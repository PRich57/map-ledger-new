import { normalizeGlMonth } from '../utils/glMonth';
import { runQuery } from '../utils/sqlClient';

export interface EntityScoaActivityInput {
  entityId: string;
  scoaAccountId: string;
  activityMonth: string;
  activityValue: number;
  updatedBy?: string | null;
}

export interface EntityScoaActivityRow extends EntityScoaActivityInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

const TABLE_NAME = 'ml.ENTITY_SCOA_ACTIVITY';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toSqlMonth = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = normalizeGlMonth(value);
  return normalized || null;
};

const mapRow = (row: {
  entity_id: string;
  scoa_account_id: string;
  activity_month?: string | null;
  activity_value?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityScoaActivityRow => ({
  entityId: row.entity_id,
  scoaAccountId: row.scoa_account_id,
  activityMonth: row.activity_month ?? '',
  activityValue: row.activity_value ?? 0,
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

export const listEntityScoaActivity = async (
  entityId: string
): Promise<EntityScoaActivityRow[]> => {
  if (!entityId) {
    return [];
  }

  const result = await runQuery<{
    entity_id: string;
    scoa_account_id: string;
    activity_month?: string | null;
    activity_value?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      ENTITY_ID as entity_id,
      SCOA_ACCOUNT_ID as scoa_account_id,
      ACTIVITY_MONTH as activity_month,
      ACTIVITY_VALUE as activity_value,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
    ORDER BY ACTIVITY_MONTH DESC, SCOA_ACCOUNT_ID ASC`,
    { entityId }
  );

  return (result.recordset ?? []).map(mapRow);
};

export const insertEntityScoaActivity = async (
  activities: EntityScoaActivityInput[]
): Promise<EntityScoaActivityRow[]> => {
  if (!activities.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = activities
    .map((activity, index) => {
      params[`entityId${index}`] = activity.entityId;
      params[`scoaAccountId${index}`] = normalizeText(activity.scoaAccountId);
      params[`activityMonth${index}`] = toSqlMonth(activity.activityMonth);
      params[`activityValue${index}`] = activity.activityValue;
      return `(@entityId${index}, @scoaAccountId${index}, @activityMonth${index}, @activityValue${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    entity_id: string;
    scoa_account_id: string;
    activity_month?: string | null;
    activity_value?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      ENTITY_ID,
      SCOA_ACCOUNT_ID,
      ACTIVITY_MONTH,
      ACTIVITY_VALUE
    )
    OUTPUT
      INSERTED.ENTITY_ID as entity_id,
      INSERTED.SCOA_ACCOUNT_ID as scoa_account_id,
      INSERTED.ACTIVITY_MONTH as activity_month,
      INSERTED.ACTIVITY_VALUE as activity_value,
      INSERTED.INSERTED_DTTM as inserted_dttm,
      INSERTED.UPDATED_DTTM as updated_dttm,
      INSERTED.UPDATED_BY as updated_by
    VALUES ${valuesClause}`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export const upsertEntityScoaActivity = async (
  activities: EntityScoaActivityInput[],
): Promise<EntityScoaActivityRow[]> => {
  if (!activities.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = activities
    .map((activity, index) => {
      params[`entityId${index}`] = activity.entityId;
      params[`scoaAccountId${index}`] = normalizeText(activity.scoaAccountId);
      params[`activityMonth${index}`] = toSqlMonth(activity.activityMonth);
      params[`activityValue${index}`] = activity.activityValue;
      params[`updatedBy${index}`] = normalizeText(activity.updatedBy);

      return `(@entityId${index}, @scoaAccountId${index}, @activityMonth${index}, @activityValue${index}, @updatedBy${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    entity_id: string;
    scoa_account_id: string;
    activity_month?: string | null;
    activity_value?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `MERGE ${TABLE_NAME} AS target
    USING (VALUES ${valuesClause}) AS source(
      entity_id,
      scoa_account_id,
      activity_month,
      activity_value,
      updated_by
    )
    ON target.ENTITY_ID = source.entity_id AND target.SCOA_ACCOUNT_ID = source.scoa_account_id AND target.ACTIVITY_MONTH = source.activity_month
    WHEN MATCHED THEN
      UPDATE SET
        ACTIVITY_VALUE = source.activity_value,
        UPDATED_BY = source.updated_by,
        UPDATED_DTTM = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        ENTITY_ID,
        SCOA_ACCOUNT_ID,
        ACTIVITY_MONTH,
        ACTIVITY_VALUE,
        UPDATED_DTTM,
        UPDATED_BY
      ) VALUES (
        source.entity_id,
        source.scoa_account_id,
        source.activity_month,
        source.activity_value,
        NULL,
        NULL
      )
    OUTPUT
      inserted.ENTITY_ID as entity_id,
      inserted.SCOA_ACCOUNT_ID as scoa_account_id,
      inserted.ACTIVITY_MONTH as activity_month,
      inserted.ACTIVITY_VALUE as activity_value,
      inserted.INSERTED_DTTM as inserted_dttm,
      inserted.UPDATED_DTTM as updated_dttm,
      inserted.UPDATED_BY as updated_by;`,
    params,
  );

  return (result.recordset ?? []).map(mapRow);
};

export const updateEntityScoaActivity = async (
  entityId: string,
  scoaAccountId: string,
  activityMonth: string,
  updates: Partial<Pick<EntityScoaActivityInput, 'activityValue' | 'updatedBy' | 'activityMonth'>>
): Promise<EntityScoaActivityRow | null> => {
  if (!entityId || !scoaAccountId || !activityMonth) {
    return null;
  }

  const normalizedMonth = toSqlMonth(updates.activityMonth ?? activityMonth);

  await runQuery(
    `UPDATE ${TABLE_NAME}
    SET
      ACTIVITY_MONTH = ISNULL(@activityMonth, ACTIVITY_MONTH),
      ACTIVITY_VALUE = ISNULL(@activityValue, ACTIVITY_VALUE),
      UPDATED_BY = @updatedBy,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE ENTITY_ID = @entityId
      AND SCOA_ACCOUNT_ID = @scoaAccountId
      AND ACTIVITY_MONTH = @existingMonth`,
    {
      entityId,
      scoaAccountId: normalizeText(scoaAccountId),
      existingMonth: toSqlMonth(activityMonth),
      activityMonth: normalizedMonth,
      activityValue: updates.activityValue ?? null,
      updatedBy: normalizeText(updates.updatedBy),
    }
  );

  const records = await listEntityScoaActivity(entityId);
  const targetMonth = normalizedMonth ?? toSqlMonth(activityMonth) ?? '';
  return records.find(
    (row) => row.scoaAccountId === scoaAccountId && row.activityMonth === targetMonth
  ) ?? null;
};

export default listEntityScoaActivity;
