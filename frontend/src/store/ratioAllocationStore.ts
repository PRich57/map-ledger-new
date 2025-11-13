import { create } from 'zustand';
import {
  AllocationResult,
  DynamicAllocationAuditRecord,
  DynamicAllocationGroup,
  DynamicAllocationGroupMember,
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


const getTargetNameById = (targetId: string): string => {
  const option = STANDARD_CHART_OF_ACCOUNTS.find(item => item.id === targetId);
  return option?.label ?? targetId;
};

const resolveTargetAccountId = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const match = STANDARD_CHART_OF_ACCOUNTS.find(
    option => option.id === normalized || option.value === normalized,
  );
  return match?.id ?? normalized;
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
  const usedIds = new Set<string>();
  const sanitized: DynamicAllocationPresetRow[] = [];

  rows.forEach(row => {
    const dynamicAccountId = normalizeAccountId(row.dynamicAccountId);
    const targetAccountId = normalizeAccountId(row.targetAccountId);
    if (!dynamicAccountId || !targetAccountId) {
      return;
    }
    if (usedIds.has(dynamicAccountId) || usedIds.has(targetAccountId)) {
      return;
    }
    usedIds.add(dynamicAccountId);
    usedIds.add(targetAccountId);
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
  groups?: DynamicAllocationGroup[];
  allocations?: RatioAllocation[];
  availablePeriods?: string[];
  selectedPeriod?: string | null;
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
    applyToAllocationId?: string | null;
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
  toggleAllocationPresetTargets: (allocationId: string, presetId: string) => void;
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
  setActivePresetForSource: (sourceAccountId: string, presetId: string | null) => void;
};

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
          : state.presets);
      const presets = presetSource.map(preset => ({
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
      const groups = deriveGroups(presets, basisAccounts, selectedPeriod);

      return {
        allocations,
        basisAccounts,
        presets,
        groups,
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
      const groups = deriveGroups(state.presets, basisAccounts, state.selectedPeriod);
      return {
        basisAccounts,
        presets: state.presets,
        groups,
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
      groups: deriveGroups(state.presets, state.basisAccounts, period),
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

      // Validate all presets before processing allocations
      presets.forEach(preset => {
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

        presetTargetsMap.forEach((targets, presetId) => {
          const preset = presets.find(item => item.id === presetId);
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

  createPreset: ({ name, rows, notes, applyToAllocationId }) => {
    let newPresetId = '';
    set(state => {
      const sanitizedRows = sanitizePresetRows(rows);
      const preset: DynamicAllocationPreset = {
        id: createId(),
        name: name.trim(),
        rows: sanitizedRows,
        notes,
      };
      newPresetId = preset.id;
      const presets = [...state.presets, preset];
      const allocations = state.allocations.map(allocation =>
        synchronizeAllocationTargets(allocation, presets, state.basisAccounts, state.selectedPeriod),
      );
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      return { presets, groups, allocations };
    });

    if (applyToAllocationId && newPresetId) {
      get().toggleAllocationPresetTargets(applyToAllocationId, newPresetId);
    }

    return newPresetId;
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
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      return { presets, groups, allocations };
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
        const usedIds = new Set(
          preset.rows.flatMap(item => [item.dynamicAccountId, item.targetAccountId]),
        );
        if (
          usedIds.has(sanitizedRow.dynamicAccountId) ||
          usedIds.has(sanitizedRow.targetAccountId)
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
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      return { presets, groups, allocations };
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
        const usedIds = new Set<string>();
        preset.rows.forEach((rowItem, index) => {
          if (index === rowIndex) {
            return;
          }
          usedIds.add(rowItem.dynamicAccountId);
          usedIds.add(rowItem.targetAccountId);
        });
        if (usedIds.has(nextRow.dynamicAccountId) || usedIds.has(nextRow.targetAccountId)) {
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
      return { presets, groups, allocations };
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
      const groups = deriveGroups(presets, state.basisAccounts, state.selectedPeriod);
      return { presets, groups, allocations };
    });
  },

  getPresetAvailableDynamicAccounts: (presetId, excludeRowIndex) => {
    const { basisAccounts, presets } = get();
    const preset = presets.find(item => item.id === presetId);
    if (!preset) {
      return basisAccounts;
    }
    const usedIds = new Set(
      preset.rows
        .flatMap((row, index) =>
          index === excludeRowIndex ? [] : [row.dynamicAccountId, row.targetAccountId],
        )
        .filter((value): value is string => Boolean(value)),
    );
    return basisAccounts.filter(account => !usedIds.has(account.id));
  },

  getPresetAvailableTargetAccounts: (presetId, excludeRowIndex) => {
    const preset = get().presets.find(item => item.id === presetId);
    const usedIds = new Set(
      (preset?.rows ?? [])
        .flatMap((row, index) =>
          index === excludeRowIndex ? [] : [row.dynamicAccountId, row.targetAccountId],
        )
        .filter((value): value is string => Boolean(value)),
    );
    return STANDARD_CHART_OF_ACCOUNTS.filter(option => !usedIds.has(option.id))
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
  setActivePresetForSource: (sourceAccountId: string, presetId: string | null) => {
    const allocation = get().getOrCreateAllocation(sourceAccountId);

    if (!presetId) {
      // Clear all preset targets
      get().updateAllocation(allocation.id, {
        targetDatapoints: allocation.targetDatapoints.filter(t => !t.groupId),
      });
      return;
    }

    // Remove any existing preset targets and add the new preset
    const nonPresetTargets = allocation.targetDatapoints.filter(t => !t.groupId);

    // Toggle to remove old preset if any, then toggle to add new preset
    const existingPresetId = allocation.targetDatapoints.find(t => t.groupId)?.groupId;
    if (existingPresetId && existingPresetId !== presetId) {
      get().toggleAllocationPresetTargets(allocation.id, existingPresetId);
    }

    // Add the new preset if not already added
    const hasNewPreset = allocation.targetDatapoints.some(t => t.groupId === presetId);
    if (!hasNewPreset) {
      get().toggleAllocationPresetTargets(allocation.id, presetId);
    }
  },
}));