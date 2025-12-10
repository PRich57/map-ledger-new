import { create } from 'zustand';
import type { ChartOfAccount, ChartOfAccountOption } from '../types';
import {
  fetchChartOfAccounts,
  loadCachedChartOfAccounts,
} from '../services/chartOfAccountsService';
import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';

interface ChartOfAccountIndex {
  byId: Record<string, ChartOfAccountOption>;
  byValue: Record<string, ChartOfAccountOption>;
}

interface ChartOfAccountsState {
  accounts: ChartOfAccount[];
  options: ChartOfAccountOption[];
  lastFetched: number | null;
  isLoading: boolean;
  error: string | null;
  optionIndex: ChartOfAccountIndex;
  initialize: (forceRefresh?: boolean) => Promise<void>;
}

const buildOptionLabel = (accountNumber: string, description?: string | null): string => {
  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    return trimmedDescription;
  }
  if (accountNumber) {
    return accountNumber;
  }
  return 'Unknown account';
};

const toOption = (account: ChartOfAccount): ChartOfAccountOption => {
  const accountNumber = account.accountNumber?.trim() || '';
  const label = buildOptionLabel(accountNumber, account.description);
  const fallbackValue = account.description ?? accountNumber ?? 'account';

  return {
    id: accountNumber || String(fallbackValue),
    value: accountNumber || String(fallbackValue),
    label,
    accountNumber,
    coreAccount: account.coreAccount ?? null,
    operationalGroup: account.operationalGroup ?? null,
    laborGroup: account.laborGroup ?? null,
    accountType: account.accountType ?? null,
    category: account.category ?? null,
    subCategory: account.subCategory ?? null,
    description: account.description ?? null,
  };
};

const buildIndex = (options: ChartOfAccountOption[]): ChartOfAccountIndex => {
  const byId: Record<string, ChartOfAccountOption> = {};
  const byValue: Record<string, ChartOfAccountOption> = {};

  options.forEach((option) => {
    const normalizedId = option.id.trim();
    const normalizedValue = option.value.trim();
    if (normalizedId) {
      byId[normalizedId] = option;
    }
    if (normalizedValue) {
      byValue[normalizedValue] = option;
    }
  });

  return { byId, byValue };
};

const buildFallbackAccounts = (): ChartOfAccount[] =>
  STANDARD_CHART_OF_ACCOUNTS.map((option) => ({
    accountNumber: option.value,
    coreAccount: null,
    operationalGroup: null,
    laborGroup: null,
    accountType: null,
    category: null,
    subCategory: null,
    description: option.label,
  }));

const hydrateInitialState = () => {
  const cached = loadCachedChartOfAccounts();
  if (cached) {
    const options = cached.accounts.map(toOption);
    return {
      accounts: cached.accounts,
      options,
      lastFetched: cached.fetchedAt,
      optionIndex: buildIndex(options),
    };
  }

  const fallbackAccounts = buildFallbackAccounts();
  const options = fallbackAccounts.map(toOption);
  return {
    accounts: fallbackAccounts,
    options,
    lastFetched: null,
    optionIndex: buildIndex(options),
  };
};

const initial = hydrateInitialState();

export const useChartOfAccountsStore = create<ChartOfAccountsState>((set) => ({
  accounts: initial.accounts,
  options: initial.options,
  lastFetched: initial.lastFetched,
  optionIndex: initial.optionIndex,
  isLoading: false,
  error: null,
  initialize: async (forceRefresh: boolean = false) => {
    set({ isLoading: true, error: null });

    try {
      const { accounts, fetchedAt } = await fetchChartOfAccounts(forceRefresh);
      const options = accounts.map(toOption);
      set({
        accounts,
        options,
        lastFetched: fetchedAt,
        optionIndex: buildIndex(options),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load chart of accounts';
      set({
        isLoading: false,
        error: message,
      });
    }
  },
}));

export const getChartOfAccountOptions = (): ChartOfAccountOption[] =>
  useChartOfAccountsStore.getState().options;

const normalizeKey = (value?: string | null) => (typeof value === 'string' ? value.trim() : '');

export const findChartOfAccountOption = (
  value?: string | null
): ChartOfAccountOption | null => {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return null;
  }
  const { optionIndex } = useChartOfAccountsStore.getState();
  return optionIndex.byId[normalized] ?? optionIndex.byValue[normalized] ?? null;
};

export const isKnownChartOfAccount = (value?: string | null): boolean => {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return false;
  }
  const { optionIndex } = useChartOfAccountsStore.getState();
  return Boolean(optionIndex.byId[normalized] || optionIndex.byValue[normalized]);
};
