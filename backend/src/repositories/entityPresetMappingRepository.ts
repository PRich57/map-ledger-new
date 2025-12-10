import { runQuery } from '../utils/sqlClient';

export interface EntityPresetMappingInput {
  presetGuid: string;
  basisDatapoint?: string | null;
  targetDatapoint: string;
  appliedPct?: number | null;
  updatedBy?: string | null;
}

export interface EntityPresetMappingRow extends EntityPresetMappingInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

const TABLE_NAME = 'ml.ENTITY_PRESET_MAPPING';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeAppliedPct = (value?: number | null): number | null => {
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

const mapRow = (row: {
  preset_guid: string;
  basis_datapoint: string | null;
  target_datapoint: string;
  applied_pct?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityPresetMappingRow => ({
  presetGuid: row.preset_guid,
  basisDatapoint: row.basis_datapoint,
  targetDatapoint: row.target_datapoint,
  // Multiply by 100 to convert from database format (0.000-1.000) to application format (0-100)
  appliedPct: row.applied_pct !== null && row.applied_pct !== undefined
    ? row.applied_pct * 100
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

export const listEntityPresetMappings = async (
  presetGuid?: string
): Promise<EntityPresetMappingRow[]> => {
  const params: Record<string, unknown> = {};
  const filters: string[] = [];

  const normalizedPresetGuid = normalizeText(presetGuid);

  if (normalizedPresetGuid) {
    params.presetGuid = normalizedPresetGuid;
    filters.push('PRESET_GUID = @presetGuid');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await runQuery<{
    preset_guid: string;
    basis_datapoint: string | null;
    target_datapoint: string;
    applied_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      PRESET_GUID as preset_guid,
      BASIS_DATAPOINT as basis_datapoint,
      TARGET_DATAPOINT as target_datapoint,
      APPLIED_PCT as applied_pct,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    ${whereClause}
    ORDER BY PRESET_GUID DESC`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export const createEntityPresetMappings = async (
  inputs: EntityPresetMappingInput[]
): Promise<EntityPresetMappingRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      params[`presetGuid${index}`] = normalizeText(input.presetGuid);
      params[`basisDatapoint${index}`] = normalizeText(input.basisDatapoint);
      params[`targetDatapoint${index}`] = normalizeText(input.targetDatapoint);
      params[`appliedPct${index}`] = normalizeAppliedPct(input.appliedPct);
      params[`updatedBy${index}`] = normalizeText(input.updatedBy);

      return `(@presetGuid${index}, @basisDatapoint${index}, @targetDatapoint${index}, @appliedPct${index}, @updatedBy${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    preset_guid: string;
    basis_datapoint: string | null;
    target_datapoint: string;
    applied_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      PRESET_GUID,
      BASIS_DATAPOINT,
      TARGET_DATAPOINT,
      APPLIED_PCT,
      UPDATED_BY
    )
    OUTPUT
      INSERTED.PRESET_GUID as preset_guid,
      INSERTED.BASIS_DATAPOINT as basis_datapoint,
      INSERTED.TARGET_DATAPOINT as target_datapoint,
      INSERTED.APPLIED_PCT as applied_pct,
      INSERTED.INSERTED_DTTM as inserted_dttm,
      INSERTED.UPDATED_DTTM as updated_dttm,
      INSERTED.UPDATED_BY as updated_by
    VALUES ${valuesClause}`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export const deleteEntityPresetMappings = async (
  presetGuid: string
): Promise<number> => {
  const normalizedGuid = normalizeText(presetGuid);
  if (!normalizedGuid) {
    return 0;
  }

  const result = await runQuery(
    `DELETE FROM ${TABLE_NAME} WHERE PRESET_GUID = @presetGuid`,
    { presetGuid: normalizedGuid }
  );

  return result.rowsAffected?.[0] ?? 0;
};
