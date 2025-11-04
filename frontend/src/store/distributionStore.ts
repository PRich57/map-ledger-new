import { create } from 'zustand';
import type { DistributionRow, DistributionType, MappingStatus } from '../types';
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

const seedRows: DistributionRow[] = [
  {
    id: 'dist-1',
    mappingRowId: FREIGHT_REVENUE_TARGET.id,
    accountId: FREIGHT_REVENUE_TARGET.value,
    description: FREIGHT_REVENUE_TARGET.label,
    activity: 500000,
    type: 'direct',
    operations: [{ id: 'ops-log', name: 'Logistics' }],
    presetId: 'preset-1',
    notes: 'Approved during March close.',
    status: 'Mapped',
  },
  {
    id: 'dist-2',
    mappingRowId: DRIVER_BENEFITS_TARGET.id,
    accountId: DRIVER_BENEFITS_TARGET.value,
    description: DRIVER_BENEFITS_TARGET.label,
    activity: 72000,
    type: 'percentage',
    operations: [
      { id: 'ops-ded', name: 'Dedicated', allocation: 60 },
      { id: 'ops-log', name: 'Logistics', allocation: 40 },
    ],
    presetId: 'preset-2',
    notes: 'Split based on headcount.',
    status: 'Mapped',
  },
  {
    id: 'dist-3',
    mappingRowId: NON_DRIVER_WAGES_TARGET.id,
    accountId: NON_DRIVER_WAGES_TARGET.value,
    description: NON_DRIVER_WAGES_TARGET.label,
    activity: 48000,
    type: 'percentage',
    operations: [
      { id: 'ops-ded', name: 'Dedicated', allocation: 55 },
      { id: 'ops-log', name: 'Logistics', allocation: 45 },
    ],
    presetId: 'preset-2',
    notes: 'Pending confirmation of allocation weights.',
    status: 'Unmapped',
  },
  {
    id: 'dist-4',
    mappingRowId: FUEL_EXPENSE_TARGET.id,
    accountId: FUEL_EXPENSE_TARGET.value,
    description: FUEL_EXPENSE_TARGET.label,
    activity: 45000,
    type: 'dynamic',
    operations: [
      { id: 'ops-log', name: 'Logistics' },
      { id: 'ops-otr', name: 'Over-the-Road' },
    ],
    presetId: 'preset-1',
    notes: 'Allocate fuel based on miles driven.',
    status: 'New',
  },
  {
    id: 'dist-5',
    mappingRowId: TRACTOR_MAINTENANCE_TARGET.id,
    accountId: TRACTOR_MAINTENANCE_TARGET.value,
    description: TRACTOR_MAINTENANCE_TARGET.label,
    activity: 20000,
    type: 'direct',
    operations: [{ id: 'ops-ded', name: 'Dedicated' }],
    presetId: null,
    notes: 'Charged entirely to dedicated operations.',
    status: 'New',
  },
];

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

export const useDistributionStore = create<DistributionState>((set, get) => ({
  rows: seedRows,
  operationsCatalog,
  searchTerm: '',
  statusFilters: [],
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
