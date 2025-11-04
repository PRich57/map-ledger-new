import { create } from 'zustand';
import {
  AllocationResult,
  DynamicAllocationAuditRecord,
  DynamicAllocationPreset,
  DynamicAllocationPresetRow,
  DynamicAllocationValidationIssue,
  DynamicBasisAccount,
  DynamicSourceAccount,
  RatioAllocation,
  RatioAllocationTargetDatapoint,
} from '../types';
import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';
import {
  allocateDynamic,
  getBasisValue,
  GroupMemberValue,
  getSourceValue,
} from '../utils/dynamicAllocation';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};


const getTargetNameById = (targetId: string): string => {
  const option = STANDARD_CHART_OF_ACCOUNTS.find(item => item.id === targetId);
  return option?.label ?? targetId;
};

const normalizeAccountId = (value?: string | null): string =>
  typeof value === 'string' ? value.trim() : '';

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
  const seenDynamics = new Set<string>();
  const seenTargets = new Set<string>();
  const sanitized: DynamicAllocationPresetRow[] = [];

  rows.forEach(row => {
    const dynamicAccountId = normalizeAccountId(row.dynamicAccountId);
    const targetAccountId = normalizeAccountId(row.targetAccountId);
    if (!dynamicAccountId || !targetAccountId) {
      return;
    }
    if (seenDynamics.has(dynamicAccountId) || seenTargets.has(targetAccountId)) {
      return;
    }
    seenDynamics.add(dynamicAccountId);
    seenTargets.add(targetAccountId);
    sanitized.push({ dynamicAccountId, targetAccountId });
  });

  return sanitized;
};

type ResolvedTargetDetail = {
  target: RatioAllocationTargetDatapoint;
  basisValue: number;
  members: GroupMemberValue[];
  error?: string;
};

export type RatioAllocationHydrationPayload = {
  basisAccounts?: DynamicBasisAccount[];
  sourceAccounts?: DynamicSourceAccount[];
  presets?: DynamicAllocationPreset[];
  allocations?: RatioAllocation[];
  availablePeriods?: string[];
  selectedPeriod?: string | null;
};

export type RatioAllocationState = {
  allocations: RatioAllocation[];
  basisAccounts: DynamicBasisAccount[];
  presets: DynamicAllocationPreset[];
  sourceAccounts: DynamicSourceAccount[];
  availablePeriods: string[];
  isProcessing: boolean;
  selectedPeriod: string | null;
  results: AllocationResult[];
  validationErrors: DynamicAllocationValidationIssue[];
  auditLog: DynamicAllocationAuditRecord[];
  hydrate: (payload: RatioAllocationHydrationPayload) => void;
  setBasisAccounts: (basisAccounts: DynamicBasisAccount[]) => void;
  getOrCreateAllocation: (sourceAccountId: string) => RatioAllocation;
  addAllocation: (allocation: Omit<RatioAllocation, 'id'>) => void;
  updateAllocation: (id: string, allocation: Partial<RatioAllocation>) => void;
  deleteAllocation: (id: string) => void;
  setAvailablePeriods: (periods: string[]) => void;
  setSelectedPeriod: (period: string) => void;
  calculateAllocations: (periodId: string) => Promise<void>;
  createPreset: (payload: {
    name: string;
    rows: DynamicAllocationPresetRow[];
    notes?: string;
  }) => void;
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
  toggleAllocationPresetTargets: (allocationId: string, presetId: string) => void;
  toggleTargetExclusion: (
    allocationId: string,
    datapointId: string,
    presetId?: string | null,
  ) => void;
};

export const useRatioAllocationStore = create<RatioAllocationState>((set, get) => ({
  allocations: [],
  basisAccounts: [],
  presets: [],
  sourceAccounts: [],
  availablePeriods: [],
  isProcessing: false,
  selectedPeriod: null,
  results: [],
  validationErrors: [],
  auditLog: [],

  hydrate: payload => {
    set(state => {
      const basisAccounts = payload.basisAccounts ?? state.basisAccounts;
      const presets = (payload.presets ?? state.presets).map(preset => ({
        ...preset,
        name: preset.name.trim(),
        notes: typeof preset.notes === 'string' ? preset.notes : preset.notes,
        rows: sanitizePresetRows(preset.rows),
      }));
      const allocationsInput = payload.allocations ?? state.allocations;
      const availablePeriods = payload.availablePeriods ?? state.availablePeriods;
      const selectedPeriod =
        payload.selectedPeriod ?? state.selectedPeriod ?? availablePeriods[0] ?? null;
      const allocations = allocationsInput.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, basisAccounts, selectedPeriod),
      );

      return {
        allocations,
        basisAccounts,
        presets,
        sourceAccounts: payload.sourceAccounts ?? state.sourceAccounts,
        availablePeriods,
        selectedPeriod,
      };
    });
  },

  setBasisAccounts: basisAccounts => {
    set(state => {
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, state.presets, basisAccounts, state.selectedPeriod),
      );
      return {
        basisAccounts,
        presets: state.presets,
        allocations,
      };
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
        const fallback: DynamicSourceAccount = {
          id: sourceAccountId,
          name: sourceAccountId,
          number: sourceAccountId,
          description: sourceAccountId,
          value: 0,
        };
        set(state => ({ sourceAccounts: [...state.sourceAccounts, fallback] }));
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

  updateAllocation: (id, allocation) => {
    set(state => ({
      allocations: state.allocations.map(item => {
        if (item.id !== id) {
          return item;
        }
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
              ? buildPresetTargetDatapoint(preset, row, state.basisAccounts, state.selectedPeriod, target)
              : target;
          });
        }
        return synchronizeAllocationTargets(
          merged,
          state.presets,
          state.basisAccounts,
          state.selectedPeriod,
        );
      }),
    }));
  },

  deleteAllocation: id => {
    set(state => ({
      allocations: state.allocations.filter(allocation => allocation.id !== id),
    }));
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
        synchronizeAllocationTargets(allocation, state.presets, state.basisAccounts, period),
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

      const filteredResults = existingResults.filter(result => result.periodId !== periodId);
      const filteredValidationErrors = existingValidationErrors.filter(issue => issue.periodId !== periodId);

      const newResults: AllocationResult[] = [];
      const newValidationErrors: DynamicAllocationValidationIssue[] = [];
      const newAuditRecords: DynamicAllocationAuditRecord[] = [];
      const runTimestamp = new Date().toISOString();

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

        const targetDetails: ResolvedTargetDetail[] = allocation.targetDatapoints.map(target => {
          if (target.groupId) {
            const preset = presets.find(item => item.id === target.groupId);
            if (!preset) {
              return {
                target,
                basisValue: 0,
                members: [],
                error: `Dynamic allocation preset ${target.name} is missing.`,
              };
            }
            const row = preset.rows.find(
              rowItem =>
                normalizeAccountId(rowItem.dynamicAccountId) ===
                normalizeAccountId(target.ratioMetric.id),
            );
            if (!row) {
              return {
                target,
                basisValue: 0,
                members: [],
                error: `Preset ${preset.name} no longer includes basis account ${target.ratioMetric.name}.`,
              };
            }
            const basisAccount = basisAccounts.find(item => item.id === row.dynamicAccountId);
            if (!basisAccount) {
              return {
                target,
                basisValue: 0,
                members: [],
                error: `Basis account ${row.dynamicAccountId} is unavailable for preset ${preset.name}.`,
              };
            }
            const value = getBasisValue(basisAccount, periodId);
            return {
              target,
              basisValue: value,
              members: [
                {
                  accountId: basisAccount.id,
                  accountName: basisAccount.name,
                  value,
                },
              ],
            };
          }

          const basisAccount = basisAccounts.find(item => item.id === target.ratioMetric.id);
          if (basisAccount) {
            const value = getBasisValue(basisAccount, periodId);
            return {
              target,
              basisValue: value,
              members: [
                {
                  accountId: basisAccount.id,
                  accountName: basisAccount.name,
                  value,
                },
              ],
            };
          }

          const metricValue = typeof target.ratioMetric.value === 'number' ? target.ratioMetric.value : 0;
          if (!Number.isFinite(metricValue)) {
            return {
              target,
              basisValue: 0,
              members: [],
              error: `Basis datapoint ${target.ratioMetric.name} is missing a numeric value.`,
            };
          }

          return {
            target,
            basisValue: metricValue,
            members: [
              {
                accountId: target.ratioMetric.id,
                accountName: target.ratioMetric.name,
                value: metricValue,
              },
            ],
          };
        });

        const localIssues: { message: string; targets?: string[] }[] = [];

        targetDetails.forEach(detail => {
          if (detail.error) {
            localIssues.push({ message: detail.error });
          }
          if (detail.basisValue < 0) {
            localIssues.push({
              message: `Basis value for ${detail.target.name} must be non-negative.`,
              targets: [detail.target.datapointId],
            });
          }
        });

        const basisTotal = targetDetails.reduce((sum, detail) => sum + detail.basisValue, 0);
        if (basisTotal <= 0) {
          localIssues.push({ message: 'Basis total is zero; provide nonzero datapoints.' });
        }

        const circularTargets = targetDetails
          .filter(detail => detail.members.some(member => member.accountId === sourceAccount.id))
          .map(detail => detail.target.datapointId);
        if (circularTargets.length > 0) {
          localIssues.push({
            message: `Basis datapoints reference source account ${sourceAccount.number}. Remove the circular dependency.`,
            targets: circularTargets,
          });
        }

        if (localIssues.length > 0) {
          localIssues.forEach(issue => {
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

        if (targetDetails.length === 0) {
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
        const basisValues = targetDetails.map(detail => detail.basisValue);

        let computed;
        try {
          computed = allocateDynamic(sourceValue, basisValues);
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

        const targetAllocations = targetDetails.map((detail, index) => {
          const ratio = basisTotal > 0 ? detail.basisValue / basisTotal : 0;
          return {
            datapointId: detail.target.datapointId,
            targetId: detail.target.datapointId,
            targetName: detail.target.name,
            basisValue: detail.basisValue,
            value: computed.allocations[index] ?? 0,
            percentage: ratio * 100,
            ratio,
            isExclusion: allocation.targetDatapoints[index]?.isExclusion ?? false,
          };
        });

        const adjustment =
          computed.adjustmentIndex !== null
            ? {
                targetId: allocation.targetDatapoints[computed.adjustmentIndex].datapointId,
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
          targets: targetAllocations.map((targetAllocation, index) => ({
            targetId: targetAllocation.targetId,
            targetName: targetAllocation.targetName,
            basisValue: targetAllocation.basisValue,
            ratio: targetAllocation.ratio,
            allocation: targetAllocation.value,
            basisMembers: targetDetails[index].members,
          })),
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

  createPreset: ({ name, rows, notes }) => {
    set(state => {
      const sanitizedRows = sanitizePresetRows(rows);
      const preset: DynamicAllocationPreset = {
        id: createId(),
        name: name.trim(),
        rows: sanitizedRows,
        notes,
      };
      const presets = [...state.presets, preset];
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      return { presets, allocations };
    });
  },

  updatePreset: (presetId, updates) => {
    set(state => {
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
      return { presets, allocations };
    });
  },

  addPresetRow: (presetId, row, index) => {
    set(state => {
      const presets = state.presets.map(preset => {
        if (preset.id !== presetId) {
          return preset;
        }
        const sanitizedRow = sanitizePresetRows([row])[0];
        if (!sanitizedRow) {
          return preset;
        }
        const usedDynamics = new Set(preset.rows.map(item => item.dynamicAccountId));
        const usedTargets = new Set(preset.rows.map(item => item.targetAccountId));
        if (
          usedDynamics.has(sanitizedRow.dynamicAccountId) ||
          usedTargets.has(sanitizedRow.targetAccountId)
        ) {
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
      return { presets, allocations };
    });
  },

  updatePresetRow: (presetId, rowIndex, updates) => {
    set(state => {
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
        const duplicateDynamic = preset.rows.some(
          (rowItem, index) => index !== rowIndex && rowItem.dynamicAccountId === nextRow.dynamicAccountId,
        );
        if (duplicateDynamic) {
          return preset;
        }
        const duplicateTarget = preset.rows.some(
          (rowItem, index) => index !== rowIndex && rowItem.targetAccountId === nextRow.targetAccountId,
        );
        if (duplicateTarget) {
          return preset;
        }
        const nextRows = [...preset.rows];
        nextRows[rowIndex] = nextRow;
        return { ...preset, rows: nextRows };
      });
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      return { presets, allocations };
    });
  },

  removePresetRow: (presetId, rowIndex) => {
    set(state => {
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
      return { presets, allocations };
    });
  },

  getPresetAvailableDynamicAccounts: (presetId, excludeRowIndex) => {
    const { basisAccounts, presets } = get();
    const preset = presets.find(item => item.id === presetId);
    if (!preset) {
      return basisAccounts;
    }
    const usedDynamics = new Set(
      preset.rows
        .map((row, index) => (index === excludeRowIndex ? null : row.dynamicAccountId))
        .filter((value): value is string => Boolean(value)),
    );
    return basisAccounts.filter(account => !usedDynamics.has(account.id));
  },

  getPresetAvailableTargetAccounts: (presetId, excludeRowIndex) => {
    const preset = get().presets.find(item => item.id === presetId);
    const usedTargets = new Set(
      (preset?.rows ?? [])
        .map((row, index) => (index === excludeRowIndex ? null : row.targetAccountId))
        .filter((value): value is string => Boolean(value)),
    );
    return STANDARD_CHART_OF_ACCOUNTS.filter(option => !usedTargets.has(option.id))
      .map(option => ({
        id: option.id,
        label: option.label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },

  toggleAllocationPresetTargets: (allocationId, presetId) => {
    set(state => {
      const preset = state.presets.find(item => item.id === presetId);
      if (!preset) {
        return state;
      }

      const allocations = state.allocations.map(allocation => {
        if (allocation.id !== allocationId) {
          return allocation;
        }

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

      return { allocations };
    });
  },
  toggleTargetExclusion: (allocationId, datapointId, presetId) => {
    set(state => ({
      allocations: state.allocations.map(allocation => {
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

        return synchronizeAllocationTargets(
          {
            ...allocation,
            targetDatapoints: nextTargets,
          },
          state.presets,
          state.basisAccounts,
          state.selectedPeriod,
        );
      }),
    }));
  },
}));
