import crypto from 'crypto';
import { runQuery } from '../utils/sqlClient';

export interface FileRecordInput {
  accountId: string;
  accountName: string;
  activityAmount: number;
  entityId?: string | null;
  entityName?: string | null;
  glMonth?: string | null;
  sourceSheet?: string | null;
  sourceRowNumber?: number | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  userDefined1?: string | null;
  userDefined2?: string | null;
  userDefined3?: string | null;
}

export interface FileRecordRow extends FileRecordInput {
  recordId: number;
  fileUploadId: string;
}

const TABLE_NAME = 'ml.FILE_RECORDS';

export const insertFileRecords = async (
  fileUploadId: string,
  records: FileRecordInput[],
): Promise<FileRecordRow[]> => {
  if (!fileUploadId || records.length === 0) {
    return [];
  }

  const params: Record<string, unknown> = { fileUploadId };
  const valuesClause = records
    .map((record, index) => {
      const recordId = crypto.randomInt(1, 2 ** 31 - 1);
      params[`recordId${index}`] = recordId;
      params[`accountId${index}`] = record.accountId;
      params[`accountName${index}`] = record.accountName;
      params[`activityAmount${index}`] = record.activityAmount;
      params[`openingBalance${index}`] = record.openingBalance ?? null;
      params[`closingBalance${index}`] = record.closingBalance ?? null;
      params[`entityId${index}`] = record.entityId ?? null;
      params[`glMonth${index}`] = record.glMonth ?? null;
      params[`sourceSheetName${index}`] = record.sourceSheet ?? null;
      params[`userDefined1_${index}`] = record.userDefined1 ?? null;
      params[`userDefined2_${index}`] = record.userDefined2 ?? null;
      params[`userDefined3_${index}`] = record.userDefined3 ?? null;

      return `(@fileUploadId, @recordId${index}, @sourceSheetName${index}, @entityId${index}, @accountId${index}, @accountName${index}, @openingBalance${index}, @closingBalance${index}, @activityAmount${index}, @glMonth${index}, @userDefined1_${index}, @userDefined2_${index}, @userDefined3_${index})`;
    })
    .join(', ');

  await runQuery(
    `INSERT INTO ${TABLE_NAME} (
      FILE_UPLOAD_ID,
      RECORD_ID,
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
      USER_DEFINED3
    )
    VALUES ${valuesClause}`,
    params,
  );

  return records.map((record, index) => ({
    ...record,
    recordId: params[`recordId${index}`] as number,
    fileUploadId,
  }));
};

export const listFileRecords = async (
  fileUploadId: string,
): Promise<FileRecordRow[]> => {
  if (!fileUploadId) {
    return [];
  }

  const result = await runQuery<{
    file_upload_id: string;
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
  }>(
    `SELECT
      FILE_UPLOAD_ID as file_upload_id,
      RECORD_ID as record_id,
      SOURCE_SHEET_NAME as source_sheet_name,
      ENTITY_ID as entity_id,
      ACCOUNT_ID as account_id,
      ACCOUNT_NAME as account_name,
      OPENING_BALANCE as opening_balance,
      CLOSING_BALANCE as closing_balance,
      ACTIVITY_AMOUNT as activity_amount,
      GL_MONTH as gl_month,
      USER_DEFINED1 as user_defined1,
      USER_DEFINED2 as user_defined2,
      USER_DEFINED3 as user_defined3
    FROM ${TABLE_NAME}
    WHERE FILE_UPLOAD_ID = @fileUploadId
    ORDER BY SOURCE_SHEET_NAME ASC, RECORD_ID ASC`,
    { fileUploadId },
  );

  return (result.recordset ?? []).map((row) => ({
    fileUploadId: row.file_upload_id,
    recordId: row.record_id,
    sourceSheet: row.source_sheet_name ?? undefined,
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
  }));
};

