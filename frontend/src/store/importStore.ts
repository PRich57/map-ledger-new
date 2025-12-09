import { create } from 'zustand';
import { Import } from '../types';

const resolveMetaEnv = () => {
  const globalMetaEnv = (globalThis as { importMetaEnv?: Record<string, unknown> }).importMetaEnv;
  if (globalMetaEnv && typeof globalMetaEnv === 'object') {
    return globalMetaEnv as Record<string, unknown>;
  }

  if (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, unknown> }).env) {
    return (import.meta as { env: Record<string, unknown> }).env;
  }

  return undefined;
};

const metaEnv = resolveMetaEnv();
const API_BASE_URL = (metaEnv?.VITE_API_BASE_URL as string | undefined) ?? '/api';

const shouldLog =
  Boolean(metaEnv?.DEV) ||
  (typeof metaEnv?.VITE_ENABLE_DEBUG_LOGGING === 'string' &&
    (metaEnv.VITE_ENABLE_DEBUG_LOGGING as string).toLowerCase() === 'true');

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
  items: RawImport[];
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
  deleteImport: (importId: string) => Promise<void>;
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

type RawImport = Import & {
  insertedBy?: string;
  insertedDttm?: string;
  lastStepCompletedDttm?: string;
  fileUploadGuid?: string;
  sourceFileName?: string;
  fileStatus?: string;
  clientName?: string;
  glPeriodStart?: string;
  glPeriodEnd?: string;
};

const normalizeImport = (item: RawImport): Import => {
  const parsedTimestamp = item.timestamp ?? item.insertedDttm ?? item.lastStepCompletedDttm;
  const timestamp = parsedTimestamp && !Number.isNaN(new Date(parsedTimestamp).getTime())
    ? new Date(parsedTimestamp).toISOString()
    : new Date().toISOString();

  const period = item.period
    || [item.glPeriodStart, item.glPeriodEnd].filter(Boolean).join(' - ')
    || '';

  const fileSize = Number(item.fileSize);
  const status: Import['status'] = item.status === 'failed' ? 'failed' : 'completed';

  const resolvedId = item.fileUploadGuid ?? item.id ?? crypto.randomUUID();

  return {
    ...item,
    id: resolvedId,
    fileUploadGuid: item.fileUploadGuid ?? item.id ?? resolvedId,
    clientId: item.clientId,
    clientName: item.clientName,
    fileName: item.fileName ?? item.sourceFileName ?? 'Unknown file',
    fileSize: Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : 0,
    fileType: item.fileType ?? 'Unknown type',
    period,
    timestamp,
    insertedDttm: item.insertedDttm ?? timestamp,
    status,
    importedBy: item.importedBy ?? item.insertedBy ?? '',
    userId: item.userId ?? '',
  };
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

      const normalizedItems = (payload.items ?? []).map((item) => normalizeImport(item as RawImport));

      set({
        imports: normalizedItems,
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
      const saved = normalizeImport(
        (body.item ?? {
          ...payload,
          timestamp: payload.timestamp ?? new Date().toISOString(),
        }) as RawImport
      );

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
  deleteImport: async (importId) => {
    if (!importId) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/client-files/${importId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete import (${response.status})`);
      }

      set((state) => {
        const remainingImports = state.imports.filter((item) => item.id !== importId);

        return {
          imports: remainingImports,
          total: Math.max(0, state.total - 1),
          page: state.page,
        };
      });
    } catch (error) {
      logError('Unable to delete import', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete import',
      });
      throw error;
    }
  },
  reset: () => set({ ...initialState }),
}));
