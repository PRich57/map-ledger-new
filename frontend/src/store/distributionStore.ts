import { create } from 'zustand';
import type {
  DistributionOperationShare,
  DistributionRow,
  DistributionStatus,
  DistributionType,
  StandardScoaSummary,
} from '../types';

export interface DistributionOperationCatalogItem {
  id: string;
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

const clampOperationsForType = (
  type: DistributionType,
  operations: DistributionRow['operations'],
): DistributionRow['operations'] => {
  if (type === 'direct') {
    const [primary] = operations;
    return primary
      ? [{ id: primary.id, name: primary.name, notes: primary.notes }]
      : [];
  }

  if (type === 'percentage') {
    return operations.map((operation, index) => ({
      ...operation,
      allocation: typeof operation.allocation === 'number' ? operation.allocation : index === 0 ? 100 : 0,
    }));
  }

  return operations.map(operation => ({
    id: operation.id,
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
        });
      }),
    })),
  updateRowOperations: (id, operations) =>
    set(state => ({
      rows: state.rows.map(row =>
        row.id === id ? applyDistributionStatus({ ...row, operations }) : row,
      ),
    })),
  updateRowPreset: (id, presetId) =>
    set(state => ({
      rows: state.rows.map(row => (row.id === id ? { ...row, presetId: presetId ?? undefined } : row)),
    })),
  updateRowNotes: (id, notes) =>
    set(state => ({
      rows: state.rows.map(row => (row.id === id ? { ...row, notes: notes || undefined } : row)),
    })),
  setOperationsCatalog: operations =>
    set({
      operationsCatalog: operations.map(operation => ({ ...operation })),
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
          return applyDistributionStatus(nextRow);
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
          idSet.has(row.id) ? { ...row, presetId: presetId ?? null } : row,
        ),
      };
    });
  },
}));