import { runQuery } from '../utils/sqlClient';

export type ClientEntityStatus = 'ACTIVE' | 'INACTIVE';

export interface ClientEntityRecord {
  entityId: string;
  clientId: string;
  entityName: string;
  entityDisplayName: string;
  entityStatus: ClientEntityStatus;
  aliases: string[];
  updatedDttm?: string | null;
  updatedBy?: string | null;
  deletedDttm?: string | null;
  deletedBy?: string | null;
  isDeleted?: boolean;
}

export interface ClientEntityInput {
  clientId: string;
  entityName: string;
  entityDisplayName?: string | null;
  entityStatus?: string | null;
  updatedBy?: string | null;
}

export interface ClientEntityUpdateInput extends ClientEntityInput {
  entityId: string;
}

interface RawClientEntityRow {
  entity_id: string | number;
  client_id: string | number;
  entity_name: string;
  entity_display_name?: string | null;
  entity_status?: string | null;
  aliases?: string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
  deleted_dttm?: Date | string | null;
  deleted_by?: string | null;
  is_deleted?: boolean | number | null;
}

const parseAliases = (value?: string | null): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(/[,;\n]/)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
};

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStatus = (value?: string | null): ClientEntityStatus => {
  const normalized = value?.trim().toUpperCase();
  return normalized === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
};

const mapRow = (row: RawClientEntityRow): ClientEntityRecord => ({
  entityId: `${row.entity_id}`,
  clientId: `${row.client_id}`,
  entityName: row.entity_name,
  entityDisplayName: row.entity_display_name || row.entity_name,
  entityStatus: normalizeStatus(row.entity_status),
  aliases: parseAliases(row.aliases),
  updatedDttm:
    row.updated_dttm instanceof Date
      ? row.updated_dttm.toISOString()
      : row.updated_dttm ?? null,
  updatedBy: row.updated_by ?? null,
  deletedDttm:
    row.deleted_dttm instanceof Date
      ? row.deleted_dttm.toISOString()
      : row.deleted_dttm ?? null,
  deletedBy: row.deleted_by ?? null,
  isDeleted:
    typeof row.is_deleted === 'boolean'
      ? row.is_deleted
      : Boolean(row.is_deleted && Number(row.is_deleted) !== 0),
});

const normalizeClientId = (value?: string | number | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const listClientEntities = async (
  clientId: string | number,
): Promise<ClientEntityRecord[]> => {
  const normalizedClientId = normalizeClientId(clientId);
  if (!normalizedClientId) {
    return [];
  }

  const result = await runQuery<RawClientEntityRow>(
    `SELECT
      ENTITY_ID as entity_id,
      CLIENT_ID as client_id,
      ENTITY_NAME as entity_name,
      ENTITY_DISPLAY_NAME as entity_display_name,
      ENTITY_STATUS as entity_status,
      IS_DELETED as is_deleted,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by,
      DELETED_DTTM as deleted_dttm,
      DELETED_BY as deleted_by
    FROM ml.CLIENT_ENTITIES
    WHERE CLIENT_ID = @clientId
      AND ISNULL(IS_DELETED, 0) = 0`,
    { clientId: normalizedClientId }
  );

  return (result.recordset ?? []).map(mapRow);
};

export const createClientEntity = async (
  input: ClientEntityInput,
): Promise<ClientEntityRecord | null> => {
  const clientId = normalizeText(input.clientId);
  const entityName = normalizeText(input.entityName);
  if (!clientId || !entityName) {
    return null;
  }

  const entityDisplayName = normalizeText(input.entityDisplayName) ?? entityName;
  const entityStatus = normalizeStatus(input.entityStatus);
  const updatedBy = normalizeText(input.updatedBy);

  const result = await runQuery<RawClientEntityRow>(
    `INSERT INTO ml.CLIENT_ENTITIES (
      CLIENT_ID,
      ENTITY_NAME,
      ENTITY_DISPLAY_NAME,
      ENTITY_STATUS
    )
    OUTPUT
      inserted.ENTITY_ID as entity_id,
      inserted.CLIENT_ID as client_id,
      inserted.ENTITY_NAME as entity_name,
      inserted.ENTITY_DISPLAY_NAME as entity_display_name,
      inserted.ENTITY_STATUS as entity_status,
      inserted.IS_DELETED as is_deleted,
      inserted.UPDATED_DTTM as updated_dttm,
      inserted.UPDATED_BY as updated_by,
      inserted.DELETED_DTTM as deleted_dttm,
      inserted.DELETED_BY as deleted_by
    VALUES (@clientId, @entityName, @entityDisplayName, @entityStatus);`,
    {
      clientId,
      entityName,
      entityDisplayName,
      entityStatus,
    },
  );

  const row = result.recordset?.[0];
  return row ? mapRow(row) : null;
};

export interface ClientEntityUpdateResult {
  record: ClientEntityRecord | null;
  rowsAffected: number;
}

export const updateClientEntity = async (
  input: ClientEntityUpdateInput,
): Promise<ClientEntityUpdateResult> => {
  const clientId = normalizeText(input.clientId);
  const entityId = normalizeText(input.entityId);
  const entityName = normalizeText(input.entityName);
  if (!clientId || !entityId || !entityName) {
    return { record: null, rowsAffected: 0 };
  }

  const entityDisplayName = normalizeText(input.entityDisplayName) ?? entityName;
  const entityStatus = normalizeStatus(input.entityStatus);
  const updatedBy = normalizeText(input.updatedBy);

  const result = await runQuery<RawClientEntityRow>(
    `UPDATE ml.CLIENT_ENTITIES
    SET
      ENTITY_NAME = @entityName,
      ENTITY_DISPLAY_NAME = @entityDisplayName,
      ENTITY_STATUS = @entityStatus,
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    OUTPUT
      inserted.ENTITY_ID as entity_id,
      inserted.CLIENT_ID as client_id,
      inserted.ENTITY_NAME as entity_name,
      inserted.ENTITY_DISPLAY_NAME as entity_display_name,
      inserted.ENTITY_STATUS as entity_status,
      inserted.IS_DELETED as is_deleted,
      inserted.UPDATED_DTTM as updated_dttm,
      inserted.UPDATED_BY as updated_by,
      inserted.DELETED_DTTM as deleted_dttm,
      inserted.DELETED_BY as deleted_by
    WHERE ENTITY_ID = @entityId AND CLIENT_ID = @clientId AND ISNULL(IS_DELETED, 0) = 0;`,
    {
      clientId,
      entityId,
      entityName,
      entityDisplayName,
      entityStatus,
      updatedBy,
    },
  );

  const rowsAffected = result.rowsAffected?.[0] ?? 0;
  const row = result.recordset?.[0];
  if (row) {
    return { record: mapRow(row), rowsAffected };
  }

  if (rowsAffected > 0) {
    const fetched = await runQuery<RawClientEntityRow>(
      `SELECT
        ENTITY_ID as entity_id,
        CLIENT_ID as client_id,
        ENTITY_NAME as entity_name,
        ENTITY_DISPLAY_NAME as entity_display_name,
        ENTITY_STATUS as entity_status,
        IS_DELETED as is_deleted,
        UPDATED_DTTM as updated_dttm,
        UPDATED_BY as updated_by,
        DELETED_DTTM as deleted_dttm,
        DELETED_BY as deleted_by
      FROM ml.CLIENT_ENTITIES
      WHERE ENTITY_ID = @entityId
        AND CLIENT_ID = @clientId
        AND ISNULL(IS_DELETED, 0) = 0`,
      { entityId, clientId },
    );

    const fetchedRow = fetched.recordset?.[0];
    return { record: fetchedRow ? mapRow(fetchedRow) : null, rowsAffected };
  }

  return { record: null, rowsAffected };
};

export const softDeleteClientEntity = async (
  input: Pick<ClientEntityUpdateInput, 'clientId' | 'entityId' | 'updatedBy'>,
): Promise<ClientEntityRecord | null> => {
  const clientId = normalizeText(input.clientId);
  const entityId = normalizeText(input.entityId);
  if (!clientId || !entityId) {
    return null;
  }

  const updatedBy = normalizeText(input.updatedBy);

  const result = await runQuery<RawClientEntityRow>(
    `UPDATE ml.CLIENT_ENTITIES
    SET
      IS_DELETED = 1,
      DELETED_DTTM = SYSUTCDATETIME(),
      DELETED_BY = @updatedBy,
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    OUTPUT
      inserted.ENTITY_ID as entity_id,
      inserted.CLIENT_ID as client_id,
      inserted.ENTITY_NAME as entity_name,
      inserted.ENTITY_DISPLAY_NAME as entity_display_name,
      inserted.ENTITY_STATUS as entity_status,
      inserted.IS_DELETED as is_deleted,
      inserted.UPDATED_DTTM as updated_dttm,
      inserted.UPDATED_BY as updated_by,
      inserted.DELETED_DTTM as deleted_dttm,
      inserted.DELETED_BY as deleted_by
    WHERE ENTITY_ID = @entityId AND CLIENT_ID = @clientId;`,
    {
      clientId,
      entityId,
      updatedBy,
    },
  );

  const row = result.recordset?.[0];
  return row ? mapRow(row) : null;
};

export default listClientEntities;