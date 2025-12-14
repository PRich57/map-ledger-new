import { runQuery } from '../utils/sqlClient';
import type { EntityDistributionPresetDetailRow } from './entityDistributionPresetDetailRepository';

export interface EntityDistributionPresetInput {
  entityId: string;
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

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizePresetGuid = (value?: string | null): string | null =>
  normalizeText(value);

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
      return 'dynamic';
    case 'x':
      return 'excluded';
    default:
      return lower;
  }
};

const mapBaseRow = (row: {
  preset_guid: string;
  entity_id: string;
  preset_type: string;
  preset_description?: string | null;
  scoa_account_id: string;
  metric?: string | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityDistributionPresetRow => ({
  presetGuid: row.preset_guid,
  entityId: row.entity_id,
  presetType: normalizePresetTypeValue(row.preset_type),
  presetDescription: row.preset_description ?? null,
  scoaAccountId: row.scoa_account_id,
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
  const params: Record<string, unknown> = {};
  const filters: string[] = [];

  if (entityId) {
    params.entityId = entityId;
    filters.push('ENTITY_ID = @entityId');
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    scoa_account_id: string;
    metric?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      PRESET_GUID as preset_guid,
      ENTITY_ID as entity_id,
      PRESET_TYPE as preset_type,
      PRESET_DESCRIPTION as preset_description,
      SCOA_ACCOUNT_ID as scoa_account_id,
      METRIC as metric,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    ${whereClause}
    ORDER BY INSERTED_DTTM DESC`,
    params
  );

  return (result.recordset ?? []).map(mapBaseRow);
};

export const createEntityDistributionPreset = async (
  input: EntityDistributionPresetInput
): Promise<EntityDistributionPresetRow | null> => {
  if (!input.entityId || !input.presetType || !input.scoaAccountId) {
    return null;
  }

  const presetGuid = normalizePresetGuid(input.presetGuid);
  const presetDescription = normalizeText(input.presetDescription);
  const scoaAccountId = normalizeText(input.scoaAccountId);
  const metric = normalizeText(input.metric);

  const columns = [
    'ENTITY_ID',
    'PRESET_TYPE',
    'PRESET_DESCRIPTION',
    'SCOA_ACCOUNT_ID',
    'METRIC',
    ...(presetGuid ? ['PRESET_GUID'] : []),
  ];

  const values = [
    '@entityId',
    '@presetType',
    '@presetDescription',
    '@scoaAccountId',
    '@metric',
    ...(presetGuid ? ['@presetGuid'] : []),
  ];

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    scoa_account_id: string;
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
      INSERTED.SCOA_ACCOUNT_ID as scoa_account_id,
      INSERTED.METRIC as metric,
      INSERTED.INSERTED_DTTM as inserted_dttm
    VALUES (
      ${values.join(',\n      ')}
    )`,
    {
      entityId: input.entityId,
      presetType: input.presetType,
      presetDescription,
      scoaAccountId,
      metric,
      ...(presetGuid ? { presetGuid } : {}),
    }
  );

  const row = result.recordset?.[0];
  if (!row) {
    return null;
  }

  return {
    presetGuid: row.preset_guid,
    entityId: row.entity_id,
    presetType: normalizePresetTypeValue(row.preset_type),
    presetDescription: row.preset_description ?? null,
    scoaAccountId: row.scoa_account_id,
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

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      PRESET_TYPE = ISNULL(@presetType, PRESET_TYPE),
      PRESET_DESCRIPTION = ISNULL(@presetDescription, PRESET_DESCRIPTION),
      SCOA_ACCOUNT_ID = ISNULL(@scoaAccountId, SCOA_ACCOUNT_ID),
      METRIC = ISNULL(@metric, METRIC),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE PRESET_GUID = @presetGuid`,
    {
      presetGuid: normalizedGuid,
      presetType: updates.presetType,
      presetDescription: normalizeText(updates.presetDescription),
      scoaAccountId: normalizeText(updates.scoaAccountId),
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
    scoa_account_id: string;
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
      edp.SCOA_ACCOUNT_ID as scoa_account_id,
      edp.METRIC as metric,
      edp.INSERTED_DTTM as inserted_dttm,
      edp.UPDATED_DTTM as updated_dttm,
      edp.UPDATED_BY as updated_by,
      edpd.OPERATION_CD as operation_cd,
      edpd.BASIS_DATAPOINT as basis_datapoint,
      edpd.IS_CALCULATED as is_calculated,
      edpd.SPECIFIED_PCT as specified_pct
    FROM ${TABLE_NAME} edp
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

export default listEntityDistributionPresets;
