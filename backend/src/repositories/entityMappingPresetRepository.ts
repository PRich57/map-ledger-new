import { runQuery } from '../utils/sqlClient';
import type { EntityMappingPresetDetailRow } from './entityMappingPresetDetailRepository';

export interface EntityMappingPresetInput {
  entityId: string;
  presetType: string;
  presetDescription?: string | null;
  presetGuid?: string;
}

export interface EntityMappingPresetRow
  extends Omit<EntityMappingPresetInput, 'presetGuid'> {
  presetGuid: string;
  insertedDttm?: string | null;
  updatedDttm?: string | null;
  updatedBy?: string | null;
}

export interface EntityMappingPresetWithDetailsRow extends EntityMappingPresetRow {
  presetDetails?: EntityMappingPresetDetailRow[];
}

const TABLE_NAME = 'ml.ENTITY_MAPPING_PRESETS';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    case 'pct':
    case 'percent':
      return 'percentage';
    case 'd':
    case 'dyn':
      return 'dynamic';
    case 'x':
    case 'excl':
      return 'excluded';
    default:
      // Only allow the four valid preset types - default to 'direct' for any unknown value
      return 'direct';
  }
};

const normalizePresetGuid = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const listEntityMappingPresets = async (
  entityId?: string
): Promise<EntityMappingPresetRow[]> => {
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
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      PRESET_GUID as preset_guid,
      ENTITY_ID as entity_id,
      PRESET_TYPE as preset_type,
      PRESET_DESCRIPTION as preset_description,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    ${whereClause}
    ORDER BY INSERTED_DTTM DESC`,
    params
  );

  return (result.recordset ?? []).map((row) => ({
    presetGuid: row.preset_guid,
    entityId: row.entity_id,
    presetType: normalizePresetTypeValue(row.preset_type),
    presetDescription: row.preset_description ?? null,
    insertedDttm:
      row.inserted_dttm instanceof Date
        ? row.inserted_dttm.toISOString()
        : row.inserted_dttm ?? null,
    updatedDttm:
      row.updated_dttm instanceof Date
        ? row.updated_dttm.toISOString()
        : row.updated_dttm ?? null,
    updatedBy: row.updated_by ?? null,
  }));
};

export const createEntityMappingPreset = async (
  input: EntityMappingPresetInput
): Promise<EntityMappingPresetRow | null> => {
  if (!input.entityId || !input.presetType) {
    return null;
  }

  const presetGuid = normalizePresetGuid(input.presetGuid);
  const presetDescription = normalizeText(input.presetDescription);
  const normalizedPresetType = normalizePresetTypeValue(input.presetType);

  const columns = [
    'ENTITY_ID',
    'PRESET_TYPE',
    'PRESET_DESCRIPTION',
    ...(presetGuid ? ['PRESET_GUID'] : []),
  ];

  const values = [
    '@entityId',
    '@presetType',
    '@presetDescription',
    ...(presetGuid ? ['@presetGuid'] : []),
  ];
  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
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
      INSERTED.INSERTED_DTTM as inserted_dttm
    VALUES (
      ${values.join(',\n      ')}
    )`,
    {
      entityId: input.entityId,
      presetType: normalizedPresetType,
      presetDescription,
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
    insertedDttm:
      row.inserted_dttm instanceof Date
        ? row.inserted_dttm.toISOString()
        : row.inserted_dttm ?? null,
    updatedBy: null,
    updatedDttm: null,
  };
};

export const updateEntityMappingPreset = async (
  presetGuid: string,
  updates: Partial<Omit<EntityMappingPresetInput, 'presetGuid'>> & {
    updatedBy?: string | null;
  }
): Promise<EntityMappingPresetRow | null> => {
  const normalizedPresetGuid = normalizeText(presetGuid);
  if (!normalizedPresetGuid) {
    return null;
  }

  const presetDescription = normalizeText(updates.presetDescription);
  const normalizedPresetType = updates.presetType
    ? normalizePresetTypeValue(updates.presetType)
    : undefined;

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      PRESET_TYPE = ISNULL(@presetType, PRESET_TYPE),
      PRESET_DESCRIPTION = ISNULL(@presetDescription, PRESET_DESCRIPTION),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE PRESET_GUID = @presetGuid`,
    {
      presetGuid: normalizedPresetGuid,
      presetType: normalizedPresetType,
      presetDescription,
      updatedBy: updates.updatedBy ?? null,
    }
  );

  const updatedRows = await listEntityMappingPresets();
  return updatedRows.find((preset) => preset.presetGuid === normalizedPresetGuid) ?? null;
};

export default listEntityMappingPresets;

const mapPresetDetailRow = (row: {
  preset_guid: string;
  basisDatapoint?: string | null;
  targetDatapoint?: string | null;
  isCalculated?: number | boolean | null;
  specifiedPct?: number | null;
}): EntityMappingPresetDetailRow => ({
  presetGuid: row.preset_guid,
  basisDatapoint: row.basisDatapoint ?? null,
  targetDatapoint: row.targetDatapoint ?? '',
  isCalculated:
    typeof row.isCalculated === 'boolean'
      ? row.isCalculated
      : row.isCalculated === null || row.isCalculated === undefined
        ? null
        : Boolean(row.isCalculated),
  specifiedPct:
    row.specifiedPct !== null && row.specifiedPct !== undefined
      ? row.specifiedPct * 100
      : null,
  insertedDttm: null,
  updatedDttm: null,
  updatedBy: null,
});

export const listEntityMappingPresetsWithDetails = async (
  entityId?: string
): Promise<EntityMappingPresetWithDetailsRow[]> => {
  const params: Record<string, unknown> = {};
  const filters: string[] = [];

  if (entityId) {
    params.entityId = entityId;
    filters.push('emp.ENTITY_ID = @entityId');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await runQuery<{
    preset_guid: string;
    entity_id: string;
    preset_type: string;
    preset_description?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
    basisDatapoint?: string | null;
    targetDatapoint?: string | null;
    isCalculated?: number | boolean | null;
    specifiedPct?: number | null;
  }>(
    `SELECT
      emp.PRESET_GUID as preset_guid,
      emp.ENTITY_ID as entity_id,
      emp.PRESET_TYPE as preset_type,
      emp.PRESET_DESCRIPTION as preset_description,
      emp.INSERTED_DTTM as inserted_dttm,
      emp.UPDATED_DTTM as updated_dttm,
      emp.UPDATED_BY as updated_by,
      emd.BASIS_DATAPOINT as basisDatapoint,
      emd.TARGET_DATAPOINT as targetDatapoint,
      emd.IS_CALCULATED as isCalculated,
      emd.SPECIFIED_PCT as specifiedPct
    FROM ${TABLE_NAME} emp
    LEFT JOIN ml.ENTITY_MAPPING_PRESET_DETAIL emd ON emd.PRESET_GUID = emp.PRESET_GUID
    ${whereClause}
    ORDER BY emp.PRESET_GUID ASC`,
    params
  );

  const rows = (result.recordset ?? []).map((row) => ({
    preset_guid: row.preset_guid,
    entity_id: row.entity_id,
    preset_type: row.preset_type,
    preset_description: row.preset_description ?? null,
    inserted_dttm:
      row.inserted_dttm instanceof Date
        ? row.inserted_dttm.toISOString()
        : row.inserted_dttm ?? null,
    updated_dttm:
      row.updated_dttm instanceof Date
        ? row.updated_dttm.toISOString()
        : row.updated_dttm ?? null,
    updated_by: row.updated_by ?? null,
    basisDatapoint: row.basisDatapoint,
    targetDatapoint: row.targetDatapoint,
    isCalculated: row.isCalculated,
    specifiedPct: row.specifiedPct,
  }));

  const grouped = new Map<
    string,
    {
      base: EntityMappingPresetRow;
      details: EntityMappingPresetDetailRow[];
    }
  >();

  rows.forEach((row) => {
    const key = row.preset_guid;
    const base: EntityMappingPresetRow = {
    presetGuid: row.preset_guid,
    entityId: row.entity_id,
    presetType: normalizePresetTypeValue(row.preset_type),
      presetDescription: row.preset_description,
      insertedDttm: row.inserted_dttm,
      updatedDttm: row.updated_dttm,
      updatedBy: row.updated_by ?? null,
    };

    const detail = mapPresetDetailRow(row);

    const existing = grouped.get(key);
    if (existing) {
      if (detail.targetDatapoint) {
        existing.details.push(detail);
      }
      return;
    }

    grouped.set(key, {
      base,
      details: detail.targetDatapoint ? [detail] : [],
    });
  });

  return Array.from(grouped.values()).map(({ base, details }) => ({
    ...base,
    presetDetails: details,
  }));
};
