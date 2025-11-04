import { create } from 'zustand';
import type {
  DynamicBasisAccount,
  GLAccountMappingRow,
  MappingPolarity,
  MappingSplitDefinition,
  MappingStatus,
  MappingType,
  TrialBalanceRow,
} from '../types';
import {
  STANDARD_CHART_OF_ACCOUNTS,
  getStandardScoaOption,
} from '../data/standardChartOfAccounts';
import { buildMappingRowsFromImport } from '../utils/buildMappingRowsFromImport';
import {
  allocateDynamic,
  getGroupTotal,
  getSourceValue,
} from '../utils/dynamicAllocation';
import { useRatioAllocationStore, type RatioAllocationHydrationPayload } from './ratioAllocationStore';

const DRIVER_BENEFITS_TARGET = getStandardScoaOption(
  'DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET',
);
const NON_DRIVER_BENEFITS_TARGET = getStandardScoaOption('NON DRIVER WAGES & BENEFITS - TOTAL ASSET OPERATIONS');

const STANDARD_SCOA_VALUE_SET = new Set(
  STANDARD_CHART_OF_ACCOUNTS.map(option => option.value),
);

const STANDARD_SCOA_TARGET_ID_SET = new Set(
  STANDARD_CHART_OF_ACCOUNTS.map(option => option.id),
);

const baseMappings: GLAccountMappingRow[] = [
  {
    id: 'acct-3',
    companyId: 'comp-global',
    companyName: 'Global Logistics',
    entityId: 'entity-main',
    entityName: 'Global Main',
    accountId: '6100',
    accountName: 'Fuel Expense',
    activity: 65000,
    status: 'New',
    mappingType: 'dynamic',
    netChange: 65000,
    operation: 'Fleet',
    suggestedCOAId: '6100',
    suggestedCOADescription: 'Fuel Expense',
    aiConfidence: 70,
    polarity: 'Debit',
    notes: 'Needs reviewer confirmation of dynamic allocation.',
    splitDefinitions: [],
    companies: [
      { id: 'entity-main', company: 'Global Main', balance: 65000 },
    ],
  },
  {
    id: 'acct-2',
    companyId: 'comp-acme',
    companyName: 'Acme Freight',
    entityId: 'entity-ops',
    entityName: 'Acme Freight Operations',
    accountId: '5200',
    accountName: 'Payroll Taxes',
    activity: 120000,
    status: 'Unmapped',
    mappingType: 'percentage',
    netChange: 120000,
    operation: 'Shared Services',
    suggestedCOAId: '5200',
    suggestedCOADescription: 'Payroll Taxes',
    aiConfidence: 82,
    polarity: 'Debit',
    presetId: 'preset-2',
    notes: 'Awaiting updated headcount split.',
    splitDefinitions: [
      {
        id: 'split-1',
        targetId: DRIVER_BENEFITS_TARGET.id,
        targetName: DRIVER_BENEFITS_TARGET.label,
        allocationType: 'percentage',
        allocationValue: 60,
        notes: 'HQ employees',
      },
      {
        id: 'split-2',
        targetId: NON_DRIVER_BENEFITS_TARGET.id,
        targetName: NON_DRIVER_BENEFITS_TARGET.label,
        allocationType: 'percentage',
        allocationValue: 40,
        notes: 'Field staff',
      },
    ],
    companies: [
      { id: 'entity-tms', company: 'Acme Freight TMS', balance: 80000 },
      { id: 'entity-ops', company: 'Acme Freight Operations', balance: 40000 },
    ],
  },
  {
    id: 'acct-1',
    companyId: 'comp-acme',
    companyName: 'Acme Freight',
    entityId: 'entity-tms',
    entityName: 'Acme Freight TMS',
    accountId: '4000',
    accountName: 'Linehaul Revenue',
    activity: 500000,
    status: 'Mapped',
    mappingType: 'direct',
    netChange: 500000,
    operation: 'Linehaul',
    suggestedCOAId: '4100',
    suggestedCOADescription: 'Revenue',
    aiConfidence: 96,
    manualCOAId: '4100',
    polarity: 'Credit',
    presetId: 'preset-1',
    notes: 'Approved during March close.',
    splitDefinitions: [],
    companies: [
      { id: 'entity-tms', company: 'Acme Freight TMS', balance: 400000 },
      { id: 'entity-mx', company: 'Acme Freight Mexico', balance: 100000 },
    ],
  },
  {
    id: 'acct-4',
    companyId: 'comp-heritage',
    companyName: 'Heritage Transport',
    entityId: 'entity-legacy',
    entityName: 'Legacy Ops',
    accountId: '8999',
    accountName: 'Legacy Clearing',
    activity: 15000,
    status: 'Excluded',
    mappingType: 'exclude',
    netChange: 15000,
    operation: 'Legacy',
    aiConfidence: 48,
    polarity: 'Debit',
    notes: 'Excluded from mapping per client request.',
    splitDefinitions: [],
    companies: [
      { id: 'entity-legacy', company: 'Legacy Ops', balance: 15000 },
    ],
  },
];

const cloneMappingRow = (row: GLAccountMappingRow): GLAccountMappingRow => ({
  ...row,
  companies: row.companies.map(company => ({ ...company })),
  splitDefinitions: row.splitDefinitions.map(split => ({ ...split })),
});

const getSignedAmountForAccount = (
  account: GLAccountMappingRow,
  amount: number,
): number => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return account.netChange >= 0 ? amount : -amount;
};

const getSplitSignedAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => {
  if (account.netChange === 0) {
    return 0;
  }

  if (split.allocationType === 'amount') {
    const absolute = Math.max(0, Math.abs(split.allocationValue));
    const capped = Math.min(absolute, Math.abs(account.netChange));
    return getSignedAmountForAccount(account, capped);
  }

  const percentage = Math.max(0, split.allocationValue);
  const base = Math.abs(account.netChange);
  const rawAmount = (base * percentage) / 100;
  return getSignedAmountForAccount(account, rawAmount);
};

const getSplitPercentage = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => {
  if (split.allocationType === 'percentage') {
    return Math.max(0, split.allocationValue);
  }
  const base = Math.abs(account.netChange);
  if (base === 0) {
    return 0;
  }
  return (Math.abs(split.allocationValue) / base) * 100;
};

const getSplitAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => Math.abs(getSplitSignedAmount(account, split));

type BasisAccumulator = {
  id: string;
  label: string;
  value: number;
};

const findStandardScoaOption = (targetId?: string | null) => {
  if (!targetId) {
    return null;
  }
  const normalized = targetId.trim();
  if (!normalized) {
    return null;
  }
  return (
    STANDARD_CHART_OF_ACCOUNTS.find(option => option.id === normalized) ??
    STANDARD_CHART_OF_ACCOUNTS.find(option => option.value === normalized) ??
    null
  );
};

const buildBasisAccountsFromMappings = (
  accounts: GLAccountMappingRow[],
): DynamicBasisAccount[] => {
  const accumulator = new Map<string, BasisAccumulator>();

  accounts.forEach(account => {
    if (account.mappingType === 'direct') {
      if (account.status !== 'Mapped') {
        return;
      }
      const normalizedTarget = account.manualCOAId?.trim();
      if (!normalizedTarget) {
        return;
      }
      const option = findStandardScoaOption(normalizedTarget);
      const targetId = option?.id ?? normalizedTarget;
      const label = option?.label ?? normalizedTarget;
      const amount = Math.abs(account.netChange);
      if (amount <= 0) {
        return;
      }
      const existing = accumulator.get(targetId);
      if (existing) {
        existing.value += amount;
      } else {
        accumulator.set(targetId, { id: targetId, label, value: amount });
      }
      return;
    }

    if (account.mappingType === 'percentage') {
      account.splitDefinitions.forEach(split => {
        if (split.isExclusion) {
          return;
        }
        const normalizedTarget = split.targetId?.trim();
        if (!normalizedTarget) {
          return;
        }
        const option = findStandardScoaOption(normalizedTarget);
        const targetId = option?.id ?? normalizedTarget;
        const label = option?.label ?? split.targetName ?? normalizedTarget;
        const amount = getSplitAmount(account, split);
        const value = amount > 0 ? amount : 0;
        const existing = accumulator.get(targetId);
        if (existing) {
          existing.value += value;
        } else {
          accumulator.set(targetId, { id: targetId, label, value });
        }
      });
      return;
    }
  });

  return Array.from(accumulator.values())
    .map(({ id, label, value }) => ({
      id,
      name: label,
      description: label,
      value,
      mappedTargetId: id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const updateDynamicBasisAccounts = (accounts: GLAccountMappingRow[]) => {
  const basisAccounts = buildBasisAccountsFromMappings(accounts);
  useRatioAllocationStore.getState().setBasisAccounts(basisAccounts);
};

type RatioAllocationStoreState = ReturnType<typeof useRatioAllocationStore.getState>;

const getAccountExcludedAmount = (account: GLAccountMappingRow): number => {
  if (account.mappingType === 'exclude' || account.status === 'Excluded') {
    return account.netChange;
  }

  if (account.mappingType === 'percentage') {
    if (account.splitDefinitions.length === 0) {
      return 0;
    }
    const total = account.splitDefinitions
      .filter(split => split.isExclusion)
      .reduce((sum, split) => sum + getSplitSignedAmount(account, split), 0);
    return total;
  }

  if (account.mappingType === 'dynamic') {
    const resolved = Math.max(0, account.dynamicExclusionAmount ?? 0);
    return getSignedAmountForAccount(account, resolved);
  }

  return 0;
};

const getAllocatableNetChange = (account: GLAccountMappingRow): number => {
  if (account.mappingType === 'exclude' || account.status === 'Excluded') {
    return 0;
  }
  const excluded = getAccountExcludedAmount(account);
  const remaining = account.netChange - excluded;
  if (Math.abs(remaining) < 1e-6) {
    return 0;
  }
  return remaining;
};

const deriveMappingStatus = (account: GLAccountMappingRow): MappingStatus => {
  if (account.mappingType === 'exclude' || account.status === 'Excluded') {
    return 'Excluded';
  }

  if (account.mappingType === 'dynamic') {
    return account.status;
  }

  if (account.mappingType === 'percentage') {
    if (account.splitDefinitions.length === 0) {
      return 'Unmapped';
    }

    const allSplitsConfigured = account.splitDefinitions.every(split => {
      if (split.isExclusion) {
        return true;
      }
      const targetId = typeof split.targetId === 'string' ? split.targetId.trim() : '';
      return targetId.length > 0 && STANDARD_SCOA_TARGET_ID_SET.has(targetId);
    });

    if (!allSplitsConfigured) {
      return 'Unmapped';
    }

    const totalPercentage = account.splitDefinitions.reduce(
      (sum, split) => sum + getSplitPercentage(account, split),
      0,
    );

    if (Math.abs(totalPercentage - 100) > 0.01) {
      return 'Unmapped';
    }

    return 'Mapped';
  }

  const manualTarget = account.manualCOAId?.trim();

  if (!manualTarget) {
    return 'Unmapped';
  }

  if (STANDARD_SCOA_VALUE_SET.has(manualTarget)) {
    return 'Mapped';
  }

  return 'New';
};

const applyDerivedStatus = (account: GLAccountMappingRow): GLAccountMappingRow => ({
  ...account,
  status: deriveMappingStatus(account),
});

export const createInitialMappingAccounts = (): GLAccountMappingRow[] =>
  baseMappings.map(row => applyDerivedStatus(cloneMappingRow(row)));

const syncDynamicAllocationState = (
  accounts: GLAccountMappingRow[],
  rows: TrialBalanceRow[] = [],
  requestedPeriod?: string | null,
) => {
  const basisAccounts = buildBasisAccountsFromMappings(accounts);

  const sourceAccounts = accounts.map(account => ({
    id: account.id,
    name: account.accountName,
    number: account.accountId,
    description: account.accountName,
    value: account.netChange,
  }));

  const periodSet = new Set<string>();
  rows.forEach(row => {
    const glMonth = typeof row.glMonth === 'string' ? row.glMonth.trim() : '';
    if (glMonth) {
      periodSet.add(glMonth);
    }
  });

  if (requestedPeriod && requestedPeriod.trim().length > 0) {
    periodSet.add(requestedPeriod.trim());
  }

  const availablePeriods = Array.from(periodSet).sort();
  const normalizedRequested = requestedPeriod?.trim() ?? null;
  const selectedPeriod = normalizedRequested && availablePeriods.includes(normalizedRequested)
    ? normalizedRequested
    : availablePeriods[0] ?? null;

  const hydratePayload: RatioAllocationHydrationPayload = {
    basisAccounts,
    sourceAccounts,
    groups: [],
    allocations: [],
    availablePeriods,
    selectedPeriod,
  };

  useRatioAllocationStore.getState().hydrate(hydratePayload);
  useRatioAllocationStore.setState({ results: [], validationErrors: [], auditLog: [] });
};

const calculateGrossTotal = (accounts: GLAccountMappingRow[]): number =>
  accounts.reduce((sum, account) => sum + account.netChange, 0);

const calculateExcludedTotal = (accounts: GLAccountMappingRow[]): number =>
  accounts.reduce((sum, account) => sum + getAccountExcludedAmount(account), 0);

type SummarySelector = {
  totalAccounts: number;
  mappedAccounts: number;
  grossTotal: number;
  excludedTotal: number;
  netTotal: number;
};

interface MappingState {
  accounts: GLAccountMappingRow[];
  searchTerm: string;
  activeStatuses: MappingStatus[];
  activeUploadId: string | null;
  activeClientId: string | null;
  activeCompanyIds: string[];
  activePeriod: string | null;
  setSearchTerm: (term: string) => void;
  toggleStatusFilter: (status: MappingStatus) => void;
  clearStatusFilters: () => void;
  updateTarget: (id: string, coaId: string) => void;
  updatePreset: (id: string, presetId: string | null) => void;
  updateStatus: (id: string, status: MappingStatus) => void;
  updateMappingType: (id: string, mappingType: MappingType) => void;
  updatePolarity: (id: string, polarity: MappingPolarity) => void;
  updateNotes: (id: string, notes: string) => void;
  addSplitDefinition: (id: string) => void;
  updateSplitDefinition: (
    accountId: string,
    splitId: string,
    updates: Partial<MappingSplitDefinition>
  ) => void;
  removeSplitDefinition: (accountId: string, splitId: string) => void;
  applyBatchMapping: (
    ids: string[],
    updates: {
      target?: string | null;
      mappingType?: MappingType;
      presetId?: string | null;
      polarity?: MappingPolarity;
      status?: MappingStatus;
    }
  ) => void;
  applyPresetToAccounts: (ids: string[], presetId: string | null) => void;
  bulkAccept: (ids: string[]) => void;
  finalizeMappings: (ids: string[]) => boolean;
  loadImportedAccounts: (payload: {
    uploadId: string;
    clientId?: string | null;
    companyIds?: string[];
    period?: string | null;
    rows: TrialBalanceRow[];
  }) => void;
}

const mappingStatuses: MappingStatus[] = ['New', 'Unmapped', 'Mapped', 'Excluded'];

export const useMappingStore = create<MappingState>((set, get) => ({
  accounts: createInitialMappingAccounts(),
  searchTerm: '',
  activeStatuses: [],
  activeUploadId: null,
  activeClientId: null,
  activeCompanyIds: [],
  activePeriod: null,
  setSearchTerm: term => set({ searchTerm: term }),
  toggleStatusFilter: status =>
    set(state => {
      const exists = state.activeStatuses.includes(status);
      const next = exists
        ? state.activeStatuses.filter(item => item !== status)
        : [...state.activeStatuses, status];
      return { activeStatuses: next };
    }),
  clearStatusFilters: () => set({ activeStatuses: [] }),
  updateTarget: (id, coaId) =>
    set(state => {
      const accounts = state.accounts.map(account =>
        account.id === id
          ? applyDerivedStatus({ ...account, manualCOAId: coaId || undefined })
          : account,
      );
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updatePreset: (id, presetId) =>
    set(state => {
      const accounts = state.accounts.map(account =>
        account.id === id
          ? applyDerivedStatus({ ...account, presetId: presetId || undefined })
          : account,
      );
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updateStatus: (id, status) =>
    set(state => {
      const accounts = state.accounts.map(account => {
        if (account.id !== id) {
          return account;
        }

        const isExcluded = status === 'Excluded';
        const nextMappingType = isExcluded
          ? 'exclude'
          : account.mappingType === 'exclude'
            ? 'direct'
            : account.mappingType;

        return applyDerivedStatus({
          ...account,
          status,
          mappingType: nextMappingType,
          manualCOAId: isExcluded ? undefined : account.manualCOAId,
          presetId: isExcluded ? undefined : account.presetId,
          splitDefinitions: isExcluded ? [] : account.splitDefinitions,
          dynamicExclusionAmount: isExcluded ? undefined : account.dynamicExclusionAmount,
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updateMappingType: (id, mappingType) =>
    set(state => {
      const accounts = state.accounts.map(account => {
        if (account.id !== id) {
          return account;
        }

        const nextSplitDefinitions =
          mappingType === 'percentage'
            ? ensureMinimumPercentageSplits(account.splitDefinitions)
            : [];
        const nextDynamicExclusion = mappingType === 'dynamic' ? account.dynamicExclusionAmount : undefined;

        return applyDerivedStatus({
          ...account,
          mappingType,
          status:
            mappingType === 'exclude'
              ? 'Excluded'
              : account.status === 'Excluded'
                ? 'Unmapped'
                : account.status,
          manualCOAId: mappingType === 'exclude' ? undefined : account.manualCOAId,
          splitDefinitions: nextSplitDefinitions,
          dynamicExclusionAmount: nextDynamicExclusion,
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updatePolarity: (id, polarity) =>
    set(state => ({
      accounts: state.accounts.map(account =>
        account.id === id ? { ...account, polarity } : account
      ),
    })),
  updateNotes: (id, notes) =>
    set(state => ({
      accounts: state.accounts.map(account =>
        account.id === id ? { ...account, notes: notes || undefined } : account
      ),
    })),
  addSplitDefinition: id =>
    set(state => {
      const accounts = state.accounts.map(account => {
        if (account.id !== id) {
          return account;
        }
        if (account.mappingType !== 'percentage') {
          return account;
        }
        const nextSplit: MappingSplitDefinition = createBlankSplitDefinition();
        return applyDerivedStatus({
          ...account,
          splitDefinitions: [...account.splitDefinitions, nextSplit],
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updateSplitDefinition: (accountId, splitId, updates) =>
    set(state => {
      const accounts = state.accounts.map(account => {
        if (account.id !== accountId) {
          return account;
        }
        return applyDerivedStatus({
          ...account,
          splitDefinitions: account.splitDefinitions.map(split =>
            split.id === splitId
              ? {
                  ...split,
                  ...updates,
                }
              : split,
          ),
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  removeSplitDefinition: (accountId, splitId) =>
    set(state => {
      const accounts = state.accounts.map(account => {
        if (account.id !== accountId) {
          return account;
        }
        return applyDerivedStatus({
          ...account,
          splitDefinitions: account.splitDefinitions.filter(split => split.id !== splitId),
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  applyBatchMapping: (ids, updates) =>
    set(state => {
      const accounts = state.accounts.map(account => {
        if (!ids.includes(account.id)) {
          return account;
        }

        const next: GLAccountMappingRow = { ...account };

        if ('target' in updates) {
          next.manualCOAId = updates.target || undefined;
        }
        if (updates.mappingType) {
          next.mappingType = updates.mappingType;
          if (updates.mappingType === 'exclude') {
            next.splitDefinitions = [];
            next.status = 'Excluded';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.dynamicExclusionAmount = undefined;
          } else if (updates.mappingType === 'percentage') {
            next.splitDefinitions = ensureMinimumPercentageSplits(
              next.splitDefinitions,
            );
          } else if (next.status === 'Excluded') {
            next.status = 'Unmapped';
          }
        }
        if ('presetId' in updates) {
          next.presetId = updates.presetId || undefined;
          if (updates.presetId && !updates.mappingType) {
            if (next.mappingType === 'exclude') {
              next.mappingType = 'percentage';
            }
            if (next.status === 'Excluded') {
              next.status = 'Unmapped';
            }
          }
        }
        if (updates.polarity) {
          next.polarity = updates.polarity;
        }
        if (updates.status) {
          next.status = updates.status;
          if (updates.status === 'Excluded') {
            next.mappingType = 'exclude';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.splitDefinitions = [];
            next.dynamicExclusionAmount = undefined;
          } else if (next.mappingType === 'exclude') {
            next.mappingType = 'direct';
          }
        } else if (updates.mappingType && updates.mappingType !== 'exclude' && next.status === 'Excluded') {
          next.status = 'Unmapped';
        }
        if (next.mappingType !== 'percentage' && next.mappingType !== 'dynamic') {
          next.splitDefinitions = [];
          next.dynamicExclusionAmount = undefined;
        }
        if (next.mappingType !== 'dynamic') {
          next.dynamicExclusionAmount = undefined;
        }
        return applyDerivedStatus(next);
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  applyPresetToAccounts: (ids, presetId) => {
    set(state => {
      const accounts = state.accounts.map(account => {
        if (!ids.includes(account.id)) {
          return account;
        }
        if (!presetId) {
          return applyDerivedStatus({ ...account, presetId: undefined });
        }
        const nextStatus: MappingStatus = account.status === 'Excluded' ? 'Unmapped' : account.status;
        return applyDerivedStatus({
          ...account,
          mappingType: 'percentage',
          splitDefinitions: ensureMinimumPercentageSplits(
            account.splitDefinitions,
          ),
          presetId,
          status: nextStatus,
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    });
  },
  bulkAccept: ids =>
    set(state => {
      if (!ids.length) {
        return state;
      }
      const accounts = state.accounts.map(account => {
        if (!ids.includes(account.id) || !account.suggestedCOAId) {
          return account;
        }
        if (account.mappingType === 'exclude' || account.status === 'Excluded') {
          return account;
        }
        return applyDerivedStatus({
          ...account,
          manualCOAId: account.suggestedCOAId,
          status: 'Mapped',
          mappingType: account.mappingType === 'direct' ? account.mappingType : 'direct',
        });
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  finalizeMappings: ids => {
    const sourceIds = ids.length ? ids : get().accounts.map(account => account.id);
    const accounts = get().accounts.filter(account => sourceIds.includes(account.id));
    const issues = getSplitValidationIssues(accounts);
    if (issues.length > 0) {
      console.warn('Unable to finalize mappings due to split issues', issues);
      return false;
    }
    const payload = accounts
      .filter(account => account.mappingType !== 'exclude' && account.status !== 'Excluded')
      .map(account => ({
        glAccountRawId: account.id,
        coAAccountId: account.manualCOAId || account.suggestedCOAId,
        status: account.status,
        mappingType: account.mappingType,
        polarity: account.polarity,
      }));
    console.log('Finalize mappings', payload);
    return true;
  },
  loadImportedAccounts: ({ uploadId, clientId, companyIds, period, rows }) => {
    const normalizedClientId = clientId && clientId.trim().length > 0 ? clientId : null;
    const normalizedPeriod = period && period.trim().length > 0 ? period : null;
    const accounts = buildMappingRowsFromImport(rows, {
      uploadId,
      clientId: normalizedClientId,
    }).map(applyDerivedStatus);

    set({
      accounts,
      searchTerm: '',
      activeStatuses: [],
      activeUploadId: uploadId,
      activeClientId: normalizedClientId,
      activeCompanyIds: companyIds ?? [],
      activePeriod: normalizedPeriod,
    });

    syncDynamicAllocationState(accounts, rows, normalizedPeriod);
  },
}));

syncDynamicAllocationState(useMappingStore.getState().accounts);

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

const createBlankSplitDefinition = (): MappingSplitDefinition => ({
  id: createId(),
  targetId: '',
  targetName: '',
  allocationType: 'percentage',
  allocationValue: 0,
  notes: '',
  isExclusion: false,
});

const ensureMinimumPercentageSplits = (
  splits: MappingSplitDefinition[],
  minimum = 2,
): MappingSplitDefinition[] => {
  const preserved = splits.map(split => ({ ...split }));
  if (preserved.length >= minimum) {
    return preserved;
  }
  const placeholders = Array.from({ length: minimum - preserved.length }, () =>
    createBlankSplitDefinition(),
  );
  return [...preserved, ...placeholders];
};

const getSplitValidationIssues = (accounts: GLAccountMappingRow[]) => {
  const issues: { accountId: string; message: string }[] = [];
  accounts.forEach(account => {
    if (account.mappingType !== 'percentage') {
      return;
    }
    if (account.splitDefinitions.length === 0) {
      issues.push({ accountId: account.id, message: 'Missing split definitions' });
      return;
    }
    const totalPercentage = account.splitDefinitions.reduce(
      (sum, split) => sum + getSplitPercentage(account, split),
      0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      issues.push({ accountId: account.id, message: 'Split percentages must equal 100%' });
    }
  });
  return issues;
};

export const selectAccounts = (state: MappingState): GLAccountMappingRow[] => state.accounts;

export const selectTotalAccounts = (state: MappingState): number => state.accounts.length;

export const selectMappedAccounts = (state: MappingState): number =>
  state.accounts.filter(account => account.manualCOAId || account.suggestedCOAId).length;

export const selectGrossTotal = (state: MappingState): number =>
  calculateGrossTotal(state.accounts);

export const selectExcludedTotal = (state: MappingState): number =>
  calculateExcludedTotal(state.accounts);

export const selectNetTotal = (state: MappingState): number =>
  calculateGrossTotal(state.accounts) - calculateExcludedTotal(state.accounts);

export const selectStatusCounts = (state: MappingState): Record<MappingStatus, number> =>
  state.accounts.reduce<Record<MappingStatus, number>>((accumulator, account) => {
    accumulator[account.status] += 1;
    return accumulator;
  }, Object.fromEntries(mappingStatuses.map(status => [status, 0])) as Record<MappingStatus, number>);

export const selectSummaryMetrics = (state: MappingState): SummarySelector => {
  const grossTotal = calculateGrossTotal(state.accounts);
  const excludedTotal = calculateExcludedTotal(state.accounts);
  return {
    totalAccounts: state.accounts.length,
    mappedAccounts: state.accounts.filter(account => account.manualCOAId || account.suggestedCOAId).length,
    grossTotal,
    excludedTotal,
    netTotal: grossTotal - excludedTotal,
  };
};

export const selectActiveStatuses = (state: MappingState): MappingStatus[] => state.activeStatuses;

export const selectSearchTerm = (state: MappingState): string => state.searchTerm;

export const calculateSplitPercentage = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition
): number => getSplitPercentage(account, split);

export const calculateSplitAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition
): number => getSplitAmount(account, split);

export const selectSplitValidationIssues = (state: MappingState) =>
  getSplitValidationIssues(state.accounts);

export const selectAccountsRequiringSplits = (state: MappingState) =>
  state.accounts.filter(
    account =>
      account.mappingType === 'percentage' && account.splitDefinitions.length === 0
  );

export { getAccountExcludedAmount, getAllocatableNetChange };

useRatioAllocationStore.subscribe(
  (state: RatioAllocationStoreState, previousState?: RatioAllocationStoreState) => {
    const prevState = previousState ?? state;
    if (
      state.results === prevState.results &&
      state.selectedPeriod === prevState.selectedPeriod &&
      state.allocations === prevState.allocations &&
      state.basisAccounts === prevState.basisAccounts &&
      state.groups === prevState.groups &&
      state.sourceAccounts === prevState.sourceAccounts
    ) {
      return;
    }

    const { results, selectedPeriod, allocations, basisAccounts, groups, sourceAccounts } = state;

    useMappingStore.setState(currentState => {
      const dynamicAccounts = currentState.accounts.filter(
        account => account.mappingType === 'dynamic',
      );

      if (dynamicAccounts.length === 0) {
        return currentState;
      }

      const targetPeriod = currentState.activePeriod ?? selectedPeriod ?? null;
      const relevantResults =
        targetPeriod !== null
          ? results.filter(result => result.periodId === targetPeriod)
          : results;

      const allocationBySource = new Map(
        allocations.map(allocation => [allocation.sourceAccount.id, allocation]),
      );

      const exclusionTargetsByAllocation = new Map<string, Set<string>>();
      allocations.forEach(allocation => {
        const ids = allocation.targetDatapoints
          .filter(target => target.isExclusion)
          .map(target => target.datapointId);
        if (ids.length > 0) {
          exclusionTargetsByAllocation.set(allocation.id, new Set(ids));
        }
      });

      const amountByAccount = new Map<string, number>();

      relevantResults.forEach(result => {
        const allocation = allocationBySource.get(result.sourceAccountId);
        if (!allocation) {
          return;
        }

        const exclusionTargets = exclusionTargetsByAllocation.get(allocation.id);
        if (!exclusionTargets || exclusionTargets.size === 0) {
          amountByAccount.set(result.sourceAccountId, 0);
          return;
        }

        let total = 0;
        result.allocations.forEach(target => {
          if (exclusionTargets.has(target.targetId)) {
            total += target.value;
          }
        });
        if (result.adjustment && exclusionTargets.has(result.adjustment.targetId)) {
          total += result.adjustment.amount;
        }

        amountByAccount.set(result.sourceAccountId, Math.max(0, Math.abs(total)));
      });

      const groupById = new Map(groups.map(group => [group.id, group]));
      const sourceAccountById = new Map(sourceAccounts.map(account => [account.id, account]));

      dynamicAccounts.forEach(account => {
        if (amountByAccount.has(account.id)) {
          return;
        }

        const allocation = allocationBySource.get(account.id);
        if (!allocation) {
          return;
        }

        const hasExcludedTargets = allocation.targetDatapoints.some(target => target.isExclusion);
        if (!hasExcludedTargets) {
          amountByAccount.set(account.id, 0);
          return;
        }

        const basisValues = allocation.targetDatapoints.map(target => {
          if (target.groupId) {
            const group = groupById.get(target.groupId);
            if (group) {
              return getGroupTotal(group, basisAccounts, targetPeriod);
            }
            return 0;
          }
          return target.ratioMetric.value;
        });

        const basisTotal = basisValues.reduce((sum, value) => sum + value, 0);
        if (!(basisTotal > 0)) {
          amountByAccount.set(account.id, 0);
          return;
        }

        const sourceAccount = sourceAccountById.get(account.id);
        const sourceAmount = sourceAccount
          ? getSourceValue(sourceAccount, targetPeriod)
          : account.netChange;
        const allocationSource = Math.abs(sourceAmount);
        if (!(allocationSource > 0)) {
          amountByAccount.set(account.id, 0);
          return;
        }

        try {
          const computed = allocateDynamic(allocationSource, basisValues);
          let excludedTotal = 0;
          allocation.targetDatapoints.forEach((target, index) => {
            if (target.isExclusion) {
              const value = computed.allocations[index] ?? 0;
              excludedTotal += Math.max(0, Math.abs(value));
            }
          });
          amountByAccount.set(account.id, excludedTotal);
        } catch (error) {
          console.warn('Failed to derive fallback dynamic exclusion amount', error);
          amountByAccount.set(account.id, 0);
        }
      });

      let changed = false;
      const nextAccounts = currentState.accounts.map(account => {
        if (account.mappingType !== 'dynamic') {
          if (typeof account.dynamicExclusionAmount === 'number') {
            changed = true;
            return { ...account, dynamicExclusionAmount: undefined };
          }
          return account;
        }

        const allocation = allocationBySource.get(account.id);
        if (!allocation) {
          if (account.dynamicExclusionAmount !== undefined) {
            changed = true;
            return { ...account, dynamicExclusionAmount: undefined };
          }
          return account;
        }

        const exclusionTargets = exclusionTargetsByAllocation.get(allocation.id);
        if (!exclusionTargets || exclusionTargets.size === 0) {
          if ((account.dynamicExclusionAmount ?? 0) === 0) {
            return account;
          }
          changed = true;
          return { ...account, dynamicExclusionAmount: 0 };
        }

        const resolvedAmount = amountByAccount.get(account.id) ?? 0;
        if (Math.abs((account.dynamicExclusionAmount ?? 0) - resolvedAmount) < 0.0001) {
          return account;
        }

        changed = true;
        return { ...account, dynamicExclusionAmount: resolvedAmount };
      });

      if (!changed) {
        return currentState;
      }

      return { accounts: nextAccounts };
    });
  },
);
