import { runQuery } from '../utils/sqlClient';

export interface ClientHeaderMappingRecord {
  mappingId: number;
  clientId: string;
  templateHeader: string;
  sourceHeader: string;
  mappingMethod: string;
  insertedAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface ClientHeaderMappingInput {
  templateHeader: string;
  sourceHeader?: string | null;
  mappingMethod?: string | null;
  updatedBy?: string | null;
}

const TABLE_NAME = 'ml.CLIENT_HEADER_MAPPING';
let tableEnsured = false;
const logPrefix = '[clientHeaderMappingRepository]';
const shouldLog = process.env.NODE_ENV !== 'test';

const logInfo = (...args: unknown[]) => {
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(logPrefix, ...args);
};

const normalizeHeader = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.toString().trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureTable = async () => {
  if (tableEnsured) {
    return;
  }

  await runQuery(
    `IF NOT EXISTS (
      SELECT 1
      FROM sys.tables t
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = 'CLIENT_HEADER_MAPPING' AND s.name = 'ml'
    )
    BEGIN
      CREATE TABLE ${TABLE_NAME} (
        MAPPING_ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CLIENT_ID INT NOT NULL,
        SOURCE_HEADER NVARCHAR(100) NOT NULL,
        TEMPLATE_HEADER NVARCHAR(100) NOT NULL,
        MAPPING_METHOD NVARCHAR(100) NOT NULL,
        INSERTED_DTTM DATETIME2 NOT NULL CONSTRAINT DF_CLIENT_HEADER_MAPPING_INSERTED DEFAULT SYSUTCDATETIME(),
        UPDATED_DTTM DATETIME2 NULL,
        UPDATED_BY NVARCHAR(100) NULL,
        CONSTRAINT UX_CLIENT_HEADER_MAPPING UNIQUE (CLIENT_ID, TEMPLATE_HEADER)
      );
    END
    ELSE
    BEGIN
      DECLARE @UpdatedDttmConstraint NVARCHAR(200);
      SELECT @UpdatedDttmConstraint = dc.name
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      WHERE dc.parent_object_id = OBJECT_ID('${TABLE_NAME}') AND c.name = 'UPDATED_DTTM';

      IF @UpdatedDttmConstraint IS NOT NULL
      BEGIN
        EXEC('ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT ' + QUOTENAME(@UpdatedDttmConstraint));
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID('${TABLE_NAME}')
          AND name = 'UPDATED_DTTM'
          AND is_nullable = 0
      )
      BEGIN
        ALTER TABLE ${TABLE_NAME} ALTER COLUMN UPDATED_DTTM DATETIME2 NULL;
      END
    END`
  );

  tableEnsured = true;
};

type NormalizedMapping = {
  templateHeader: string;
  sourceHeader: string | null;
  mappingMethod: string;
  updatedBy: string | null;
};

const normalizeMappings = (
  mappings: ClientHeaderMappingInput[]
): NormalizedMapping[] => {
  const unique = new Map<string, NormalizedMapping>();

  mappings.forEach(({ templateHeader, sourceHeader, mappingMethod, updatedBy }) => {
    const normalizedTemplate = normalizeHeader(templateHeader);
    const normalizedSource = normalizeHeader(sourceHeader ?? null);
    const normalizedMethod = normalizeHeader(mappingMethod ?? 'manual') ?? 'manual';
    const normalizedUpdatedBy = normalizeHeader(updatedBy ?? null);

    if (!normalizedTemplate) {
      return;
    }

    unique.set(normalizedTemplate, {
      templateHeader: normalizedTemplate,
      sourceHeader: normalizedSource,
      mappingMethod: normalizedMethod,
      updatedBy: normalizedUpdatedBy,
    });
  });

  return Array.from(unique.values());
};

const mapRowToRecord = (row: {
  mapping_id: number;
  client_id: string;
  template_header: string;
  source_header: string;
  mapping_method: string;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): ClientHeaderMappingRecord => ({
  mappingId: Number(row.mapping_id),
  clientId: row.client_id,
  templateHeader: row.template_header,
  sourceHeader: row.source_header,
  mappingMethod: row.mapping_method,
  insertedAt: row.inserted_dttm
    ? new Date(row.inserted_dttm).toISOString()
    : undefined,
  updatedAt: row.updated_dttm ? new Date(row.updated_dttm).toISOString() : undefined,
  updatedBy: row.updated_by ?? null,
});

export const listClientHeaderMappings = async (
  clientId: string
): Promise<ClientHeaderMappingRecord[]> => {
  if (!normalizeHeader(clientId)) {
    return [];
  }

  await ensureTable();

  const result = await runQuery<{
    mapping_id: number;
    client_id: string;
    template_header: string;
    source_header: string;
    mapping_method: string;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      MAPPING_ID AS mapping_id,
      CLIENT_ID AS client_id,
      TEMPLATE_HEADER AS template_header,
      SOURCE_HEADER AS source_header,
      MAPPING_METHOD AS mapping_method,
      CASE
        WHEN COL_LENGTH('ml.CLIENT_HEADER_MAPPING', 'INSERTED_DTTM') IS NOT NULL THEN INSERTED_DTTM
        ELSE NULL
      END AS inserted_dttm,
      CASE
        WHEN COL_LENGTH('ml.CLIENT_HEADER_MAPPING', 'UPDATED_DTTM') IS NOT NULL THEN UPDATED_DTTM
        ELSE NULL
      END AS updated_dttm,
      CASE
        WHEN COL_LENGTH('ml.CLIENT_HEADER_MAPPING', 'UPDATED_BY') IS NOT NULL THEN UPDATED_BY
        ELSE NULL
      END AS updated_by
    FROM ${TABLE_NAME}
    WHERE CLIENT_ID = @clientId
    ORDER BY TEMPLATE_HEADER ASC`,
    { clientId }
  );

  return (result.recordset ?? []).map(mapRowToRecord);
};

export const upsertClientHeaderMappings = async (
  clientId: string,
  mappings: ClientHeaderMappingInput[]
): Promise<ClientHeaderMappingRecord[]> => {
  const normalizedClientId = normalizeHeader(clientId);
  if (!normalizedClientId) {
    return [];
  }

  const normalizedMappings = normalizeMappings(mappings).filter(
    (mapping) => mapping.sourceHeader !== null
  );

  logInfo('Preparing to upsert client header mappings', {
    clientId: normalizedClientId,
    requestedMappings: mappings.length,
    normalizedMappings: normalizedMappings.length,
  });

  if (normalizedMappings.length === 0) {
    logInfo('No normalized mappings to upsert; returning current mappings', {
      clientId: normalizedClientId,
    });
    return listClientHeaderMappings(normalizedClientId);
  }

  await ensureTable();

  const params: Record<string, unknown> = {
    clientId: normalizedClientId,
  };

  const valuesClause = normalizedMappings
    .map((mapping, index) => {
      const templateKey = `templateHeader${index}`;
      const sourceKey = `sourceHeader${index}`;
      const methodKey = `mappingMethod${index}`;
      params[templateKey] = mapping.templateHeader;
      params[sourceKey] = mapping.sourceHeader;
      params[methodKey] = mapping.mappingMethod;
      if (mapping.updatedBy !== null) {
        const updatedByKey = `updatedBy${index}`;
        params[updatedByKey] = mapping.updatedBy;
        return `(@clientId, @${templateKey}, @${sourceKey}, @${methodKey}, @${updatedByKey})`;
      }

      return `(@clientId, @${templateKey}, @${sourceKey}, @${methodKey}, NULL)`;
    })
    .join(', ');

  await runQuery(
    `MERGE ${TABLE_NAME} AS target
    USING (VALUES ${valuesClause}) AS source (CLIENT_ID, TEMPLATE_HEADER, SOURCE_HEADER, MAPPING_METHOD, UPDATED_BY)
      ON target.CLIENT_ID = source.CLIENT_ID AND target.TEMPLATE_HEADER = source.TEMPLATE_HEADER
    WHEN MATCHED THEN
      UPDATE SET
        SOURCE_HEADER = source.SOURCE_HEADER,
        MAPPING_METHOD = source.MAPPING_METHOD,
        UPDATED_BY = source.UPDATED_BY,
        UPDATED_DTTM = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        CLIENT_ID,
        TEMPLATE_HEADER,
        SOURCE_HEADER,
        MAPPING_METHOD,
        INSERTED_DTTM
      )
      VALUES (
        source.CLIENT_ID,
        source.TEMPLATE_HEADER,
        source.SOURCE_HEADER,
        source.MAPPING_METHOD,
        SYSUTCDATETIME()
      );`,
    params
  );

  logInfo('Upsert complete; fetching stored mappings', {
    clientId: normalizedClientId,
  });

  return listClientHeaderMappings(normalizedClientId);
};

export const replaceClientHeaderMappings = async (
  clientId: string,
  mappings: ClientHeaderMappingInput[]
): Promise<ClientHeaderMappingRecord[]> => {
  const normalizedClientId = normalizeHeader(clientId);
  if (!normalizedClientId) {
    return [];
  }

  const normalizedMappings = normalizeMappings(mappings);
  logInfo('Preparing to replace client header mappings', {
    clientId: normalizedClientId,
    requestedMappings: mappings.length,
    normalizedMappings: normalizedMappings.length,
  });
  if (normalizedMappings.length === 0) {
    logInfo('No normalized mappings provided; returning current mappings', {
      clientId: normalizedClientId,
    });
    return listClientHeaderMappings(normalizedClientId);
  }

  await ensureTable();

  const params: Record<string, unknown> = {
    clientId: normalizedClientId,
  };

  const mappingsWithIndex = normalizedMappings.map((mapping, index) => ({
    mapping,
    index,
  }));

  mappingsWithIndex.forEach(({ mapping, index }) => {
    params[`templateHeader${index}`] = mapping.templateHeader;
    if (mapping.sourceHeader !== null) {
      params[`sourceHeader${index}`] = mapping.sourceHeader;
      params[`mappingMethod${index}`] = mapping.mappingMethod;
    }
  });

  const deletePlaceholders = mappingsWithIndex
    .map(({ index }) => `@templateHeader${index}`)
    .join(', ');

  await runQuery(
    `DELETE FROM ${TABLE_NAME}
    WHERE CLIENT_ID = @clientId AND TEMPLATE_HEADER IN (${deletePlaceholders})`,
    params
  );

  const inserts = mappingsWithIndex.filter(
    ({ mapping }) => mapping.sourceHeader !== null
  );

  if (inserts.length > 0) {
    const valuesClause = inserts
      .map(
        ({ index }) =>
          `(@clientId, @templateHeader${index}, @sourceHeader${index}, @mappingMethod${index}, SYSUTCDATETIME())`
      )
      .join(', ');

    await runQuery(
      `INSERT INTO ${TABLE_NAME} (
        CLIENT_ID,
        TEMPLATE_HEADER,
        SOURCE_HEADER,
        MAPPING_METHOD,
        INSERTED_DTTM
      )
      VALUES ${valuesClause}`,
      params
    );
  }

  logInfo('Replace complete; fetching stored mappings', {
    clientId: normalizedClientId,
  });

  return listClientHeaderMappings(normalizedClientId);
};

export default listClientHeaderMappings;
