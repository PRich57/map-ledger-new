export type CoaManagerCostType = string;

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

const normalizeRow = (
  row: Record<string, unknown>,
  index: number,
): CoaManagerRow => {
  const accountNumber = coerceString(
    row.accountNumber ?? row.account_number ?? row.account ?? row.accountNo,
  );
  const accountName = coerceString(row.accountName ?? row.account_name ?? row.name);
  const id =
    coerceString(row.id ?? row.rowId ?? row.row_id) ||
    accountNumber ||
    accountName ||
    `row-${index}`;

  return {
    id,
    accountNumber,
    accountName,
    category: coerceString(row.category),
    department: coerceString(row.department),
    costType: coerceString(row.costType ?? row.cost_type ?? row.costType),
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
