import { runQuery } from '../utils/sqlClient';

export interface EntityAccountInput {
  entityId: string;
  accountId: string;
  accountName?: string | null;
  updatedBy?: string | null;
}

export interface EntityAccountRow extends EntityAccountInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

const TABLE_NAME = 'ml.ENTITY_ACCOUNTS';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const mapRow = (row: {
  entity_id: string | number;
  account_id: string;
  account_name?: string | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityAccountRow => ({
  entityId: `${row.entity_id}`,
  accountId: row.account_id,
  accountName: row.account_name ?? null,
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

export const upsertEntityAccounts = async (
  inputs: EntityAccountInput[],
): Promise<EntityAccountRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      params[`entityId${index}`] = input.entityId;
      params[`accountId${index}`] = input.accountId;
      params[`accountName${index}`] = normalizeText(input.accountName);
      params[`updatedBy${index}`] = normalizeText(input.updatedBy);

      return `(@entityId${index}, @accountId${index}, @accountName${index}, @updatedBy${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    entity_id: string | number;
    account_id: string;
    account_name?: string | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `MERGE ${TABLE_NAME} AS target
    USING (VALUES ${valuesClause}) AS source(
      entity_id,
      account_id,
      account_name,
      updated_by
    )
    ON target.ENTITY_ID = source.entity_id AND target.ACCOUNT_ID = source.account_id
    WHEN MATCHED THEN
      UPDATE SET
        ACCOUNT_NAME = ISNULL(source.account_name, target.ACCOUNT_NAME),
        UPDATED_BY = source.updated_by,
        UPDATED_DTTM = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        ENTITY_ID,
        ACCOUNT_ID,
        ACCOUNT_NAME,
        UPDATED_DTTM,
        UPDATED_BY
      ) VALUES (
        source.entity_id,
        source.account_id,
        source.account_name,
        NULL,
        source.updated_by
      )
    OUTPUT
      inserted.ENTITY_ID as entity_id,
      inserted.ACCOUNT_ID as account_id,
      inserted.ACCOUNT_NAME as account_name,
      inserted.INSERTED_DTTM as inserted_dttm,
      inserted.UPDATED_DTTM as updated_dttm,
      inserted.UPDATED_BY as updated_by;`,
    params,
  );

  return (result.recordset ?? []).map(mapRow);
};

export default upsertEntityAccounts;