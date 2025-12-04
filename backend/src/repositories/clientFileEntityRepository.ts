import { runQuery } from '../utils/sqlClient';

export interface ClientFileEntityRow {
  fileUploadGuid: string;
  entityId: number;
  isSelected?: boolean;
  insertedDttm?: string;
  updatedDttm?: string;
  updatedBy?: string;
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

const mapEntityRow = (
  row: Partial<{
    fileUploadGuid: string;
    entityId: number;
    isSelected?: number | boolean | null;
    insertedDttm?: string | Date | null;
    updatedDttm?: string | Date | null;
    updatedBy?: string | null;
  }>
): ClientFileEntityRow => ({
  fileUploadGuid: row.fileUploadGuid as string,
  entityId: Number(row.entityId),
  isSelected:
    row.isSelected === undefined || row.isSelected === null
      ? undefined
      : Boolean(row.isSelected),
  insertedDttm: parseDate(row.insertedDttm),
  updatedDttm: parseDate(row.updatedDttm),
  updatedBy: row.updatedBy ?? undefined,
});

export interface NewClientFileEntityInput {
  fileUploadGuid: string;
  entityId: number;
  isSelected?: boolean;
}

export const insertClientFileEntity = async (
  input: NewClientFileEntityInput
): Promise<ClientFileEntityRow> => {
  const result = await runQuery<{
    fileUploadGuid: string;
    entityId: number;
    isSelected: number | null;
    insertedDttm: string | Date | null;
  }>(
    `INSERT INTO ml.CLIENT_FILE_ENTITIES (
      FILE_UPLOAD_GUID,
      ENTITY_ID,
      IS_SELECTED
    )
    OUTPUT
      INSERTED.FILE_UPLOAD_GUID as fileUploadGuid,
      INSERTED.ENTITY_ID as entityId,
      INSERTED.IS_SELECTED as isSelected,
      INSERTED.INSERTED_DTTM as insertedDttm
    VALUES (
      @fileUploadGuid,
      @entityId,
      @isSelected
    )`,
    {
      fileUploadGuid: input.fileUploadGuid,
      entityId: input.entityId,
      isSelected: input.isSelected ?? null,
    }
  );

  const inserted = result.recordset?.[0];

  return mapEntityRow(
    inserted ?? {
      fileUploadGuid: input.fileUploadGuid,
      entityId: input.entityId,
      isSelected: input.isSelected ?? null,
      insertedDttm: null,
    }
  );
};

export interface ClientFileEntityUpdate {
  fileUploadGuid: string;
  entityId: number;
  isSelected?: boolean;
  updatedBy?: string;
}

export const updateClientFileEntity = async (
  input: ClientFileEntityUpdate
): Promise<ClientFileEntityRow | null> => {
  const result = await runQuery<{
    fileUploadGuid: string;
    entityId: number;
    isSelected: number | null;
    insertedDttm: string | Date | null;
    updatedDttm: string | Date | null;
    updatedBy: string | null;
  }>(
    `UPDATE ml.CLIENT_FILE_ENTITIES
    SET
      IS_SELECTED = @isSelected,
      UPDATED_DTTM = CURRENT_TIMESTAMP,
      UPDATED_BY = @updatedBy
    OUTPUT
      INSERTED.FILE_UPLOAD_GUID as fileUploadGuid,
      INSERTED.ENTITY_ID as entityId,
      INSERTED.IS_SELECTED as isSelected,
      INSERTED.INSERTED_DTTM as insertedDttm,
      INSERTED.UPDATED_DTTM as updatedDttm,
      INSERTED.UPDATED_BY as updatedBy
    WHERE FILE_UPLOAD_GUID = @fileUploadGuid
      AND ENTITY_ID = @entityId
      AND IS_DELETED = 0`,
    {
      fileUploadGuid: input.fileUploadGuid,
      entityId: input.entityId,
      isSelected: input.isSelected ?? null,
      updatedBy: input.updatedBy ?? null,
    }
  );

  const updated = result.recordset?.[0];

  return updated ? mapEntityRow(updated) : null;
};

export const softDeleteClientFileEntity = async (
  fileUploadGuid: string,
  entityId: number,
  updatedBy?: string
): Promise<boolean> => {
  const result = await runQuery(
    `UPDATE ml.CLIENT_FILE_ENTITIES
    SET IS_DELETED = 1,
        DELETED_DTTM = CURRENT_TIMESTAMP,
        UPDATED_DTTM = CURRENT_TIMESTAMP,
        UPDATED_BY = @updatedBy
    WHERE FILE_UPLOAD_GUID = @fileUploadGuid
      AND ENTITY_ID = @entityId
      AND IS_DELETED = 0`,
    { fileUploadGuid, entityId, updatedBy: updatedBy ?? null }
  );

  const rowsAffected = (
    result as typeof result & { rowsAffected?: number[] }
  ).rowsAffected?.[0];

  return (rowsAffected ?? 0) > 0;
};

export const listClientFileEntities = async (
  fileUploadGuid: string
): Promise<ClientFileEntityRow[]> => {
  const result = await runQuery<{
    fileUploadGuid: string;
    entityId: number;
    isSelected?: number | boolean | null;
    insertedDttm?: string | Date | null;
    updatedDttm?: string | Date | null;
    updatedBy?: string | null;
  }>(
    `SELECT
      FILE_UPLOAD_GUID as fileUploadGuid,
      ENTITY_ID as entityId,
      IS_SELECTED as isSelected,
      INSERTED_DTTM as insertedDttm,
      UPDATED_DTTM as updatedDttm,
      UPDATED_BY as updatedBy
    FROM ml.CLIENT_FILE_ENTITIES
    WHERE FILE_UPLOAD_GUID = @fileUploadGuid
      AND IS_DELETED = 0`,
    { fileUploadGuid }
  );

  return (result.recordset ?? []).map(mapEntityRow);
};
