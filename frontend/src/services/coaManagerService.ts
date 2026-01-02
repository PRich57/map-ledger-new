export type CoaManagerCostType = string;
export type CoaManagerIsFinancial = boolean | null;

export interface CoaManagerColumn {
  key: string;
  label: string;
  description?: string | null;
}

export interface CoaManagerRow {
  id: string;
  accountNumber: string;
  accountName: string;
  category: string;
  department: string;
  costType: CoaManagerCostType;
  isFinancial: CoaManagerIsFinancial;
}

export interface CoaManagerIndustryResponse {
  columns: CoaManagerColumn[];
  rows: CoaManagerRow[];
}

export class IndustryAlreadyExistsError extends Error {
  code: string;

  constructor(message = 'Industry already exists.') {
    super(message);
    this.name = 'IndustryAlreadyExistsError';
    this.code = 'industry_exists';
  }
}

const env = import.meta.env;
const API_BASE_URL = env.VITE_API_BASE_URL ?? '/api';

const coerceString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
};

const coerceBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
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

const normalizeIndustry = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object') {
    const name = coerceString((value as { name?: unknown }).name);
    return name.length > 0 ? name : null;
  }
  return null;
};

const normalizeColumn = (column: Record<string, unknown>): CoaManagerColumn | null => {
  const key = coerceString(column.key ?? column.field ?? column.name);
  const label = coerceString(column.label ?? column.title ?? column.name ?? column.key);
  if (!key) {
    return null;
  }
  const description = coerceString(column.description);
  return {
    key,
    label: label || key,
    description: description || null,
  };
};

const getValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      continue;
    }
    const value = row[key];
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '';
};

const getRawValue = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      continue;
    }
    return row[key];
  }
  return undefined;
};

const normalizeRow = (
  row: Record<string, unknown>,
  index: number,
): CoaManagerRow => {
  const accountNumber = getValue(row, [
    'accountNumber',
    'account_number',
    'ACCOUNT_NUMBER',
    'account',
    'ACCOUNT',
    'accountNo',
    'ACCOUNT_NO',
  ]);
  const accountName = getValue(row, [
    'accountName',
    'account_name',
    'ACCOUNT_NAME',
    'name',
    'NAME',
    'description',
    'DESCRIPTION',
  ]);
  const id =
    getValue(row, ['id', 'rowId', 'row_id', 'recordId', 'record_id', 'RECORD_ID']) ||
    accountNumber ||
    accountName ||
    `row-${index}`;

  return {
    id,
    accountNumber,
    accountName,
    category: getValue(row, ['category', 'CATEGORY']),
    department: getValue(row, ['department', 'DEPARTMENT', 'dept', 'DEPT']),
    costType: getValue(row, ['costType', 'cost_type', 'COST_TYPE']),
    isFinancial: coerceBoolean(
      getRawValue(row, ['isFinancial', 'is_financial', 'IS_FINANCIAL', 'financialFlag']),
    ),
  };
};

export const fetchIndustries = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/industries`);
  if (!response.ok) {
    throw new Error(`Failed to fetch industries (${response.status})`);
  }

  const payload = (await response.json()) as
    | string[]
    | { industries?: unknown[]; items?: unknown[] };
  const rawList = Array.isArray(payload)
    ? payload
    : payload.industries ?? payload.items ?? [];

  return rawList
    .map(normalizeIndustry)
    .filter((value): value is string => Boolean(value));
};

export const createIndustry = async (name: string): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/industries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to create industry.');
    const lower = errorText.toLowerCase();
    if (response.status === 409 || lower.includes('exists') || lower.includes('duplicate')) {
      throw new IndustryAlreadyExistsError(errorText || 'Industry already exists.');
    }
    throw new Error(errorText || 'Unable to create industry.');
  }

  const payload = (await response.json().catch(() => null)) as
    | { name?: string; industry?: string }
    | null;
  const resolved = payload?.name ?? payload?.industry ?? name;
  return resolved.trim() || name;
};

export const fetchIndustryCoaManager = async (
  industry: string,
): Promise<CoaManagerIndustryResponse> => {
  const response = await fetch(`${API_BASE_URL}/coa-manager/industry/${industry}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch COA manager data (${response.status})`);
  }

  const payload = (await response.json()) as {
    rows?: Record<string, unknown>[];
    columns?: Record<string, unknown>[];
  };

  const columns = (payload.columns ?? [])
    .map(column => normalizeColumn(column))
    .filter((column): column is CoaManagerColumn => Boolean(column));
  const rows = (payload.rows ?? []).map((row, index) => normalizeRow(row, index));

  return { columns, rows };
};

export const updateIndustryCostType = async (
  industry: string,
  rowId: string,
  costType: CoaManagerCostType,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/coa-manager/industry/${industry}/cost-type`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowId, costType }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to update cost type.');
    throw new Error(errorText || 'Unable to update cost type.');
  }
};

export const updateIndustryIsFinancial = async (
  industry: string,
  rowId: string,
  isFinancial: CoaManagerIsFinancial,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/coa-manager/industry/${industry}/is-financial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowId, isFinancial }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to update financial flag.');
    throw new Error(errorText || 'Unable to update financial flag.');
  }
};

export const updateIndustryCostTypeBatch = async (
  industry: string,
  rowIds: string[],
  costType: CoaManagerCostType,
): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/coa-manager/industry/${industry}/cost-type/batch`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIds, costType }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to update cost types.');
    throw new Error(errorText || 'Unable to update cost types.');
  }
};

export const updateIndustryIsFinancialBatch = async (
  industry: string,
  rowIds: string[],
  isFinancial: CoaManagerIsFinancial,
): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/coa-manager/industry/${industry}/is-financial/batch`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIds, isFinancial }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to update financial flags.');
    throw new Error(errorText || 'Unable to update financial flags.');
  }
};

const extractErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const text = await response.text().catch(() => '');
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as { message?: string; detail?: string };
    return parsed.message ?? parsed.detail ?? text;
  } catch {
    return text;
  }
};

export const importIndustryCoaFile = async (
  industry: string,
  file: File,
): Promise<void> => {
  const formData = new FormData();
  formData.append('industry', industry);
  formData.append('action', 'import');
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/coa-manager/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response, 'Unable to import COA file.');
    throw new Error(message || 'Unable to import COA file.');
  }
};
