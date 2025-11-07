import type { GLAccountMappingRow, MappingPolarity, TrialBalanceRow } from '../types';

interface BuildMappingRowsFromImportOptions {
  uploadId: string;
  clientId?: string | null;
}

const determinePolarity = (value: number): MappingPolarity => {
  if (value > 0) {
    return 'Debit';
  }
  if (value < 0) {
    return 'Credit';
  }
  return 'Absolute';
};

const normalizeEntity = (
  entity: string | undefined,
  fallbackId: string,
  fallbackName: string,
): { id: string; name: string } => {
  const trimmed = entity?.trim();
  if (trimmed && trimmed.length > 0) {
    const normalizedId = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return {
      id: normalizedId.length > 0 ? normalizedId : fallbackId,
      name: trimmed,
    };
  }
  return { id: fallbackId, name: fallbackName };
};

const resolveOperation = (row: TrialBalanceRow, fallback: string): string => {
  const direct = row['operation'];
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }
  const alt = row['operationName'] ?? row['Operation'];
  if (typeof alt === 'string' && alt.trim().length > 0) {
    return alt.trim();
  }

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && value.trim().length > 0 && key.toLowerCase().includes('operation')) {
      return value.trim();
    }
  }

  return fallback;
};

export const buildMappingRowsFromImport = (
  rows: TrialBalanceRow[],
  options: BuildMappingRowsFromImportOptions,
): GLAccountMappingRow[] => {
  return rows.map((row, index) => {
    const fallbackEntityId = `${options.uploadId}-entity-${index}`;
    const fallbackName = options.clientId ? `Client ${options.clientId}` : 'Imported Entity';
    const normalized = normalizeEntity(row.entity, fallbackEntityId, fallbackName);
    const rawAccountId = (row.accountId ?? '').toString().trim();
    const accountId = rawAccountId.length > 0 ? rawAccountId : `account-${index + 1}`;
    const compositeKey = `${normalized.id}__${accountId}`;
    const rowId = options.uploadId ? `${options.uploadId}-${compositeKey}` : compositeKey;
    const rawNetChange = Number(row.netChange ?? 0);
    const netChange = Number.isFinite(rawNetChange) ? rawNetChange : 0;
    const polarity = determinePolarity(netChange);
    const operation = resolveOperation(row, 'Imported');

    return {
      id: rowId,
      companyId: normalized.id,
      companyName: normalized.name,
      entityId: normalized.id,
      entityName: normalized.name,
      accountId,
      accountName: row.description,
      activity: netChange,
      status: 'Unmapped',
      mappingType: 'direct',
      netChange,
      operation,
      polarity,
      splitDefinitions: [],
      companies: [
        {
          id: normalized.id,
          company: normalized.name,
          balance: netChange,
        },
      ],
      glMonth: row.glMonth, // Preserve GL month from import
    };
  });
};

export type { BuildMappingRowsFromImportOptions };
