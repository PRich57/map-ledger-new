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
import { selectAccounts, useMappingStore } from './mappingStore';
import { buildDistributionActivityEntries } from '../utils/distributionActivity';
import { persistDistributionActivity } from '../services/distributionActivityService';
import { normalizeDistributionStatus } from '../utils/distributionStatus';
import {
  fetchDistributionHistory,
  type DistributionHistorySuggestion,
} from '../services/distributionSuggestionService';
import { useRatioAllocationStore } from './ratioAllocationStore';

const env = import.meta.env;
const API_BASE_URL = env.VITE_API_BASE_URL ?? '/api';
const AUTO_SAVE_DEBOUNCE_MS = 1200;
const AUTO_SAVE_BACKOFF_MS = 2500;

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
  currentEntityId: string | null;
  currentUpdatedBy: string | null;
  historyByAccount: Record<string, DistributionHistorySuggestion>;
  historyEntityId: string | null;
  isAutoSaving: boolean;
  autoSaveMessage: string | null;
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
  queueAutoSave: (ids: string[], options?: { immediate?: boolean }) => void;
  flushAutoSaveQueue: (options?: { immediate?: boolean }) => Promise<void>;
  setSaveContext: (entityId: string | null, updatedBy: string | null) => void;
  loadHistoryForEntity: (entityId: string | null) => Promise<void>;
  saveDistributions: (
    entityId: string | null,
    updatedBy: string | null,
  ) => Promise<number>;
}

const isEffectivelyZero = (value: number, tolerance = 0.0001): boolean =>
  Math.abs(value) <= tolerance;

const deriveDistributionStatus = (
  type: DistributionType,
  operations: DistributionRow['operations'],
  activity: number,
): DistributionStatus => {
  if (isEffectivelyZero(activity)) {
    return 'Distributed';
  }

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
  status: deriveDistributionStatus(row.type, row.operations, row.activity),
});

export type DistributionProgress = {
  totalRows: number;
  distributedRows: number;
  isComplete: boolean;
};

export const selectDistributionProgress = (state: DistributionState): DistributionProgress => {
  const totalRows = state.rows.length;
  const distributedRows = state.rows.filter(
    row => deriveDistributionStatus(row.type, row.operations, row.activity) === 'Distributed',
  ).length;

  return {
    totalRows,
    distributedRows,
    isComplete: totalRows > 0 && distributedRows === totalRows,
  };
};

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
    basisDatapoint: operation.basisDatapoint,
  }));
};

const cloneOperations = (
  operations: DistributionOperationShare[],
): DistributionOperationShare[] =>
  operations.map(operation => ({
    id: operation.id,
    code: operation.code,
    name: operation.name,
    allocation:
      typeof operation.allocation === 'number' && Number.isFinite(operation.allocation)
        ? operation.allocation
        : undefined,
    notes: operation.notes,
    basisDatapoint: operation.basisDatapoint,
  }));

const applyHistorySuggestions = (
  rows: DistributionRow[],
  history: Record<string, DistributionHistorySuggestion>,
): DistributionRow[] => {
  if (!history || Object.keys(history).length === 0) {
    return rows;
  }
  const ratioState = useRatioAllocationStore.getState();
  return rows.map(row => {
    const suggestion = history[row.accountId];
    if (!suggestion || row.isDirty) {
      return row;
    }
    const preparedOperations = clampOperationsForType(
      suggestion.type,
      cloneOperations(suggestion.operations),
    );
    if (suggestion.type === 'dynamic') {
      ratioState.syncSourceAccountBalance(
        row.accountId,
        row.activity,
        ratioState.selectedPeriod ?? null,
      );
      ratioState.setActivePresetForSource(row.accountId, suggestion.presetId ?? null);
    }
    return applyDistributionStatus({
      ...row,
      type: suggestion.type,
      operations: preparedOperations,
      presetId: suggestion.presetId ?? null,
      status: suggestion.status,
      isDirty: false,
      autoSaveState: 'saved',
      autoSaveError: null,
    });
  });
};

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
  const basisDatapoint = operation.basisDatapoint?.toString().trim();
  return {
    operationCd: candidate,
    allocation,
    notes: operation.notes ?? null,
    basisDatapoint: basisDatapoint && basisDatapoint.length > 0 ? basisDatapoint : null,
  };
};

const buildDistributionPayloadRows = (
  rows: DistributionRow[],
  updatedBy: string | null,
): DistributionSaveRowInput[] =>
  rows.map(row => ({
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

const applySaveResults = (
  rows: DistributionRow[],
  payloadRows: DistributionSaveRowInput[],
  savedItems: DistributionSaveResponseItem[],
  autoSaveState: DistributionRow['autoSaveState'] = 'saved',
): DistributionRow[] => {
  const lookup = new Map<string, DistributionSaveResponseItem>();
  savedItems.forEach(item => {
    lookup.set(item.scoaAccountId, item);
  });

  const savedAccountIds = new Set(payloadRows.map(row => row.scoaAccountId));

  return rows.map(row => {
    if (!savedAccountIds.has(row.accountId)) {
      return row;
    }
    const match = lookup.get(row.accountId);
    return {
      ...row,
      presetId: match?.presetGuid ?? row.presetId,
      status: normalizeDistributionStatus(match?.distributionStatus ?? row.status),
      isDirty: false,
      autoSaveState,
      autoSaveError: null,
    };
  });
};

const postDistributionRows = async (
  entityId: string,
  payloadRows: DistributionSaveRowInput[],
): Promise<DistributionSaveResponseItem[]> => {
  const requestBody = {
    entityId,
    changedRows: payloadRows,
    items: payloadRows,
  };

  const response = await fetch(`${API_BASE_URL}/entityDistributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Unable to save distribution rows.');
    throw new Error(message || 'Unable to save distribution rows.');
  }

  const body = (await response.json()) as { items?: DistributionSaveResponseItem[] };
  return body.items ?? [];
};

const autoSaveQueue = new Set<string>();
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
let isAutoSaveRunning = false;

export const useDistributionStore = create<DistributionState>((set, _get) => {
  const queueRowsForAutoSave = (ids: string[], options?: { immediate?: boolean }) => {
    const normalizedIds = ids.filter(Boolean);
    if (!normalizedIds.length) {
      return;
    }
    normalizedIds.forEach(id => autoSaveQueue.add(id));
    set(state => ({
      rows: state.rows.map(row =>
        autoSaveQueue.has(row.id)
          ? {
              ...row,
              autoSaveState: row.autoSaveState === 'saving' ? row.autoSaveState : 'queued',
              autoSaveError: null,
            }
          : row,
      ),
      autoSaveMessage: null,
    }));

    scheduleAutoSave(options?.immediate ?? false);
  };

  const runAutoSave = async () => {
    if (isAutoSaveRunning) {
      scheduleAutoSave();
      return;
    }

    const state = _get();
    const { currentEntityId, currentUpdatedBy } = state;
    const queuedRows = state.rows.filter(row => row.isDirty && autoSaveQueue.has(row.id));

    if (queuedRows.length === 0) {
      set({ isAutoSaving: false, autoSaveMessage: null });
      return;
    }

    if (!currentEntityId) {
      autoSaveDelay = AUTO_SAVE_BACKOFF_MS;
      set(currentState => ({
        rows: currentState.rows.map(row =>
          autoSaveQueue.has(row.id)
            ? {
                ...row,
                autoSaveState: 'error',
                autoSaveError: 'Select an entity before auto-saving distributions.',
              }
            : row,
        ),
        isAutoSaving: false,
        autoSaveMessage: 'Auto-save paused until an entity is selected.',
      }));
      scheduleAutoSave();
      return;
    }

    isAutoSaveRunning = true;
    autoSaveTimer = null;
    set(currentState => ({
      rows: currentState.rows.map(row =>
        autoSaveQueue.has(row.id) && row.isDirty
          ? { ...row, autoSaveState: 'saving', autoSaveError: null }
          : row,
      ),
      isAutoSaving: true,
      autoSaveMessage: null,
    }));

    try {
      const payloadRows = buildDistributionPayloadRows(queuedRows, currentUpdatedBy ?? null);
      const savedItems = await postDistributionRows(currentEntityId, payloadRows);
      queuedRows.forEach(row => autoSaveQueue.delete(row.id));
      autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;

      set(currentState => ({
        rows: applySaveResults(currentState.rows, payloadRows, savedItems, 'saved'),
        isAutoSaving: false,
        autoSaveMessage:
          savedItems.length > 0
            ? `Auto-saved ${savedItems.length} row${savedItems.length === 1 ? '' : 's'}.`
            : 'No distribution rows were changed.',
      }));
      try {
        await persistActivityForRows(queuedRows, currentEntityId, currentUpdatedBy ?? null);
      } catch (activityError) {
        const message =
          activityError instanceof Error
            ? activityError.message
            : 'Failed to persist distribution activity.';
        console.error('Failed to persist distribution activity', activityError);
        set({ autoSaveMessage: message });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to auto-save distribution rows.';
      autoSaveDelay = AUTO_SAVE_BACKOFF_MS;
      set(currentState => ({
        rows: currentState.rows.map(row =>
          autoSaveQueue.has(row.id) && row.isDirty
            ? { ...row, autoSaveState: 'error', autoSaveError: message }
            : row,
        ),
        isAutoSaving: false,
        autoSaveMessage: message,
      }));
    } finally {
      isAutoSaveRunning = false;
      if (autoSaveQueue.size > 0) {
        scheduleAutoSave();
      }
    }
  };

function scheduleAutoSave(immediate = false) {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    void runAutoSave();
  }, immediate ? 0 : autoSaveDelay);
}

const persistActivityForRows = async (
  rows: DistributionRow[],
  entityId: string | null,
  updatedBy: string | null,
) => {
  if (!entityId || rows.length === 0) {
    return;
  }
  const accounts = selectAccounts(useMappingStore.getState());
  if (!accounts.length) {
    return;
  }
  const entries = buildDistributionActivityEntries(rows, accounts);
  if (!entries.length) {
    return;
  }
  await persistDistributionActivity(entityId, entries, updatedBy);
};

  return {
    rows: [],
    operationsCatalog: [],
    searchTerm: '',
    statusFilters: [],
    currentEntityId: null,
    currentUpdatedBy: null,
    historyByAccount: {},
    historyEntityId: null,
    isAutoSaving: false,
    autoSaveMessage: null,
    isSavingDistributions: false,
    saveError: null,
    saveSuccess: null,
    lastSavedCount: 0,
    syncRowsFromStandardTargets: summaries =>
      set(state => {
        const uniqueSummaries = summaries.reduce<StandardScoaSummary[]>((acc, summary) => {
          if (acc.some(item => item.id === summary.id)) {
            return acc;
          }
          acc.push(summary);
          return acc;
        }, []);

        const existingByTarget = new Map(
          state.rows.map(row => [row.mappingRowId, row] as const),
        );
        const nextRows: DistributionRow[] = uniqueSummaries.map(summary => {
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
            status: normalizeDistributionStatus(existing?.status ?? 'Undistributed'),
            isDirty: existing?.isDirty ?? false,
            autoSaveState: existing?.autoSaveState ?? 'idle',
            autoSaveError: existing?.autoSaveError ?? null,
          });
        });
        return { rows: applyHistorySuggestions(nextRows, state.historyByAccount) };
      }),
    setSearchTerm: term => set({ searchTerm: term }),
    toggleStatusFilter: status =>
      set(state => {
        const isAlreadyActive = state.statusFilters.length === 1 && state.statusFilters[0] === status;
        return { statusFilters: isAlreadyActive ? [] : [status] };
      }),
    clearStatusFilters: () => set({ statusFilters: [] }),
    updateRow: (id, updates) => {
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
            autoSaveState: 'queued',
            autoSaveError: null,
          };
          return applyDistributionStatus(nextRow);
        }),
      }));
      queueRowsForAutoSave([id]);
    },
    updateRowType: (id, type) => {
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
            autoSaveState: 'queued',
            autoSaveError: null,
          });
        }),
      }));
      queueRowsForAutoSave([id]);
    },
    updateRowOperations: (id, operations) => {
      set(state => ({
        rows: state.rows.map(row =>
          row.id === id
            ? applyDistributionStatus({
                ...row,
                operations,
                isDirty: true,
                autoSaveState: 'queued',
                autoSaveError: null,
              })
            : row,
        ),
      }));
      queueRowsForAutoSave([id]);
    },
    updateRowPreset: (id, presetId) => {
      set(state => ({
        rows: state.rows.map(row =>
          row.id === id
            ? {
                ...row,
                presetId: presetId ?? undefined,
                isDirty: true,
                autoSaveState: 'queued',
                autoSaveError: null,
              }
            : row,
        ),
      }));
      queueRowsForAutoSave([id]);
    },
    updateRowNotes: (id, notes) => {
      set(state => ({
        rows: state.rows.map(row =>
          row.id === id
            ? {
                ...row,
                notes: notes || undefined,
                isDirty: true,
                autoSaveState: 'queued',
                autoSaveError: null,
              }
            : row,
        ),
      }));
      queueRowsForAutoSave([id]);
    },
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
            return applyDistributionStatus({
              ...nextRow,
              isDirty: true,
              autoSaveState: 'queued',
              autoSaveError: null,
            });
          }),
        };
      });
      queueRowsForAutoSave(ids);
    },
    applyPresetToRows: (ids, presetId) => {
      if (!ids.length) {
        return;
      }
      set(state => {
        const idSet = new Set(ids);
        return {
          rows: state.rows.map(row =>
            idSet.has(row.id)
              ? {
                  ...row,
                  presetId: presetId ?? null,
                  isDirty: true,
                  autoSaveState: 'queued',
                  autoSaveError: null,
                }
              : row,
          ),
        };
      });
      queueRowsForAutoSave(ids);
    },
    queueAutoSave: (ids, options) => queueRowsForAutoSave(ids, options),
    flushAutoSaveQueue: async options => {
      if (options?.immediate) {
        autoSaveDelay = 0;
      }
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      if (autoSaveQueue.size === 0) {
        autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
        return;
      }
      await runAutoSave();
      autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
    },
    setSaveContext: (entityId, updatedBy) => {
      set({ currentEntityId: entityId, currentUpdatedBy: updatedBy });
      if (entityId && autoSaveQueue.size > 0) {
        scheduleAutoSave(true);
      }
    },
    loadHistoryForEntity: async entityId => {
      const normalized = entityId?.trim() ?? null;
      if (!normalized) {
        set({ historyByAccount: {}, historyEntityId: null });
        return;
      }

      const currentState = _get();
      if (
        currentState.historyEntityId === normalized &&
        Object.keys(currentState.historyByAccount).length > 0
      ) {
        return;
      }

      try {
        const suggestions = await fetchDistributionHistory(normalized);
        const lookup: Record<string, DistributionHistorySuggestion> = {};
        suggestions.forEach(suggestion => {
          lookup[suggestion.accountId] = suggestion;
        });
        set(state => ({
          historyByAccount: lookup,
          historyEntityId: normalized,
          rows: applyHistorySuggestions(state.rows, lookup),
        }));
      } catch (error) {
        console.error('Unable to load distribution history', error);
        set({ historyByAccount: {}, historyEntityId: normalized });
      }
    },
    saveDistributions: async (entityId, updatedBy) => {
      const state = _get();

      const resolvedEntityId = entityId ?? state.currentEntityId;
      const resolvedUpdatedBy = updatedBy ?? state.currentUpdatedBy;

      if (!resolvedEntityId) {
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

      const payloadRows = buildDistributionPayloadRows(dirtyRows, resolvedUpdatedBy ?? null);

      try {
        const savedItems = await postDistributionRows(resolvedEntityId, payloadRows);
        dirtyRows.forEach(row => autoSaveQueue.delete(row.id));
        set(currentState => ({
          rows: applySaveResults(currentState.rows, payloadRows, savedItems, 'saved'),
          isSavingDistributions: false,
          saveError: null,
          saveSuccess:
            savedItems.length > 0
              ? `Saved ${savedItems.length} distribution row${savedItems.length === 1 ? '' : 's'}.`
              : 'No distribution rows were changed.',
          lastSavedCount: savedItems.length,
        }));
        try {
          await persistActivityForRows(dirtyRows, resolvedEntityId, resolvedUpdatedBy ?? null);
        } catch (activityError) {
          const message =
            activityError instanceof Error
              ? activityError.message
              : 'Failed to persist distribution activity.';
          console.error('Failed to persist distribution activity', activityError);
          set({ autoSaveMessage: message });
        }

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
  };
});
