import { runQuery } from '../utils/sqlClient';
import { normalizeGlMonth } from '../utils/glMonth';

export interface EntityAccountMappingUpsertInput {
  entityId: string;
  entityAccountId: string;
  polarity?: string | null;
  mappingType?: string | null;
  presetId?: string | null;
  mappingStatus?: string | null;
  exclusionPct?: number | null;
  updatedBy?: string | null;
}

export interface EntityAccountMappingRow extends EntityAccountMappingUpsertInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

export interface EntityAccountMappingWithRecord extends EntityAccountMappingRow {
  fileUploadGuid?: string | null;
  recordId?: number | null;
  accountName?: string | null;
  activityAmount?: number | null;
  glMonth?: string | null;
  presetDetails?: EntityMappingPresetDetailRow[];
}

const TABLE_NAME = 'ml.ENTITY_ACCOUNT_MAPPING';

export interface EntityMappingPresetDetailRow {
  basisDatapoint?: string | null;
  targetDatapoint?: string | null;
  isCalculated?: boolean | null;
  specifiedPct?: number | null;
  recordId?: number | null;
  presetDetailRecordId?: number | null;
}

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value?: number | null): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeExclusionPct = (value?: number | null): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  // Clamp to 0-100 range, then divide by 100 to convert to 0.000-1.000 for database storage
  const clamped = Math.max(0, Math.min(parsed, 100));
  const normalized = clamped / 100;

  return Number.isFinite(normalized) ? normalized : null;
};

const normalizePresetId = (value?: string | null): string | null => {
  const normalized = normalizeText(value);
  if (normalized) {
    return normalized;
  }
  return null;
};

const toEntityId = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return `${value}`.trim();
};

const mapRow = (row: {
  entity_id: string | number | null;
  entity_account_id: string;
  polarity?: string | null;
  mapping_type?: string | null;
  preset_id?: string | null;
  mapping_status?: string | null;
  exclusion_pct?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityAccountMappingRow => ({
  entityId: toEntityId(row.entity_id),
  entityAccountId: row.entity_account_id,
  polarity: row.polarity ?? null,
  mappingType: row.mapping_type ?? null,
  presetId: row.preset_id ?? null,
  mappingStatus: row.mapping_status ?? null,
  // Multiply by 100 to convert from database format (0.000-1.000) to application format (0-100)
  exclusionPct: row.exclusion_pct !== null && row.exclusion_pct !== undefined
    ? row.exclusion_pct * 100
    : null,
  insertedDttm:
    row.inserted_dttm instanceof Date
      ? row.inserted_dttm.toISOString()
      : row.inserted_dttm ?? null,
  updatedDttm:
    row.updated_dttm instanceof Date
      ? row.updated_dttm.toISOString()
      : row.updated_dttm ?? null,
  updatedBy: row.updated_by ?? null,
});

export const listEntityAccountMappings = async (
  entityId: string | undefined,
): Promise<EntityAccountMappingRow[]> => {
  if (!entityId) {
    return [];
  }

  const result = await runQuery<{
    entity_id: string | number;
    entity_account_id: string;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      ENTITY_ID as entity_id,
      ENTITY_ACCOUNT_ID as entity_account_id,
      POLARITY as polarity,
      MAPPING_TYPE as mapping_type,
      PRESET_GUID as preset_id,
      MAPPING_STATUS as mapping_status,
      EXCLUSION_PCT as exclusion_pct,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
    ORDER BY ENTITY_ACCOUNT_ID ASC`,
    { entityId }
  );

  return (result.recordset ?? []).map(mapRow);
};

const hydratePresetDetails = <T extends EntityAccountMappingRow>(
  rows: (T &
    EntityMappingPresetDetailRow & {
      recordId?: number | null;
      presetDetailRecordId?: number | null;
    })[],
): (T & {
  presetDetails?: EntityMappingPresetDetailRow[];
  recordId?: number | null;
})[] => {
  const grouped = new Map<string, {
    base: T & { recordId?: number | null };
    details: EntityMappingPresetDetailRow[];
  }>();

  rows.forEach((row) => {
    const key = `${row.entityId}|${row.entityAccountId}|${row.recordId ?? ''}`;
    const existing = grouped.get(key);
    const detail = row.targetDatapoint
      ? {
          targetDatapoint: row.targetDatapoint,
          basisDatapoint: row.basisDatapoint ?? null,
          isCalculated: row.isCalculated ?? null,
          specifiedPct: row.specifiedPct ?? null,
          recordId: row.presetDetailRecordId ?? null,
        }
      : null;

    if (existing) {
      if (detail) {
        existing.details.push(detail);
      }
      return;
    }

    grouped.set(key, {
      base: {
        ...(row as T),
        recordId: row.recordId ?? null,
      },
      details: detail ? [detail] : [],
    });
  });

  return Array.from(grouped.values()).map(({ base, details }) => ({
    ...base,
    presetDetails: details,
  }));
};

export const listEntityAccountMappingsWithPresets = async (
  entityId: string,
): Promise<(EntityAccountMappingRow & { presetDetails?: EntityMappingPresetDetailRow[] })[]> => {
  if (!entityId) {
    return [];
  }

  const result = await runQuery<
    {
      entity_id: string | number;
      entity_account_id: string;
      polarity?: string | null;
      mapping_type?: string | null;
      preset_id?: string | null;
      mapping_status?: string | null;
      exclusion_pct?: number | null;
      inserted_dttm?: Date | string | null;
      updated_dttm?: Date | string | null;
      updated_by?: string | null;
      record_id?: number | null;
      basisDatapoint?: string | null;
      targetDatapoint?: string | null;
      isCalculated?: boolean | null;
      specifiedPct?: number | null;
      presetDetailRecordId?: number | null;
    }
  >(
    `SELECT
      eam.ENTITY_ID as entity_id,
      eam.ENTITY_ACCOUNT_ID as entity_account_id,
      eam.POLARITY as polarity,
      eam.MAPPING_TYPE as mapping_type,
      eam.PRESET_GUID as preset_id,
      eam.MAPPING_STATUS as mapping_status,
      eam.EXCLUSION_PCT as exclusion_pct,
      eam.INSERTED_DTTM as inserted_dttm,
      eam.UPDATED_DTTM as updated_dttm,
      eam.UPDATED_BY as updated_by,
      emd.BASIS_DATAPOINT as basisDatapoint,
      emd.TARGET_DATAPOINT as targetDatapoint,
      emd.IS_CALCULATED as isCalculated,
      emd.SPECIFIED_PCT as specifiedPct,
      emd.RECORD_ID as presetDetailRecordId
    FROM ${TABLE_NAME} eam
    LEFT JOIN ml.ENTITY_MAPPING_PRESETS emp ON emp.PRESET_GUID = eam.PRESET_GUID
    LEFT JOIN ml.ENTITY_MAPPING_PRESET_DETAIL emd ON emd.PRESET_GUID = emp.PRESET_GUID
    WHERE eam.ENTITY_ID = @entityId
    ORDER BY eam.ENTITY_ACCOUNT_ID ASC`,
    { entityId },
  );

  const rows = (result.recordset ?? []).map((row) => ({
    ...mapRow(row),
    recordId: row.record_id ?? null,
    basisDatapoint: row.basisDatapoint,
    targetDatapoint: row.targetDatapoint,
    isCalculated: row.isCalculated,
    // Multiply by 100 to convert from database format (0.000-1.000) to application format (0-100)
    specifiedPct: row.specifiedPct !== null && row.specifiedPct !== undefined
      ? row.specifiedPct * 100
      : null,
    presetDetailRecordId: row.presetDetailRecordId ?? null,
  }));
  const decorated = hydratePresetDetails(rows);
  return decorated.map(({ presetDetails, ...rest }) => ({
    ...rest,
    presetDetails,
  }));
};

export const listEntityAccountMappingsByFileUpload = async (
  fileUploadGuid: string,
): Promise<EntityAccountMappingWithRecord[]> => {
  if (!fileUploadGuid) {
    return [];
  }

  const result = await runQuery<{
    file_upload_guid: string;
    record_id: number;
    entity_id: string | number | null;
    entity_account_id: string;
    account_name: string | null;
    activity_amount: number | null;
    gl_month: string | null;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
    basisDatapoint?: string | null;
    targetDatapoint?: string | null;
    isCalculated?: boolean | null;
    specifiedPct?: number | null;
    presetDetailRecordId?: number | null;
  }>(
    `SELECT
      fr.FILE_UPLOAD_GUID as file_upload_guid,
      fr.RECORD_ID as record_id,
      fr.ENTITY_ID as entity_id,
      fr.ACCOUNT_ID as entity_account_id,
      fr.ACCOUNT_NAME as account_name,
      fr.ACTIVITY_AMOUNT as activity_amount,
      fr.GL_MONTH as gl_month,
      eam.POLARITY as polarity,
      eam.MAPPING_TYPE as mapping_type,
      eam.PRESET_GUID as preset_id,
      eam.MAPPING_STATUS as mapping_status,
      eam.EXCLUSION_PCT as exclusion_pct,
      eam.INSERTED_DTTM as inserted_dttm,
      eam.UPDATED_DTTM as updated_dttm,
      eam.UPDATED_BY as updated_by,
      emd.BASIS_DATAPOINT as basisDatapoint,
      emd.TARGET_DATAPOINT as targetDatapoint,
      emd.IS_CALCULATED as isCalculated,
      emd.SPECIFIED_PCT as specifiedPct,
      emd.RECORD_ID as presetDetailRecordId
    FROM ml.FILE_RECORDS fr
    LEFT JOIN ${TABLE_NAME} eam
      ON eam.ENTITY_ID = fr.ENTITY_ID AND eam.ENTITY_ACCOUNT_ID = fr.ACCOUNT_ID
    LEFT JOIN ml.ENTITY_MAPPING_PRESETS emp ON emp.PRESET_GUID = eam.PRESET_GUID
    LEFT JOIN ml.ENTITY_MAPPING_PRESET_DETAIL emd ON emd.PRESET_GUID = emp.PRESET_GUID
    WHERE fr.FILE_UPLOAD_GUID = @fileUploadGuid
    ORDER BY fr.SOURCE_SHEET_NAME ASC, fr.RECORD_ID ASC`,
    { fileUploadGuid }
  );

  const rows = (result.recordset ?? []).map((row) => ({
    ...mapRow(row),
    fileUploadGuid: row.file_upload_guid,
    record_id: row.record_id,
    accountName: row.account_name,
    activityAmount: row.activity_amount,
    glMonth: row.gl_month,
    basisDatapoint: row.basisDatapoint,
    targetDatapoint: row.targetDatapoint,
    isCalculated: row.isCalculated,
    // Multiply by 100 to convert from database format (0.000-1.000) to application format (0-100)
    specifiedPct: row.specifiedPct !== null && row.specifiedPct !== undefined
      ? row.specifiedPct * 100
      : null,
    presetDetailRecordId: row.presetDetailRecordId ?? null,
  }));

  return hydratePresetDetails(rows).map(({ presetDetails, ...rest }) => ({
    ...rest,
    presetDetails,
  }));
};

export const listEntityAccountMappingsWithActivityForEntity = async (
  entityId: string,
  glMonths?: string[],
): Promise<EntityAccountMappingWithRecord[]> => {
  if (!entityId) {
    return [];
  }

  const params: Record<string, unknown> = { entityId };
  const normalizedMonths = Array.from(
    new Set(
      (glMonths ?? [])
        .map(month => normalizeGlMonth(month ?? '') ?? month?.trim())
        .filter((month): month is string => Boolean(month)),
    ),
  );

  const monthFilters = normalizedMonths.map((month, index) => {
    params[`glMonth${index}`] = month;
    return `fr.GL_MONTH = @glMonth${index}`;
  });

  const monthClause = monthFilters.length ? ` AND (${monthFilters.join(' OR ')})` : '';

  const result = await runQuery<{
    file_upload_guid: string | null;
    record_id: number | null;
    entity_id: string | number | null;
    entity_account_id: string;
    account_name: string | null | undefined;
    activity_amount: number | null;
    gl_month: string | null;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
    basisDatapoint?: string | null;
    targetDatapoint?: string | null;
    isCalculated?: boolean | null;
    specifiedPct?: number | null;
    presetDetailRecordId?: number | null;
  }>(
    `WITH LatestUploads AS (
      SELECT FILE_UPLOAD_GUID, ENTITY_ID, GL_MONTH
      FROM (
        SELECT
          fr.FILE_UPLOAD_GUID,
          fr.ENTITY_ID,
          fr.GL_MONTH,
          ROW_NUMBER() OVER (
            PARTITION BY fr.ENTITY_ID, fr.GL_MONTH
            ORDER BY fr.INSERTED_DTTM DESC, fr.FILE_UPLOAD_GUID DESC
          ) as rn
        FROM ml.FILE_RECORDS fr
        WHERE fr.ENTITY_ID = @entityId${monthClause}
      ) ranked
      WHERE rn = 1
    )
    SELECT
      fr.FILE_UPLOAD_GUID as file_upload_guid,
      fr.RECORD_ID as record_id,
      eam.ENTITY_ID as entity_id,
      ISNULL(fr.ACCOUNT_ID, eam.ENTITY_ACCOUNT_ID) as entity_account_id,
      fr.ACCOUNT_NAME as account_name,
      fr.ACTIVITY_AMOUNT as activity_amount,
      fr.GL_MONTH as gl_month,
      eam.POLARITY as polarity,
      eam.MAPPING_TYPE as mapping_type,
      eam.PRESET_GUID as preset_id,
      eam.MAPPING_STATUS as mapping_status,
      eam.EXCLUSION_PCT as exclusion_pct,
      eam.INSERTED_DTTM as inserted_dttm,
      eam.UPDATED_DTTM as updated_dttm,
      eam.UPDATED_BY as updated_by,
      emd.BASIS_DATAPOINT as basisDatapoint,
      emd.TARGET_DATAPOINT as targetDatapoint,
      emd.IS_CALCULATED as isCalculated,
      emd.SPECIFIED_PCT as specifiedPct,
      emd.RECORD_ID as presetDetailRecordId
    FROM ${TABLE_NAME} eam
    LEFT JOIN (
      SELECT frInner.*
      FROM ml.FILE_RECORDS frInner
      INNER JOIN LatestUploads lu
        ON lu.FILE_UPLOAD_GUID = frInner.FILE_UPLOAD_GUID
        AND lu.GL_MONTH = frInner.GL_MONTH
        AND (frInner.ENTITY_ID = lu.ENTITY_ID OR frInner.ENTITY_ID IS NULL)
    ) fr
      ON fr.ACCOUNT_ID = eam.ENTITY_ACCOUNT_ID
      AND (fr.ENTITY_ID = eam.ENTITY_ID OR fr.ENTITY_ID IS NULL)
    LEFT JOIN ml.ENTITY_MAPPING_PRESETS emp ON emp.PRESET_GUID = eam.PRESET_GUID
    LEFT JOIN ml.ENTITY_MAPPING_PRESET_DETAIL emd ON emd.PRESET_GUID = emp.PRESET_GUID
    WHERE eam.ENTITY_ID = @entityId
    ORDER BY fr.SOURCE_SHEET_NAME ASC, fr.RECORD_ID ASC`,
    params,
  );

  const rows = (result.recordset ?? []).map((row) => ({
    ...mapRow(row),
    fileUploadGuid: row.file_upload_guid,
    record_id: row.record_id,
    accountName: row.account_name,
    activityAmount: row.activity_amount,
    glMonth: row.gl_month,
    basisDatapoint: row.basisDatapoint,
    targetDatapoint: row.targetDatapoint,
    isCalculated: row.isCalculated,
    // Multiply by 100 to convert from database format (0.000-1.000) to application format (0-100)
    specifiedPct: row.specifiedPct !== null && row.specifiedPct !== undefined
      ? row.specifiedPct * 100
      : null,
    presetDetailRecordId: row.presetDetailRecordId ?? null,
  }));

  return hydratePresetDetails(rows).map(({ presetDetails, ...rest }) => ({
    ...rest,
    presetDetails,
  }));
};

export const upsertEntityAccountMappings = async (
  inputs: EntityAccountMappingUpsertInput[],
): Promise<EntityAccountMappingRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valueRows = inputs.map((input, index) => {
    const presetId = normalizePresetId(input.presetId);

    params[`entityId${index}`] = input.entityId;
    params[`entityAccountId${index}`] = input.entityAccountId;
    params[`polarity${index}`] = normalizeText(input.polarity);
    params[`mappingType${index}`] = normalizeText(input.mappingType);
    params[`presetId${index}`] = presetId;
    params[`mappingStatus${index}`] = normalizeText(input.mappingStatus);
    params[`exclusionPct${index}`] = normalizeExclusionPct(input.exclusionPct);
    params[`updatedBy${index}`] = normalizeText(input.updatedBy);

    return `(@entityId${index}, @entityAccountId${index}, @polarity${index}, @mappingType${index}, @presetId${index}, @mappingStatus${index}, @exclusionPct${index}, @updatedBy${index})`;
  });

  const valuesClause = valueRows.join(', ');

  const result = await runQuery<{
    entity_id: string;
    entity_account_id: string;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SET XACT_ABORT ON;
    BEGIN TRANSACTION;
      DECLARE @payload TABLE (
        entity_id varchar(36),
        entity_account_id varchar(36),
        polarity varchar(50),
        mapping_type varchar(50),
        preset_id varchar(36),
        mapping_status varchar(50),
        exclusion_pct decimal(10, 3),
        updated_by varchar(100)
      );

      INSERT INTO @payload (
        entity_id,
        entity_account_id,
        polarity,
        mapping_type,
        preset_id,
        mapping_status,
        exclusion_pct,
        updated_by
      ) VALUES ${valuesClause};

      MERGE ${TABLE_NAME} AS target
      USING @payload AS source
      ON target.ENTITY_ID = source.entity_id AND target.ENTITY_ACCOUNT_ID = source.entity_account_id
      WHEN MATCHED THEN
        UPDATE SET
          POLARITY = ISNULL(source.polarity, target.POLARITY),
          MAPPING_TYPE = ISNULL(source.mapping_type, target.MAPPING_TYPE),
          PRESET_GUID = ISNULL(source.preset_id, target.PRESET_GUID),
          MAPPING_STATUS = ISNULL(source.mapping_status, target.MAPPING_STATUS),
          EXCLUSION_PCT = ISNULL(source.exclusion_pct, target.EXCLUSION_PCT),
          UPDATED_BY = source.updated_by,
          UPDATED_DTTM = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (
          ENTITY_ID,
          ENTITY_ACCOUNT_ID,
          POLARITY,
          MAPPING_TYPE,
          PRESET_GUID,
          MAPPING_STATUS,
          EXCLUSION_PCT,
          UPDATED_DTTM,
          UPDATED_BY
        ) VALUES (
          source.entity_id,
          source.entity_account_id,
          source.polarity,
          source.mapping_type,
          source.preset_id,
          source.mapping_status,
          source.exclusion_pct,
          NULL,
          NULL
        )
      OUTPUT
        inserted.ENTITY_ID as entity_id,
        inserted.ENTITY_ACCOUNT_ID as entity_account_id,
        inserted.POLARITY as polarity,
        inserted.MAPPING_TYPE as mapping_type,
        inserted.PRESET_GUID as preset_id,
        inserted.MAPPING_STATUS as mapping_status,
        inserted.EXCLUSION_PCT as exclusion_pct,
        inserted.INSERTED_DTTM as inserted_dttm,
        inserted.UPDATED_DTTM as updated_dttm,
        inserted.UPDATED_BY as updated_by;
    COMMIT TRANSACTION;`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export const listEntityAccountMappingsForAccounts = async (
  mappings: { entityId: string; entityAccountId: string }[],
): Promise<EntityAccountMappingRow[]> => {
  if (!mappings.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const clauses = mappings.map((mapping, index) => {
    params[`entityId${index}`] = mapping.entityId;
    params[`entityAccountId${index}`] = mapping.entityAccountId;
    return `(ENTITY_ID = @entityId${index} AND ENTITY_ACCOUNT_ID = @entityAccountId${index})`;
  });

  const whereClause = clauses.join(' OR ');

  const result = await runQuery<{
    entity_id: string | number;
    entity_account_id: string;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      ENTITY_ID as entity_id,
      ENTITY_ACCOUNT_ID as entity_account_id,
      POLARITY as polarity,
      MAPPING_TYPE as mapping_type,
      PRESET_GUID as preset_id,
      MAPPING_STATUS as mapping_status,
      EXCLUSION_PCT as exclusion_pct,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE ${whereClause}`,
    params,
  );

  return (result.recordset ?? []).map(mapRow);
};

export default listEntityAccountMappings;
