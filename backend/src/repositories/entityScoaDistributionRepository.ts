import { runQuery } from '../utils/sqlClient';
import type { EntityDistributionPresetDetailRow } from './entityDistributionPresetDetailRepository';

export interface EntityScoaDistributionInput {
  entityId: string;
  entityAccountId: string;
  scoaAccountId: string;
  distributionType: string;
  presetGuid?: string | null;
  distributionStatus?: string | null;
  updatedBy?: string | null;
}

export interface EntityScoaDistributionRow extends EntityScoaDistributionInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

export interface EntityScoaDistributionWithDetailsRow
  extends EntityScoaDistributionRow {
  presetDescription?: string | null;
  presetType?: string | null;
  presetDetails: EntityDistributionPresetDetailRow[];
}

const TABLE_NAME = 'ml.ENTITY_SCOA_DISTRIBUTION';

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

export type DistributionTableSchema = {
  entityAccountColumn: string | null;
  scoaAccountColumn: string | null;
};

let distributionTableSchemaPromise: Promise<DistributionTableSchema> | null = null;

const resolveColumnName = (
  columns: Set<string>,
  candidates: string[],
): string | null => {
  const match = candidates.find((candidate) => columns.has(candidate));
  return match ?? null;
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
          tableName: TABLE_NAME,
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

export const getEntityScoaDistributionSchema = async (): Promise<DistributionTableSchema> =>
  loadDistributionTableSchema();

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

const normalizeGuid = (value?: string | null): string | null => normalizeText(value);

const normalizeDistributionTypeValue = (value?: string | null): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase();
  if (lower === 'direct' || lower === 'd') {
    return 'direct';
  }
  if (lower === 'percentage' || lower === 'p') {
    return 'percentage';
  }
  if (lower === 'dynamic') {
    return 'dynamic';
  }
  return lower.length > 1 ? lower : null;
};

const mapRow = (row: {
  entity_id: string;
  entity_account_id?: string | null;
  scoa_account_id?: string | null;
  distribution_type: string;
  preset_guid?: string | null;
  distribution_status?: string | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityScoaDistributionRow => ({
  entityId: row.entity_id,
  entityAccountId: row.entity_account_id ?? '',
  scoaAccountId: row.scoa_account_id ?? '',
  distributionType: row.distribution_type,
  presetGuid: row.preset_guid ?? null,
  distributionStatus: row.distribution_status ?? null,
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

export const listEntityScoaDistributions = async (
  entityId: string
): Promise<EntityScoaDistributionRow[]> => {
  if (!entityId) {
    return [];
  }

  const schema = await loadDistributionTableSchema();
  const entityAccountSelect = schema.entityAccountColumn
    ? `${schema.entityAccountColumn} as entity_account_id`
    : 'NULL as entity_account_id';
  const scoaAccountSelect = schema.scoaAccountColumn
    ? `${schema.scoaAccountColumn} as scoa_account_id`
    : 'NULL as scoa_account_id';
  const orderBy = schema.scoaAccountColumn ?? 'PRESET_GUID';

  const result = await runQuery<{
    entity_id: string;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    distribution_type: string;
    preset_guid?: string | null;
    distribution_status?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      ENTITY_ID as entity_id,
      ${entityAccountSelect},
      ${scoaAccountSelect},
      DISTRIBUTION_TYPE as distribution_type,
      PRESET_GUID as preset_guid,
      DISTRIBUTION_STATUS as distribution_status,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
    ORDER BY ${orderBy} ASC`,
    { entityId }
  );

  return (result.recordset ?? []).map(mapRow);
};

export const insertEntityScoaDistributions = async (
  inputs: EntityScoaDistributionInput[]
): Promise<EntityScoaDistributionRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const schema = await loadDistributionTableSchema();
  const columns = [
    'ENTITY_ID',
    ...(schema.entityAccountColumn ? [schema.entityAccountColumn] : []),
    ...(schema.scoaAccountColumn ? [schema.scoaAccountColumn] : []),
    'DISTRIBUTION_TYPE',
    'PRESET_GUID',
    'DISTRIBUTION_STATUS',
  ];
  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      params[`entityId${index}`] = input.entityId;
      if (schema.entityAccountColumn) {
        params[`entityAccountId${index}`] = normalizeMeaningfulText(input.entityAccountId);
      }
      if (schema.scoaAccountColumn) {
        params[`scoaAccountId${index}`] = normalizeMeaningfulText(input.scoaAccountId);
      }
      params[`distributionType${index}`] = normalizeDistributionTypeValue(input.distributionType);
      params[`presetGuid${index}`] = normalizeGuid(input.presetGuid ?? null);
      params[`distributionStatus${index}`] = normalizeText(input.distributionStatus);
      const rowValues = [
        `@entityId${index}`,
        ...(schema.entityAccountColumn ? [`@entityAccountId${index}`] : []),
        ...(schema.scoaAccountColumn ? [`@scoaAccountId${index}`] : []),
        `@distributionType${index}`,
        `@presetGuid${index}`,
        `@distributionStatus${index}`,
      ];
      return `(${rowValues.join(', ')})`;
    })
    .join(', ');

  const result = await runQuery<{
    entity_id: string;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    distribution_type: string;
    preset_guid?: string | null;
    distribution_status?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      ${columns.join(',\n      ')}
    )
    OUTPUT
      INSERTED.ENTITY_ID as entity_id,
      ${schema.entityAccountColumn ? `INSERTED.${schema.entityAccountColumn} as entity_account_id,` : 'NULL as entity_account_id,'}
      ${schema.scoaAccountColumn ? `INSERTED.${schema.scoaAccountColumn} as scoa_account_id,` : 'NULL as scoa_account_id,'}
      INSERTED.DISTRIBUTION_TYPE as distribution_type,
      INSERTED.PRESET_GUID as preset_guid,
      INSERTED.DISTRIBUTION_STATUS as distribution_status,
      INSERTED.INSERTED_DTTM as inserted_dttm,
      INSERTED.UPDATED_DTTM as updated_dttm,
      INSERTED.UPDATED_BY as updated_by
    VALUES ${valuesClause}`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export const updateEntityScoaDistribution = async (
  entityId: string,
  entityAccountId: string,
  scoaAccountId: string,
  distributionType: string,
  updates: Partial<
    Omit<
      EntityScoaDistributionInput,
      'entityId' | 'entityAccountId' | 'scoaAccountId' | 'distributionType'
    >
  >
): Promise<EntityScoaDistributionRow | null> => {
  if (!entityId || !scoaAccountId || !distributionType) {
    return null;
  }

  const normalizedDistributionType = normalizeDistributionTypeValue(distributionType);
  if (!normalizedDistributionType) {
    return null;
  }

  const schema = await loadDistributionTableSchema();
  if (!schema.entityAccountColumn && !schema.scoaAccountColumn) {
    return null;
  }
  const whereClauses = [
    ...(schema.entityAccountColumn ? [`${schema.entityAccountColumn} = @entityAccountId`] : []),
    ...(schema.scoaAccountColumn ? [`${schema.scoaAccountColumn} = @scoaAccountId`] : []),
    'DISTRIBUTION_TYPE = @distributionType',
  ];

  const whereClause = whereClauses.length
    ? `AND ${whereClauses.join('\n      AND ')}`
    : '';

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      PRESET_GUID = ISNULL(@presetGuid, PRESET_GUID),
      DISTRIBUTION_STATUS = ISNULL(@distributionStatus, DISTRIBUTION_STATUS),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE ENTITY_ID = @entityId
      ${whereClause}`,
    {
      entityId,
      entityAccountId: normalizeMeaningfulText(entityAccountId),
      scoaAccountId: normalizeMeaningfulText(scoaAccountId),
      distributionType: normalizedDistributionType,
      presetGuid: normalizeGuid(updates.presetGuid ?? null),
      distributionStatus: normalizeText(updates.distributionStatus),
      updatedBy: normalizeText(updates.updatedBy),
    }
  );

  const records = await listEntityScoaDistributions(entityId);
  return records.find(
    (row) =>
      row.entityAccountId === entityAccountId &&
      row.scoaAccountId === scoaAccountId &&
      row.distributionType === distributionType
  ) ?? null;
};

export const deleteEntityScoaDistribution = async (
  entityId: string,
  entityAccountId: string,
  scoaAccountId: string,
  distributionType?: string | null
): Promise<number> => {
  if (!entityId || !scoaAccountId) {
    return 0;
  }

  const schema = await loadDistributionTableSchema();
  if (!schema.entityAccountColumn && !schema.scoaAccountColumn) {
    return 0;
  }
  const whereClauses = [
    ...(schema.entityAccountColumn ? [`${schema.entityAccountColumn} = @entityAccountId`] : []),
    ...(schema.scoaAccountColumn ? [`${schema.scoaAccountColumn} = @scoaAccountId`] : []),
    ...(distributionType ? ['DISTRIBUTION_TYPE = @distributionType'] : []),
  ];

  const whereClause = whereClauses.length
    ? `AND ${whereClauses.join('\n      AND ')}`
    : '';

  const result = await runQuery(
    `DELETE FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
      ${whereClause}`,
    {
      entityId,
      entityAccountId: normalizeMeaningfulText(entityAccountId),
      scoaAccountId: normalizeMeaningfulText(scoaAccountId),
      distributionType: distributionType ? normalizeDistributionTypeValue(distributionType) : null,
    }
  );

  return result.rowsAffected?.[0] ?? 0;
};

const normalizeDetailRow = (row: {
  preset_guid: string | null;
  operation_cd?: string | null;
  basis_datapoint?: string | null;
  is_calculated?: number | boolean | null;
  specified_pct?: number | null;
}): EntityDistributionPresetDetailRow | null => {
  const operationCd = row.operation_cd?.trim();
  if (!operationCd) {
    return null;
  }
  return {
    presetGuid: row.preset_guid ?? '',
    operationCd,
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
    insertedDttm: null,
    updatedDttm: null,
    updatedBy: null,
  };
};

export const listEntityScoaDistributionsWithDetails = async (
  entityId: string,
): Promise<EntityScoaDistributionWithDetailsRow[]> => {
  if (!entityId) {
    return [];
  }

  const schema = await loadDistributionTableSchema();
  const entityAccountSelect = schema.entityAccountColumn
    ? `esd.${schema.entityAccountColumn} as entity_account_id`
    : 'NULL as entity_account_id';
  const scoaAccountSelect = schema.scoaAccountColumn
    ? `esd.${schema.scoaAccountColumn} as scoa_account_id`
    : 'NULL as scoa_account_id';
  const orderBy = schema.scoaAccountColumn
    ? `esd.${schema.scoaAccountColumn}`
    : 'esd.PRESET_GUID';

  const result = await runQuery<{
    entity_id: string;
    entity_account_id?: string | null;
    scoa_account_id?: string | null;
    distribution_type: string;
    preset_guid?: string | null;
    distribution_status?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
    preset_type?: string | null;
    preset_description?: string | null;
    operation_cd?: string | null;
    basis_datapoint?: string | null;
    is_calculated?: number | boolean | null;
    specified_pct?: number | null;
  }>(
    `SELECT
      esd.ENTITY_ID as entity_id,
      ${entityAccountSelect},
      ${scoaAccountSelect},
      esd.DISTRIBUTION_TYPE as distribution_type,
      esd.PRESET_GUID as preset_guid,
      esd.DISTRIBUTION_STATUS as distribution_status,
      esd.INSERTED_DTTM as inserted_dttm,
      esd.UPDATED_DTTM as updated_dttm,
      esd.UPDATED_BY as updated_by,
      edp.PRESET_TYPE as preset_type,
      edp.PRESET_DESCRIPTION as preset_description,
      edpd.OPERATION_CD as operation_cd,
      edpd.BASIS_DATAPOINT as basis_datapoint,
      edpd.IS_CALCULATED as is_calculated,
      edpd.SPECIFIED_PCT as specified_pct
    FROM ${TABLE_NAME} esd
    LEFT JOIN ml.ENTITY_DISTRIBUTION_PRESETS edp ON edp.PRESET_GUID = esd.PRESET_GUID
    LEFT JOIN ml.ENTITY_DISTRIBUTION_PRESET_DETAIL edpd ON edpd.PRESET_GUID = esd.PRESET_GUID
    WHERE esd.ENTITY_ID = @entityId
    ORDER BY ${orderBy} ASC`,
    { entityId },
  );

  const rows = (result.recordset ?? []).map(row => ({
    distribution: mapRow(row),
    presetDescription: row.preset_description ?? null,
    presetType: row.preset_type ?? null,
    detail: normalizeDetailRow({
      preset_guid: row.preset_guid ?? null,
      operation_cd: row.operation_cd,
      basis_datapoint: row.basis_datapoint,
      is_calculated: row.is_calculated,
      specified_pct: row.specified_pct,
    }),
  }));

  const grouped = new Map<
    string,
    {
      base: EntityScoaDistributionRow & {
        presetDescription?: string | null;
        presetType?: string | null;
      };
      details: EntityDistributionPresetDetailRow[];
    }
  >();

  const useEntityAccountKey = Boolean(schema.entityAccountColumn);

  rows.forEach(({ distribution, presetDescription, presetType, detail }) => {
    const key = useEntityAccountKey
      ? `${distribution.entityId}|${distribution.entityAccountId}|${distribution.scoaAccountId}`
      : `${distribution.entityId}|${distribution.scoaAccountId}|${distribution.distributionType}|${distribution.presetGuid ?? ''}`;
    const existing = grouped.get(key);
    if (existing) {
      if (detail) {
        existing.details.push(detail);
      }
      return;
    }
    grouped.set(key, {
      base: {
        ...distribution,
        presetDescription,
        presetType,
      },
      details: detail ? [detail] : [],
    });
  });

  return Array.from(grouped.values()).map(({ base, details }) => ({
    ...base,
    presetDetails: details,
  }));
};

export default listEntityScoaDistributions;
