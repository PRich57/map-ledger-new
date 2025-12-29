import { create } from 'zustand';
import {
  createIndustry,
  fetchIndustries,
  fetchIndustryCoaManager,
  updateIndustryCostType,
  updateIndustryCostTypeBatch,
  type CoaManagerColumn,
  type CoaManagerCostType,
  type CoaManagerRow,
  IndustryAlreadyExistsError,
} from '../services/coaManagerService';

export type RowUpdateStatus = {
  state: 'idle' | 'pending' | 'success' | 'error';
  message?: string;
};

interface CoaManagerState {
  industries: string[];
  industriesLoading: boolean;
  industriesError: string | null;
  selectedIndustry: string;
  columns: CoaManagerColumn[];
  rows: CoaManagerRow[];
  rowsLoading: boolean;
  rowsError: string | null;
  selectedRowIds: Set<string>;
  rowUpdateStatus: Record<string, RowUpdateStatus>;
  createIndustryError: string | null;
  createIndustryLoading: boolean;
  loadIndustries: () => Promise<void>;
  selectIndustry: (industry: string) => Promise<void>;
  refreshIndustryData: () => Promise<void>;
  createIndustry: (name: string) => Promise<boolean>;
  clearCreateIndustryError: () => void;
  toggleRowSelection: (rowId: string) => void;
  toggleSelectAll: () => void;
  clearRowSelection: () => void;
  updateRowCostType: (rowId: string, costType: CoaManagerCostType) => Promise<void>;
  updateBatchCostType: (rowIds: string[], costType: CoaManagerCostType) => Promise<void>;
}

const STATUS_RESET_MS = 2500;

const applyStatusReset = (
  set: (partial: Partial<CoaManagerState> | ((state: CoaManagerState) => Partial<CoaManagerState>)) =>
    void,
  rowIds: string[],
) => {
  window.setTimeout(() => {
    set(state => {
      const next = { ...state.rowUpdateStatus };
      rowIds.forEach(rowId => {
        if (next[rowId]?.state === 'success') {
          next[rowId] = { state: 'idle' };
        }
      });
      return { rowUpdateStatus: next };
    });
  }, STATUS_RESET_MS);
};

export const useCoaManagerStore = create<CoaManagerState>((set, get) => ({
  industries: [],
  industriesLoading: false,
  industriesError: null,
  selectedIndustry: '',
  columns: [],
  rows: [],
  rowsLoading: false,
  rowsError: null,
  selectedRowIds: new Set(),
  rowUpdateStatus: {},
  createIndustryError: null,
  createIndustryLoading: false,
  loadIndustries: async () => {
    set({ industriesLoading: true, industriesError: null });
    try {
      const industries = await fetchIndustries();
      set(state => ({
        industries,
        industriesLoading: false,
        industriesError: null,
        selectedIndustry: industries.includes(state.selectedIndustry)
          ? state.selectedIndustry
          : '',
        rows: industries.includes(state.selectedIndustry) ? state.rows : [],
        columns: industries.includes(state.selectedIndustry) ? state.columns : [],
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load industries.';
      set({ industriesLoading: false, industriesError: message });
    }
  },
  selectIndustry: async (industry: string) => {
    set({
      selectedIndustry: industry,
      rows: [],
      columns: [],
      rowsError: null,
      rowUpdateStatus: {},
      selectedRowIds: new Set(),
    });

    if (!industry) {
      return;
    }

    await get().refreshIndustryData();
  },
  refreshIndustryData: async () => {
    const industry = get().selectedIndustry;
    if (!industry) {
      return;
    }

    set({ rowsLoading: true, rowsError: null });
    try {
      const response = await fetchIndustryCoaManager(industry);
      set({
        columns: response.columns,
        rows: response.rows,
        rowsLoading: false,
        rowUpdateStatus: {},
        selectedRowIds: new Set(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load COA table.';
      set({ rowsLoading: false, rowsError: message });
    }
  },
  createIndustry: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      set({ createIndustryError: 'Industry name is required.' });
      return false;
    }

    set({ createIndustryLoading: true, createIndustryError: null });
    try {
      const created = await createIndustry(trimmed);
      set(state => ({
        industries: state.industries.includes(created)
          ? state.industries
          : [...state.industries, created],
        createIndustryLoading: false,
        createIndustryError: null,
      }));
      await get().selectIndustry(created);
      return true;
    } catch (error) {
      const message =
        error instanceof IndustryAlreadyExistsError
          ? 'That industry already exists.'
          : error instanceof Error
            ? error.message
            : 'Unable to create industry.';
      set({ createIndustryLoading: false, createIndustryError: message });
      return false;
    }
  },
  clearCreateIndustryError: () => set({ createIndustryError: null }),
  toggleRowSelection: (rowId: string) => {
    set(state => {
      const next = new Set(state.selectedRowIds);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return { selectedRowIds: next };
    });
  },
  toggleSelectAll: () => {
    set(state => {
      if (state.rows.length === 0) {
        return { selectedRowIds: state.selectedRowIds };
      }
      const isAllSelected = state.selectedRowIds.size === state.rows.length;
      return {
        selectedRowIds: isAllSelected ? new Set() : new Set(state.rows.map(row => row.id)),
      };
    });
  },
  clearRowSelection: () => set({ selectedRowIds: new Set() }),
  updateRowCostType: async (rowId: string, costType: CoaManagerCostType) => {
    const { selectedIndustry, rows } = get();
    if (!selectedIndustry) {
      return;
    }

    const previousCostTypes = new Map<string, CoaManagerCostType>();
    const nextRows = rows.map(row => {
      if (row.id !== rowId) {
        return row;
      }
      previousCostTypes.set(row.id, row.costType);
      return { ...row, costType };
    });

    set(state => ({
      rows: nextRows,
      rowUpdateStatus: {
        ...state.rowUpdateStatus,
        [rowId]: { state: 'pending' },
      },
    }));

    try {
      await updateIndustryCostType(selectedIndustry, rowId, costType);
      set(state => ({
        rowUpdateStatus: {
          ...state.rowUpdateStatus,
          [rowId]: { state: 'success' },
        },
      }));
      applyStatusReset(set, [rowId]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed.';
      set(state => ({
        rows: state.rows.map(row =>
          previousCostTypes.has(row.id)
            ? { ...row, costType: previousCostTypes.get(row.id) ?? row.costType }
            : row,
        ),
        rowUpdateStatus: {
          ...state.rowUpdateStatus,
          [rowId]: { state: 'error', message },
        },
      }));
    }
  },
  updateBatchCostType: async (rowIds: string[], costType: CoaManagerCostType) => {
    const { selectedIndustry, rows } = get();
    if (!selectedIndustry || rowIds.length === 0) {
      return;
    }

    const rowIdSet = new Set(rowIds);
    const previousCostTypes = new Map<string, CoaManagerCostType>();
    const nextRows = rows.map(row => {
      if (!rowIdSet.has(row.id)) {
        return row;
      }
      previousCostTypes.set(row.id, row.costType);
      return { ...row, costType };
    });

    set(state => {
      const nextStatus = { ...state.rowUpdateStatus };
      rowIds.forEach(id => {
        nextStatus[id] = { state: 'pending' };
      });
      return { rows: nextRows, rowUpdateStatus: nextStatus };
    });

    try {
      await updateIndustryCostTypeBatch(selectedIndustry, rowIds, costType);
      set(state => {
        const nextStatus = { ...state.rowUpdateStatus };
        rowIds.forEach(id => {
          nextStatus[id] = { state: 'success' };
        });
        return { rowUpdateStatus: nextStatus };
      });
      applyStatusReset(set, rowIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Batch update failed.';
      set(state => {
        const nextStatus = { ...state.rowUpdateStatus };
        rowIds.forEach(id => {
          nextStatus[id] = { state: 'error', message };
        });
        return {
          rows: state.rows.map(row =>
            previousCostTypes.has(row.id)
              ? { ...row, costType: previousCostTypes.get(row.id) ?? row.costType }
              : row,
          ),
          rowUpdateStatus: nextStatus,
        };
      });
    }
  },
}));
