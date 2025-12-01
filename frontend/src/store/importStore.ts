import { create } from 'zustand';
import { Import } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const shouldLog =
  import.meta.env.DEV ||
  (typeof import.meta.env.VITE_ENABLE_DEBUG_LOGGING === 'string' &&
    import.meta.env.VITE_ENABLE_DEBUG_LOGGING.toLowerCase() === 'true');

const logPrefix = '[ImportStore]';

const logDebug = (...args: unknown[]) => {
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(logPrefix, ...args);
};

const logError = (...args: unknown[]) => {
  if (!shouldLog) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(logPrefix, ...args);
};

export interface ImportHistoryResponse {
  items: Import[];
  total: number;
  page: number;
  pageSize: number;
}

export type ImportPayload = Omit<Import, 'timestamp'> & { timestamp?: string };

interface ImportState {
  imports: Import[];
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total: number;
  fetchImports: (params: {
    userId: string;
    clientId?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  recordImport: (payload: ImportPayload) => Promise<Import | null>;
  setPage: (page: number) => void;
  reset: () => void;
}

const initialState: Pick<
  ImportState,
  'imports' | 'isLoading' | 'error' | 'page' | 'pageSize' | 'total'
> = {
  imports: [],
  isLoading: false,
  error: null,
  page: 1,
  pageSize: 10,
  total: 0,
};

const buildQueryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  });
  return search.toString();
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initialState,
  setPage: (page) => set({ page }),
  fetchImports: async ({ userId, clientId, page, pageSize }) => {
    set({ isLoading: true, error: null });
    const currentPage = page ?? get().page;
    const currentPageSize = pageSize ?? get().pageSize;

    try {
      const query = buildQueryString({
        userId,
        clientId,
        page: currentPage,
        pageSize: currentPageSize,
      });

      const response = await fetch(`${API_BASE_URL}/client-files?${query}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch import history (${response.status})`);
      }

      const payload = (await response.json()) as ImportHistoryResponse;
      logDebug('Fetched import history', payload);

      set({
        imports: payload.items ?? [],
        total: payload.total ?? 0,
        page: payload.page ?? currentPage,
        pageSize: payload.pageSize ?? currentPageSize,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      logError('Unable to load import history', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load imports',
      });
    }
  },
  recordImport: async (payload) => {
    try {
      const response = await fetch(`${API_BASE_URL}/client-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to save import metadata (${response.status})`);
      }

      const body = (await response.json()) as { item?: Import };
      const saved = body.item ?? {
        ...payload,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      };

      const { page, pageSize, imports } = get();
      const nextImports = page === 1 ? [saved, ...imports].slice(0, pageSize) : imports;
      set({
        imports: nextImports,
        total: get().total + 1,
      });

      return saved;
    } catch (error) {
      logError('Unable to persist import metadata', error);
      set({ error: error instanceof Error ? error.message : 'Failed to save import' });
      return null;
    }
  },
  reset: () => set({ ...initialState }),
}));
