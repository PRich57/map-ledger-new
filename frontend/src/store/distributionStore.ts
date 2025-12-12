import { create } from 'zustand';
import type {
  DistributionOperationShare,
  DistributionRow,
  DistributionSaveOperation,
  DistributionSaveResponseItem,
  DistributionSaveRowInput,
  DistributionStatus,
  DistributionType,
  StandardScoaSummary,
} from '../types';

const env = import.meta.env;
const API_BASE_URL = env.VITE_API_BASE_URL ?? '/api';

export interface DistributionOperationCatalogItem {
  id: string;
  code: string;
  name: string;
}

interface DistributionState {
  rows: DistributionRow[];
  operationsCatalog: DistributionOperationCatalogItem[];
  searchTerm: string;
  statusFilters: DistributionStatus[];
  syncRowsFromStandardTargets: (summaries: StandardScoaSummary[]) => void;
  setSearchTerm: (term: string) => void;
  toggleStatusFilter: (status: DistributionStatus) => void;
  clearStatusFilters: () => void;
  updateRow: (id: string, updates: Partial<DistributionRow>) => void;
  updateRowType: (id: string, type: DistributionType) => void;
  updateRowOperations: (id: string, operations: DistributionRow['operations']) => void;
  updateRowPreset: (id: string, presetId: string | null) => void;
  updateRowNotes: (id: string, notes: string) => void;
  setOperationsCatalog: (operations: DistributionOperationCatalogItem[]) => void;
  applyBatchDistribution: (
    ids: string[],
    updates: {
      type?: DistributionType;
      operation?: DistributionOperationShare | null;
    },
  ) => void;
  applyPresetToRows: (ids: string[], presetId: string | null) => void;
  isSavingDistributions: boolean;
  saveError: string | null;
  saveSuccess: string | null;
  lastSavedCount: number;
  saveDistributions: (
    entityId: string | null,
    updatedBy: string | null,
  ) => Promise<number>;
}

const deriveDistributionStatus = (
  type: DistributionType,
  operations: DistributionRow['operations'],
): DistributionStatus => {
  if (type === 'direct') {
    return operations.length === 1 ? 'Distributed' : 'Undistributed';
  }

  if (type === 'percentage') {
    if (operations.length === 0) {
      return 'Undistributed';
    }

    const allHaveAllocations = operations.every(operation => typeof operation.allocation === 'number');
    if (!allHaveAllocations) {
      return 'Undistributed';
    }

    const total = operations.reduce((sum, operation) => sum + (operation.allocation ?? 0), 0);
    return Math.abs(total - 100) <= 0.01 ? 'Distributed' : 'Undistributed';
  }

  return operations.length > 0 ? 'Distributed' : 'Undistributed';
};

const applyDistributionStatus = (row: DistributionRow): DistributionRow => ({
  ...row,
  status: deriveDistributionStatus(row.type, row.operations),
});

const createBlankPercentageOperation = (): DistributionOperationShare => ({
  id: '',
  name: '',
  allocation: 0,
});

const ensureMinimumPercentageOperations = (
  operations: DistributionRow['operations'],
  minimum = 2,
): DistributionRow['operations'] => {
  const normalized = operations.map(operation => ({ ...operation }));
  if (normalized.length >= minimum) {
    return normalized;
  }
  const placeholders = Array.from({ length: minimum - normalized.length }, () =>
    createBlankPercentageOperation(),
  );
  return [...normalized, ...placeholders];
};

const clampOperationsForType = (
  type: DistributionType,
  operations: DistributionRow['operations'],
): DistributionRow['operations'] => {
  if (type === 'direct') {
    const [primary] = operations;
    return primary
      ? [
          {
            id: primary.id,
            code: primary.code,
            name: primary.name,
            notes: primary.notes,
          },
        ]
      : [];
  }

  if (type === 'percentage') {
    const normalized = operations.map((operation, index) => ({
      ...operation,
      allocation:
        typeof operation.allocation === 'number' ? operation.allocation : index === 0 ? 100 : 0,
    }));
    return ensureMinimumPercentageOperations(normalized);
  }

  return operations.map(operation => ({
    id: operation.id,
    code: operation.code,
    name: operation.name,
    allocation: operation.allocation,
    notes: operation.notes,
  }));
};

export const useDistributionStore = create<DistributionState>((set, _get) => ({
  rows: [],
  operationsCatalog: [],
  searchTerm: '',
  statusFilters: [],
  isSavingDistributions: false,
  saveError: null,
  saveSuccess: null,
  lastSavedCount: 0,
  syncRowsFromStandardTargets: summaries =>
    set(state => {
      const existingByTarget = new Map(
        state.rows.map(row => [row.mappingRowId, row] as const),
      );
      const nextRows: DistributionRow[] = summaries.map(summary => {
        const existing = existingByTarget.get(summary.id);
        const nextOperations = existing
          ? existing.operations.map(operation => ({ ...operation }))
          : [];
        const resolvedType = existing?.type ?? 'direct';
        return applyDistributionStatus({
          id: existing?.id ?? summary.id,
          mappingRowId: summary.id,
          accountId: summary.value,
          description: summary.label,
          activity: summary.mappedAmount,
          type: resolvedType,
          operations: clampOperationsForType(resolvedType, nextOperations),
          presetId: existing?.presetId ?? null,
          notes: existing?.notes,
          status: existing?.status ?? 'Undistributed',
          isDirty: existing?.isDirty ?? false,
        });
      });
      return { rows: nextRows };
    }),
  setSearchTerm: term => set({ searchTerm: term }),
  toggleStatusFilter: status =>
    set(state => ({
      statusFilters: state.statusFilters.includes(status)
        ? state.statusFilters.filter(value => value !== status)
        : [...state.statusFilters, status],
    })),
  clearStatusFilters: () => set({ statusFilters: [] }),
  updateRow: (id, updates) =>
    set(state => ({
      rows: state.rows.map(row => {
        if (row.id !== id) {
          return row;
        }
        const nextRow: DistributionRow = {
          ...row,
          ...updates,
          operations: updates.operations ?? row.operations,
          type: updates.type ?? row.type,
          isDirty: true,
        };
        return applyDistributionStatus(nextRow);
      }),
    })),
  updateRowType: (id, type) =>
    set(state => ({
      rows: state.rows.map(row => {
        if (row.id !== id) {
          return row;
        }
        const nextOperations = clampOperationsForType(type, row.operations);
        return applyDistributionStatus({
          ...row,
          type,
          operations: nextOperations,
          isDirty: true,
        });
      }),
    })),
  updateRowOperations: (id, operations) =>
    set(state => ({
      rows: state.rows.map(row =>
        row.id === id
          ? applyDistributionStatus({ ...row, operations, isDirty: true })
          : row,
      ),
    })),
  updateRowPreset: (id, presetId) =>
    set(state => ({
      rows: state.rows.map(row =>
        row.id === id ? { ...row, presetId: presetId ?? undefined, isDirty: true } : row,
      ),
    })),
  updateRowNotes: (id, notes) =>
    set(state => ({
      rows: state.rows.map(row =>
        row.id === id ? { ...row, notes: notes || undefined, isDirty: true } : row,
      ),
    })),
  setOperationsCatalog: operations =>
    set({
      operationsCatalog: operations.map(operation => ({
        ...operation,
        code: operation.code || operation.id,
        id: operation.id || operation.code,
      })),
    }),
  applyBatchDistribution: (ids, updates) => {
    if (!ids.length) {
      return;
    }
    set(state => {
      const idSet = new Set(ids);
      return {
        rows: state.rows.map(row => {
          if (!idSet.has(row.id)) {
            return row;
          }
          let nextRow: DistributionRow = { ...row };
          if (updates.type && updates.type !== nextRow.type) {
            nextRow = {
              ...nextRow,
              type: updates.type,
              operations: clampOperationsForType(updates.type, nextRow.operations),
            };
          }
          if (Object.prototype.hasOwnProperty.call(updates, 'operation')) {
            const operationShare = updates.operation;
            if (operationShare) {
              nextRow = {
                ...nextRow,
                operations: clampOperationsForType(nextRow.type, [operationShare]),
              };
            } else {
              nextRow = { ...nextRow, operations: [] };
            }
          }
          return applyDistributionStatus({ ...nextRow, isDirty: true });
        }),
      };
    });
  },
  applyPresetToRows: (ids, presetId) => {
    if (!ids.length) {
      return;
    }
    set(state => {
      const idSet = new Set(ids);
      return {
        rows: state.rows.map(row =>
          idSet.has(row.id) ? { ...row, presetId: presetId ?? null, isDirty: true } : row,
        ),
      };
    });
  },
  saveDistributions: async (entityId, updatedBy) => {
    const state = _get();

    if (!entityId) {
      set({
        saveError: 'Select an entity before saving the distributions.',
        saveSuccess: null,
        lastSavedCount: 0,
      });
      return 0;
    }

    if (state.rows.length === 0) {
      set({
        saveError: 'No distribution rows are available to save.',
        saveSuccess: null,
        lastSavedCount: 0,
      });
      return 0;
    }

    set({
      isSavingDistributions: true,
      saveError: null,
      saveSuccess: null,
    });

    const buildOperationPayload = (
      operation: DistributionOperationShare,
    ): DistributionSaveOperation | null => {
      const candidate = (operation.id ?? operation.code ?? '').trim().toUpperCase();
      if (!candidate) {
        return null;
      }
      const allocation =
        typeof operation.allocation === 'number' && Number.isFinite(operation.allocation)
          ? Math.max(0, Math.min(100, operation.allocation))
          : null;
      return {
        operationCd: candidate,
        allocation,
        notes: operation.notes ?? null,
      };
    };

    const dirtyRows = state.rows.filter(row => row.isDirty);

    if (dirtyRows.length === 0) {
      set({
        isSavingDistributions: false,
        saveError: null,
        saveSuccess: 'No distribution rows have been modified.',
        lastSavedCount: 0,
      });
      return 0;
    }

    const payloadRows: DistributionSaveRowInput[] = dirtyRows.map(row => ({
      scoaAccountId: row.accountId,
      distributionType: row.type,
      presetGuid: row.presetId ?? null,
      presetDescription: row.description ?? row.accountId,
      distributionStatus: row.status,
      operations: row.operations
        .map(buildOperationPayload)
        .filter((entry): entry is DistributionSaveOperation => Boolean(entry)),
      updatedBy,
    }));

    const requestBody = {
      entityId,
      changedRows: payloadRows,
      items: payloadRows,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/entityDistributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const message = await response
          .text()
          .catch(() => 'Unable to save distribution rows.');
        set({
          isSavingDistributions: false,
          saveError: message,
          saveSuccess: null,
          lastSavedCount: 0,
        });
        return 0;
      }

      const body = (await response.json()) as {
        items?: DistributionSaveResponseItem[];
      };
      const savedItems = body.items ?? [];
      const lookup = new Map<string, DistributionSaveResponseItem>();
      savedItems.forEach(item => {
        lookup.set(item.scoaAccountId, item);
      });

      const savedAccountIds = new Set(payloadRows.map(row => row.scoaAccountId));

      set(currentState => ({
        rows: currentState.rows.map(row => {
          if (!savedAccountIds.has(row.accountId)) {
            return row;
          }
          const match = lookup.get(row.accountId);
          if (!match) {
            return { ...row, isDirty: false };
          }
          return {
            ...row,
            presetId: match.presetGuid,
            status: match.distributionStatus,
            isDirty: false,
          };
        }),
        isSavingDistributions: false,
        saveError: null,
        saveSuccess:
          savedItems.length > 0
            ? `Saved ${savedItems.length} distribution row${savedItems.length === 1 ? '' : 's'}.`
            : 'No distribution rows were changed.',
        lastSavedCount: savedItems.length,
      }));

      return savedItems.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save distribution rows.';
      set({
        isSavingDistributions: false,
        saveError: message,
        saveSuccess: null,
        lastSavedCount: 0,
      });
      return 0;
    }
  },
}));
