import { runQuery } from '../utils/sqlClient';

export type ImportStatus = 'completed' | 'failed' | string;

export interface ClientFileSheet {
  sheetName: string;
  glMonth?: string;
  rowCount: number;
  isSelected?: boolean;
  firstDataRowIndex?: number;
  insertedDttm?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ClientFileEntity {
  entityId?: string;
  entityName: string;
  displayName?: string;
  rowCount: number;
  isSelected?: boolean;
  insertedDttm?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ClientFileRecord {
  id: number;
  clientId: string;
  userId?: string;
  uploadedBy?: string;
  importedBy?: string;
  fileName: string;
  fileStorageUri: string;
  fileSize?: number;
  fileType?: string;
  status: ImportStatus;
  period: string;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  rowCount?: number;
  timestamp: string;
  sheets?: ClientFileSheet[];
  entities?: ClientFileEntity[];
}

export interface NewClientFileRecord {
  clientId: string;
  userId?: string;
  uploadedBy?: string;
  sourceFileName: string;
  fileStorageUri: string;
  fileSize?: number;
  fileType?: string;
  status: ImportStatus;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  rowCount?: number;
  lastStepCompletedDttm?: string;
  sheets?: ClientFileSheet[];
  entities?: ClientFileEntity[];
}

interface RawClientFileRow {
  fileUploadId: number;
  clientId: string;
  userId?: string;
  uploadedBy?: string;
  sourceFileName: string;
  fileStorageUri: string;
  fileSize?: number;
  fileType?: string;
  fileStatus: ImportStatus;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  rowCount?: number;
  lastStepCompletedDttm?: string | Date;
}

const parseDate = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return undefined;
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
  const timestamp =
    parseDate(row.lastStepCompletedDttm) ??
    (row.lastStepCompletedDttm ? String(row.lastStepCompletedDttm) : new Date().toISOString());

  return {
    id: row.fileUploadId,
    clientId: row.clientId,
    uploadedBy: row.uploadedBy,
    importedBy: row.uploadedBy,
    fileName: row.sourceFileName,
    fileStorageUri: row.fileStorageUri,
    fileSize: row.fileSize,
    fileType: row.fileType,
    status: row.fileStatus,
    glPeriodStart: row.glPeriodStart,
    glPeriodEnd: row.glPeriodEnd,
    period: buildPeriodLabel(row.glPeriodStart, row.glPeriodEnd),
    rowCount: row.rowCount,
    timestamp,
  };
};

export const saveClientFileMetadata = async (
  record: NewClientFileRecord
): Promise<ClientFileRecord> => {
  const lastStepCompletedDttm = record.lastStepCompletedDttm ?? new Date().toISOString();

  const insertResult = await runQuery<{ file_upload_id: number }>(
    `INSERT INTO ml.CLIENT_FILES (
      CLIENT_ID,
      UPLOADED_BY,
      SOURCE_FILE_NAME,
      FILE_STORAGE_URI,
      FILE_SIZE,
      FILE_TYPE,
      FILE_STATUS,
      GL_PERIOD_START,
      GL_PERIOD_END,
      ROW_COUNT,
      LAST_STEP_COMPLETED_DTTM
    )
    OUTPUT INSERTED.FILE_UPLOAD_ID as file_upload_id
    VALUES (
      @clientId,
      @uploadedBy,
      @sourceFileName,
      @fileStorageUri,
      @fileSize,
      @fileType,
      @fileStatus,
      @glPeriodStart,
      @glPeriodEnd,
      @rowCount,
      @lastStepCompletedDttm
    )`,
    {
      clientId: record.clientId,
      uploadedBy: record.uploadedBy ?? null,
      sourceFileName: record.sourceFileName,
      fileStorageUri: record.fileStorageUri,
      fileSize: record.fileSize ?? null,
      fileType: record.fileType ?? null,
      fileStatus: record.status,
      glPeriodStart: record.glPeriodStart ?? null,
      glPeriodEnd: record.glPeriodEnd ?? null,
      rowCount: record.rowCount ?? null,
      lastStepCompletedDttm,
    }
  );

  const fileUploadId = insertResult.recordset?.[0]?.file_upload_id;

  if (fileUploadId === undefined) {
    throw new Error('Failed to persist client file metadata');
  }

  if (Array.isArray(record.sheets) && record.sheets.length > 0) {
    const sheetTimestamp = new Date().toISOString();
    const values = record.sheets
      .map(
        (_sheet, index) =>
          `(@fileUploadId, @sheetName${index}, @isSelected${index}, @firstDataRowIndex${index}, @sheetRowCount${index}, @inserted${index}, @updated${index}, @updatedBy${index})`
      )
      .join(', ');

    const params: Record<string, unknown> = { fileUploadId };
    const updatedByFallback = record.uploadedBy ?? record.userId ?? null;

    record.sheets.forEach((sheet, index) => {
      params[`sheetName${index}`] = sheet.sheetName;
      params[`isSelected${index}`] = sheet.isSelected === false ? 0 : 1;
      params[`firstDataRowIndex${index}`] = sheet.firstDataRowIndex ?? null;
      params[`sheetRowCount${index}`] = sheet.rowCount;
      params[`inserted${index}`] = sheetTimestamp;
      params[`updated${index}`] = sheetTimestamp;
      params[`updatedBy${index}`] = sheet.updatedBy ?? updatedByFallback;
    });

    await runQuery(
      `INSERT INTO ml.CLIENT_FILE_SHEETS (FILE_UPLOAD_ID, SHEET_NAME, IS_SELECTED, FIRST_DATA_ROW_INDEX, ROW_COUNT, INSERTED_DTTM, UPDATED_DTTM, UPDATED_BY)
      VALUES ${values}`,
      params
    );
  }

  if (Array.isArray(record.entities) && record.entities.length > 0) {
    const entityTimestamp = new Date().toISOString();
    const values = record.entities
      .map(
        (_entity, index) =>
          `(@fileUploadId, @entityId${index}, @entityName${index}, @entityRowCount${index}, @entityIsSelected${index}, @entityInserted${index}, @entityUpdated${index}, @entityUpdatedBy${index})`
      )
      .join(', ');

    const params: Record<string, unknown> = { fileUploadId };
    const updatedByFallback = record.uploadedBy ?? record.userId ?? null;
    record.entities.forEach((entity, index) => {
      const entityName = entity.displayName ?? entity.entityName;
      params[`entityId${index}`] = entity.entityId ?? null;
      params[`entityName${index}`] = entityName;
      params[`entityRowCount${index}`] = entity.rowCount;
      params[`entityIsSelected${index}`] = entity.isSelected === false ? 0 : 1;
      params[`entityInserted${index}`] = entity.insertedDttm ?? entityTimestamp;
      params[`entityUpdated${index}`] = entity.updatedAt ?? entityTimestamp;
      params[`entityUpdatedBy${index}`] = entity.updatedBy ?? updatedByFallback;
    });

    await runQuery(
      `INSERT INTO ml.CLIENT_FILE_ENTITIES (FILE_UPLOAD_ID, ENTITY_ID, ENTITY_NAME, ROW_COUNT, IS_SELECTED, INSERTED_DTTM, UPDATED_DTTM, UPDATED_BY)
      VALUES ${values}`,
      params
    );
  }

  return {
    id: fileUploadId,
    clientId: record.clientId,
    userId: record.userId,
    uploadedBy: record.uploadedBy,
    importedBy: record.uploadedBy,
    fileName: record.sourceFileName,
    fileStorageUri: record.fileStorageUri,
    fileSize: record.fileSize,
    fileType: record.fileType,
    status: record.status,
    glPeriodStart: record.glPeriodStart,
    glPeriodEnd: record.glPeriodEnd,
    period: buildPeriodLabel(record.glPeriodStart, record.glPeriodEnd),
    rowCount: record.rowCount,
    timestamp: lastStepCompletedDttm,
    sheets: record.sheets,
    entities: record.entities,
  };
};

const buildWhereClause = (
  userId?: string,
  clientId?: string
): { clause: string; parameters: Record<string, unknown> } => {
  const conditions: string[] = [];
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

export const listClientFiles = async (
  userId: string | undefined,
  clientId: string | undefined,
  page: number,
  pageSize: number
): Promise<ClientFileHistoryResult> => {
  const { clause, parameters } = buildWhereClause(userId, clientId);
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
      cf.FILE_UPLOAD_ID as fileUploadId,
      cf.CLIENT_ID as clientId,
      cf.UPLOADED_BY as uploadedBy,
      cf.SOURCE_FILE_NAME as sourceFileName,
      cf.FILE_STORAGE_URI as fileStorageUri,
      cf.FILE_SIZE as fileSize,
      cf.FILE_TYPE as fileType,
      cf.FILE_STATUS as fileStatus,
      cf.GL_PERIOD_START as glPeriodStart,
      cf.GL_PERIOD_END as glPeriodEnd,
      cf.ROW_COUNT as rowCount,
      cf.LAST_STEP_COMPLETED_DTTM as lastStepCompletedDttm
    FROM ml.CLIENT_FILES cf
    ${clause}
    ORDER BY cf.LAST_STEP_COMPLETED_DTTM DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY`,
    { ...parameters, offset, pageSize }
  );

  const items = (filesResult.recordset ?? []).map(mapClientFileRow);
  const fileIds = items.map((item) => item.id);

  if (fileIds.length === 0) {
    return { items, total, page, pageSize };
  }

  const sheetParameters: Record<string, unknown> = {};
  const sheetPlaceholders = fileIds
    .map((id, index) => {
      const key = `sheetFileId${index}`;
      sheetParameters[key] = id;
      return `@${key}`;
    })
    .join(', ');

  const sheetsResult = await runQuery<{
    fileUploadId: number;
    sheetName: string;
    isSelected?: boolean | number;
    firstDataRowIndex?: number;
    rowCount: number;
    insertedDttm?: string | Date;
    updatedAt?: string | Date;
    updatedBy?: string;
  }>(
    `SELECT FILE_UPLOAD_ID as fileUploadId, SHEET_NAME as sheetName, IS_SELECTED as isSelected, FIRST_DATA_ROW_INDEX as firstDataRowIndex, ROW_COUNT as rowCount, INSERTED_DTTM as insertedDttm, UPDATED_DTTM as updatedAt, UPDATED_BY as updatedBy
    FROM ml.CLIENT_FILE_SHEETS
    WHERE FILE_UPLOAD_ID IN (${sheetPlaceholders})`,
    sheetParameters
  );

  const sheetsByFile = new Map<number, ClientFileSheet[]>();
  (sheetsResult.recordset ?? []).forEach((sheet) => {
    const existing = sheetsByFile.get(sheet.fileUploadId) ?? [];
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
      rowCount: sheet.rowCount,
      insertedDttm: parseDate(sheet.insertedDttm),
      updatedAt: parseDate(sheet.updatedAt),
      updatedBy: sheet.updatedBy ?? undefined,
    });
    sheetsByFile.set(sheet.fileUploadId, existing);
  });

  const entityParameters: Record<string, unknown> = {};
  const entityPlaceholders = fileIds
    .map((id, index) => {
      const key = `entityFileId${index}`;
      entityParameters[key] = id;
      return `@${key}`;
    })
    .join(', ');

  const entitiesResult = await runQuery<{
    fileUploadId: number;
    entityId?: string;
    entityName: string;
    rowCount: number;
    isSelected?: number | boolean;
    insertedDttm?: string | Date | null;
    updatedAt?: string | Date | null;
    updatedBy?: string | null;
  }>(
    `SELECT FILE_UPLOAD_ID as fileUploadId, ENTITY_ID as entityId, ENTITY_NAME as entityName, ROW_COUNT as rowCount, IS_SELECTED as isSelected, INSERTED_DTTM as insertedDttm, UPDATED_DTTM as updatedAt, UPDATED_BY as updatedBy
    FROM ml.CLIENT_FILE_ENTITIES
    WHERE FILE_UPLOAD_ID IN (${entityPlaceholders})`,
    entityParameters
  );

  const entitiesByFile = new Map<number, ClientFileEntity[]>();
  (entitiesResult.recordset ?? []).forEach((entity) => {
    const existing = entitiesByFile.get(entity.fileUploadId) ?? [];
    existing.push({
      entityId: entity.entityId ?? undefined,
      entityName: entity.entityName,
      displayName: entity.entityName,
      rowCount: entity.rowCount,
      isSelected:
        entity.isSelected === undefined || entity.isSelected === null
          ? undefined
          : Boolean(entity.isSelected),
      insertedDttm: parseDate(entity.insertedDttm),
      updatedAt: parseDate(entity.updatedAt),
      updatedBy: entity.updatedBy ?? undefined,
    });
    entitiesByFile.set(entity.fileUploadId, existing);
  });

  const enrichedItems = items.map((item) => ({
    ...item,
    sheets: sheetsByFile.get(item.id) ?? [],
    entities: entitiesByFile.get(item.id) ?? [],
  }));

  return { items: enrichedItems, total, page, pageSize };
};
