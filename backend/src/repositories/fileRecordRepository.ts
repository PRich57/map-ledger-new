import { normalizeGlMonth, isValidNormalizedMonth } from '../utils/glMonth';
import { runQuery } from '../utils/sqlClient';

const logPrefix = '[fileRecordRepository]';

const logWarn = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(logPrefix, ...args);
};

const toSqlCompatibleGlMonth = (glMonth?: string | null): string | null => {
  if (!glMonth) {
    return null;
  }

  const normalizedMonth = normalizeGlMonth(glMonth);
  if (!normalizedMonth || !isValidNormalizedMonth(normalizedMonth)) {
    logWarn('Unable to normalize glMonth value; skipping assignment', { glMonth });
    return null;
  }

  return normalizedMonth;
};

export interface FileRecordInput {
  accountId: string;
  accountName: string;
  activityAmount: number;
  entityId?: string | null;
  glMonth?: string | null;
  sourceSheetName?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  userDefined1?: string | null;
  userDefined2?: string | null;
  userDefined3?: string | null;
}

export interface FileRecordRow extends FileRecordInput {
  recordId: number;
  fileUploadGuid: string;
  insertedDttm?: string | null;
}

const TABLE_NAME = 'ml.FILE_RECORDS';

interface RawFileRecordRow {
  file_upload_guid: string;
  record_id: number;
  source_sheet_name?: string | null;
  entity_id?: string | null;
  account_id: string;
  account_name: string;
  opening_balance?: number | null;
  closing_balance?: number | null;
  activity_amount: number;
  gl_month?: string | null;
  user_defined1?: string | null;
  user_defined2?: string | number | null;
  user_defined3?: string | null;
  inserted_dttm?: Date | string | null;
}

const mapFileRecordRow = (row: RawFileRecordRow): FileRecordRow => ({
  fileUploadGuid: row.file_upload_guid,
  recordId: row.record_id,
  sourceSheetName: row.source_sheet_name ?? undefined,
  entityId: row.entity_id ?? undefined,
  accountId: row.account_id,
  accountName: row.account_name,
  openingBalance: row.opening_balance ?? undefined,
  closingBalance: row.closing_balance ?? undefined,
  activityAmount: row.activity_amount,
  glMonth: row.gl_month ?? undefined,
  userDefined1: row.user_defined1 ?? undefined,
  userDefined2:
    row.user_defined2 !== undefined && row.user_defined2 !== null
      ? String(row.user_defined2)
      : undefined,
  userDefined3: row.user_defined3 ?? undefined,
  insertedDttm:
    row.inserted_dttm instanceof Date
      ? row.inserted_dttm.toISOString()
      : row.inserted_dttm ?? undefined,
});

// SQL Server has a 2100 parameter limit. Each record uses 12 parameters,
// so we use 150 records per batch (150 * 12 = 1800) to stay safely under the limit.
const BATCH_SIZE = 150;

const insertFileRecordsBatch = async (
  fileUploadGuid: string,
  records: FileRecordInput[],
): Promise<FileRecordRow[]> => {
  if (records.length === 0) {
    return [];
  }

  const params: Record<string, unknown> = { fileUploadGuid };
  const valuesClause = records
    .map((record, index) => {
      params[`accountId${index}`] = record.accountId;
      params[`accountName${index}`] = record.accountName;
      params[`activityAmount${index}`] = record.activityAmount;
      params[`openingBalance${index}`] = record.openingBalance ?? null;
      params[`closingBalance${index}`] = record.closingBalance ?? null;
      params[`entityId${index}`] = record.entityId ?? null;
      params[`glMonth${index}`] = toSqlCompatibleGlMonth(record.glMonth ?? null);
      params[`sourceSheetName${index}`] = record.sourceSheetName ?? null;
      params[`userDefined1_${index}`] = record.userDefined1 ?? null;
      params[`userDefined2_${index}`] = record.userDefined2 ?? null;
      params[`userDefined3_${index}`] = record.userDefined3 ?? null;

      return `(@fileUploadGuid, @sourceSheetName${index}, @entityId${index}, @accountId${index}, @accountName${index}, @openingBalance${index}, @closingBalance${index}, @activityAmount${index}, @glMonth${index}, @userDefined1_${index}, @userDefined2_${index}, @userDefined3_${index}, NULL, NULL)`;
    })
    .join(', ');

  const insertResult = await runQuery<{ record_id: number; inserted_dttm?: string | Date | null }>(
    `INSERT INTO ${TABLE_NAME} (
      FILE_UPLOAD_GUID,
      SOURCE_SHEET_NAME,
      ENTITY_ID,
      ACCOUNT_ID,
      ACCOUNT_NAME,
      OPENING_BALANCE,
      CLOSING_BALANCE,
      ACTIVITY_AMOUNT,
      GL_MONTH,
      USER_DEFINED1,
      USER_DEFINED2,
      USER_DEFINED3,
      UPDATED_DTTM,
      UPDATED_BY
    )
    OUTPUT INSERTED.RECORD_ID as record_id, INSERTED.INSERTED_DTTM as inserted_dttm
    VALUES ${valuesClause}`,
    params,
  );

  const insertedRecords = insertResult.recordset ?? [];

  return records.map((record, index) => {
    const insertedRecordId = insertedRecords[index]?.record_id;

    if (insertedRecordId === undefined) {
      throw new Error('Failed to insert all file records');
    }

    return {
      ...record,
      recordId: insertedRecordId,
      fileUploadGuid,
      insertedDttm:
        insertedRecords[index]?.inserted_dttm instanceof Date
          ? insertedRecords[index]?.inserted_dttm.toISOString()
          : insertedRecords[index]?.inserted_dttm ?? undefined,
    };
  });
};

export const insertFileRecords = async (
  fileUploadGuid: string,
  records: FileRecordInput[],
): Promise<FileRecordRow[]> => {
  if (!fileUploadGuid || fileUploadGuid.length !== 36 || records.length === 0) {
    return [];
  }

  // Process records in batches to avoid SQL Server's 2100 parameter limit
  const allResults: FileRecordRow[] = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchResults = await insertFileRecordsBatch(fileUploadGuid, batch);
    allResults.push(...batchResults);
  }

  return allResults;
};

export const listFileRecords = async (fileUploadGuid?: string): Promise<FileRecordRow[]> => {
  if (!fileUploadGuid) {
    return [];
  }

  const params: Record<string, unknown> = { fileUploadGuid };
  const whereClause = 'WHERE fr.FILE_UPLOAD_GUID = @fileUploadGuid AND cf.IS_DELETED = 0';

  const result = await runQuery<RawFileRecordRow>(
    `SELECT
      fr.FILE_UPLOAD_GUID as file_upload_guid,
      fr.RECORD_ID as record_id,
      fr.SOURCE_SHEET_NAME as source_sheet_name,
      fr.ENTITY_ID as entity_id,
      fr.ACCOUNT_ID as account_id,
      fr.ACCOUNT_NAME as account_name,
      fr.OPENING_BALANCE as opening_balance,
      fr.CLOSING_BALANCE as closing_balance,
      fr.ACTIVITY_AMOUNT as activity_amount,
      fr.GL_MONTH as gl_month,
      fr.USER_DEFINED1 as user_defined1,
      fr.USER_DEFINED2 as user_defined2,
      fr.USER_DEFINED3 as user_defined3,
      fr.INSERTED_DTTM as inserted_dttm
    FROM ${TABLE_NAME} fr
    INNER JOIN ml.CLIENT_FILES cf ON cf.FILE_UPLOAD_GUID = fr.FILE_UPLOAD_GUID
    ${whereClause}
    ORDER BY SOURCE_SHEET_NAME ASC, RECORD_ID ASC`,
    params,
  );

  return (result.recordset ?? []).map(mapFileRecordRow);
};

export const listLatestFileRecordsForClient = async (
  clientId?: string,
): Promise<FileRecordRow[]> => {
  const normalizedClientId = clientId?.trim();
  if (!normalizedClientId) {
    return [];
  }

  const result = await runQuery<RawFileRecordRow>(
    `WITH RankedRecords AS (
      SELECT
        fr.FILE_UPLOAD_GUID as file_upload_guid,
        fr.RECORD_ID as record_id,
        fr.SOURCE_SHEET_NAME as source_sheet_name,
        fr.ENTITY_ID as entity_id,
        fr.ACCOUNT_ID as account_id,
        fr.ACCOUNT_NAME as account_name,
        fr.OPENING_BALANCE as opening_balance,
        fr.CLOSING_BALANCE as closing_balance,
        fr.ACTIVITY_AMOUNT as activity_amount,
        fr.GL_MONTH as gl_month,
        fr.USER_DEFINED1 as user_defined1,
        fr.USER_DEFINED2 as user_defined2,
        fr.USER_DEFINED3 as user_defined3,
        fr.INSERTED_DTTM as inserted_dttm,
        ROW_NUMBER() OVER (
          PARTITION BY fr.ENTITY_ID, fr.ACCOUNT_ID, fr.GL_MONTH
          ORDER BY COALESCE(cf.LAST_STEP_COMPLETED_DTTM, cf.INSERTED_DTTM, fr.INSERTED_DTTM) DESC,
                   fr.INSERTED_DTTM DESC,
                   fr.FILE_UPLOAD_GUID DESC,
                   fr.RECORD_ID DESC
        ) as rn
      FROM ${TABLE_NAME} fr
      INNER JOIN ml.CLIENT_FILES cf ON cf.FILE_UPLOAD_GUID = fr.FILE_UPLOAD_GUID
      WHERE cf.CLIENT_ID = @clientId
        AND cf.IS_DELETED = 0
    )
    SELECT
      file_upload_guid,
      record_id,
      source_sheet_name,
      entity_id,
      account_id,
      account_name,
      opening_balance,
      closing_balance,
      activity_amount,
      gl_month,
      user_defined1,
      user_defined2,
      user_defined3,
      inserted_dttm
    FROM RankedRecords
    WHERE rn = 1
    ORDER BY source_sheet_name ASC, record_id ASC`,
    { clientId: normalizedClientId },
  );

  return (result.recordset ?? []).map(mapFileRecordRow);
};
