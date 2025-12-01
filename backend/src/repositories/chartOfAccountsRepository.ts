import { runQuery } from '../utils/sqlClient';

export interface ChartOfAccountRecord {
  accountNumber: string;
  coreAccount: string | null;
  operationalGroup: string | null;
  laborGroup: string | null;
  accountType: string | null;
  category: string | null;
  subCategory: string | null;
  description: string | null;
}

const TABLE_NAME = 'ML.CHART_OF_ACCOUNTS';

export const listChartOfAccounts = async (): Promise<ChartOfAccountRecord[]> => {
  const { recordset = [] } = await runQuery<ChartOfAccountRecord>(
    `SELECT
      ACCOUNT_NUMBER AS accountNumber,
      CORE_ACCOUNT AS coreAccount,
      OPERATIONAL_GROUP AS operationalGroup,
      LABOR_GROUP AS laborGroup,
      ACCOUNT_TYPE AS accountType,
      CATEGORY AS category,
      SUB_CATEGORY AS subCategory,
      DESCRIPTION AS description
    FROM ${TABLE_NAME}
    ORDER BY ACCOUNT_NUMBER`
  );

  return recordset.map((row) => ({
    accountNumber: row.accountNumber?.trim?.() ?? '',
    coreAccount: row.coreAccount ?? null,
    operationalGroup: row.operationalGroup ?? null,
    laborGroup: row.laborGroup ?? null,
    accountType: row.accountType ?? null,
    category: row.category ?? null,
    subCategory: row.subCategory ?? null,
    description: row.description ?? null,
  }));
};

export default listChartOfAccounts;
