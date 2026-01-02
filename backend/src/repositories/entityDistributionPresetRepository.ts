import { runQuery } from '../utils/sqlClient';
import type { EntityDistributionPresetDetailRow } from './entityDistributionPresetDetailRepository';

export interface EntityDistributionPresetInput {
  entityId: string;
  entityAccountId: string;
  presetType: string;
  presetDescription?: string | null;
  presetGuid?: string;
  scoaAccountId: string;
  metric?: string | null;
}

export interface EntityDistributionPresetRow
  extends Omit<EntityDistributionPresetInput, 'presetGuid'> {
  presetGuid: string;
  insertedDttm?: string | null;
  updatedDttm?: string | null;
  updatedBy?: string | null;
}

export interface EntityDistributionPresetWithDetailsRow extends EntityDistributionPresetRow {
  presetDetails?: EntityDistributionPresetDetailRow[];
}

const TABLE_NAME = 'ml.ENTITY_DISTRIBUTION_PRESETS';
const DISTRIBUTION_TABLE_NAME = 'ml.ENTITY_SCOA_DISTRIBUTION';

const ENTITY_ACCOUNT_COLUMN_CANDIDATES = [
  'ENTITY_ACCOUNT_ID',
  'ACCOUNT_ID',
  'GL_ACCOUNT_ID',
  'SOURCE_ACCOUNT_ID',
  'ENTITY_GL_ACCOUNT_ID',
];

const SCOA_ACCOUNT_COLUMN_CANDIDATES = [
  'SCOA_ACCOUNT_ID',
  'TARGET_ACCOUNT_ID',
  'SCOA_ID',
  'SCOA_ACCOUNT',
];

type PresetTableSchema = {
  hasEntityAccountId: boolean;
  hasScoaAccountId: boolean;
};

type DistributionTableSchema = {
  entityAccountColumn: string | null;
  scoaAccountColumn: string | null;
};

let presetTableSchemaPromise: Promise<PresetTableSchema> | null = null;
let distributionTableSchemaPromise: Promise<DistributionTableSchema> | null = null;

const resolveColumnName = (
  columns: Set<string>,
  candidates: string[],
): string | null => {
  const match = candidates.find((candidate) => columns.has(candidate));
  return match ?? null;
};

const loadPresetTableSchema = async (): Promise<PresetTableSchema> => {
  if (!presetTableSchemaPromise) {
    presetTableSchemaPromise = (async () => {
      const result = await runQuery<{ column_name: string }>(
        `SELECT COLUMN_NAME as column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = PARSENAME(@tableName, 2)
          AND TABLE_NAME = PARSENAME(@tableName, 1)`,
        {
          tableName: TABLE_NAME,
        },
      );

      const columns = new Set(
        (result.recordset ?? []).map((row) => row.column_name.toUpperCase()),
      );

      return {
        hasEntityAccountId: columns.has('ENTITY_ACCOUNT_ID'),
        hasScoaAccountId: columns.has('SCOA_ACCOUNT_ID'),
      };
    })();
  }

  return presetTableSchemaPromise;
};

const loadDistributionTableSchema = async (): Promise<DistributionTableSchema> => {
  if (!distributionTableSchemaPromise) {
    distributionTableSchemaPromise = (async () => {
      const result = await runQuery<{ column_name: string }>(
        `SELECT COLUMN_NAME as column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = PARSENAME(@tableName, 2)
          AND TABLE_NAME = PARSENAME(@tableName, 1)`,
        {
          tableName: DISTRIBUTION_TABLE_NAME,
        },
      );

      const columns = new Set(
        (result.recordset ?? []).map((row) => row.column_name.toUpperCase()),
      );

      return {
        entityAccountColumn: resolveColumnName(columns, ENTITY_ACCOUNT_COLUMN_CANDIDATES),
        scoaAccountColumn: resolveColumnName(columns, SCOA_ACCOUNT_COLUMN_CANDIDATES),
      };
    })();
  }

  return distributionTableSchemaPromise;
};

const buildDistributionJoinFilters = (
  presetSchema: PresetTableSchema,
  distributionSchema: DistributionTableSchema,
): string[] => {
  const filters = [
    'esd.PRESET_GUID = edp.PRESET_GUID',
    'esd.ENTITY_ID = edp.ENTITY_ID',
  ];

  if (presetSchema.hasEntityAccountId && distributionSchema.entityAccountColumn) {
    filters.push(
      `esd.${distributionSchema.entityAccountColumn} = edp.ENTITY_ACCOUNT_ID`,
    );
  }

  if (presetSchema.hasScoaAccountId && distributionSchema.scoaAccountColumn) {
    filters.push(`esd.${distributionSchema.scoaAccountColumn} = edp.SCOA_ACCOUNT_ID`);
  }

  return filters;
};

const buildDistributionApply = (
  presetSchema: PresetTableSchema,
  distributionSchema: DistributionTableSchema,
): string => {
  const filters = buildDistributionJoinFilters(presetSchema, distributionSchema).join(
    '\n      AND ',
  );
  const entityAccountSelect = distributionSchema.entityAccountColumn
    ? `esd.${distributionSchema.entityAccountColumn} as entity_account_id`
    : 'NULL as entity_account_id';
  const scoaAccountSelect = distributionSchema.scoaAccountColumn
    ? `esd.${distributionSchema.scoaAccountColumn} as scoa_account_id`
    : 'NULL as scoa_account_id';
  return `OUTER APPLY (
      SELECT TOP 1
        ${entityAccountSelect},
        ${scoaAccountSelect}
      FROM ${DISTRIBUTION_TABLE_NAME} esd
      WHERE ${filters}
      ORDER BY esd.INSERTED_DTTM DESC
    ) esd`;
};

const resolvePresetAccountQuery = async (): Promise<{
  entityAccountSelect: string;
  scoaAccountSelect: string;
  distributionJoin: string;
  schema: PresetTableSchema;
  hasEntityAccountSupport: boolean;
  hasScoaAccountSupport: boolean;
}> => {
  const schema = await loadPresetTableSchema();
  const distributionSchema = await loadDistributionTableSchema();
  const needsDistributionJoin = !schema.hasEntityAccountId || !schema.hasScoaAccountId;
  const hasEntityAccountSupport =
    schema.hasEntityAccountId || Boolean(distributionSchema.entityAccountColumn);
  const hasScoaAccountSupport =
    schema.hasScoaAccountId || Boolean(distributionSchema.scoaAccountColumn);

  return {
    entityAccountSelect: schema.hasEntityAccountId
      ? 'edp.ENTITY_ACCOUNT_ID'
      : 'esd.entity_account_id',
    scoaAccountSelect: schema.hasScoaAccountId
      ? 'edp.SCOA_ACCOUNT_ID'
      : 'esd.scoa_account_id',
    distributionJoin: needsDistributionJoin
      ? buildDistributionApply(schema, distributionSchema)
      : '',
    schema,
    hasEntityAccountSupport,
    hasScoaAccountSupport,
  };
};

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeMeaningfulText = (value?: string | null): string | null => {
  const normalized = normalizeText(value);
  return normalized && normalized.length > 1 ? normalized : null;
};

const normalizePresetGuid = (value?: string | null): string | null =>
  normalizeText(value);

const findEntityDistributionPresetByAccount = async (
  entityId: string,
  entityAccountId: string,
  scoaAccountId: string
): Promise<EntityDistributionPresetRow | null> => {
  const normalizedEntityId = normalizeText(entityId);
  const normalizedEntityAccountId = normalizeMeaningfulText(entityAccountId);
  const normalizedScoaAccountId = normalizeMeaningfulText(scoaAccountId);

  if (!normalizedEntityId || !normalizedEntityAccountId || !normalizedScoaAccountId) {
    return null;
  }

  const {
    entityAccountSelect,
    scoaAccountSelect,
    distributionJoin,
    hasEntityAccountSupport,
    hasScoaAccountSupport,
  } =
    await resolvePresetAccountQuery();

  const filters = ['edp.ENTITY_ID = @entityId'];
  if (hasEntityAccountSupport) {
    filters.push(`${entityAccountSelect} = @entityAccountId`);
  }
  if (hasScoaAccountSupport) {
    filters.push(`${scoaAccountSelect} = @scoaAccountId`);
  }

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    metric?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT TOP 1
      edp.PRESET_GUID as preset_guid,
      edp.ENTITY_ID as entity_id,
      edp.PRESET_TYPE as preset_type,
      edp.PRESET_DESCRIPTION as preset_description,
      ${entityAccountSelect} as entity_account_id,
      ${scoaAccountSelect} as scoa_account_id,
      edp.METRIC as metric,
      edp.INSERTED_DTTM as inserted_dttm,
      edp.UPDATED_DTTM as updated_dttm,
      edp.UPDATED_BY as updated_by
    FROM ${TABLE_NAME} edp
    ${distributionJoin}
    WHERE ${filters.join('\n      AND ')}
    ORDER BY edp.INSERTED_DTTM DESC`,
    {
      entityId: normalizedEntityId,
      entityAccountId: normalizedEntityAccountId,
      scoaAccountId: normalizedScoaAccountId,
    }
  );

  const row = result.recordset?.[0];
  return row ? mapBaseRow(row) : null;
};

const normalizePresetTypeValue = (value?: string | null): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'direct';
  }
  const lower = normalized.toLowerCase();
  switch (lower) {
    case 'dynamic':
      return 'dynamic';
    case 'percentage':
      return 'percentage';
    case 'direct':
      return 'direct';
    case 'exclude':
    case 'excluded':
      return 'excluded';
    case 'p':
      return 'percentage';
    case 'd':
      return 'direct';
    case 'x':
      return 'excluded';
    default:
      return lower.length > 1 ? lower : 'direct';
  }
};

const mapBaseRow = (row: {
  preset_guid: string;
  entity_id: string;
  preset_type: string;
  preset_description?: string | null;
  entity_account_id?: string | null;
  scoa_account_id?: string | null;
  metric?: string | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityDistributionPresetRow => ({
  presetGuid: row.preset_guid,
  entityId: row.entity_id,
  presetType: normalizePresetTypeValue(row.preset_type),
  presetDescription: row.preset_description ?? null,
  entityAccountId: row.entity_account_id ?? '',
  scoaAccountId: row.scoa_account_id ?? '',
  metric: row.metric ?? null,
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

const mapDetailRow = (row: {
  preset_guid: string;
  operation_cd?: string | null;
  basis_datapoint?: string | null;
  is_calculated?: number | boolean | null;
  specified_pct?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityDistributionPresetDetailRow => ({
  presetGuid: row.preset_guid,
  operationCd: row.operation_cd ?? '',
  basisDatapoint: row.basis_datapoint ?? null,
  isCalculated:
    typeof row.is_calculated === 'boolean'
      ? row.is_calculated
      : row.is_calculated === null || row.is_calculated === undefined
        ? null
        : Boolean(row.is_calculated),
  specifiedPct:
    row.specified_pct !== null && row.specified_pct !== undefined
      ? row.specified_pct * 100
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

export const listEntityDistributionPresets = async (
  entityId?: string
): Promise<EntityDistributionPresetRow[]> => {
  const { entityAccountSelect, scoaAccountSelect, distributionJoin } =
    await resolvePresetAccountQuery();
  const params: Record<string, unknown> = {};
  const filters: string[] = [];

  if (entityId) {
    params.entityId = entityId;
    filters.push('edp.ENTITY_ID = @entityId');
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    metric?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      edp.PRESET_GUID as preset_guid,
      edp.ENTITY_ID as entity_id,
      edp.PRESET_TYPE as preset_type,
      edp.PRESET_DESCRIPTION as preset_description,
      ${entityAccountSelect} as entity_account_id,
      ${scoaAccountSelect} as scoa_account_id,
      edp.METRIC as metric,
      edp.INSERTED_DTTM as inserted_dttm,
      edp.UPDATED_DTTM as updated_dttm,
      edp.UPDATED_BY as updated_by
    FROM ${TABLE_NAME} edp
    ${distributionJoin}
    ${whereClause}
    ORDER BY edp.INSERTED_DTTM DESC`,
    params
  );

  return (result.recordset ?? []).map(mapBaseRow);
};

export const createEntityDistributionPreset = async (
  input: EntityDistributionPresetInput
): Promise<EntityDistributionPresetRow | null> => {
  if (!input.entityId || !input.entityAccountId || !input.presetType || !input.scoaAccountId) {
    return null;
  }

  const entityId = normalizeText(input.entityId);
  const entityAccountId = normalizeMeaningfulText(input.entityAccountId);
  const scoaAccountId = normalizeMeaningfulText(input.scoaAccountId);
  if (!entityId || !entityAccountId || !scoaAccountId) {
    return null;
  }

  const presetGuid = normalizePresetGuid(input.presetGuid);
  const presetDescription = normalizeMeaningfulText(input.presetDescription);
  const metric = normalizeText(input.metric);
  const presetType = normalizePresetTypeValue(input.presetType);
  const schema = await loadPresetTableSchema();

  const existingPreset = await findEntityDistributionPresetByAccount(
    entityId,
    entityAccountId,
    scoaAccountId,
  );
  if (existingPreset) {
    const updated = await updateEntityDistributionPreset(existingPreset.presetGuid, {
      presetType,
      presetDescription,
      entityAccountId,
      scoaAccountId,
      metric,
      updatedBy: null,
    });

    return updated ?? existingPreset;
  }

  const columns = [
    'ENTITY_ID',
    'PRESET_TYPE',
    'PRESET_DESCRIPTION',
    ...(schema.hasEntityAccountId ? ['ENTITY_ACCOUNT_ID'] : []),
    ...(schema.hasScoaAccountId ? ['SCOA_ACCOUNT_ID'] : []),
    'METRIC',
    ...(presetGuid ? ['PRESET_GUID'] : []),
  ];

  const values = [
    '@entityId',
    '@presetType',
    '@presetDescription',
    ...(schema.hasEntityAccountId ? ['@entityAccountId'] : []),
    ...(schema.hasScoaAccountId ? ['@scoaAccountId'] : []),
    '@metric',
    ...(presetGuid ? ['@presetGuid'] : []),
  ];

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    metric?: string | null;
    inserted_dttm?: Date | string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      ${columns.join(',\n      ')}
    )
    OUTPUT
      INSERTED.PRESET_GUID as preset_guid,
      INSERTED.ENTITY_ID as entity_id,
      INSERTED.PRESET_TYPE as preset_type,
      INSERTED.PRESET_DESCRIPTION as preset_description,
      ${schema.hasEntityAccountId ? 'INSERTED.ENTITY_ACCOUNT_ID as entity_account_id,' : ''}
      ${schema.hasScoaAccountId ? 'INSERTED.SCOA_ACCOUNT_ID as scoa_account_id,' : ''}
      INSERTED.METRIC as metric,
      INSERTED.INSERTED_DTTM as inserted_dttm
    VALUES (
      ${values.join(',\n      ')}
    )`,
    {
      entityId,
      presetType,
      presetDescription,
      entityAccountId,
      scoaAccountId,
      metric,
      ...(presetGuid ? { presetGuid } : {}),
    }
  );

  const row = result.recordset?.[0];
  if (!row) {
    return null;
  }

  const resolvedEntityAccountId = row.entity_account_id ?? entityAccountId;
  const resolvedScoaAccountId = row.scoa_account_id ?? scoaAccountId;

  return {
    presetGuid: row.preset_guid,
    entityId: row.entity_id,
    presetType: normalizePresetTypeValue(row.preset_type),
    presetDescription: row.preset_description ?? null,
    entityAccountId: resolvedEntityAccountId ?? '',
    scoaAccountId: resolvedScoaAccountId ?? '',
    metric: row.metric ?? null,
    insertedDttm:
      row.inserted_dttm instanceof Date ? row.inserted_dttm.toISOString() : row.inserted_dttm ?? null,
    updatedDttm: null,
    updatedBy: null,
  };
};

export const updateEntityDistributionPreset = async (
  presetGuid: string,
  updates: Partial<Omit<EntityDistributionPresetInput, 'presetGuid'>> & {
    updatedBy?: string | null;
  }
): Promise<EntityDistributionPresetRow | null> => {
  const normalizedGuid = normalizePresetGuid(presetGuid);
  if (!normalizedGuid) {
    return null;
  }

  const normalizedPresetType = updates.presetType
    ? normalizePresetTypeValue(updates.presetType)
    : undefined;

  const schema = await loadPresetTableSchema();
  const setClauses = [
    'PRESET_TYPE = ISNULL(@presetType, PRESET_TYPE)',
    'PRESET_DESCRIPTION = ISNULL(@presetDescription, PRESET_DESCRIPTION)',
    schema.hasEntityAccountId
      ? 'ENTITY_ACCOUNT_ID = ISNULL(@entityAccountId, ENTITY_ACCOUNT_ID)'
      : null,
    schema.hasScoaAccountId ? 'SCOA_ACCOUNT_ID = ISNULL(@scoaAccountId, SCOA_ACCOUNT_ID)' : null,
    'METRIC = ISNULL(@metric, METRIC)',
    'UPDATED_BY = @updatedBy',
    'UPDATED_DTTM = SYSUTCDATETIME()',
  ].filter((clause): clause is string => Boolean(clause));

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      ${setClauses.join(',\n      ')}
    WHERE PRESET_GUID = @presetGuid`,
    {
      presetGuid: normalizedGuid,
      presetType: normalizedPresetType,
      presetDescription: normalizeMeaningfulText(updates.presetDescription),
      entityAccountId: normalizeMeaningfulText(updates.entityAccountId),
      scoaAccountId: normalizeMeaningfulText(updates.scoaAccountId),
      metric: normalizeText(updates.metric),
      updatedBy: updates.updatedBy ?? null,
    }
  );

  const updatedRows = await listEntityDistributionPresets();
  return updatedRows.find((row) => row.presetGuid === normalizedGuid) ?? null;
};

export const listEntityDistributionPresetsWithDetails = async (
  entityId?: string
): Promise<EntityDistributionPresetWithDetailsRow[]> => {
  const { entityAccountSelect, scoaAccountSelect, distributionJoin } =
    await resolvePresetAccountQuery();
  const params: Record<string, unknown> = {};
  const filters: string[] = [];

  if (entityId) {
    params.entityId = entityId;
    filters.push('edp.ENTITY_ID = @entityId');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    metric?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
    operation_cd?: string | null;
    basis_datapoint?: string | null;
    is_calculated?: number | boolean | null;
    specified_pct?: number | null;
  }>(
    `SELECT
      edp.PRESET_GUID as preset_guid,
      edp.ENTITY_ID as entity_id,
      edp.PRESET_TYPE as preset_type,
      edp.PRESET_DESCRIPTION as preset_description,
      ${entityAccountSelect} as entity_account_id,
      ${scoaAccountSelect} as scoa_account_id,
      edp.METRIC as metric,
      edp.INSERTED_DTTM as inserted_dttm,
      edp.UPDATED_DTTM as updated_dttm,
      edp.UPDATED_BY as updated_by,
      edpd.OPERATION_CD as operation_cd,
      edpd.BASIS_DATAPOINT as basis_datapoint,
      edpd.IS_CALCULATED as is_calculated,
      edpd.SPECIFIED_PCT as specified_pct
    FROM ${TABLE_NAME} edp
    ${distributionJoin}
    LEFT JOIN ml.ENTITY_DISTRIBUTION_PRESET_DETAIL edpd ON edpd.PRESET_GUID = edp.PRESET_GUID
    ${whereClause}
    ORDER BY edp.PRESET_GUID ASC`,
    params
  );

  const rows = (result.recordset ?? []).map((row) => ({
    ...row,
  }));

  const grouped = new Map<
    string,
    {
      base: EntityDistributionPresetRow;
      details: EntityDistributionPresetDetailRow[];
    }
  >();

  rows.forEach((row) => {
    const key = row.preset_guid;
    const base: EntityDistributionPresetRow = mapBaseRow(row);
    const detail = row.operation_cd ? mapDetailRow(row) : null;

    const existing = grouped.get(key);
    if (existing) {
      if (detail) {
        existing.details.push(detail);
      }
      return;
    }

    grouped.set(key, {
      base,
      details: detail ? [detail] : [],
    });
  });

  return Array.from(grouped.values()).map(({ base, details }) => ({
    ...base,
    presetDetails: details,
  }));
};

export const getEntityDistributionPresetSchema = async (): Promise<PresetTableSchema> =>
  loadPresetTableSchema();

export default listEntityDistributionPresets;
