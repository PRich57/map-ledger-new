import { runQuery } from '../utils/sqlClient';

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

const TABLE_NAME = 'ml.ENTITY_MAPPING_PRESETS';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    presetType: row.preset_type,
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
      presetType: input.presetType,
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
    presetType: row.preset_type,
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
      presetType: updates.presetType,
      presetDescription,
      updatedBy: updates.updatedBy ?? null,
    }
  );

  const updatedRows = await listEntityMappingPresets();
  return updatedRows.find((preset) => preset.presetGuid === normalizedPresetGuid) ?? null;
};

export default listEntityMappingPresets;
