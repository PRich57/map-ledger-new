import { runQuery } from '../utils/sqlClient';

export interface EntityDistributionPresetDetailInput {
  presetId: string;
  operationCd: string;
  isCalculated?: boolean | null;
  specifiedPct?: number | null;
  updatedBy?: string | null;
}

export interface EntityDistributionPresetDetailRow
  extends EntityDistributionPresetDetailInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

const TABLE_NAME = 'ml.ENTITY_DISTRIBUTION_PRESET_DETAIL';

const toBit = (value?: boolean | null): number | null => {
  if (value === undefined || value === null) {
    return null;
  }
  return value ? 1 : 0;
};

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeGuid = (value?: string | null): string | null => normalizeText(value);

const normalizeSpecifiedPct = (value?: number | null): number | null => {
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
  preset_id: string;
  operation_cd: string;
  is_calculated?: number | boolean | null;
  specified_pct?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityDistributionPresetDetailRow => ({
  presetId: row.preset_id,
  operationCd: row.operation_cd,
  isCalculated: typeof row.is_calculated === 'boolean'
    ? row.is_calculated
    : row.is_calculated === null || row.is_calculated === undefined
      ? null
      : Boolean(row.is_calculated),
  // Multiply by 100 to convert from database format (0.000-1.000) to application format (0-100)
  specifiedPct: row.specified_pct !== null && row.specified_pct !== undefined
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

export const listEntityDistributionPresetDetails = async (
  presetId?: string
): Promise<EntityDistributionPresetDetailRow[]> => {
  const params: Record<string, unknown> = {};
  const filters: string[] = [];

  const normalizedPreset = normalizeGuid(presetId ?? null);

  if (normalizedPreset) {
    params.presetId = normalizedPreset;
    filters.push('PRESET_GUID = @presetId');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await runQuery<{
    preset_id: string;
    operation_cd: string;
    is_calculated?: number | boolean | null;
    specified_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      PRESET_GUID as preset_id,
      OPERATION_CD as operation_cd,
      IS_CALCULATED as is_calculated,
      SPECIFIED_PCT as specified_pct,
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

export const createEntityDistributionPresetDetails = async (
  inputs: EntityDistributionPresetDetailInput[]
): Promise<EntityDistributionPresetDetailRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      params[`presetId${index}`] = normalizeGuid(input.presetId);
      params[`operationCd${index}`] = normalizeText(input.operationCd);
      params[`isCalculated${index}`] = toBit(input.isCalculated);
      params[`specifiedPct${index}`] = normalizeSpecifiedPct(input.specifiedPct);
      params[`updatedBy${index}`] = normalizeText(input.updatedBy);

      return `(@presetId${index}, @operationCd${index}, @isCalculated${index}, @specifiedPct${index}, NULL, @updatedBy${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    preset_id: string;
    operation_cd: string;
    is_calculated?: number | boolean | null;
    specified_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      PRESET_GUID,
      OPERATION_CD,
      IS_CALCULATED,
      SPECIFIED_PCT,
      UPDATED_DTTM,
      UPDATED_BY
    )
    OUTPUT
      INSERTED.PRESET_GUID as preset_id,
      INSERTED.OPERATION_CD as operation_cd,
      INSERTED.IS_CALCULATED as is_calculated,
      INSERTED.SPECIFIED_PCT as specified_pct,
      INSERTED.INSERTED_DTTM as inserted_dttm,
      INSERTED.UPDATED_DTTM as updated_dttm,
      INSERTED.UPDATED_BY as updated_by
    VALUES ${valuesClause}`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export const updateEntityDistributionPresetDetail = async (
  presetId: string,
  operationCd: string,
  updates: Partial<Omit<EntityDistributionPresetDetailInput, 'presetId' | 'operationCd'>>
): Promise<EntityDistributionPresetDetailRow | null> => {
  const normalizedPreset = normalizeGuid(presetId);

  if (!normalizedPreset || !operationCd) {
    return null;
  }

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      IS_CALCULATED = ISNULL(@isCalculated, IS_CALCULATED),
      SPECIFIED_PCT = ISNULL(@specifiedPct, SPECIFIED_PCT),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE PRESET_GUID = @presetId
      AND OPERATION_CD = @operationCd`,
    {
      presetId: normalizedPreset,
      operationCd,
      isCalculated: toBit(updates.isCalculated ?? null),
      specifiedPct: normalizeSpecifiedPct(updates.specifiedPct),
      updatedBy: normalizeText(updates.updatedBy),
    }
  );

  const updatedRows = await listEntityDistributionPresetDetails(presetId);
  return updatedRows.find((row) => row.operationCd === operationCd) ?? null;
};

export default listEntityDistributionPresetDetails;
