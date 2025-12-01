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
  fallbackId: string,
  fallbackName: string,
  selectedEntities?: EntitySummary[],
): { id: string; name: string } => {
  const matchedEntity = matchSelectedEntity(entity, selectedEntities);
  if (matchedEntity) {
    return { id: matchedEntity.id, name: matchedEntity.name };
  }

  const trimmed = entity?.trim();
  if (trimmed && trimmed.length > 0) {
    const normalizedId = slugify(trimmed);
    return {
      id: normalizedId.length > 0 ? normalizedId : fallbackId,
      name: trimmed,
    };
  }

  if (selectedEntities && selectedEntities.length === 1) {
    const [singleEntity] = selectedEntities;
    return { id: singleEntity.id, name: singleEntity.name };
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
      options.selectedEntities,
    );
    const rawAccountId = (row.accountId ?? '').toString().trim();
    const accountId = rawAccountId.length > 0 ? rawAccountId : `account-${index + 1}`;
    const compositeKey = `${normalized.id}__${accountId}${row.glMonth ? `__${row.glMonth}` : ''}__${index}`;
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
      entities: [
        {
          id: normalized.id,
          entity: normalized.name,
          balance: netChange,
        },
      ],
      glMonth: row.glMonth, // Preserve GL month from import
      requiresEntityAssignment: false,
    };
  });
};

export type { BuildMappingRowsFromImportOptions };