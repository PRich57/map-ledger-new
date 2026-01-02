import type {
  EntitySummary,
  GLAccountMappingRow,
  MappingPolarity,
  TrialBalanceRow,
} from '../types';
import { normalizeGlMonth } from './extractDateFromText';
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
  entityId: string | null,
  entityName: string | null,
  selectedEntities?: EntitySummary[],
): EntitySummary | null => {
  if (!selectedEntities || selectedEntities.length === 0) {
    return null;
  }

  const normalizedId = entityId?.trim();
  if (normalizedId) {
    const byId = selectedEntities.find(entity => entity.id === normalizedId);
    if (byId) {
      return byId;
    }
  }

  const normalizedName = entityName?.trim();
  if (!normalizedName) {
    return null;
  }

  const normalizedSlug = slugify(normalizedName);

  for (const selected of selectedEntities) {
    const candidates = [selected.id, selected.name, slugify(selected.name)];
    if (
      candidates.some((candidate) => {
        const comparison = candidate.trim().toLowerCase();
        return (
          comparison === normalizedName.toLowerCase() ||
          comparison === normalizedSlug
        );
      })
    ) {
      return selected;
    }
  }

  return null;
};

const normalizeEntity = (
  row: TrialBalanceRow,
  selectedEntities?: EntitySummary[],
): { id: string | null; name: string | null } => {
  const providedId = row.entityId?.trim() ?? null;
  const providedName = row.entityName?.trim() ?? row.entity?.trim() ?? null;

  const matchedEntity = matchSelectedEntity(providedId, providedName, selectedEntities);
  if (matchedEntity) {
    return { id: matchedEntity.id, name: matchedEntity.name };
  }

  if (providedId) {
    return { id: providedId, name: providedName ?? providedId };
  }

  if (providedName) {
    const normalizedId = slugify(providedName);
    return {
      id: normalizedId.length > 0 ? normalizedId : null,
      name: providedName,
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
    const normalized = normalizeEntity(row, options.selectedEntities);
    const rawAccountId = (row.accountId ?? '').toString().trim();
    const accountId = rawAccountId.length > 0 ? rawAccountId : `account-${index + 1}`;
    const compositeEntityKey = normalized.id ?? 'no-entity';
    const compositeKey = `${compositeEntityKey}__${accountId}${row.glMonth ? `__${row.glMonth}` : ''}__${index}`;
    const rowId = options.uploadId ? `${options.uploadId}-${compositeKey}` : compositeKey;
    const rawNetChange = Number(row.netChange ?? 0);
    const netChange = Number.isFinite(rawNetChange) ? rawNetChange : 0;
    const polarity = determinePolarity(netChange);
    const operation = resolveOperation(row, 'Imported');
    const normalizedGlMonth = normalizeGlMonth((row.glMonth ?? '').trim());

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
      glMonth: normalizedGlMonth || undefined, // Normalize GL month to YYYY-MM-01
      requiresEntityAssignment: !normalized.id && !normalized.name,
      userDefined1: row.userDefined1 ?? null,
      userDefined2: row.userDefined2 ?? null,
      userDefined3: row.userDefined3 ?? null,
    };
  });
};

export type { BuildMappingRowsFromImportOptions };
