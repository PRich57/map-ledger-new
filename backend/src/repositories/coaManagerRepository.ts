import { runQuery } from '../utils/sqlClient';
import {
  buildCoaTableName,
  isSafeTableName,
  listIndustries,
  normalizeIndustryName,
} from './industriesRepository';

export interface CoaManagerColumn {
  key: string;
  label: string;
}

export interface CoaManagerRow {
  id: string;
  accountNumber: string;
  accountName: string;
  category: string | null;
  department: string | null;
  costType: string | null;
  isFinancial: boolean | null;
}

export interface IndustryCoaData {
  columns: CoaManagerColumn[];
  rows: CoaManagerRow[];
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

type ColumnMapping = {
  recordId: string | null;
  accountNumber: string | null;
  accountName: string | null;
  category: string | null;
  department: string | null;
  costType: string | null;
  isFinancial: string | null;
};

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  recordId: ['RECORD_ID', 'RECORDID', 'ID'],
  accountNumber: [
    'ACCOUNT_NUMBER',
    'ACCOUNT',
    'ACCOUNT_NO',
    'ACCT_NO',
    'ACCT_NUMBER',
    'ACCOUNTNUM',
    'ACCOUNT_NUM',
    'GL_ACCOUNT',
    'GL_ACCOUNT_NUMBER',
  ],
  accountName: [
    'ACCOUNT_NAME',
    'ACCOUNT_DESCRIPTION',
    'ACCOUNT_DESC',
    'DESCRIPTION',
    'NAME',
    'ACCT_NAME',
  ],
  category: ['CATEGORY', 'ACCOUNT_CATEGORY', 'ACCT_CATEGORY'],
  department: ['DEPARTMENT', 'DEPT'],
  costType: ['COST_TYPE', 'COSTTYPE'],
  isFinancial: ['IS_FINANCIAL', 'ISFINANCIAL'],
};

const IS_FINANCIAL_COLUMN_TYPE = 'BIT';

const normalizeColumnKey = (value: string): string =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');

const escapeColumnName = (value: string): string => `[${value.replace(/]/g, ']]')}]`;

const splitTableName = (tableName: string): { schema: string; name: string } => {
  const [schema, name] = tableName.split('.');
  return { schema: schema ?? 'dbo', name: name ?? tableName };
};

const resolveColumnName = (aliases: string[], lookup: Map<string, string>): string | null => {
  for (const alias of aliases) {
    const normalized = normalizeColumnKey(alias);
    const match = lookup.get(normalized);
    if (match) {
      return match;
    }
  }
  return null;
};

const buildColumnMapping = (columns: string[]): ColumnMapping => {
  const lookup = new Map<string, string>();
  columns.forEach((column) => {
    lookup.set(normalizeColumnKey(column), column);
  });

  return {
    recordId: resolveColumnName(COLUMN_ALIASES.recordId, lookup),
    accountNumber: resolveColumnName(COLUMN_ALIASES.accountNumber, lookup),
    accountName: resolveColumnName(COLUMN_ALIASES.accountName, lookup),
    category: resolveColumnName(COLUMN_ALIASES.category, lookup),
    department: resolveColumnName(COLUMN_ALIASES.department, lookup),
    costType: resolveColumnName(COLUMN_ALIASES.costType, lookup),
    isFinancial: resolveColumnName(COLUMN_ALIASES.isFinancial, lookup),
  };
};

const buildColumnResponse = (mapping: ColumnMapping): CoaManagerColumn[] => [
  { key: 'accountNumber', label: mapping.accountNumber ?? 'Account' },
  { key: 'accountName', label: mapping.accountName ?? 'Name' },
  { key: 'category', label: mapping.category ?? 'Category' },
  { key: 'department', label: mapping.department ?? 'Department' },
  { key: 'isFinancial', label: mapping.isFinancial ?? 'Is Financial' },
  { key: 'costType', label: mapping.costType ?? 'Cost Type' },
];

const toNullableString = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return String(value);
};

const toRequiredString = (value: unknown): string => toNullableString(value) ?? '';

const toNullableBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes' ||
      normalized === 'y' ||
      normalized.includes('financial')
    ) {
      return true;
    }
    if (
      normalized === 'false' ||
      normalized === '0' ||
      normalized === 'no' ||
      normalized === 'n' ||
      normalized.includes('operational')
    ) {
      return false;
    }
  }
  return null;
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
  const resolvedTableName = match.tableName?.trim() || expectedTableName;

  if (!isSafeTableName(resolvedTableName)) {
    throw new InvalidIndustryTableError();
  }

  const allowlist = new Set(
    industries.map((industry) =>
      (industry.tableName?.trim() || buildCoaTableName(industry.normalizedName)).toUpperCase(),
    ),
  );
  if (!allowlist.has(resolvedTableName.toUpperCase())) {
    throw new InvalidIndustryTableError();
  }

  return resolvedTableName;
};

const listTableColumns = async (tableName: string): Promise<string[]> => {
  const { schema, name } = splitTableName(tableName);
  const { recordset = [] } = await runQuery<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schema
      AND TABLE_NAME = @name
    ORDER BY ORDINAL_POSITION`,
    {
      schema,
      name,
    },
  );

  return recordset.map((row) => row.column_name);
};

const ensureIsFinancialColumn = async (tableName: string): Promise<void> => {
  await runQuery(
    `IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = PARSENAME(@tableName, 2)
        AND TABLE_NAME = PARSENAME(@tableName, 1)
        AND COLUMN_NAME = 'IS_FINANCIAL'
    )
    BEGIN
      EXEC('ALTER TABLE ${tableName} ADD [IS_FINANCIAL] ${IS_FINANCIAL_COLUMN_TYPE} NULL')
    END`,
    {
      tableName,
    },
  );
};

export const listIndustryCoaData = async (
  industryName: string,
): Promise<IndustryCoaData> => {
  const tableName = await resolveIndustryTableName(industryName);
  await ensureIsFinancialColumn(tableName);
  const tableColumns = await listTableColumns(tableName);
  const mapping = buildColumnMapping(tableColumns);
  const orderByColumn = mapping.accountNumber ?? mapping.recordId;
  const orderClause = orderByColumn ? ` ORDER BY ${escapeColumnName(orderByColumn)}` : '';
  const { recordset = [] } = await runQuery<Record<string, unknown>>(
    `SELECT *
    FROM ${tableName}${orderClause}`,
  );

  const rows = recordset.map((row, index) => {
    const recordIdValue = mapping.recordId ? row[mapping.recordId] : null;
    const accountNumber = toRequiredString(
      mapping.accountNumber ? row[mapping.accountNumber] : null,
    );
    const accountName = toRequiredString(mapping.accountName ? row[mapping.accountName] : null);
    const id =
      recordIdValue !== null && recordIdValue !== undefined
        ? String(recordIdValue)
        : accountNumber || accountName || `row-${index}`;

    return {
      id,
      accountNumber,
      accountName,
      category: toNullableString(mapping.category ? row[mapping.category] : null),
      department: toNullableString(mapping.department ? row[mapping.department] : null),
      costType: toNullableString(mapping.costType ? row[mapping.costType] : null),
      isFinancial: toNullableBoolean(mapping.isFinancial ? row[mapping.isFinancial] : null),
    };
  });

  return {
    columns: buildColumnResponse(mapping),
    rows,
  };
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

export const updateIndustryIsFinancial = async (
  industryName: string,
  recordId: string,
  isFinancial: boolean | null,
): Promise<boolean> => {
  const tableName = await resolveIndustryTableName(industryName);
  const result = await runQuery(
    `UPDATE ${tableName}
    SET IS_FINANCIAL = @isFinancial
    WHERE RECORD_ID = @recordId`,
    {
      isFinancial,
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

export const updateIndustryIsFinancialBatch = async (
  industryName: string,
  recordIds: string[],
  isFinancial: boolean | null,
): Promise<number> => {
  if (recordIds.length === 0) {
    return 0;
  }

  const tableName = await resolveIndustryTableName(industryName);
  const params: Record<string, unknown> = {
    isFinancial,
  };
  const idsClause = recordIds
    .map((recordId, index) => {
      params[`recordId${index}`] = recordId;
      return `@recordId${index}`;
    })
    .join(', ');

  const result = await runQuery(
    `UPDATE ${tableName}
    SET IS_FINANCIAL = @isFinancial
    WHERE RECORD_ID IN (${idsClause})`,
    params,
  );

  return result.rowsAffected?.[0] ?? 0;
};

export default listIndustryCoaData;
