import { runQuery } from '../utils/sqlClient';
import {
  buildCoaTableName,
  isSafeTableName,
  listIndustries,
  normalizeIndustryName,
} from './industriesRepository';

export interface CoaManagerRow {
  id: string;
  accountNumber: string;
  accountName: string;
  category: string | null;
  department: string | null;
  costType: string | null;
}

export class IndustryNotFoundError extends Error {
  code = 'industry_not_found';

  constructor(message = 'Industry not found.') {
    super(message);
    this.name = 'IndustryNotFoundError';
  }
}

export class InvalidIndustryNameError extends Error {
  code = 'invalid_industry_name';

  constructor(message = 'Industry name is invalid.') {
    super(message);
    this.name = 'InvalidIndustryNameError';
  }
}

export class InvalidIndustryTableError extends Error {
  code = 'invalid_industry_table';

  constructor(message = 'Industry table configuration is invalid.') {
    super(message);
    this.name = 'InvalidIndustryTableError';
  }
}

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveIndustryTableName = async (industryName: string): Promise<string> => {
  const normalized = normalizeIndustryName(industryName);
  if (!normalized) {
    throw new InvalidIndustryNameError();
  }

  const industries = await listIndustries();
  const match = industries.find((industry) => industry.normalizedName === normalized);
  if (!match) {
    throw new IndustryNotFoundError();
  }

  const expectedTableName = buildCoaTableName(normalized);
  if (!isSafeTableName(expectedTableName)) {
    throw new InvalidIndustryTableError();
  }

  if (match.tableName && match.tableName.toUpperCase() !== expectedTableName.toUpperCase()) {
    throw new InvalidIndustryTableError();
  }

  const allowlist = new Set(
    industries.map((industry) => buildCoaTableName(industry.normalizedName)),
  );
  if (!allowlist.has(expectedTableName)) {
    throw new InvalidIndustryTableError();
  }

  return expectedTableName;
};

export const listIndustryCoaRows = async (industryName: string): Promise<CoaManagerRow[]> => {
  const tableName = await resolveIndustryTableName(industryName);
  const { recordset = [] } = await runQuery<{
    record_id: string | number;
    account_number: string | null;
    account_name: string | null;
    category: string | null;
    department: string | null;
    cost_type: string | null;
  }>(
    `SELECT
      RECORD_ID AS record_id,
      ACCOUNT_NUMBER AS account_number,
      ACCOUNT_NAME AS account_name,
      CATEGORY AS category,
      DEPARTMENT AS department,
      COST_TYPE AS cost_type
    FROM ${tableName}
    ORDER BY ACCOUNT_NUMBER`,
  );

  return recordset.map((row) => ({
    id: `${row.record_id}`,
    accountNumber: row.account_number?.trim?.() ?? '',
    accountName: row.account_name?.trim?.() ?? '',
    category: row.category ?? null,
    department: row.department ?? null,
    costType: row.cost_type ?? null,
  }));
};

export const updateIndustryCostType = async (
  industryName: string,
  recordId: string,
  costType: string | null,
): Promise<boolean> => {
  const tableName = await resolveIndustryTableName(industryName);
  const result = await runQuery(
    `UPDATE ${tableName}
    SET COST_TYPE = @costType
    WHERE RECORD_ID = @recordId`,
    {
      costType: normalizeText(costType),
      recordId,
    },
  );

  return (result.rowsAffected?.[0] ?? 0) > 0;
};

export const updateIndustryCostTypeBatch = async (
  industryName: string,
  recordIds: string[],
  costType: string | null,
): Promise<number> => {
  if (recordIds.length === 0) {
    return 0;
  }

  const tableName = await resolveIndustryTableName(industryName);
  const params: Record<string, unknown> = {
    costType: normalizeText(costType),
  };
  const idsClause = recordIds
    .map((recordId, index) => {
      params[`recordId${index}`] = recordId;
      return `@recordId${index}`;
    })
    .join(', ');

  const result = await runQuery(
    `UPDATE ${tableName}
    SET COST_TYPE = @costType
    WHERE RECORD_ID IN (${idsClause})`,
    params,
  );

  return result.rowsAffected?.[0] ?? 0;
};

export default listIndustryCoaRows;
