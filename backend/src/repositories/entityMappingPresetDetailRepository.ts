import { runQuery } from '../utils/sqlClient';

export interface EntityMappingPresetDetailInput {
  presetGuid: string;
  basisDatapoint?: string | null;
  targetDatapoint: string;
  isCalculated?: boolean | null;
  specifiedPct?: number | null;
  updatedBy?: string | null;
  recordId?: number | null;
}

export interface EntityMappingPresetDetailRow
  extends EntityMappingPresetDetailInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

const TABLE_NAME = 'ml.ENTITY_MAPPING_PRESET_DETAIL';

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
  preset_guid: string;
  basis_datapoint: string | null;
  target_datapoint: string;
  is_calculated?: number | boolean | null;
  specified_pct?: number | null;
  record_id?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityMappingPresetDetailRow => ({
  presetGuid: row.preset_guid,
  basisDatapoint: row.basis_datapoint,
  targetDatapoint: row.target_datapoint,
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
  recordId: row.record_id ?? null,
});

export const listEntityMappingPresetDetails = async (
  presetGuid?: string
): Promise<EntityMappingPresetDetailRow[]> => {
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
    is_calculated?: number | boolean | null;
    specified_pct?: number | null;
    record_id?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      PRESET_GUID as preset_guid,
      BASIS_DATAPOINT as basis_datapoint,
      TARGET_DATAPOINT as target_datapoint,
      IS_CALCULATED as is_calculated,
      SPECIFIED_PCT as specified_pct,
      RECORD_ID as record_id,
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

export const createEntityMappingPresetDetails = async (
  inputs: EntityMappingPresetDetailInput[]
): Promise<EntityMappingPresetDetailRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      params[`presetGuid${index}`] = normalizeText(input.presetGuid);
      params[`basisDatapoint${index}`] = normalizeText(input.basisDatapoint);
      params[`targetDatapoint${index}`] = normalizeText(input.targetDatapoint);
      params[`isCalculated${index}`] = toBit(input.isCalculated);
      params[`specifiedPct${index}`] = normalizeSpecifiedPct(input.specifiedPct);

      return `(@presetGuid${index}, @basisDatapoint${index}, @targetDatapoint${index}, @isCalculated${index}, @specifiedPct${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    preset_guid: string;
    basis_datapoint: string | null;
    target_datapoint: string;
    is_calculated?: number | boolean | null;
    specified_pct?: number | null;
    record_id?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      PRESET_GUID,
      BASIS_DATAPOINT,
      TARGET_DATAPOINT,
      IS_CALCULATED,
      SPECIFIED_PCT
    )
    OUTPUT
      INSERTED.PRESET_GUID as preset_guid,
      INSERTED.BASIS_DATAPOINT as basis_datapoint,
      INSERTED.TARGET_DATAPOINT as target_datapoint,
      INSERTED.IS_CALCULATED as is_calculated,
      INSERTED.SPECIFIED_PCT as specified_pct,
      INSERTED.RECORD_ID as record_id,
      INSERTED.INSERTED_DTTM as inserted_dttm,
      INSERTED.UPDATED_DTTM as updated_dttm,
      INSERTED.UPDATED_BY as updated_by
    VALUES ${valuesClause}`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

const updateByRecordId = async (
  recordId: number,
  updates: {
    targetDatapoint?: string | null;
    basisDatapoint?: string | null;
    isCalculated?: boolean | null;
    specifiedPct?: number | null;
    updatedBy?: string | null;
  },
): Promise<void> => {
  if (!recordId || recordId <= 0) {
    return;
  }

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      TARGET_DATAPOINT = ISNULL(@targetDatapoint, TARGET_DATAPOINT),
      BASIS_DATAPOINT = ISNULL(@basisDatapoint, BASIS_DATAPOINT),
      IS_CALCULATED = ISNULL(@isCalculated, IS_CALCULATED),
      SPECIFIED_PCT = ISNULL(CAST(@specifiedPct AS DECIMAL(4,3)), SPECIFIED_PCT),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE RECORD_ID = @recordId`,
    {
      recordId,
      targetDatapoint: normalizeText(updates.targetDatapoint),
      basisDatapoint: normalizeText(updates.basisDatapoint),
      isCalculated: toBit(updates.isCalculated ?? null),
      specifiedPct: normalizeSpecifiedPct(updates.specifiedPct),
      updatedBy: normalizeText(updates.updatedBy),
    }
  );
};

export const updateEntityMappingPresetDetail = async (
  presetGuid: string,
  basisDatapoint: string | null,
  targetDatapoint: string,
  updates: Partial<Omit<EntityMappingPresetDetailInput, 'presetGuid' | 'basisDatapoint' | 'targetDatapoint'>>,
  recordId?: number | null,
): Promise<EntityMappingPresetDetailRow | null> => {
  if (!presetGuid || (!targetDatapoint && !recordId)) {
    return null;
  }

  if (recordId && recordId > 0) {
    await updateByRecordId(recordId, {
      targetDatapoint: targetDatapoint || undefined,
      basisDatapoint,
      isCalculated: updates.isCalculated ?? undefined,
      specifiedPct: updates.specifiedPct ?? undefined,
      updatedBy: updates.updatedBy ?? undefined,
    });
  } else if (targetDatapoint) {
    await runQuery(
      `UPDATE ${TABLE_NAME}
      SET
        IS_CALCULATED = ISNULL(@isCalculated, IS_CALCULATED),
        SPECIFIED_PCT = ISNULL(CAST(@specifiedPct AS DECIMAL(4,3)), SPECIFIED_PCT),
        UPDATED_BY = @updatedBy,
        UPDATED_DTTM = SYSUTCDATETIME()
      WHERE PRESET_GUID = @presetGuid
        AND ((BASIS_DATAPOINT IS NULL AND @basisDatapoint IS NULL) OR BASIS_DATAPOINT = @basisDatapoint)
        AND TARGET_DATAPOINT = @targetDatapoint`,
      {
        presetGuid,
        basisDatapoint: normalizeText(basisDatapoint),
        targetDatapoint,
        isCalculated: toBit(updates.isCalculated ?? null),
        specifiedPct: normalizeSpecifiedPct(updates.specifiedPct),
        updatedBy: normalizeText(updates.updatedBy),
      }
    );
  }

  const updatedRows = await listEntityMappingPresetDetails(presetGuid);
  return updatedRows.find(
    (row) =>
      row.recordId === (recordId ?? null) ||
      (row.basisDatapoint === normalizeText(basisDatapoint) &&
        row.targetDatapoint === targetDatapoint)
  ) ?? null;
};

export const deleteEntityMappingPresetDetailsByIds = async (
  ids: number[],
): Promise<number> => {
  const recordIds = ids.filter((id) => Number.isFinite(id) && id > 0);
  if (!recordIds.length) {
    return 0;
  }

  const placeholders = recordIds.map((_, index) => `@id${index}`).join(', ');
  const params: Record<string, number> = {};
  recordIds.forEach((id, index) => {
    params[`id${index}`] = id;
  });

  const result = await runQuery(
    `DELETE FROM ${TABLE_NAME} WHERE RECORD_ID IN (${placeholders})`,
    params,
  );

  return result.rowsAffected?.[0] ?? 0;
};

export default listEntityMappingPresetDetails;
