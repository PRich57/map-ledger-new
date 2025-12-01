import crypto from 'crypto';
import { runQuery } from '../utils/sqlClient';

export interface FileRecordInput {
  accountId: string;
  accountName: string;
  activityAmount: number;
  entityName?: string | null;
  glMonth?: string | null;
  sourceSheet?: string | null;
  sourceRowNumber?: number | null;
}

export interface FileRecordRow extends FileRecordInput {
  recordId: string;
  fileUploadId: string;
}

const TABLE_NAME = 'ml.FILE_RECORDS';
let tableEnsured = false;

const ensureTable = async () => {
  if (tableEnsured) {
    return;
  }

  await runQuery(
    `IF NOT EXISTS (
      SELECT 1
      FROM sys.tables t
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = 'FILE_RECORDS' AND s.name = 'ml'
    )
    BEGIN
      CREATE TABLE ${TABLE_NAME} (
        FILE_UPLOAD_ID NVARCHAR(128) NOT NULL,
        RECORD_ID NVARCHAR(128) NOT NULL,
        ACCOUNT_ID NVARCHAR(256) NOT NULL,
        ACCOUNT_NAME NVARCHAR(512) NOT NULL,
        ACTIVITY_AMOUNT FLOAT NULL,
        GL_MONTH NVARCHAR(7) NULL,
        ENTITY_NAME NVARCHAR(512) NULL,
        SOURCE_SHEET NVARCHAR(256) NULL,
        SOURCE_ROW_NUMBER INT NULL,
        CONSTRAINT PK_FILE_RECORDS PRIMARY KEY (FILE_UPLOAD_ID, RECORD_ID)
      );
    END`
  );

  tableEnsured = true;
};

export const insertFileRecords = async (
  fileUploadId: string,
  records: FileRecordInput[],
): Promise<FileRecordRow[]> => {
  if (!fileUploadId || records.length === 0) {
    return [];
  }

  await ensureTable();

  const params: Record<string, unknown> = { fileUploadId };
  const valuesClause = records
    .map((record, index) => {
      const recordId = crypto.randomUUID();
      params[`recordId${index}`] = recordId;
      params[`accountId${index}`] = record.accountId;
      params[`accountName${index}`] = record.accountName;
      params[`activityAmount${index}`] = record.activityAmount;
      params[`glMonth${index}`] = record.glMonth ?? null;
      params[`entityName${index}`] = record.entityName ?? null;
      params[`sourceSheet${index}`] = record.sourceSheet ?? null;
      params[`sourceRow${index}`] = record.sourceRowNumber ?? null;

      return `(@fileUploadId, @recordId${index}, @accountId${index}, @accountName${index}, @activityAmount${index}, @glMonth${index}, @entityName${index}, @sourceSheet${index}, @sourceRow${index})`;
    })
    .join(', ');

  await runQuery(
    `INSERT INTO ${TABLE_NAME} (
      FILE_UPLOAD_ID,
      RECORD_ID,
      ACCOUNT_ID,
      ACCOUNT_NAME,
      ACTIVITY_AMOUNT,
      GL_MONTH,
      ENTITY_NAME,
      SOURCE_SHEET,
      SOURCE_ROW_NUMBER
    )
    VALUES ${valuesClause}`,
    params,
  );

  return records.map((record, index) => ({
    ...record,
    recordId: params[`recordId${index}`] as string,
    fileUploadId,
  }));
};

export const listFileRecords = async (
  fileUploadId: string,
): Promise<FileRecordRow[]> => {
  if (!fileUploadId) {
    return [];
  }

  await ensureTable();

  const result = await runQuery<{
    file_upload_id: string;
    record_id: string;
    account_id: string;
    account_name: string;
    activity_amount: number;
    gl_month?: string | null;
    entity_name?: string | null;
    source_sheet?: string | null;
    source_row_number?: number | null;
  }>(
    `SELECT
      FILE_UPLOAD_ID as file_upload_id,
      RECORD_ID as record_id,
      ACCOUNT_ID as account_id,
      ACCOUNT_NAME as account_name,
      ACTIVITY_AMOUNT as activity_amount,
      GL_MONTH as gl_month,
      ENTITY_NAME as entity_name,
      SOURCE_SHEET as source_sheet,
      SOURCE_ROW_NUMBER as source_row_number
    FROM ${TABLE_NAME}
    WHERE FILE_UPLOAD_ID = @fileUploadId
    ORDER BY SOURCE_SHEET ASC, SOURCE_ROW_NUMBER ASC`,
    { fileUploadId },
  );

  return (result.recordset ?? []).map((row) => ({
    fileUploadId: row.file_upload_id,
    recordId: row.record_id,
    accountId: row.account_id,
    accountName: row.account_name,
    activityAmount: row.activity_amount,
    glMonth: row.gl_month ?? undefined,
    entityName: row.entity_name ?? undefined,
    sourceSheet: row.source_sheet ?? undefined,
    sourceRowNumber: row.source_row_number ?? undefined,
  }));
};

