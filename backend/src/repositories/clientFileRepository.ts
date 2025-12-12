import crypto from 'node:crypto';
import { runQuery } from '../utils/sqlClient';

export const ALLOWED_IMPORT_STATUSES = [
  'uploaded',
  'mapping',
  'distribution',
  'review',
  'completed',
] as const;

export type ImportStatus = (typeof ALLOWED_IMPORT_STATUSES)[number];

export const isImportStatus = (value: unknown): value is ImportStatus =>
  typeof value === 'string' && ALLOWED_IMPORT_STATUSES.includes(value as ImportStatus);

export const coerceImportStatus = (value: unknown): ImportStatus =>
  isImportStatus(value) ? (value as ImportStatus) : 'uploaded';

export interface ClientFileSheet {
  sheetName: string;
  glMonth?: string;
  isSelected?: boolean;
  firstDataRowIndex?: number;
  rowCount?: number;
  insertedDttm?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ClientFileEntity {
  entityId?: number;
  isSelected?: boolean;
  insertedDttm?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ClientFileRecord {
  id: string;
  fileUploadGuid: string;
  clientId: string;
  clientName?: string;
  insertedBy?: string;
  importedBy?: string;
  fileName: string;
  fileStorageUri: string;
  status: ImportStatus;
  insertedDttm?: string;
  timestamp?: string;
  period: string;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  lastStepCompletedDttm?: string;
  sheets?: ClientFileSheet[];
  entities?: ClientFileEntity[];
}

export interface NewClientFileRecord {
  fileUploadGuid?: string;
  clientId: string;
  insertedBy?: string;
  sourceFileName: string;
  fileStorageUri: string;
  status: ImportStatus;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  lastStepCompletedDttm?: string;
}

interface RawClientFileRow {
  fileUploadGuid: string;
  clientId: string;
  clientName?: string;
  insertedBy?: string;
  insertedDttm?: string | Date;
  sourceFileName: string;
  fileStorageUri: string;
  fileStatus: string;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  lastStepCompletedDttm?: string | Date;
}

const parseDate = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const stringValue = String(value).trim();
  const normalizedValue =
    /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(stringValue)
      ? `${stringValue.replace(' ', 'T')}Z`
      : stringValue;

  const parsed = new Date(normalizedValue);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
};

const normalizeMonth = (value?: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }

  const stringValue = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(stringValue.trim());

  if (match) {
    const [, year, month] = match;
    return `${year}-${month}`;
  }

  const parsed = value instanceof Date ? value : new Date(stringValue);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;

  return `${year}-${month.toString().padStart(2, '0')}`;
};

const normalizeYearMonthString = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})(?:-(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  const [, year, month, day] = match;
  const normalizedDay = (day ?? '01').padStart(2, '0');
  return `${year}-${month}-${normalizedDay}`;
};

const buildPeriodLabel = (
  start?: string,
  end?: string
): string => {
  if (start && end) {
    return `${start} - ${end}`;
  }

  if (start) {
    return start;
  }

  if (end) {
    return end;
  }

  return '';
};

const mapClientFileRow = (row: RawClientFileRow): ClientFileRecord => {
  const insertedDttm = parseDate(row.insertedDttm);
  const normalizedStart = normalizeMonth(row.glPeriodStart);
  const normalizedEnd = normalizeMonth(row.glPeriodEnd);

  return {
    id: row.fileUploadGuid,
    fileUploadGuid: row.fileUploadGuid,
    clientId: row.clientId,
    clientName: row.clientName,
    insertedBy: row.insertedBy,
    importedBy: row.insertedBy,
    fileName: row.sourceFileName,
    fileStorageUri: row.fileStorageUri,
    status: coerceImportStatus(row.fileStatus),
    insertedDttm,
    timestamp: insertedDttm ?? parseDate(row.lastStepCompletedDttm),
    glPeriodStart: normalizedStart,
    glPeriodEnd: normalizedEnd,
    period: buildPeriodLabel(normalizedStart, normalizedEnd),
    lastStepCompletedDttm: parseDate(row.lastStepCompletedDttm),
  };
};

export const getClientFileByGuid = async (
  fileUploadGuid: string,
): Promise<ClientFileRecord | null> => {
  if (!fileUploadGuid) {
    return null;
  }

  const result = await runQuery<RawClientFileRow>(
    `SELECT
      cf.FILE_UPLOAD_GUID as fileUploadGuid,
      cf.CLIENT_ID as clientId,
      client.CLIENT_NAME as clientName,
      cf.INSERTED_BY as insertedBy,
      cf.INSERTED_DTTM as insertedDttm,
      cf.SOURCE_FILE_NAME as sourceFileName,
      cf.FILE_STORAGE_URI as fileStorageUri,
      cf.FILE_STATUS as fileStatus,
      cf.GL_PERIOD_START as glPeriodStart,
      cf.GL_PERIOD_END as glPeriodEnd,
      cf.LAST_STEP_COMPLETED_DTTM as lastStepCompletedDttm
    FROM ml.CLIENT_FILES cf
    LEFT JOIN ML.V_CLIENT_OPERATIONS client ON client.CLIENT_ID = cf.CLIENT_ID
    WHERE cf.FILE_UPLOAD_GUID = @fileUploadGuid
      AND cf.IS_DELETED = 0`,
    { fileUploadGuid }
  );

  const row = result.recordset?.[0];
  return row ? mapClientFileRow(row) : null;
};

export const saveClientFileMetadata = async (
  record: NewClientFileRecord
): Promise<ClientFileRecord> => {
  const lastStepCompletedDttm = record.lastStepCompletedDttm ?? null;
  const fileUploadGuid =
    record.fileUploadGuid && record.fileUploadGuid.length === 36
      ? record.fileUploadGuid
      : crypto.randomUUID();
  const status = coerceImportStatus(record.status ?? 'uploaded');
  const glPeriodStart = normalizeYearMonthString(record.glPeriodStart) ?? null;
  const glPeriodEnd = normalizeYearMonthString(record.glPeriodEnd) ?? null;

  const insertResult = await runQuery<{
    file_upload_guid: string;
    inserted_dttm?: string | Date;
  }>(
    `INSERT INTO ml.CLIENT_FILES (
      CLIENT_ID,
      FILE_UPLOAD_GUID,
      SOURCE_FILE_NAME,
      FILE_STORAGE_URI,
      GL_PERIOD_START,
      GL_PERIOD_END,
      INSERTED_BY,
      FILE_STATUS,
      LAST_STEP_COMPLETED_DTTM
    )
    OUTPUT INSERTED.FILE_UPLOAD_GUID as file_upload_guid,
           INSERTED.INSERTED_DTTM as inserted_dttm
    VALUES (
      @clientId,
      @fileUploadGuid,
      @sourceFileName,
      @fileStorageUri,
      @glPeriodStart,
      @glPeriodEnd,
      @insertedBy,
      @fileStatus,
      @lastStepCompletedDttm
    )`,
    {
      fileUploadGuid,
      clientId: record.clientId,
      insertedBy: record.insertedBy,
      sourceFileName: record.sourceFileName,
      fileStorageUri: record.fileStorageUri,
      fileStatus: status,
      glPeriodStart,
      glPeriodEnd,
      lastStepCompletedDttm,
    }
  );

  const persistedFileUploadGuid = insertResult.recordset?.[0]?.file_upload_guid ?? fileUploadGuid;
  const insertedDttm = parseDate(insertResult.recordset?.[0]?.inserted_dttm);

  return {
    id: persistedFileUploadGuid,
    fileUploadGuid: persistedFileUploadGuid,
    clientId: record.clientId,
    insertedBy: record.insertedBy,
    importedBy: record.insertedBy,
    fileName: record.sourceFileName,
    fileStorageUri: record.fileStorageUri,
    status,
    insertedDttm,
    timestamp: insertedDttm,
    glPeriodStart: record.glPeriodStart,
    glPeriodEnd: record.glPeriodEnd,
    period: buildPeriodLabel(record.glPeriodStart, record.glPeriodEnd),
    lastStepCompletedDttm: lastStepCompletedDttm ?? undefined,
  };
};

const buildWhereClause = (
  clientId?: string
): { clause: string; parameters: Record<string, unknown> } => {
  const conditions: string[] = ['cf.IS_DELETED = 0'];
  const parameters: Record<string, unknown> = {};

  if (clientId) {
    conditions.push('cf.CLIENT_ID = @clientId');
    parameters.clientId = clientId;
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, parameters };
};

export interface ClientFileHistoryResult {
  items: ClientFileRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export const softDeleteClientFile = async (
  fileUploadGuid: string
): Promise<boolean> => {
  if (!fileUploadGuid || typeof fileUploadGuid !== 'string') {
    return false;
  }

  const result = await runQuery(
    `UPDATE ml.CLIENT_FILES
    SET IS_DELETED = 1,
        DELETED_DTTM = CURRENT_TIMESTAMP,
        FILE_STATUS = 'deleted'
    WHERE FILE_UPLOAD_GUID = @fileUploadGuid`,
    { fileUploadGuid }
  );

  return (result.rowsAffected?.[0] ?? 0) > 0;
};

export const listClientFiles = async (
  clientId: string | undefined,
  page: number,
  pageSize: number
): Promise<ClientFileHistoryResult> => {
  const { clause, parameters } = buildWhereClause(clientId);
  const offset = Math.max(page - 1, 0) * pageSize;

  const totalResult = await runQuery<{ total: number }>(
    `SELECT COUNT(*) as total FROM ml.CLIENT_FILES cf ${clause}`,
    parameters
  );

  const total = totalResult.recordset?.[0]?.total ?? 0;

  if (total === 0) {
    return { items: [], total: 0, page, pageSize };
  }

  const filesResult = await runQuery<RawClientFileRow>(
    `SELECT
      cf.FILE_UPLOAD_GUID as fileUploadGuid,
      cf.CLIENT_ID as clientId,
      client.CLIENT_NAME as clientName,
      cf.INSERTED_BY as insertedBy,
      cf.INSERTED_DTTM as insertedDttm,
      cf.SOURCE_FILE_NAME as sourceFileName,
      cf.FILE_STORAGE_URI as fileStorageUri,
      cf.FILE_STATUS as fileStatus,
      cf.GL_PERIOD_START as glPeriodStart,
      cf.GL_PERIOD_END as glPeriodEnd,
      cf.LAST_STEP_COMPLETED_DTTM as lastStepCompletedDttm
    FROM ml.CLIENT_FILES cf
    LEFT JOIN ML.V_CLIENT_OPERATIONS client ON client.CLIENT_ID = cf.CLIENT_ID
    ${clause}
    ORDER BY cf.LAST_STEP_COMPLETED_DTTM DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY`,
    { ...parameters, offset, pageSize }
  );

  const items = (filesResult.recordset ?? []).map(mapClientFileRow);
  const fileGuids = items.map((item) => item.fileUploadGuid);

  if (fileGuids.length === 0) {
    return { items, total, page, pageSize };
  }

  const sheetParameters: Record<string, unknown> = {};
  const sheetPlaceholders = fileGuids
    .map((guid, index) => {
      const key = `sheetFileGuid${index}`;
      sheetParameters[key] = guid;
      return `@${key}`;
    })
    .join(', ');

  const sheetsResult = await runQuery<{
    fileUploadGuid: string;
    sheetName: string;
    isSelected?: boolean | number;
    firstDataRowIndex?: number;
    rowCount?: number;
    insertedDttm?: string | Date;
    updatedAt?: string | Date;
    updatedBy?: string;
  }>(
    `SELECT FILE_UPLOAD_GUID as fileUploadGuid,
            SHEET_NAME as sheetName,
            IS_SELECTED as isSelected,
            FIRST_DATA_ROW_INDEX as firstDataRowIndex,
            ROW_COUNT as [rowCount],
            INSERTED_DTTM as insertedDttm,
            UPDATED_DTTM as updatedAt,
            UPDATED_BY as updatedBy
      FROM ml.CLIENT_FILE_SHEETS
      WHERE FILE_UPLOAD_GUID IN (${sheetPlaceholders})`,
    sheetParameters
  );
    

  const sheetsByFile = new Map<string, ClientFileSheet[]>();
  (sheetsResult.recordset ?? []).forEach((sheet) => {
    const existing = sheetsByFile.get(sheet.fileUploadGuid) ?? [];
    existing.push({
      sheetName: sheet.sheetName,
      isSelected:
        sheet.isSelected === undefined ? undefined : Boolean(sheet.isSelected),
      firstDataRowIndex:
        typeof sheet.firstDataRowIndex === 'number'
          ? sheet.firstDataRowIndex
          : Number.isFinite(Number(sheet.firstDataRowIndex))
            ? Number(sheet.firstDataRowIndex)
            : undefined,
      rowCount:
        typeof sheet.rowCount === 'number'
          ? sheet.rowCount
          : Number.isFinite(Number(sheet.rowCount))
            ? Number(sheet.rowCount)
            : undefined,
      insertedDttm: parseDate(sheet.insertedDttm),
      updatedAt: parseDate(sheet.updatedAt),
      updatedBy: sheet.updatedBy ?? undefined,
    });
    sheetsByFile.set(sheet.fileUploadGuid, existing);
  });

  const entityParameters: Record<string, unknown> = {};
  const entityPlaceholders = fileGuids
    .map((guid, index) => {
      const key = `entityFileGuid${index}`;
      entityParameters[key] = guid;
      return `@${key}`;
    })
    .join(', ');

  const entitiesResult = await runQuery<{
    fileUploadGuid: string;
    entityId?: number;
    isSelected?: number | boolean;
    insertedDttm?: string | Date | null;
    updatedAt?: string | Date | null;
    updatedBy?: string | null;
  }>(
    `SELECT FILE_UPLOAD_GUID as fileUploadGuid, ENTITY_ID as entityId, IS_SELECTED as isSelected, INSERTED_DTTM as insertedDttm, UPDATED_DTTM as updatedAt, UPDATED_BY as updatedBy
    FROM ml.CLIENT_FILE_ENTITIES
    WHERE FILE_UPLOAD_GUID IN (${entityPlaceholders})`,
    entityParameters
  );

  const entitiesByFile = new Map<string, ClientFileEntity[]>();
  (entitiesResult.recordset ?? []).forEach((entity) => {
    const existing = entitiesByFile.get(entity.fileUploadGuid) ?? [];
    existing.push({
      entityId: Number.isFinite(entity.entityId)
        ? (entity.entityId as number)
        : undefined,
      isSelected:
        entity.isSelected === undefined || entity.isSelected === null
          ? undefined
          : Boolean(entity.isSelected),
      insertedDttm: parseDate(entity.insertedDttm),
      updatedAt: parseDate(entity.updatedAt),
      updatedBy: entity.updatedBy ?? undefined,
    });
    entitiesByFile.set(entity.fileUploadGuid, existing);
  });

  const enrichedItems = items.map((item) => ({
    ...item,
    sheets: sheetsByFile.get(item.fileUploadGuid) ?? [],
    entities: entitiesByFile.get(item.fileUploadGuid) ?? [],
  }));

  return { items: enrichedItems, total, page, pageSize };
};

export const clientFileExists = async (
  fileUploadGuid: string
): Promise<boolean> => {
  if (!fileUploadGuid) {
    return false;
  }

  const result = await runQuery<{ exists: number }>(
    `SELECT CASE WHEN EXISTS (
      SELECT 1 FROM ml.CLIENT_FILES
      WHERE FILE_UPLOAD_GUID = @fileUploadGuid
        AND IS_DELETED = 0
    ) THEN 1 ELSE 0 END as exists`,
    { fileUploadGuid }
  );

  return result.recordset?.[0]?.exists === 1;
};
