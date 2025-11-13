import { create } from 'zustand';
import type {
  CompanySummary,
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
import { slugify } from '../utils/slugify';
import { getSourceValue } from '../utils/dynamicAllocation';
import { computeDynamicExclusionSummaries } from '../utils/dynamicExclusions';
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

const ensureCompanyBreakdown = (
  account: GLAccountMappingRow,
  companyId: string,
  companyName: string,
) => {
  if (!account.companies || account.companies.length === 0) {
    return [
      {
        id: companyId,
        company: companyName,
        balance: account.netChange,
      },
    ];
  }

  return account.companies.map((company, index) => {
    if (index === 0) {
      return {
        ...company,
        id: companyId,
        company: companyName,
      };
    }
    return { ...company };
  });
};

const resolveCompanyConflicts = (
  accounts: GLAccountMappingRow[],
  selectedCompanies: CompanySummary[],
): GLAccountMappingRow[] => {
  const normalized = accounts.map(account => {
    const trimmedName = account.companyName?.trim() ?? '';
    const normalizedId =
      trimmedName.length > 0
        ? account.companyId && account.companyId.length > 0
          ? account.companyId
          : slugify(trimmedName) || `unassigned-${account.id}`
        : `unassigned-${account.id}`;

    return {
      ...account,
      companyId: normalizedId,
      companyName: trimmedName,
      companies: ensureCompanyBreakdown(account, normalizedId, trimmedName),
      requiresCompanyAssignment: trimmedName.length === 0,
    };
  });

  if (selectedCompanies.length !== 1) {
    return normalized;
  }

  const groupedByAccountMonth = new Map<string, GLAccountMappingRow[]>();
  normalized.forEach(account => {
    const periodKey = account.glMonth ?? 'unspecified';
    const groupKey = `${account.accountId}__${periodKey}`;
    const group = groupedByAccountMonth.get(groupKey) ?? [];
    group.push(account);
    groupedByAccountMonth.set(groupKey, group);
  });

  groupedByAccountMonth.forEach(group => {
    if (group.length <= 1) {
      return;
    }

    const nameCounts = new Map<string, number>();
    group.forEach(account => {
      const key = account.companyName.length > 0 ? account.companyName.toLowerCase() : '__blank__';
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    });

    group.forEach(account => {
      const key = account.companyName.length > 0 ? account.companyName.toLowerCase() : '__blank__';
      if ((nameCounts.get(key) ?? 0) > 1) {
        const index = normalized.findIndex(candidate => candidate.id === account.id);
        if (index !== -1) {
          normalized[index] = {
            ...normalized[index],
            requiresCompanyAssignment: true,
          };
        }
      }
    });
  });

  return normalized;
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
  activeCompanies: CompanySummary[];
  activePeriod: string | null;
  setSearchTerm: (term: string) => void;
  setActivePeriod: (period: string | null) => void;
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
  applyMappingToMonths: (
    companyId: string,
    accountId: string,
    months: string[] | 'all',
    mapping: {
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
  updateAccountCompany: (
    accountId: string,
    payload: { companyName: string; companyId?: string | null }
  ) => void;
  loadImportedAccounts: (payload: {
    uploadId: string;
    clientId?: string | null;
    companyIds?: string[];
    companies?: CompanySummary[];
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
  activeCompanies: [],
  activePeriod: null,
  setSearchTerm: term => set({ searchTerm: term }),
  setActivePeriod: period => set({ activePeriod: period }),
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
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      // If viewing all periods, apply to all months of this account
      // If viewing specific period, only apply to this row
      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.companyId === targetAccount.companyId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        return shouldUpdate
          ? applyDerivedStatus({ ...account, manualCOAId: coaId || undefined })
          : account;
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updatePreset: (id, presetId) =>
    set(state => {
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.companyId === targetAccount.companyId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        return shouldUpdate
          ? applyDerivedStatus({ ...account, presetId: presetId || undefined })
          : account;
      });
      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updateStatus: (id, status) =>
    set(state => {
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.companyId === targetAccount.companyId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
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
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const templateSplits =
        mappingType === 'percentage'
          ? ensureMinimumPercentageSplits(targetAccount.splitDefinitions)
          : [];

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.companyId === targetAccount.companyId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        const nextSplitDefinitions =
          mappingType === 'percentage'
            ? shouldApplyToAll
              ? templateSplits.map(split => ({ ...split }))
              : ensureMinimumPercentageSplits(account.splitDefinitions)
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
    set(state => {
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      return {
        accounts: state.accounts.map(account => {
          const isSameAccount = account.companyId === targetAccount.companyId &&
                                account.accountId === targetAccount.accountId;
          const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

          return shouldUpdate ? { ...account, polarity } : account;
        }),
      };
    }),
  updateNotes: (id, notes) =>
    set(state => {
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      return {
        accounts: state.accounts.map(account => {
          const isSameAccount = account.companyId === targetAccount.companyId &&
                                account.accountId === targetAccount.accountId;
          const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

          return shouldUpdate ? { ...account, notes: notes || undefined } : account;
        }),
      };
    }),
  addSplitDefinition: id =>
    set(state => {
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount || targetAccount.mappingType !== 'percentage') {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const templateSplit = createBlankSplitDefinition();
      const updatedTargetSplits = [...targetAccount.splitDefinitions, templateSplit];
      const key = `${targetAccount.companyId}__${targetAccount.accountId}`;

      const accounts = state.accounts.map(account => {
        const matchesKey = `${account.companyId}__${account.accountId}` === key;
        const shouldUpdate = shouldApplyToAll ? matchesKey : account.id === id;

        if (!shouldUpdate || account.mappingType !== 'percentage') {
          return account;
        }

        const splitsToApply = shouldApplyToAll
          ? updatedTargetSplits.map(split => ({ ...split }))
          : [...account.splitDefinitions, { ...templateSplit }];

        return applyDerivedStatus({
          ...account,
          splitDefinitions: splitsToApply,
        });
      });

      updateDynamicBasisAccounts(accounts);
      return { accounts };
    }),
  updateSplitDefinition: (accountId, splitId, updates) =>
    set(state => {
      const targetAccount = state.accounts.find(acc => acc.id === accountId);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const updatedTargetSplits = targetAccount.splitDefinitions.map(split =>
        split.id === splitId
          ? {
              ...split,
              ...updates,
            }
          : split,
      );
      const key = `${targetAccount.companyId}__${targetAccount.accountId}`;

      const accounts = state.accounts.map(account => {
        const matchesKey = `${account.companyId}__${account.accountId}` === key;
        const shouldUpdate = shouldApplyToAll ? matchesKey : account.id === accountId;

        if (!shouldUpdate) {
          return account;
        }

        if (shouldApplyToAll) {
          return applyDerivedStatus({
            ...account,
            splitDefinitions: updatedTargetSplits.map(split => ({ ...split })),
          });
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
      const targetAccount = state.accounts.find(acc => acc.id === accountId);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const updatedTargetSplits = targetAccount.splitDefinitions.filter(split => split.id !== splitId);
      const key = `${targetAccount.companyId}__${targetAccount.accountId}`;

      const accounts = state.accounts.map(account => {
        const matchesKey = `${account.companyId}__${account.accountId}` === key;
        const shouldUpdate = shouldApplyToAll ? matchesKey : account.id === accountId;

        if (!shouldUpdate) {
          return account;
        }

        if (shouldApplyToAll) {
          return applyDerivedStatus({
            ...account,
            splitDefinitions: updatedTargetSplits.map(split => ({ ...split })),
          });
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
  applyMappingToMonths: (companyId, accountId, months, mapping) =>
    set(state => {
      const targetIds = state.accounts
        .filter(account => {
          const matchesAccount = account.companyId === companyId && account.accountId === accountId;
          if (!matchesAccount) return false;

          if (months === 'all') return true;

          return account.glMonth && months.includes(account.glMonth);
        })
        .map(account => account.id);

      const accounts = state.accounts.map(account => {
        if (!targetIds.includes(account.id)) {
          return account;
        }

        const next: GLAccountMappingRow = { ...account };

        if ('target' in mapping) {
          next.manualCOAId = mapping.target || undefined;
        }
        if (mapping.mappingType) {
          next.mappingType = mapping.mappingType;
          if (mapping.mappingType === 'exclude') {
            next.splitDefinitions = [];
            next.status = 'Excluded';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.dynamicExclusionAmount = undefined;
          } else if (mapping.mappingType === 'percentage') {
            next.splitDefinitions = ensureMinimumPercentageSplits(
              next.splitDefinitions,
            );
          } else if (next.status === 'Excluded') {
            next.status = 'Unmapped';
          }
        }
        if ('presetId' in mapping) {
          next.presetId = mapping.presetId || undefined;
          if (mapping.presetId && !mapping.mappingType) {
            if (next.mappingType === 'exclude') {
              next.mappingType = 'percentage';
            }
            if (next.status === 'Excluded') {
              next.status = 'Unmapped';
            }
          }
        }
        if (mapping.polarity) {
          next.polarity = mapping.polarity;
        }
        if (mapping.status) {
          next.status = mapping.status;
          if (mapping.status === 'Excluded') {
            next.mappingType = 'exclude';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.splitDefinitions = [];
            next.dynamicExclusionAmount = undefined;
          } else if (next.mappingType === 'exclude') {
            next.mappingType = 'direct';
          }
        } else if (mapping.mappingType && mapping.mappingType !== 'exclude' && next.status === 'Excluded') {
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
      if (!ids.length) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const keySet = shouldApplyToAll
        ? new Set(
            state.accounts
              .filter(account => ids.includes(account.id))
              .map(account => `${account.companyId}__${account.accountId}`),
          )
        : null;
      const templateSplitsByKey = new Map<string, MappingSplitDefinition[]>();
      if (shouldApplyToAll && presetId) {
        state.accounts.forEach(account => {
          if (!ids.includes(account.id)) {
            return;
          }
          const key = `${account.companyId}__${account.accountId}`;
          if (templateSplitsByKey.has(key)) {
            return;
          }
          const splits = ensureMinimumPercentageSplits(account.splitDefinitions).map(split => ({ ...split }));
          templateSplitsByKey.set(key, splits);
        });
      }

      const accounts = state.accounts.map(account => {
        const matchesDirect = ids.includes(account.id);
        const matchesKey = shouldApplyToAll
          ? keySet?.has(`${account.companyId}__${account.accountId}`)
          : false;

        if (!matchesDirect && !matchesKey) {
          return account;
        }

        if (!presetId) {
          return applyDerivedStatus({ ...account, presetId: undefined });
        }

        const nextStatus: MappingStatus = account.status === 'Excluded' ? 'Unmapped' : account.status;
        const key = `${account.companyId}__${account.accountId}`;
        const baseSplits = shouldApplyToAll
          ? templateSplitsByKey.get(key)?.map(split => ({ ...split })) ??
            ensureMinimumPercentageSplits(account.splitDefinitions)
          : ensureMinimumPercentageSplits(account.splitDefinitions);
        return applyDerivedStatus({
          ...account,
          mappingType: 'percentage',
          splitDefinitions: baseSplits,
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
  updateAccountCompany: (accountId, payload) =>
    set(state => {
      const trimmedName = payload.companyName.trim();
      const normalizedId =
        trimmedName.length > 0
          ? payload.companyId && payload.companyId.length > 0
            ? payload.companyId
            : slugify(trimmedName) || `unassigned-${accountId}`
          : `unassigned-${accountId}`;

      const accounts = state.accounts.map(account => {
        if (account.id !== accountId) {
          return account;
        }

        return {
          ...account,
          companyId: normalizedId,
          companyName: trimmedName,
          companies: ensureCompanyBreakdown(account, normalizedId, trimmedName),
        };
      });

      const resolved = resolveCompanyConflicts(accounts, state.activeCompanies);
      updateDynamicBasisAccounts(resolved);
      return { accounts: resolved };
    }),
  loadImportedAccounts: ({
    uploadId,
    clientId,
    companyIds,
    companies,
    period,
    rows,
  }) => {
    const normalizedClientId = clientId && clientId.trim().length > 0 ? clientId : null;
    const normalizedPeriod = period && period.trim().length > 0 ? period : null;

    const selectedCompanies = companies
      ? Array.from(
          new Map(
            companies.map(company => [company.id, { id: company.id, name: company.name }]),
          ).values(),
        )
      : [];

    const accountsFromImport = buildMappingRowsFromImport(rows, {
      uploadId,
      clientId: normalizedClientId,
      selectedCompanies,
    }).map(applyDerivedStatus);

    const resolvedAccounts = resolveCompanyConflicts(accountsFromImport, selectedCompanies);

    const periodSet = new Set<string>();
    resolvedAccounts.forEach(account => {
      if (account.glMonth) {
        periodSet.add(account.glMonth);
      }
    });

    const uniquePeriods = Array.from(periodSet);
    const hasMultiplePeriods = uniquePeriods.length > 1;
    const resolvedPeriod = hasMultiplePeriods
      ? null
      : normalizedPeriod ?? uniquePeriods[0] ?? null;

    const resolvedCompanyIds = companyIds ?? selectedCompanies.map(company => company.id);

    set({
      accounts: resolvedAccounts,
      searchTerm: '',
      activeStatuses: [],
      activeUploadId: uploadId,
      activeClientId: normalizedClientId,
      activeCompanyIds: resolvedCompanyIds,
      activeCompanies: selectedCompanies,
      activePeriod: resolvedPeriod,
    });

    syncDynamicAllocationState(resolvedAccounts, rows, normalizedPeriod);
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

export const selectActivePeriod = (state: MappingState): string | null => state.activePeriod;

export const selectAvailablePeriods = (state: MappingState): string[] => {
  const periodSet = new Set<string>();
  state.accounts.forEach(account => {
    if (account.glMonth) {
      periodSet.add(account.glMonth);
    }
  });
  return Array.from(periodSet).sort();
};

export const selectFilteredAccounts = (state: MappingState): GLAccountMappingRow[] => {
  if (!state.activePeriod) {
    return state.accounts;
  }
  return state.accounts.filter(account => account.glMonth === state.activePeriod);
};

export const selectAccountsByPeriod = (state: MappingState): Map<string, GLAccountMappingRow[]> => {
  const byPeriod = new Map<string, GLAccountMappingRow[]>();
  state.accounts.forEach(account => {
    const period = account.glMonth || 'unknown';
    const existing = byPeriod.get(period) || [];
    byPeriod.set(period, [...existing, account]);
  });
  return byPeriod;
};

export const selectAccountHasMultiplePeriods = (
  state: MappingState,
  companyId: string,
  accountId: string
): boolean => {
  const periods = new Set<string>();
  state.accounts.forEach(account => {
    if (account.companyId === companyId && account.accountId === accountId && account.glMonth) {
      periods.add(account.glMonth);
    }
  });
  return periods.size > 1;
};

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

      const summaries = computeDynamicExclusionSummaries({
        accounts: dynamicAccounts,
        allocations,
        basisAccounts,
        groups,
        selectedPeriod: targetPeriod,
        results: relevantResults,
      });

      const sourceAccountLookup = new Map(sourceAccounts.map(account => [account.id, account]));

      let changed = false;
      const nextAccounts = currentState.accounts.map(account => {
        if (account.mappingType !== 'dynamic') {
          if (typeof account.dynamicExclusionAmount === 'number') {
            changed = true;
            return { ...account, dynamicExclusionAmount: undefined };
          }
          return account;
        }

        const summary = summaries.get(account.id);
        if (!summary) {
          if ((account.dynamicExclusionAmount ?? 0) === 0) {
            return account;
          }
          changed = true;
          return { ...account, dynamicExclusionAmount: 0 };
        }

        const ratio = summary.percentage;
        const sourceAccount = sourceAccountLookup.get(account.id);
        const sourceValue = sourceAccount
          ? Math.abs(getSourceValue(sourceAccount, targetPeriod))
          : Math.abs(account.netChange);
        const resolvedAmount = sourceValue > 0 ? ratio * sourceValue : 0;

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