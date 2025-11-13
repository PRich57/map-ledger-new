import type {
  CompanySummary,
  GLAccountMappingRow,
  MappingPolarity,
  TrialBalanceRow,
} from '../types';
import { slugify } from './slugify';

interface BuildMappingRowsFromImportOptions {
  uploadId: string;
  clientId?: string | null;
  selectedCompanies?: CompanySummary[];
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

const matchSelectedCompany = (
  entity: string | undefined,
  selectedCompanies?: CompanySummary[],
): CompanySummary | null => {
  if (!entity || !selectedCompanies || selectedCompanies.length === 0) {
    return null;
  }

  const trimmed = entity.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const slug = slugify(trimmed);

  for (const company of selectedCompanies) {
    const candidates = [company.id, company.name, slugify(company.name)];
    if (
      candidates.some((candidate) => {
        const comparison = candidate.trim().toLowerCase();
        return comparison === normalized || comparison === slug;
      })
    ) {
      return company;
    }
  }

  return null;
};

const normalizeEntity = (
  entity: string | undefined,
  fallbackId: string,
  fallbackName: string,
  selectedCompanies?: CompanySummary[],
): { id: string; name: string } => {
  const matchedCompany = matchSelectedCompany(entity, selectedCompanies);
  if (matchedCompany) {
    return { id: matchedCompany.id, name: matchedCompany.name };
  }

  const trimmed = entity?.trim();
  if (trimmed && trimmed.length > 0) {
    const normalizedId = slugify(trimmed);
    return {
      id: normalizedId.length > 0 ? normalizedId : fallbackId,
      name: trimmed,
    };
  }

  if (selectedCompanies && selectedCompanies.length === 1) {
    const [singleCompany] = selectedCompanies;
    return { id: singleCompany.id, name: singleCompany.name };
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
    const normalized = normalizeEntity(
      row.entity,
      fallbackEntityId,
      fallbackName,
      options.selectedCompanies,
    );
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
      requiresCompanyAssignment: false,
    };
  });
};

export type { BuildMappingRowsFromImportOptions };