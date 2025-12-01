import type { ChartOfAccount } from '../types';

const resolveApiBaseUrl = (): string | undefined => {
  const metaEnv = (globalThis as any)?.importMetaEnv;
  if (metaEnv && typeof metaEnv.VITE_API_BASE_URL === 'string') {
    return metaEnv.VITE_API_BASE_URL;
  }

  if (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) {
    return process.env.VITE_API_BASE_URL;
  }

  return undefined;
};

const API_BASE_URL = resolveApiBaseUrl() ?? '/api';
const CACHE_KEY = 'ml_chart_of_accounts_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export interface ChartOfAccountCacheEntry {
  fetchedAt: number;
  accounts: ChartOfAccount[];
}

const normalizeAccount = (account: Record<string, unknown>): ChartOfAccount => {
  const getValue = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = account[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }
    return null;
  };

  return {
    accountNumber: getValue(['accountNumber', 'ACCOUNT_NUMBER']) ?? '',
    coreAccount: getValue(['coreAccount', 'CORE_ACCOUNT']),
    operationalGroup: getValue(['operationalGroup', 'OPERATIONAL_GROUP']),
    laborGroup: getValue(['laborGroup', 'LABOR_GROUP']),
    accountType: getValue(['accountType', 'ACCOUNT_TYPE']),
    category: getValue(['category', 'CATEGORY']),
    subCategory: getValue(['subCategory', 'SUB_CATEGORY']),
    description: getValue(['description', 'DESCRIPTION']),
  };
};

const readCache = (): ChartOfAccountCacheEntry | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ChartOfAccountCacheEntry;
    if (!parsed || !Array.isArray(parsed.accounts)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('[ChartOfAccountsService] Failed to read cache', error);
    return null;
  }
};

export const clearChartOfAccountsCache = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('[ChartOfAccountsService] Failed to clear cache', error);
  }
};

const writeCache = (entry: ChartOfAccountCacheEntry) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (error) {
    console.warn('[ChartOfAccountsService] Failed to write cache', error);
  }
};

const isCacheValid = (entry: ChartOfAccountCacheEntry | null): entry is ChartOfAccountCacheEntry => {
  if (!entry) {
    return false;
  }
  if (!entry.fetchedAt || !Array.isArray(entry.accounts)) {
    return false;
  }
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
};

export const loadCachedChartOfAccounts = (): ChartOfAccountCacheEntry | null => {
  const cached = readCache();
  if (!cached) {
    return null;
  }
  if (!isCacheValid(cached)) {
    return null;
  }
  return cached;
};

export const fetchChartOfAccounts = async (
  forceRefresh: boolean = false
): Promise<ChartOfAccountCacheEntry> => {
  const cached = readCache();
  if (!forceRefresh && isCacheValid(cached)) {
    return cached as ChartOfAccountCacheEntry;
  }

  const response = await fetch(`${API_BASE_URL}/chart-of-accounts`);
  if (!response.ok) {
    if (cached) {
      return cached;
    }
    throw new Error(`Failed to fetch chart of accounts: ${response.statusText}`);
  }

  const payload = (await response.json()) as { accounts?: Record<string, unknown>[] };
  const normalized = (payload.accounts ?? []).map(normalizeAccount);
  const entry: ChartOfAccountCacheEntry = {
    fetchedAt: Date.now(),
    accounts: normalized,
  };
  writeCache(entry);
  return entry;
};
