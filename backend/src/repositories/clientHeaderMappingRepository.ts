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

type NormalizedMapping = {
  templateHeader: string;
  sourceHeader: string | null;
  mappingMethod: string | null;
  updatedBy: string | null;
};

const normalizeMappings = (
  mappings: ClientHeaderMappingInput[]
): NormalizedMapping[] => {
  const unique = new Map<string, NormalizedMapping>();

  mappings.forEach(({ templateHeader, sourceHeader, mappingMethod, updatedBy }) => {
    const normalizedTemplate = normalizeHeader(templateHeader);
    const normalizedSource = normalizeHeader(sourceHeader ?? null);
    const normalizedMethod = normalizeHeader(mappingMethod ?? null);
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

  const normalizedMappings = normalizeMappings(mappings);

  if (normalizedMappings.length === 0) {
    logInfo('No normalized mappings to upsert; returning current mappings', {
      clientId: normalizedClientId,
    });
    return listClientHeaderMappings(normalizedClientId);
  }

  const existingMappings = await listClientHeaderMappings(normalizedClientId);
  const existingByTemplate = new Map(
    existingMappings.map((mapping) => [mapping.templateHeader, mapping])
  );

  logInfo('Preparing to upsert client header mappings', {
    clientId: normalizedClientId,
    requestedMappings: mappings.length,
    normalizedMappings: normalizedMappings.length,
  });

  const resolvedMappings = normalizedMappings.map((mapping) => {
    const existing = existingByTemplate.get(mapping.templateHeader);
    const resolvedMethod =
      mapping.mappingMethod ??
      (existing && existing.sourceHeader === mapping.sourceHeader
        ? existing.mappingMethod
        : 'manual');

    return {
      ...mapping,
      mappingMethod: resolvedMethod ?? 'manual',
    };
  });

  const params: Record<string, unknown> = {
    clientId: normalizedClientId,
  };

  const valuesClause = resolvedMappings
    .map((mapping, index) => {
      const templateKey = `templateHeader${index}`;
      const sourceKey = `sourceHeader${index}`;
      const methodKey = `mappingMethod${index}`;
      const updatedByKey = `updatedBy${index}`;
      params[templateKey] = mapping.templateHeader;
      params[sourceKey] = mapping.sourceHeader;
      params[methodKey] = mapping.mappingMethod;
      params[updatedByKey] = mapping.updatedBy;
      return `(@clientId, @${templateKey}, @${sourceKey}, @${methodKey}, @${updatedByKey})`;
    })
    .join(', ');

  await runQuery(
    `MERGE ${TABLE_NAME} AS target
    USING (VALUES ${valuesClause}) AS source (CLIENT_ID, TEMPLATE_HEADER, SOURCE_HEADER, MAPPING_METHOD, UPDATED_BY)
      ON target.CLIENT_ID = source.CLIENT_ID AND target.TEMPLATE_HEADER = source.TEMPLATE_HEADER
    WHEN MATCHED AND (
      ISNULL(target.SOURCE_HEADER, '') <> ISNULL(source.SOURCE_HEADER, '') OR
      ISNULL(target.MAPPING_METHOD, '') <> ISNULL(source.MAPPING_METHOD, '')
    ) THEN
      UPDATE SET
        SOURCE_HEADER = source.SOURCE_HEADER,
        MAPPING_METHOD = source.MAPPING_METHOD,
        UPDATED_BY = source.UPDATED_BY,
        UPDATED_DTTM = SYSUTCDATETIME()
    WHEN NOT MATCHED AND source.SOURCE_HEADER IS NOT NULL THEN
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
  return upsertClientHeaderMappings(normalizedClientId, normalizedMappings);
};

export default listClientHeaderMappings;