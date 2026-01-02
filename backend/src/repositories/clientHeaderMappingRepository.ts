import { runQuery } from '../utils/sqlClient';

export interface ClientHeaderMappingRecord {
  mappingId: number;
  clientId: string;
  templateHeader: string;
  sourceHeader: string;
  mappingMethod: string;
  fileUploadGuid?: string | null;
  insertedAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface ClientHeaderMappingInput {
  templateHeader: string;
  sourceHeader?: string | null;
  mappingMethod?: string | null;
  fileUploadGuid?: string | null;
  updatedBy?: string | null;
}

export interface UserDefinedHeaderMapping {
  templateHeader: string;
  sourceHeader: string;
}

const TABLE_NAME = 'ml.CLIENT_HEADER_MAPPING';
const logPrefix = '[clientHeaderMappingRepository]';
const shouldLog = process.env.NODE_ENV !== 'test';
const USER_DEFINED_TEMPLATES = ['User Defined 1', 'User Defined 2', 'User Defined 3'];

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
  fileUploadGuid: string | null;
  updatedBy: string | null;
};

const normalizeMappings = (
  mappings: ClientHeaderMappingInput[]
): NormalizedMapping[] => {
  const unique = new Map<string, NormalizedMapping>();

  mappings.forEach(({ templateHeader, sourceHeader, mappingMethod, fileUploadGuid, updatedBy }) => {
    const normalizedTemplate = normalizeHeader(templateHeader);
    const normalizedSource = normalizeHeader(sourceHeader ?? null);
    const normalizedMethod = normalizeHeader(mappingMethod ?? null);
    const normalizedFileUploadGuid = normalizeHeader(fileUploadGuid ?? null);
    const normalizedUpdatedBy = normalizeHeader(updatedBy ?? null);

    if (!normalizedTemplate) {
      return;
    }

    unique.set(normalizedTemplate, {
      templateHeader: normalizedTemplate,
      sourceHeader: normalizedSource,
      mappingMethod: normalizedMethod,
      fileUploadGuid: normalizedFileUploadGuid,
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
  file_upload_guid?: string | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): ClientHeaderMappingRecord => ({
  mappingId: Number(row.mapping_id),
  clientId: row.client_id,
  templateHeader: row.template_header,
  sourceHeader: row.source_header,
  mappingMethod: row.mapping_method,
  fileUploadGuid: row.file_upload_guid ?? null,
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
    file_upload_guid?: string | null;
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
      FILE_UPLOAD_GUID AS file_upload_guid,
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
    const resolvedFileUploadGuid =
      mapping.fileUploadGuid ?? existing?.fileUploadGuid ?? null;

    return {
      ...mapping,
      mappingMethod: resolvedMethod ?? 'manual',
      fileUploadGuid: resolvedFileUploadGuid,
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
      const fileKey = `fileUploadGuid${index}`;
      const updatedByKey = `updatedBy${index}`;
      params[templateKey] = mapping.templateHeader;
      params[sourceKey] = mapping.sourceHeader;
      params[methodKey] = mapping.mappingMethod;
      params[fileKey] = mapping.fileUploadGuid;
      params[updatedByKey] = mapping.updatedBy;
      return `(@clientId, @${templateKey}, @${sourceKey}, @${methodKey}, @${fileKey}, @${updatedByKey})`;
    })
    .join(', ');

  await runQuery(
    `MERGE ${TABLE_NAME} AS target
    USING (VALUES ${valuesClause}) AS source (CLIENT_ID, TEMPLATE_HEADER, SOURCE_HEADER, MAPPING_METHOD, FILE_UPLOAD_GUID, UPDATED_BY)
      ON target.CLIENT_ID = source.CLIENT_ID AND target.TEMPLATE_HEADER = source.TEMPLATE_HEADER
    WHEN MATCHED AND (
      ISNULL(target.SOURCE_HEADER, '') <> ISNULL(source.SOURCE_HEADER, '') OR
      ISNULL(target.MAPPING_METHOD, '') <> ISNULL(source.MAPPING_METHOD, '') OR
      ISNULL(target.FILE_UPLOAD_GUID, '') <> ISNULL(source.FILE_UPLOAD_GUID, '')
    ) THEN
      UPDATE SET
        SOURCE_HEADER = source.SOURCE_HEADER,
        MAPPING_METHOD = source.MAPPING_METHOD,
        FILE_UPLOAD_GUID = source.FILE_UPLOAD_GUID,
        UPDATED_BY = source.UPDATED_BY,
        UPDATED_DTTM = SYSUTCDATETIME()
    WHEN NOT MATCHED AND source.SOURCE_HEADER IS NOT NULL THEN
      INSERT (
        CLIENT_ID,
        TEMPLATE_HEADER,
        SOURCE_HEADER,
        MAPPING_METHOD,
        FILE_UPLOAD_GUID,
        INSERTED_DTTM
      )
      VALUES (
        source.CLIENT_ID,
        source.TEMPLATE_HEADER,
        source.SOURCE_HEADER,
        source.MAPPING_METHOD,
        source.FILE_UPLOAD_GUID,
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

export const listUserDefinedHeaderMappingsForFileUpload = async (
  fileUploadGuid: string,
): Promise<UserDefinedHeaderMapping[]> => {
  const normalizedFileUploadGuid = normalizeHeader(fileUploadGuid);
  if (!normalizedFileUploadGuid) {
    return [];
  }

  const params: Record<string, unknown> = {
    fileUploadGuid: normalizedFileUploadGuid,
  };

  USER_DEFINED_TEMPLATES.forEach((header, index) => {
    params[`templateHeader${index}`] = header;
  });

  const templateParams = USER_DEFINED_TEMPLATES.map(
    (_header, index) => `@templateHeader${index}`,
  ).join(', ');

  const result = await runQuery<{
    template_header: string;
    source_header: string;
  }>(
    `SELECT
      TEMPLATE_HEADER as template_header,
      SOURCE_HEADER as source_header
    FROM ${TABLE_NAME}
    WHERE FILE_UPLOAD_GUID = @fileUploadGuid
      AND TEMPLATE_HEADER IN (${templateParams})
      AND LTRIM(RTRIM(ISNULL(SOURCE_HEADER, ''))) <> ''
    ORDER BY TEMPLATE_HEADER ASC`,
    params,
  );

  return (result.recordset ?? []).map((row) => ({
    templateHeader: row.template_header,
    sourceHeader: row.source_header,
  }));
};

export default listClientHeaderMappings;
