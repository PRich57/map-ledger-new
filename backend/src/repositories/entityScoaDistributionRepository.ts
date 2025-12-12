import { runQuery } from '../utils/sqlClient';

export interface EntityScoaDistributionInput {
  entityId: string;
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

const TABLE_NAME = 'ml.ENTITY_SCOA_DISTRIBUTION';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeGuid = (value?: string | null): string | null => normalizeText(value);

const mapRow = (row: {
  entity_id: string;
  scoa_account_id: string;
  distribution_type: string;
  preset_guid?: string | null;
  distribution_status?: string | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityScoaDistributionRow => ({
  entityId: row.entity_id,
  scoaAccountId: row.scoa_account_id,
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

  const result = await runQuery<{
    entity_id: string;
    scoa_account_id: string;
    distribution_type: string;
    preset_guid?: string | null;
    distribution_status?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      ENTITY_ID as entity_id,
      SCOA_ACCOUNT_ID as scoa_account_id,
      DISTRIBUTION_TYPE as distribution_type,
      PRESET_GUID as preset_guid,
      DISTRIBUTION_STATUS as distribution_status,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
    ORDER BY SCOA_ACCOUNT_ID ASC`,
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

  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      params[`entityId${index}`] = input.entityId;
      params[`scoaAccountId${index}`] = normalizeText(input.scoaAccountId);
      params[`distributionType${index}`] = normalizeText(input.distributionType);
      params[`presetGuid${index}`] = normalizeGuid(input.presetGuid ?? null);
      params[`distributionStatus${index}`] = normalizeText(input.distributionStatus);
      return `(@entityId${index}, @scoaAccountId${index}, @distributionType${index}, @presetGuid${index}, @distributionStatus${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    entity_id: string;
    scoa_account_id: string;
    distribution_type: string;
    preset_guid?: string | null;
    distribution_status?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      ENTITY_ID,
      SCOA_ACCOUNT_ID,
      DISTRIBUTION_TYPE,
      PRESET_GUID,
      DISTRIBUTION_STATUS
    )
    OUTPUT
      INSERTED.ENTITY_ID as entity_id,
      INSERTED.SCOA_ACCOUNT_ID as scoa_account_id,
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
  scoaAccountId: string,
  distributionType: string,
  updates: Partial<Omit<EntityScoaDistributionInput, 'entityId' | 'scoaAccountId' | 'distributionType'>>
): Promise<EntityScoaDistributionRow | null> => {
  if (!entityId || !scoaAccountId || !distributionType) {
    return null;
  }

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      PRESET_GUID = ISNULL(@presetGuid, PRESET_GUID),
      DISTRIBUTION_STATUS = ISNULL(@distributionStatus, DISTRIBUTION_STATUS),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE ENTITY_ID = @entityId
      AND SCOA_ACCOUNT_ID = @scoaAccountId
      AND DISTRIBUTION_TYPE = @distributionType`,
    {
      entityId,
      scoaAccountId: normalizeText(scoaAccountId),
      distributionType: normalizeText(distributionType),
      presetGuid: normalizeGuid(updates.presetGuid ?? null),
      distributionStatus: normalizeText(updates.distributionStatus),
      updatedBy: normalizeText(updates.updatedBy),
    }
  );

  const records = await listEntityScoaDistributions(entityId);
  return records.find(
    (row) =>
      row.scoaAccountId === scoaAccountId && row.distributionType === distributionType
  ) ?? null;
};

export const deleteEntityScoaDistribution = async (
  entityId: string,
  scoaAccountId: string
): Promise<number> => {
  if (!entityId || !scoaAccountId) {
    return 0;
  }

  const result = await runQuery(
    `DELETE FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
      AND SCOA_ACCOUNT_ID = @scoaAccountId`,
    {
      entityId,
      scoaAccountId: normalizeText(scoaAccountId),
    }
  );

  return result.rowsAffected?.[0] ?? 0;
};

export default listEntityScoaDistributions;
