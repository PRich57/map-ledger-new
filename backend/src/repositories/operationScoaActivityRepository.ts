import { normalizeGlMonth } from '../utils/glMonth';
import { runQuery } from '../utils/sqlClient';

export interface OperationScoaActivityInput {
  operationCd: string;
  scoaAccountId: string;
  activityMonth: string;
  activityValue: number;
  updatedBy?: string | null;
}

export interface OperationScoaActivityRow extends OperationScoaActivityInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

const TABLE_NAME = 'ml.OPERATION_SCOA_ACTIVITY';

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
  operation_cd: string;
  scoa_account_id: string;
  activity_month?: string | null;
  activity_value?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): OperationScoaActivityRow => ({
  operationCd: row.operation_cd,
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

export const listOperationScoaActivity = async (
  operationCd: string
): Promise<OperationScoaActivityRow[]> => {
  if (!operationCd) {
    return [];
  }

  const result = await runQuery<{
    operation_cd: string;
    scoa_account_id: string;
    activity_month?: string | null;
    activity_value?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      OPERATION_CD as operation_cd,
      SCOA_ACCOUNT_ID as scoa_account_id,
      ACTIVITY_MONTH as activity_month,
      ACTIVITY_VALUE as activity_value,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE OPERATION_CD = @operationCd
    ORDER BY ACTIVITY_MONTH DESC, SCOA_ACCOUNT_ID ASC`,
    { operationCd }
  );

  return (result.recordset ?? []).map(mapRow);
};

export const insertOperationScoaActivity = async (
  activities: OperationScoaActivityInput[]
): Promise<OperationScoaActivityRow[]> => {
  if (!activities.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = activities
    .map((activity, index) => {
      params[`operationCd${index}`] = normalizeText(activity.operationCd);
      params[`scoaAccountId${index}`] = normalizeText(activity.scoaAccountId);
      params[`activityMonth${index}`] = toSqlMonth(activity.activityMonth);
      params[`activityValue${index}`] = activity.activityValue;
      return `(@operationCd${index}, @scoaAccountId${index}, @activityMonth${index}, @activityValue${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    operation_cd: string;
    scoa_account_id: string;
    activity_month?: string | null;
    activity_value?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `INSERT INTO ${TABLE_NAME} (
      OPERATION_CD,
      SCOA_ACCOUNT_ID,
      ACTIVITY_MONTH,
      ACTIVITY_VALUE
    )
    OUTPUT
      INSERTED.OPERATION_CD as operation_cd,
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

export const updateOperationScoaActivity = async (
  operationCd: string,
  scoaAccountId: string,
  activityMonth: string,
  updates: Partial<Pick<OperationScoaActivityInput, 'activityMonth' | 'activityValue' | 'updatedBy'>>
): Promise<OperationScoaActivityRow | null> => {
  if (!operationCd || !scoaAccountId || !activityMonth) {
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
    WHERE OPERATION_CD = @operationCd
      AND SCOA_ACCOUNT_ID = @scoaAccountId
      AND ACTIVITY_MONTH = @existingMonth`,
    {
      operationCd: normalizeText(operationCd),
      scoaAccountId: normalizeText(scoaAccountId),
      existingMonth: toSqlMonth(activityMonth),
      activityMonth: normalizedMonth,
      activityValue: updates.activityValue ?? null,
      updatedBy: normalizeText(updates.updatedBy),
    }
  );

  const records = await listOperationScoaActivity(operationCd);
  const targetMonth = normalizedMonth ?? toSqlMonth(activityMonth) ?? '';
  return records.find(
    (row) => row.scoaAccountId === scoaAccountId && row.activityMonth === targetMonth
  ) ?? null;
};

export default listOperationScoaActivity;
