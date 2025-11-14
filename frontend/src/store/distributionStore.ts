import { create } from 'zustand';
import type {
  DistributionRow,
  DistributionType,
  MappingStatus,
  StandardScoaSummary,
} from '../types';
import { getStandardScoaOption } from '../data/standardChartOfAccounts';

export interface DistributionOperationCatalogItem {
  id: string;
  name: string;
}

interface DistributionState {
  rows: DistributionRow[];
  operationsCatalog: DistributionOperationCatalogItem[];
  searchTerm: string;
  statusFilters: MappingStatus[];
  syncRowsFromStandardTargets: (summaries: StandardScoaSummary[]) => void;
  setSearchTerm: (term: string) => void;
  toggleStatusFilter: (status: MappingStatus) => void;
  clearStatusFilters: () => void;
  updateRow: (id: string, updates: Partial<DistributionRow>) => void;
  updateRowType: (id: string, type: DistributionType) => void;
  updateRowOperations: (id: string, operations: DistributionRow['operations']) => void;
  updateRowPreset: (id: string, presetId: string | null) => void;
  updateRowNotes: (id: string, notes: string) => void;
  updateRowStatus: (id: string, status: MappingStatus) => void;
}

const operationsCatalog: DistributionOperationCatalogItem[] = [
  { id: 'ops-log', name: 'Logistics' },
  { id: 'ops-otr', name: 'Over-the-Road' },
  { id: 'ops-ded', name: 'Dedicated' },
  { id: 'ops-ltl', name: 'Less-than-Truckload' },
  { id: 'ops-int', name: 'Intermodal' },
];

const FREIGHT_REVENUE_TARGET = getStandardScoaOption('FREIGHT REVENUE LINEHAUL - COMPANY FLEET');
const DRIVER_BENEFITS_TARGET = getStandardScoaOption(
  'DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET',
);
const NON_DRIVER_WAGES_TARGET = getStandardScoaOption('NON DRIVER WAGES & BENEFITS - TOTAL ASSET OPERATIONS');
const FUEL_EXPENSE_TARGET = getStandardScoaOption('FUEL EXPENSE - COMPANY FLEET');
const TRACTOR_MAINTENANCE_TARGET = getStandardScoaOption('MAINTENANCE EXPENSE - TRACTOR - COMPANY FLEET');

const DEFAULT_ROW_CONFIGS: Record<string, Partial<DistributionRow>> = {
  [FREIGHT_REVENUE_TARGET.id]: {
    type: 'direct',
    operations: [{ id: 'ops-log', name: 'Logistics' }],
    presetId: 'preset-1',
    notes: 'Approved during March close.',
    status: 'Mapped',
  },
  [DRIVER_BENEFITS_TARGET.id]: {
    type: 'percentage',
    operations: [
      { id: 'ops-ded', name: 'Dedicated', allocation: 60 },
      { id: 'ops-log', name: 'Logistics', allocation: 40 },
    ],
    presetId: 'preset-2',
    notes: 'Split based on headcount.',
    status: 'Mapped',
  },
  [NON_DRIVER_WAGES_TARGET.id]: {
    type: 'percentage',
    operations: [
      { id: 'ops-ded', name: 'Dedicated', allocation: 55 },
      { id: 'ops-log', name: 'Logistics', allocation: 45 },
    ],
    presetId: 'preset-2',
    notes: 'Pending confirmation of allocation weights.',
    status: 'Unmapped',
  },
  [FUEL_EXPENSE_TARGET.id]: {
    type: 'dynamic',
    operations: [
      { id: 'ops-log', name: 'Logistics' },
      { id: 'ops-otr', name: 'Over-the-Road' },
    ],
    presetId: 'preset-1',
    notes: 'Allocate fuel based on miles driven.',
    status: 'New',
  },
  [TRACTOR_MAINTENANCE_TARGET.id]: {
    type: 'direct',
    operations: [{ id: 'ops-ded', name: 'Dedicated' }],
    presetId: null,
    notes: 'Charged entirely to dedicated operations.',
    status: 'New',
  },
};

const clampOperationsForType = (
  type: DistributionType,
  operations: DistributionRow['operations'],
): DistributionRow['operations'] => {
  if (type === 'direct') {
    const [primary] = operations;
    return primary ? [{ id: primary.id, name: primary.name }] : [];
  }

  if (type === 'percentage') {
    return operations.map((operation, index) => ({
      ...operation,
      allocation: typeof operation.allocation === 'number' ? operation.allocation : index === 0 ? 100 : 0,
    }));
  }

  return operations.map(operation => ({ id: operation.id, name: operation.name, allocation: operation.allocation }));
};

export const useDistributionStore = create<DistributionState>((set, _get) => ({
  rows: [],
  operationsCatalog,
  searchTerm: '',
  statusFilters: [],
  syncRowsFromStandardTargets: summaries =>
    set(state => {
      const existingByTarget = new Map(
        state.rows.map(row => [row.mappingRowId, row] as const),
      );
      const nextRows: DistributionRow[] = summaries.map(summary => {
        const existing = existingByTarget.get(summary.id);
        const defaultConfig = DEFAULT_ROW_CONFIGS[summary.id];
        const nextOperations = existing
          ? existing.operations.map(operation => ({ ...operation }))
          : defaultConfig?.operations?.map(operation => ({ ...operation })) ?? [];
        const resolvedType = existing?.type ?? defaultConfig?.type ?? 'direct';
        return {
          id: existing?.id ?? summary.id,
          mappingRowId: summary.id,
          accountId: summary.value,
          description: summary.label,
          activity: summary.mappedAmount,
          type: resolvedType,
          operations: clampOperationsForType(resolvedType, nextOperations),
          presetId: existing?.presetId ?? defaultConfig?.presetId ?? null,
          notes: existing?.notes ?? defaultConfig?.notes,
          status:
            existing?.status ??
            defaultConfig?.status ??
            (summary.mappedAmount > 0 ? 'Mapped' : 'Unmapped'),
        };
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
      rows: state.rows.map(row => (row.id === id ? { ...row, ...updates } : row)),
    })),
  updateRowType: (id, type) =>
    set(state => ({
      rows: state.rows.map(row =>
        row.id === id
          ? {
              ...row,
              type,
              operations: clampOperationsForType(type, row.operations),
            }
          : row,
      ),
    })),
  updateRowOperations: (id, operations) =>
    set(state => ({
      rows: state.rows.map(row => (row.id === id ? { ...row, operations } : row)),
    })),
  updateRowPreset: (id, presetId) =>
    set(state => ({
      rows: state.rows.map(row => (row.id === id ? { ...row, presetId: presetId ?? undefined } : row)),
    })),
  updateRowNotes: (id, notes) =>
    set(state => ({
      rows: state.rows.map(row => (row.id === id ? { ...row, notes: notes || undefined } : row)),
    })),
  updateRowStatus: (id, status) =>
    set(state => ({
      rows: state.rows.map(row => (row.id === id ? { ...row, status } : row)),
    })),
}));
