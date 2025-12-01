import { runQuery } from '../utils/sqlClient';

export interface ClientEntityRecord {
  entityId: string;
  clientId: string;
  entityName: string;
  entityDisplayName: string;
  aliases: string[];
}

interface RawClientEntityRow {
  entityId: string;
  entityName: string;
  entityDisplayName: string;
  aliases?: string | null;
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

export const listClientEntities = async (
  clientId: string
): Promise<ClientEntityRecord[]> => {
  if (!clientId || clientId.trim().length === 0) {
    return [];
  }

  const result = await runQuery<RawClientEntityRow>(
    `SELECT
      ENTITY_ID as entityId,
      ENTITY_NAME as entityName,
      ENTITY_DISPLAY_NAME as entityDisplayName
    FROM ml.CLIENT_ENTITIES
    WHERE CLIENT_ID = @clientId
      AND ISNULL(IS_DELETED, 0) = 0
      AND (ENTITY_STATUS IS NULL OR UPPER(ENTITY_STATUS) = 'ACTIVE')`,
    { clientId }
  );

  return (result.recordset ?? []).map((row) => ({
    entityId: row.entityId,
    clientId,
    entityName: row.entityName,
    entityDisplayName: row.entityDisplayName,
    aliases: parseAliases(row.aliases),
  }));
};

export default listClientEntities;
