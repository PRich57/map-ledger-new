import type {
  EntitySummary,
  GLAccountMappingRow,
  MappingPolarity,
  TrialBalanceRow,
} from '../types';
import { slugify } from './slugify';

interface BuildMappingRowsFromImportOptions {
  uploadId: string;
  clientId?: string | null;
  selectedEntities?: EntitySummary[];
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

const matchSelectedEntity = (
  entity: string | undefined,
  selectedEntities?: EntitySummary[],
): EntitySummary | null => {
  if (!entity || !selectedEntities || selectedEntities.length === 0) {
    return null;
  }

  const trimmed = entity.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const slug = slugify(trimmed);

  for (const selected of selectedEntities) {
    const candidates = [selected.id, selected.name, slugify(selected.name)];
    if (
      candidates.some((candidate) => {
        const comparison = candidate.trim().toLowerCase();
        return comparison === normalized || comparison === slug;
      })
    ) {
      return selected;
    }
  }

  return null;
};

const normalizeEntity = (
  entity: string | undefined,
  selectedEntities?: EntitySummary[],
): { id: string | null; name: string | null } => {
  const matchedEntity = matchSelectedEntity(entity, selectedEntities);
  if (matchedEntity) {
    return { id: matchedEntity.id, name: matchedEntity.name };
  }

  const trimmed = entity?.trim();
  if (trimmed && trimmed.length > 0) {
    const normalizedId = slugify(trimmed);
    return {
      id: normalizedId.length > 0 ? normalizedId : null,
      name: trimmed,
    };
  }

  return { id: null, name: null };
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
    const normalized = normalizeEntity(row.entity, options.selectedEntities);
    const rawAccountId = (row.accountId ?? '').toString().trim();
    const accountId = rawAccountId.length > 0 ? rawAccountId : `account-${index + 1}`;
    const compositeEntityKey = normalized.id ?? 'no-entity';
    const compositeKey = `${compositeEntityKey}__${accountId}${row.glMonth ? `__${row.glMonth}` : ''}__${index}`;
    const rowId = options.uploadId ? `${options.uploadId}-${compositeKey}` : compositeKey;
    const rawNetChange = Number(row.netChange ?? 0);
    const netChange = Number.isFinite(rawNetChange) ? rawNetChange : 0;
    const polarity = determinePolarity(netChange);
    const operation = resolveOperation(row, 'Imported');

    return {
      id: rowId,
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
      entities:
        normalized.id && normalized.name
          ? [
              {
                id: normalized.id,
                entity: normalized.name,
                balance: netChange,
              },
            ]
          : [],
      glMonth: row.glMonth, // Preserve GL month from import
      requiresEntityAssignment: !normalized.id && !normalized.name,
    };
  });
};

export type { BuildMappingRowsFromImportOptions };