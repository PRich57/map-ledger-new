import { create } from 'zustand';
import {
  AllocationResult,
  DynamicAllocationAuditRecord,
  DynamicAllocationGroup,
  DynamicAllocationGroupMember,
  DynamicAllocationPreset,
  DynamicAllocationPresetRow,
  DynamicAllocationPresetContext,
  DynamicAllocationValidationIssue,
  DynamicBasisAccount,
  DynamicSourceAccount,
  RatioAllocation,
  RatioAllocationTargetDatapoint,
} from '../types';
import {
  findChartOfAccountOption,
  getChartOfAccountOptions,
} from './chartOfAccountsStore';
import {
  allocateDynamicWithPresets,
  getBasisValue,
  GroupMemberValue,
  getSourceValue,
  PresetBasisRow,
} from '../utils/dynamicAllocation';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};



type DynamicAllocationMutation = {
  accountId: string;
  accountIds?: string[];
  timestamp: number;
};

type MutationOptions = {
  suppressMutation?: boolean;
};

const getTargetNameById = (targetId: string): string => {
  const option = findChartOfAccountOption(targetId);
  return option?.label ?? targetId;
};

export const resolveTargetAccountId = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const match = findChartOfAccountOption(normalized);
  return match?.id ?? normalized;
};

const resolveCanonicalTargetId = (value?: string | null): string | null => {
  const resolved = resolveTargetAccountId(value);
  return resolved && resolved.trim().length > 0 ? resolved : null;
};

export const resolvePresetRowCanonicalTargetIds = (
  row: DynamicAllocationPresetRow,
  basisAccounts: DynamicBasisAccount[],
): string[] => {
  const canonicalIds: string[] = [];
  if (row.dynamicAccountId) {
    const basisAccount = basisAccounts.find(account => account.id === row.dynamicAccountId);
    const basisTargetId = resolveCanonicalTargetId(basisAccount?.mappedTargetId);
    if (basisTargetId) {
      canonicalIds.push(basisTargetId);
    }
  }
  const rowTargetId = resolveCanonicalTargetId(row.targetAccountId);
  if (rowTargetId) {
    canonicalIds.push(rowTargetId);
  }
  return canonicalIds;
};

const buildGroupMembers = (
  preset: DynamicAllocationPreset,
  basisAccounts: DynamicBasisAccount[],
  periodId?: string | null,
): DynamicAllocationGroupMember[] =>
  preset.rows.map(row => {
    const basisAccount = basisAccounts.find(account => account.id === row.dynamicAccountId);
    const basisValue = basisAccount ? getBasisValue(basisAccount, periodId) : 0;
    return {
      accountId: row.dynamicAccountId,
      accountName: basisAccount?.name ?? row.dynamicAccountId,
      basisValue,
      targetAccountId: row.targetAccountId,
      targetName: getTargetNameById(row.targetAccountId),
    };
  });

const deriveGroups = (
  presets: DynamicAllocationPreset[],
  basisAccounts: DynamicBasisAccount[],
  periodId?: string | null,
): DynamicAllocationGroup[] =>
  presets.map(preset => ({
    ...preset,
    members: buildGroupMembers(preset, basisAccounts, periodId),
  }));

const normalizeAccountId = (value?: string | null): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeSourceAccountId = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildDynamicMutation = (
  accountIds: string[],
  previous?: DynamicAllocationMutation | null,
): DynamicAllocationMutation | null => {
  const normalized = Array.from(
    new Set(accountIds.map(id => normalizeAccountId(id)).filter(Boolean)),
  );
  if (!normalized.length) {
    return null;
  }
  const now = Date.now();
  const timestamp =
    previous && previous.timestamp >= now ? previous.timestamp + 1 : now;
  return { accountId: normalized[0], accountIds: normalized, timestamp };
};

const getPresetAllocationSourceIds = (
  allocations: RatioAllocation[],
  presetId: string,
): string[] =>
  allocations
    .filter(allocation =>
      allocation.targetDatapoints.some(target => target.groupId === presetId),
    )
    .map(allocation => allocation.sourceAccount.id);

const coerceFiniteNumber = (value?: number | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const upsertSourceAccountBalance = (
  accounts: DynamicSourceAccount[],
  sourceAccountId: string,
  value: number,
  periodId?: string | null,
): DynamicSourceAccount[] => {
  const normalizedId = normalizeSourceAccountId(sourceAccountId);
  if (!normalizedId) {
    return accounts;
  }

  const normalizedValue = coerceFiniteNumber(value);
  const periodKey =
    typeof periodId === 'string' && periodId.trim().length > 0 ? periodId.trim() : null;

  const existingIndex = accounts.findIndex(account => account.id === normalizedId);
  if (existingIndex === -1) {
    const nextAccount: DynamicSourceAccount = {
      id: normalizedId,
      name: normalizedId,
      number: normalizedId,
      description: normalizedId,
      value: normalizedValue,
      ...(periodKey ? { valuesByPeriod: { [periodKey]: normalizedValue } } : {}),
    };
    return [...accounts, nextAccount];
  }

  const existing = accounts[existingIndex];
  const existingPeriodValue = periodKey ? existing.valuesByPeriod?.[periodKey] : undefined;

  if (existing.value === normalizedValue && (!periodKey || existingPeriodValue === normalizedValue)) {
    return accounts;
  }

  const nextAccounts = [...accounts];
  nextAccounts[existingIndex] = {
    ...existing,
    value: normalizedValue,
    valuesByPeriod: periodKey
      ? { ...(existing.valuesByPeriod ?? {}), [periodKey]: normalizedValue }
      : existing.valuesByPeriod,
  };
  return nextAccounts;
};

const buildPresetTargetDatapoint = (
  preset: DynamicAllocationPreset,
  row: DynamicAllocationPresetRow,
  basisAccounts: DynamicBasisAccount[],
  periodId?: string | null,
  previous?: RatioAllocationTargetDatapoint,
): RatioAllocationTargetDatapoint => {
  const dynamicAccountId = normalizeAccountId(row.dynamicAccountId);
  const targetAccountId = normalizeAccountId(row.targetAccountId);
  const basisAccount = basisAccounts.find(account => account.id === dynamicAccountId) ?? null;
  const ratioValue = basisAccount ? getBasisValue(basisAccount, periodId) : 0;
  const ratioName = basisAccount?.name ?? (dynamicAccountId || `${preset.name} basis`);
  const datapointId = targetAccountId || `${preset.id}:${dynamicAccountId || createId()}`;
  return {
    datapointId,
    name: targetAccountId ? getTargetNameById(targetAccountId) : datapointId,
    groupId: preset.id,
    ratioMetric: {
      id: dynamicAccountId,
      name: ratioName,
      value: ratioValue,
    },
    isExclusion: previous?.isExclusion ?? false,
  };
};

const synchronizeAllocationTargets = (
  allocation: RatioAllocation,
  presets: DynamicAllocationPreset[],
  basisAccounts: DynamicBasisAccount[],
  periodId?: string | null,
): RatioAllocation => {
  const nextTargets: RatioAllocationTargetDatapoint[] = [];
  const handledPresets = new Set<string>();

  allocation.targetDatapoints.forEach(target => {
    if (!target.groupId) {
      nextTargets.push(target);
      return;
    }

    if (handledPresets.has(target.groupId)) {
      return;
    }

    handledPresets.add(target.groupId);

    const preset = presets.find(item => item.id === target.groupId);
    if (!preset) {
      return;
    }

    const previousTargets = allocation.targetDatapoints.filter(
      candidate => candidate.groupId === preset.id,
    );

    preset.rows.forEach(row => {
      const previous = previousTargets.find(
        candidate => normalizeAccountId(candidate.ratioMetric.id) === normalizeAccountId(row.dynamicAccountId),
      );
      nextTargets.push(
        buildPresetTargetDatapoint(preset, row, basisAccounts, periodId, previous),
      );
    });
  });

  return {
    ...allocation,
    targetDatapoints: nextTargets,
  };
};

const sanitizePresetRows = (
  rows: DynamicAllocationPresetRow[],
): DynamicAllocationPresetRow[] => {
  const basisIds = new Set<string>();
  const targetIds = new Set<string>();
  const sanitized: DynamicAllocationPresetRow[] = [];

  rows.forEach(row => {
    const dynamicAccountId = normalizeAccountId(row.dynamicAccountId);
    const targetAccountId = normalizeAccountId(row.targetAccountId);
    if (!dynamicAccountId || !targetAccountId) {
      return;
    }
    if (basisIds.has(dynamicAccountId)) {
      return;
    }
    if (targetIds.has(dynamicAccountId)) {
      return;
    }
    if (basisIds.has(targetAccountId)) {
      return;
    }
    basisIds.add(dynamicAccountId);
    targetIds.add(targetAccountId);
    sanitized.push({ dynamicAccountId, targetAccountId });
  });

  return sanitized;
};

export const DEFAULT_PRESET_CONTEXT: DynamicAllocationPresetContext = 'mapping';

const getPresetsByContext = (
  presets: DynamicAllocationPreset[],
  context: DynamicAllocationPresetContext,
): DynamicAllocationPreset[] => presets.filter(preset => preset.context === context);

const replacePresetsForContext = (
  existing: DynamicAllocationPreset[],
  context: DynamicAllocationPresetContext,
  replacements: DynamicAllocationPreset[],
): DynamicAllocationPreset[] => {
  const filtered = existing.filter(preset => preset.context !== context);
  const prepared = replacements.map(preset => ({
    ...preset,
    context,
  }));
  return [...filtered, ...prepared];
};

export type RatioAllocationHydrationPayload = {
  basisAccounts?: DynamicBasisAccount[];
  sourceAccounts?: DynamicSourceAccount[];
  presets?: DynamicAllocationPreset[];
  groups?: DynamicAllocationGroup[];
  allocations?: RatioAllocation[];
  availablePeriods?: string[];
  selectedPeriod?: string | null;
};

export type RatioPresetSummary = {
  id: string;
  name: string;
};

export type RatioAllocationState = {
  allocations: RatioAllocation[];
  basisAccounts: DynamicBasisAccount[];
  presets: DynamicAllocationPreset[];
  groups: DynamicAllocationGroup[];
  sourceAccounts: DynamicSourceAccount[];
  availablePeriods: string[];
  isProcessing: boolean;
  selectedPeriod: string | null;
  results: AllocationResult[];
  validationErrors: DynamicAllocationValidationIssue[];
  auditLog: DynamicAllocationAuditRecord[];
  lastDynamicMutation: DynamicAllocationMutation | null;
  hydrate: (payload: RatioAllocationHydrationPayload) => void;
  setContextPresets: (
    context: DynamicAllocationPresetContext,
    presets: DynamicAllocationPreset[],
  ) => void;
  setBasisAccounts: (basisAccounts: DynamicBasisAccount[]) => void;
  getOrCreateAllocation: (sourceAccountId: string) => RatioAllocation;
  addAllocation: (allocation: Omit<RatioAllocation, 'id'>) => void;
  updateAllocation: (
    id: string,
    allocation: Partial<RatioAllocation>,
    options?: MutationOptions,
  ) => void;
  deleteAllocation: (id: string) => void;
  setAvailablePeriods: (periods: string[]) => void;
  setSelectedPeriod: (period: string) => void;
  calculateAllocations: (periodId: string) => Promise<void>;
  syncSourceAccountBalance: (
    sourceAccountId: string,
    value: number,
    periodId?: string | null,
  ) => void;
  createPreset: (payload: {
    name: string;
    rows: DynamicAllocationPresetRow[];
    notes?: string;
    applyToAllocationId?: string | null;
    context?: DynamicAllocationPresetContext;
  }) => string;
  updatePreset: (
    presetId: string,
    updates: Partial<Omit<DynamicAllocationPreset, 'id' | 'rows'>>,
  ) => void;
  addPresetRow: (presetId: string, row: DynamicAllocationPresetRow, index?: number) => void;
  updatePresetRow: (
    presetId: string,
    rowIndex: number,
    updates: Partial<DynamicAllocationPresetRow>,
  ) => void;
  removePresetRow: (presetId: string, rowIndex: number) => void;
  getPresetAvailableDynamicAccounts: (
    presetId: string,
    excludeRowIndex?: number,
  ) => DynamicBasisAccount[];
  getPresetAvailableTargetAccounts: (
    presetId: string,
    excludeRowIndex?: number,
  ) => { id: string; label: string }[];
  toggleAllocationPresetTargets: (
    allocationId: string,
    presetId: string,
    options?: MutationOptions,
  ) => void;
  toggleTargetExclusion: (
    allocationId: string,
    datapointId: string,
    presetId?: string | null,
  ) => void;
  createGroup: (payload: {
    label: string;
    memberAccountIds: string[];
    targetId?: string | null;
  }) => void;
  getActivePresetForSource: (sourceAccountId: string) => DynamicAllocationPreset | null;
  setActivePresetForSource: (
    sourceAccountId: string,
    presetId: string | null,
    options?: MutationOptions,
  ) => void;
};

export const selectPresetSummaries = (
  state: RatioAllocationState,
): RatioPresetSummary[] =>
  getPresetsByContext(state.presets, DEFAULT_PRESET_CONTEXT).map(preset => ({
    id: preset.id,
    name: preset.name,
  }));

export const selectDistributionPresetSummaries = (
  state: RatioAllocationState,
): RatioPresetSummary[] =>
  getPresetsByContext(state.presets, 'distribution').map(preset => ({
    id: preset.id,
    name: preset.name,
  }));

export const selectPresetsByContext = (
  state: RatioAllocationState,
  context: DynamicAllocationPresetContext,
): DynamicAllocationPreset[] => getPresetsByContext(state.presets, context);

export const useRatioAllocationStore = create<RatioAllocationState>((set, get) => ({
  allocations: [],
  basisAccounts: [],
  presets: [],
  groups: [],
  sourceAccounts: [],
  availablePeriods: [],
  isProcessing: false,
  selectedPeriod: null,
  results: [],
  validationErrors: [],
  auditLog: [],
  lastDynamicMutation: null,

    hydrate: payload => {
      set(state => {
        const basisAccounts = payload.basisAccounts ?? state.basisAccounts;
        const presetSource =
          payload.presets ??
          (payload.groups
            ? payload.groups.map(group => ({
                id: group.id,
                name: group.name,
                rows: group.rows,
                notes: group.notes,
              }))
            : getPresetsByContext(state.presets, DEFAULT_PRESET_CONTEXT));
        const sanitizedPresets = presetSource.map(preset => ({
          ...preset,
          context: preset.context ?? DEFAULT_PRESET_CONTEXT,
          name: preset.name.trim(),
          notes: typeof preset.notes === 'string' ? preset.notes : preset.notes,
          rows: sanitizePresetRows(preset.rows),
        }));
        const combinedPresets = replacePresetsForContext(
          state.presets,
          DEFAULT_PRESET_CONTEXT,
          sanitizedPresets,
        );
        const mappingPresets = getPresetsByContext(combinedPresets, DEFAULT_PRESET_CONTEXT);
        const allocationsInput = payload.allocations ?? state.allocations;
        const availablePeriods = payload.availablePeriods ?? state.availablePeriods;
        const selectedPeriod =
          payload.selectedPeriod ?? state.selectedPeriod ?? availablePeriods[0] ?? null;
        const allocations = allocationsInput.map(allocation =>
          synchronizeAllocationTargets(allocation, mappingPresets, basisAccounts, selectedPeriod),
        );
        const groups = deriveGroups(mappingPresets, basisAccounts, selectedPeriod);

        return {
          allocations,
          basisAccounts,
          presets: combinedPresets,
          groups,
          sourceAccounts: payload.sourceAccounts ?? state.sourceAccounts,
          availablePeriods,
          selectedPeriod,
          lastDynamicMutation: null,
        };
      });
    },
    setContextPresets: (context, presets) => {
      set(state => ({
        presets: replacePresetsForContext(
          state.presets,
          context,
          presets.map(preset => ({
            ...preset,
            name: preset.name.trim(),
            notes: typeof preset.notes === 'string' ? preset.notes : preset.notes,
            rows: sanitizePresetRows(preset.rows),
          })),
        ),
      }));
    },

  setBasisAccounts: basisAccounts => {
    set(state => {
      const mappingPresets = getPresetsByContext(state.presets, DEFAULT_PRESET_CONTEXT);
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, mappingPresets, basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(mappingPresets, basisAccounts, state.selectedPeriod);
      return {
        basisAccounts,
        presets: state.presets,
        groups,
        allocations,
      };
    });
  },

  syncSourceAccountBalance: (sourceAccountId, value, periodId) => {
    const normalizedId = normalizeSourceAccountId(sourceAccountId);
    if (!normalizedId) {
      return;
    }
    const normalizedValue = coerceFiniteNumber(value);
    set(state => {
      const nextAccounts = upsertSourceAccountBalance(
        state.sourceAccounts,
        normalizedId,
        normalizedValue,
        periodId,
      );
      if (nextAccounts === state.sourceAccounts) {
        return {};
      }
      return { sourceAccounts: nextAccounts };
    });
  },

  getOrCreateAllocation: sourceAccountId => {
    const existing = get().allocations.find(allocation => allocation.sourceAccount.id === sourceAccountId);
    if (existing) {
      return existing;
    }
    const sourceAccount =
      get().sourceAccounts.find(account => account.id === sourceAccountId) ??
      (() => {
        const fallbackValue = 0;
        const fallback: DynamicSourceAccount = {
          id: sourceAccountId,
          name: sourceAccountId,
          number: sourceAccountId,
          description: sourceAccountId,
          value: fallbackValue,
        };
        set(state => ({
          sourceAccounts: upsertSourceAccountBalance(state.sourceAccounts, sourceAccountId, fallbackValue),
        }));
        return fallback;
      })();
    const allocation: RatioAllocation = {
      id: createId(),
      name: `${sourceAccount.name} allocation`,
      sourceAccount: {
        id: sourceAccount.id,
        number: sourceAccount.number,
        description: sourceAccount.description,
      },
      targetDatapoints: [],
      effectiveDate: new Date().toISOString(),
      status: 'active',
    };
    set(state => ({ allocations: [...state.allocations, allocation] }));
    return allocation;
  },

  addAllocation: allocation => {
    set(state => ({
      allocations: [
        ...state.allocations,
        synchronizeAllocationTargets(
          { ...allocation, id: createId() },
          state.presets,
          state.basisAccounts,
          state.selectedPeriod,
        ),
      ],
    }));
  },

  updateAllocation: (id, allocation, options) => {
    set(state => {
      let mutatedAccountId: string | null = null;
      const allocations = state.allocations.map(item => {
        if (item.id !== id) {
          return item;
        }
        mutatedAccountId = item.sourceAccount.id;
        const merged: RatioAllocation = {
          ...item,
          ...allocation,
        };
        if (allocation.targetDatapoints) {
          merged.targetDatapoints = allocation.targetDatapoints.map(target => {
            if (!target.groupId) {
              return target;
            }
            const preset = state.presets.find(presetItem => presetItem.id === target.groupId);
            if (!preset) {
              return target;
            }
            const row = preset.rows.find(
              rowItem =>
                normalizeAccountId(rowItem.dynamicAccountId) ===
                  normalizeAccountId(target.ratioMetric.id) ||
                normalizeAccountId(rowItem.targetAccountId) === normalizeAccountId(target.datapointId),
            );
            return row
              ? buildPresetTargetDatapoint(
                  preset,
                  row,
                  state.basisAccounts,
                  state.selectedPeriod,
                  target,
                )
              : target;
          });
        }
        return synchronizeAllocationTargets(
          merged,
          state.presets,
          state.basisAccounts,
          state.selectedPeriod,
        );
      });
      const mutation = options?.suppressMutation
        ? null
        : buildDynamicMutation(
            mutatedAccountId ? [mutatedAccountId] : [],
            state.lastDynamicMutation,
          );
      return {
        allocations,
        ...(mutation ? { lastDynamicMutation: mutation } : {}),
      };
    });
  },

  deleteAllocation: id => {
    set(state => {
      const removed = state.allocations.find(allocation => allocation.id === id);
      const allocations = state.allocations.filter(allocation => allocation.id !== id);
      const mutation = buildDynamicMutation(
        removed ? [removed.sourceAccount.id] : [],
        state.lastDynamicMutation,
      );
      return {
        allocations,
        ...(mutation ? { lastDynamicMutation: mutation } : {}),
      };
    });
  },

  setAvailablePeriods: periods => {
    set(state => {
      const normalized = Array.from(new Set(periods)).sort();
      const nextSelected = state.selectedPeriod && normalized.includes(state.selectedPeriod)
        ? state.selectedPeriod
        : normalized[0] ?? null;
      return {
        availablePeriods: normalized,
        selectedPeriod: nextSelected,
      };
    });
  },

    setSelectedPeriod: period => {
      set(state => ({
        selectedPeriod: period,
        allocations: state.allocations.map(allocation =>
          synchronizeAllocationTargets(
            allocation,
            getPresetsByContext(state.presets, DEFAULT_PRESET_CONTEXT),
            state.basisAccounts,
            period,
          ),
        ),
        groups: deriveGroups(
          getPresetsByContext(state.presets, DEFAULT_PRESET_CONTEXT),
          state.basisAccounts,
          period,
        ),
      }));
      get()
        .calculateAllocations(period)
      .catch(error => {
        console.error('Failed to calculate allocations', error);
      });
  },

  calculateAllocations: async periodId => {
    set({ isProcessing: true });
    try {
      const {
        allocations,
        presets,
        basisAccounts,
        sourceAccounts,
        results: existingResults,
        validationErrors: existingValidationErrors,
        auditLog: existingAuditLog,
      } = get();
      const mappingPresets = getPresetsByContext(presets, DEFAULT_PRESET_CONTEXT);

      const filteredResults = existingResults.filter(result => result.periodId !== periodId);
      const filteredValidationErrors = existingValidationErrors.filter(issue => issue.periodId !== periodId);

      const newResults: AllocationResult[] = [];
      const newValidationErrors: DynamicAllocationValidationIssue[] = [];
      const newAuditRecords: DynamicAllocationAuditRecord[] = [];
      const runTimestamp = new Date().toISOString();

      // Validate all presets before processing allocations
      mappingPresets.forEach(preset => {
        if (preset.rows.length === 0) {
          newValidationErrors.push({
            id: createId(),
            allocationId: '',
            periodId,
            sourceAccountId: '',
            sourceAccountName: '',
            message: `Preset "${preset.name}" has no rows configured.`,
          });
          return;
        }

        // Validate each preset row
        preset.rows.forEach((row, index) => {
          if (!row.dynamicAccountId || !row.targetAccountId) {
            newValidationErrors.push({
              id: createId(),
              allocationId: '',
              periodId,
              sourceAccountId: '',
              sourceAccountName: '',
              message: `Preset "${preset.name}" row ${index + 1} has incomplete dynamic or target account selection.`,
            });
          }
        });

        // Check if preset has any rows with zero basis
        const presetBasisValues = preset.rows.map(row => {
          const basisAccount = basisAccounts.find(acc => acc.id === row.dynamicAccountId);
          return basisAccount ? getBasisValue(basisAccount, periodId) : 0;
        });

        const presetTotal = presetBasisValues.reduce((sum, val) => sum + val, 0);
        if (presetTotal === 0) {
          newValidationErrors.push({
            id: createId(),
            allocationId: '',
            periodId,
            sourceAccountId: '',
            sourceAccountName: '',
            message: `Preset "${preset.name}" has a total basis of zero for period ${periodId}. All dynamic accounts have zero balances.`,
          });
        }
      });

      allocations.forEach(allocation => {
        const sourceAccount = sourceAccounts.find(account => account.id === allocation.sourceAccount.id);
        if (!sourceAccount) {
          newValidationErrors.push({
            id: createId(),
            allocationId: allocation.id,
            periodId,
            sourceAccountId: allocation.sourceAccount.id,
            sourceAccountName: allocation.sourceAccount.description,
            message: `Source account ${allocation.sourceAccount.id} is unavailable for allocation.`,
          });
          return;
        }

        if (allocation.targetDatapoints.length < 2) {
          newValidationErrors.push({
            id: createId(),
            allocationId: allocation.id,
            periodId,
            sourceAccountId: sourceAccount.id,
            sourceAccountName: sourceAccount.description,
            message: 'Dynamic allocations require at least two targets.',
          });
          return;
        }

        // Separate preset and non-preset targets
        const presetRowData: PresetBasisRow[] = [];
        const nonPresetTargets: Array<{
          target: RatioAllocationTargetDatapoint;
          basisValue: number;
          members: GroupMemberValue[];
        }> = [];
        const targetErrors: Array<{ message: string; targets?: string[] }> = [];

        // Process preset targets
        const presetTargetsMap = new Map<string, RatioAllocationTargetDatapoint[]>();
        allocation.targetDatapoints.forEach(target => {
          if (target.groupId) {
            const existing = presetTargetsMap.get(target.groupId) ?? [];
            existing.push(target);
            presetTargetsMap.set(target.groupId, existing);
          }
        });

        presetTargetsMap.forEach((_, presetId) => {
          const preset = mappingPresets.find(item => item.id === presetId);
          if (!preset) {
            targetErrors.push({
              message: `Dynamic allocation preset with ID ${presetId} is missing.`,
            });
            return;
          }

          // Validate preset has all required data
          preset.rows.forEach(row => {
            const basisAccount = basisAccounts.find(item => item.id === row.dynamicAccountId);
            if (!basisAccount) {
              targetErrors.push({
                message: `Basis account ${row.dynamicAccountId} is unavailable for preset ${preset.name}.`,
              });
              return;
            }

            const value = getBasisValue(basisAccount, periodId);
            if (value < 0) {
              targetErrors.push({
                message: `Basis value for ${basisAccount.name} in preset ${preset.name} must be non-negative.`,
                targets: [row.targetAccountId],
              });
            }

            presetRowData.push({
              dynamicAccountId: row.dynamicAccountId,
              targetAccountId: row.targetAccountId,
              basisValue: value,
              presetId: preset.id,
              presetName: preset.name,
            });
          });
        });

        // Process non-preset targets
        allocation.targetDatapoints.forEach(target => {
          if (target.groupId) {
            return; // Already handled above
          }

          const basisAccount = basisAccounts.find(item => item.id === target.ratioMetric.id);
          if (basisAccount) {
            const value = getBasisValue(basisAccount, periodId);
            if (value < 0) {
              targetErrors.push({
                message: `Basis value for ${target.name} must be non-negative.`,
                targets: [target.datapointId],
              });
            }
            nonPresetTargets.push({
              target,
              basisValue: value,
              members: [
                {
                  accountId: basisAccount.id,
                  accountName: basisAccount.name,
                  value,
                },
              ],
            });
            return;
          }

          const metricValue = typeof target.ratioMetric.value === 'number' ? target.ratioMetric.value : 0;
          if (!Number.isFinite(metricValue)) {
            targetErrors.push({
              message: `Basis datapoint ${target.ratioMetric.name} is missing a numeric value.`,
            });
            return;
          }

          nonPresetTargets.push({
            target,
            basisValue: metricValue,
            members: [
              {
                accountId: target.ratioMetric.id,
                accountName: target.ratioMetric.name,
                value: metricValue,
              },
            ],
          });
        });

        // Check for errors
        if (targetErrors.length > 0) {
          targetErrors.forEach(issue => {
            newValidationErrors.push({
              id: createId(),
              allocationId: allocation.id,
              periodId,
              sourceAccountId: sourceAccount.id,
              sourceAccountName: sourceAccount.description,
              message: issue.message,
              targetIds: issue.targets,
            });
          });
          return;
        }

        // Check for circular dependencies
        const circularPresetRows = presetRowData.filter(row =>
          row.dynamicAccountId === sourceAccount.id,
        );
        const circularNonPresetTargets = nonPresetTargets.filter(item =>
          item.members.some(member => member.accountId === sourceAccount.id),
        );

        if (circularPresetRows.length > 0 || circularNonPresetTargets.length > 0) {
          const circularTargetIds = [
            ...circularPresetRows.map(row => row.targetAccountId),
            ...circularNonPresetTargets.map(item => item.target.datapointId),
          ];
          newValidationErrors.push({
            id: createId(),
            allocationId: allocation.id,
            periodId,
            sourceAccountId: sourceAccount.id,
            sourceAccountName: sourceAccount.description,
            message: `Basis datapoints reference source account ${sourceAccount.number}. Remove the circular dependency.`,
            targetIds: circularTargetIds,
          });
          return;
        }

        const totalTargets = presetRowData.length + nonPresetTargets.length;
        if (totalTargets === 0) {
          newValidationErrors.push({
            id: createId(),
            allocationId: allocation.id,
            periodId,
            sourceAccountId: sourceAccount.id,
            sourceAccountName: sourceAccount.description,
            message: 'Add at least one target datapoint before running a dynamic allocation.',
          });
          return;
        }

        const sourceValue = getSourceValue(sourceAccount, periodId);

        // Use the new preset-based allocation
        let computed;
        try {
          computed = allocateDynamicWithPresets(
            sourceValue,
            presetRowData,
            nonPresetTargets.map(item => ({
              basisValue: item.basisValue,
              targetId: item.target.datapointId,
            })),
          );
        } catch (error) {
          newValidationErrors.push({
            id: createId(),
            allocationId: allocation.id,
            periodId,
            sourceAccountId: sourceAccount.id,
            sourceAccountName: sourceAccount.description,
            message:
              error instanceof Error ? error.message : 'Unable to allocate using provided basis.',
          });
          return;
        }

        // Calculate total basis
        const basisTotal = computed.allocations.reduce((sum, item) => sum + item.basisValue, 0);

        // Build target allocations from computed results
        const targetAllocations = computed.allocations.map(item => {
          const matchingTarget = allocation.targetDatapoints.find(
            target => target.datapointId === item.targetAccountId ||
              (target.groupId && presetRowData.find(
                row => row.presetId === target.groupId &&
                  row.targetAccountId === item.targetAccountId
              ))
          );
          return {
            datapointId: item.targetAccountId,
            targetId: item.targetAccountId,
            targetName: matchingTarget?.name ?? getTargetNameById(item.targetAccountId),
            basisValue: item.basisValue,
            value: item.value,
            percentage: item.percentage,
            ratio: item.ratio,
            isExclusion: matchingTarget?.isExclusion ?? false,
          };
        });

        const adjustment =
          computed.adjustmentIndex !== null && computed.adjustmentIndex >= 0
            ? {
                targetId: computed.allocations[computed.adjustmentIndex].targetAccountId,
                amount: computed.adjustmentAmount,
              }
            : undefined;

        newResults.push({
          allocationId: allocation.id,
          allocationName: allocation.name,
          periodId,
          sourceAccountId: sourceAccount.id,
          sourceAccountName: sourceAccount.description,
          sourceValue,
          basisTotal,
          runAt: runTimestamp,
          adjustment,
          allocations: targetAllocations,
        });

        // Create audit records with preset information
        const auditTargets = computed.allocations.map(item => {
          const presetRow = presetRowData.find(row => row.targetAccountId === item.targetAccountId);
          const nonPresetTarget = nonPresetTargets.find(
            target => target.target.datapointId === item.targetAccountId,
          );

          return {
            targetId: item.targetAccountId,
            targetName: getTargetNameById(item.targetAccountId),
            basisValue: item.basisValue,
            ratio: item.ratio,
            percentage: item.percentage,
            allocation: item.value,
            presetId: item.presetId,
            basisMembers: presetRow
              ? [
                  {
                    accountId: presetRow.dynamicAccountId,
                    accountName:
                      basisAccounts.find(acc => acc.id === presetRow.dynamicAccountId)?.name ??
                      presetRow.dynamicAccountId,
                    value: presetRow.basisValue,
                  },
                ]
              : nonPresetTarget?.members ?? [],
          };
        });

        // Create audit records per preset
        computed.presetAllocations.forEach(presetAlloc => {
          newAuditRecords.push({
            id: createId(),
            allocationId: allocation.id,
            allocationName: allocation.name,
            periodId,
            runAt: runTimestamp,
            sourceAccount: {
              id: sourceAccount.id,
              number: sourceAccount.number,
              description: sourceAccount.description,
            },
            sourceAmount: presetAlloc.allocatedAmount,
            basisTotal: presetAlloc.totalBasis,
            adjustment: undefined,
            presetId: presetAlloc.presetId,
            userId: null,
            targets: presetAlloc.rows.map(row => {
              const presetRow = presetRowData.find(r => r.targetAccountId === row.targetAccountId);
              return {
                targetId: row.targetAccountId,
                targetName: getTargetNameById(row.targetAccountId),
                basisValue: row.basisValue,
                ratio: row.ratio,
                percentage: row.percentage,
                allocation: row.allocation,
                basisMembers: presetRow
                  ? [
                      {
                        accountId: presetRow.dynamicAccountId,
                        accountName:
                          basisAccounts.find(acc => acc.id === presetRow.dynamicAccountId)?.name ??
                          presetRow.dynamicAccountId,
                        value: presetRow.basisValue,
                      },
                    ]
                  : [],
              };
            }),
          });
        });

        // Create overall audit record
        newAuditRecords.push({
          id: createId(),
          allocationId: allocation.id,
          allocationName: allocation.name,
          periodId,
          runAt: runTimestamp,
          sourceAccount: {
            id: sourceAccount.id,
            number: sourceAccount.number,
            description: sourceAccount.description,
          },
          sourceAmount: sourceValue,
          basisTotal,
          adjustment,
          presetId: null,
          userId: null,
          targets: auditTargets,
        });
      });

      set({
        results: [...filteredResults, ...newResults],
        validationErrors: [...filteredValidationErrors, ...newValidationErrors],
        auditLog: [...existingAuditLog, ...newAuditRecords],
        isProcessing: false,
      });
    } catch (error) {
      set({ isProcessing: false });
      throw error;
    }
  },

  createPreset: ({
    name,
    rows,
    notes,
    applyToAllocationId,
    context = DEFAULT_PRESET_CONTEXT,
  }: {
    name: string;
    rows: DynamicAllocationPresetRow[];
    notes?: string;
    applyToAllocationId?: string | null;
    context?: DynamicAllocationPresetContext;
  }) => {
    let newPresetId = '';
    set(state => {
      const sanitizedRows = sanitizePresetRows(rows);
      const preset: DynamicAllocationPreset = {
        id: createId(),
        name: name.trim(),
        rows: sanitizedRows,
        notes,
        context,
      };
      newPresetId = preset.id;
      const presets = [...state.presets, preset];
      const mappingPresets = getPresetsByContext(presets, DEFAULT_PRESET_CONTEXT);
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, mappingPresets, state.basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(mappingPresets, state.basisAccounts, state.selectedPeriod);
      return { presets, groups, allocations };
    });

    if (applyToAllocationId && newPresetId) {
      get().toggleAllocationPresetTargets(applyToAllocationId, newPresetId);
    }

    return newPresetId;
  },

  updatePreset: (presetId, updates) => {
    set(state => {
      const affectedAccountIds = getPresetAllocationSourceIds(state.allocations, presetId);
      const presets = state.presets.map(preset => {
        if (preset.id !== presetId) {
          return preset;
        }
        const next: DynamicAllocationPreset = {
          ...preset,
          ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        };
        return next;
      });
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      const mutation = buildDynamicMutation(
        affectedAccountIds,
        state.lastDynamicMutation,
      );
      return {
        presets,
        groups,
        allocations,
        ...(mutation ? { lastDynamicMutation: mutation } : {}),
      };
    });
  },

  addPresetRow: (presetId, row, index) => {
    set(state => {
      const affectedAccountIds = getPresetAllocationSourceIds(state.allocations, presetId);
      const presets = state.presets.map(preset => {
        if (preset.id !== presetId) {
          return preset;
        }
        const sanitizedRow = sanitizePresetRows([row])[0];
        if (!sanitizedRow) {
          return preset;
        }
        const basisIds = new Set(preset.rows.map(item => item.dynamicAccountId));
        const targetIds = new Set(preset.rows.map(item => item.targetAccountId));
        if (basisIds.has(sanitizedRow.dynamicAccountId)) {
          return preset;
        }
        if (targetIds.has(sanitizedRow.dynamicAccountId)) {
          return preset;
        }
        if (basisIds.has(sanitizedRow.targetAccountId)) {
          return preset;
        }
        const nextRows = [...preset.rows];
        if (typeof index === 'number' && index >= 0 && index <= nextRows.length) {
          nextRows.splice(index, 0, sanitizedRow);
        } else {
          nextRows.push(sanitizedRow);
        }
        return { ...preset, rows: nextRows };
      });
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      const mutation = buildDynamicMutation(
        affectedAccountIds,
        state.lastDynamicMutation,
      );
      return {
        presets,
        groups,
        allocations,
        ...(mutation ? { lastDynamicMutation: mutation } : {}),
      };
    });
  },

  updatePresetRow: (presetId, rowIndex, updates) => {
    set(state => {
      const affectedAccountIds = getPresetAllocationSourceIds(state.allocations, presetId);
      const presets = state.presets.map(preset => {
        if (preset.id !== presetId) {
          return preset;
        }
        if (rowIndex < 0 || rowIndex >= preset.rows.length) {
          return preset;
        }
        const currentRow = preset.rows[rowIndex];
        const nextRow: DynamicAllocationPresetRow = {
          dynamicAccountId:
            updates.dynamicAccountId !== undefined
              ? normalizeAccountId(updates.dynamicAccountId)
              : currentRow.dynamicAccountId,
          targetAccountId:
            updates.targetAccountId !== undefined
              ? normalizeAccountId(updates.targetAccountId)
              : currentRow.targetAccountId,
        };
        if (!nextRow.dynamicAccountId || !nextRow.targetAccountId) {
          return preset;
        }
        const basisIds = new Set<string>();
        const targetIds = new Set<string>();
        preset.rows.forEach((rowItem, index) => {
          if (index === rowIndex) {
            return;
          }
          basisIds.add(rowItem.dynamicAccountId);
          targetIds.add(rowItem.targetAccountId);
        });
        if (basisIds.has(nextRow.dynamicAccountId)) {
          return preset;
        }
        if (targetIds.has(nextRow.dynamicAccountId)) {
          return preset;
        }
        if (basisIds.has(nextRow.targetAccountId)) {
          return preset;
        }
        const nextRows = [...preset.rows];
        nextRows[rowIndex] = nextRow;
        return { ...preset, rows: nextRows };
      });
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      const mutation = buildDynamicMutation(
        affectedAccountIds,
        state.lastDynamicMutation,
      );
      return {
        presets,
        groups,
        allocations,
        ...(mutation ? { lastDynamicMutation: mutation } : {}),
      };
    });
  },

  removePresetRow: (presetId, rowIndex) => {
    set(state => {
      const affectedAccountIds = getPresetAllocationSourceIds(state.allocations, presetId);
      const presets = state.presets.map(preset => {
        if (preset.id !== presetId) {
          return preset;
        }
        if (rowIndex < 0 || rowIndex >= preset.rows.length) {
          return preset;
        }
        const nextRows = preset.rows.filter((_, index) => index !== rowIndex);
        return { ...preset, rows: nextRows };
      });
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      const mutation = buildDynamicMutation(
        affectedAccountIds,
        state.lastDynamicMutation,
      );
      return {
        presets,
        groups,
        allocations,
        ...(mutation ? { lastDynamicMutation: mutation } : {}),
      };
    });
  },

  getPresetAvailableDynamicAccounts: (presetId, rowIndex) => {
    const { basisAccounts, presets } = get();
    const preset = presets.find(item => item.id === presetId);
    if (!preset) {
      return basisAccounts;
    }

    const dynamicUsage = new Map<string, Set<string>>();
    const targetCanonicalUsage = new Map<string, Set<string>>();

    const addUsage = (map: Map<string, Set<string>>, id: string | null, key: string) => {
      if (!id) {
        return;
      }
      if (!map.has(id)) {
        map.set(id, new Set());
      }
      map.get(id)?.add(key);
    };

    preset.rows.forEach((row, index) => {
      const basisKey = `basis-${index}`;
      const targetKey = `target-${index}`;
      if (row.dynamicAccountId) {
        addUsage(dynamicUsage, row.dynamicAccountId, basisKey);
      }
      const targetCanonicalId = resolveCanonicalTargetId(row.targetAccountId);
      addUsage(targetCanonicalUsage, targetCanonicalId, targetKey);
    });

    const dropdownKey = typeof rowIndex === 'number' ? `basis-${rowIndex}` : null;

    return basisAccounts.filter(account => {
      const dynamicUsers = dynamicUsage.get(account.id);
      if (dynamicUsers && dynamicUsers.size > 0) {
        if (!dropdownKey || dynamicUsers.size > 1 || !dynamicUsers.has(dropdownKey)) {
          return false;
        }
      }
      const canonicalTargetId = resolveCanonicalTargetId(account.mappedTargetId);
      if (!canonicalTargetId) {
        return true;
      }
      const targetUsers = targetCanonicalUsage.get(canonicalTargetId);
      if (!targetUsers || targetUsers.size === 0) {
        return true;
      }
      return false;
    });
  },

  getPresetAvailableTargetAccounts: (presetId, _rowIndex) => {
    void _rowIndex;
    const { basisAccounts, presets } = get();
    const preset = presets.find(item => item.id === presetId);
    const basisCanonicalUsage = new Map<string, Set<string>>();

    const addUsage = (map: Map<string, Set<string>>, id: string | null, key: string) => {
      if (!id) {
        return;
      }
      if (!map.has(id)) {
        map.set(id, new Set());
      }
      map.get(id)?.add(key);
    };

    (preset?.rows ?? []).forEach((row, index) => {
      const basisKey = `basis-${index}`;
      if (row.dynamicAccountId) {
        const basisAccount = basisAccounts.find(account => account.id === row.dynamicAccountId);
        const canonicalId = resolveCanonicalTargetId(basisAccount?.mappedTargetId);
        addUsage(basisCanonicalUsage, canonicalId, basisKey);
      }
    });

    return getChartOfAccountOptions()
      .filter(option => {
        const basisUsers = basisCanonicalUsage.get(option.id);
        if (!basisUsers || basisUsers.size === 0) {
          return true;
        }
        return false;
      })
      .map(option => ({
        id: option.id,
        label: option.label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },

  toggleAllocationPresetTargets: (allocationId, presetId, options) => {
    set(state => {
      const preset = state.presets.find(item => item.id === presetId);
      if (!preset) {
        return state;
      }

      let mutatedAccountId: string | null = null;
      const allocations = state.allocations.map(allocation => {
        if (allocation.id !== allocationId) {
          return allocation;
        }

        mutatedAccountId = allocation.sourceAccount.id;
        const exists = allocation.targetDatapoints.some(target => target.groupId === presetId);
        const nextTargets = exists
          ? allocation.targetDatapoints.filter(target => target.groupId !== presetId)
          : [
              ...allocation.targetDatapoints,
              ...preset.rows.map(row =>
                buildPresetTargetDatapoint(preset, row, state.basisAccounts, state.selectedPeriod),
              ),
            ];

        return synchronizeAllocationTargets(
          {
            ...allocation,
            targetDatapoints: nextTargets,
          },
          state.presets,
          state.basisAccounts,
          state.selectedPeriod,
        );
      });

      if (!mutatedAccountId) {
        return state;
      }
      const mutation = options?.suppressMutation
        ? null
        : buildDynamicMutation([mutatedAccountId], state.lastDynamicMutation);
      return mutation
        ? { allocations, lastDynamicMutation: mutation }
        : { allocations };
    });
  },
  toggleTargetExclusion: (allocationId, datapointId, presetId) => {
    set(state => {
      let mutatedAccountId: string | null = null;
      const allocations = state.allocations.map(allocation => {
        if (allocation.id !== allocationId) {
          return allocation;
        }

        const matchesTarget = (target: RatioAllocationTargetDatapoint) => {
          if (presetId) {
            return target.groupId === presetId;
          }
          return target.datapointId === datapointId;
        };

        const exists = allocation.targetDatapoints.some(matchesTarget);
        if (!exists) {
          return allocation;
        }

        const nextTargets = allocation.targetDatapoints.map(target =>
          matchesTarget(target) ? { ...target, isExclusion: !target.isExclusion } : target,
        );

        mutatedAccountId = allocation.sourceAccount.id;

        return synchronizeAllocationTargets(
          {
            ...allocation,
            targetDatapoints: nextTargets,
          },
          state.presets,
          state.basisAccounts,
          state.selectedPeriod,
        );
      });

      const mutation = buildDynamicMutation(
        mutatedAccountId ? [mutatedAccountId] : [],
        state.lastDynamicMutation,
      );
      if (!mutation) {
        return state;
      }

      return {
        allocations,
        lastDynamicMutation: mutation,
      };
    });
  },
  createGroup: ({ label, memberAccountIds, targetId }) => {
    set(state => {
      const name = label.trim();
      if (!name) {
        return state;
      }

      const uniqueMemberIds = Array.from(
        new Set(memberAccountIds.filter(id => typeof id === 'string' && id.trim().length > 0)),
      );
      const resolvedTargetId = resolveTargetAccountId(targetId);

      const presetRows = uniqueMemberIds
        .map(memberId => {
          const basisAccount = state.basisAccounts.find(account => account.id === memberId);
          if (!basisAccount) {
            return null;
          }
          const targetAccountId =
            resolvedTargetId ??
            resolveTargetAccountId(basisAccount.mappedTargetId) ??
            basisAccount.mappedTargetId;
          if (!targetAccountId) {
            return null;
          }
          return {
            dynamicAccountId: basisAccount.id,
            targetAccountId,
          };
        })
        .filter((row): row is DynamicAllocationPresetRow => Boolean(row));

      const sanitizedRows = sanitizePresetRows(presetRows);

      const preset: DynamicAllocationPreset = {
        id: createId(),
        name,
        rows: sanitizedRows,
      };

      const presets = [...state.presets, preset];
      let groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);

      if (sanitizedRows.length === 0 && uniqueMemberIds.length > 0) {
        const fallbackMembers = uniqueMemberIds
          .map(memberId => state.sourceAccounts.find(account => account.id === memberId))
          .filter((account): account is DynamicSourceAccount => Boolean(account))
          .map(account => {
            const fallbackTargetId = resolvedTargetId ?? account.id;
            return {
              accountId: account.id,
              accountName: account.name,
              basisValue: Math.abs(account.value ?? 0),
              targetAccountId: fallbackTargetId,
              targetName: getTargetNameById(fallbackTargetId),
            };
          });

        groups = groups.map(group =>
          group.id === preset.id && fallbackMembers.length > 0
            ? { ...group, members: fallbackMembers }
            : group,
        );
      }

      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );

      return { presets, groups, allocations };
    });
  },
  getActivePresetForSource: (sourceAccountId: string) => {
    const { allocations, presets } = get();
    const allocation = allocations.find(alloc => alloc.sourceAccount.id === sourceAccountId);
    if (!allocation || allocation.targetDatapoints.length === 0) {
      return null;
    }
    // Get the first preset that has targets in this allocation
    const presetId = allocation.targetDatapoints.find(t => t.groupId)?.groupId;
    if (!presetId) {
      return null;
    }
    return presets.find(p => p.id === presetId) ?? null;
  },
  setActivePresetForSource: (sourceAccountId: string, presetId: string | null, options) => {
    const allocation = get().getOrCreateAllocation(sourceAccountId);

    if (!presetId) {
      // Clear all preset targets
      get().updateAllocation(
        allocation.id,
        {
          targetDatapoints: allocation.targetDatapoints.filter(t => !t.groupId),
        },
        options,
      );
      return;
    }

    // Toggle to remove old preset if any, then toggle to add new preset
    const existingPresetId = allocation.targetDatapoints.find(t => t.groupId)?.groupId;
    if (existingPresetId && existingPresetId !== presetId) {
      get().toggleAllocationPresetTargets(allocation.id, existingPresetId, options);
    }

    // Add the new preset if not already added
    const hasNewPreset = allocation.targetDatapoints.some(t => t.groupId === presetId);
    if (!hasNewPreset) {
      get().toggleAllocationPresetTargets(allocation.id, presetId, options);
    }
  },
}));
