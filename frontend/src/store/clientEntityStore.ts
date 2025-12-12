import { create } from 'zustand';
import { ClientEntity } from '../types';
import { slugify } from '../utils/slugify';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const shouldLog =
  import.meta.env.DEV ||
  (typeof import.meta.env.VITE_ENABLE_DEBUG_LOGGING === 'string' &&
    import.meta.env.VITE_ENABLE_DEBUG_LOGGING.toLowerCase() === 'true');

const logPrefix = '[ClientEntityStore]';

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

interface ClientEntityState {
  entitiesByClient: Record<string, ClientEntity[]>;
  isLoading: boolean;
  error: string | null;
  fetchForClient: (clientId: string, options?: { force?: boolean }) => Promise<ClientEntity[]>;
  createEntity: (payload: {
    clientId: string;
    entityName: string;
    entityDisplayName?: string;
    entityStatus?: 'ACTIVE' | 'INACTIVE';
  }) => Promise<ClientEntity | null>;
  updateEntity: (payload: {
    entityId: string;
    clientId: string;
    entityName: string;
    entityDisplayName?: string;
    entityStatus?: 'ACTIVE' | 'INACTIVE';
  }) => Promise<ClientEntity | null>;
  deleteEntity: (clientId: string, entityId: string) => Promise<boolean>;
  reset: () => void;
}

interface ClientEntityResponseItem {
  entityId?: string;
  entityName?: string;
  entityDisplayName?: string;
  entityStatus?: string;
  isDeleted?: boolean;
  aliases?: string[] | string | null;
}

interface ClientEntityResponse {
  items?: ClientEntityResponseItem[];
}

const normalizeAliases = (value?: string[] | string | null): string[] => {
  if (!value) return [];
  const segments = Array.isArray(value)
    ? value
    : value
        .split(/[,;\n]/)
        .map((alias) => alias.trim())
        .filter(Boolean);

  return Array.from(new Set(segments.map((alias) => alias.trim())));
};

const toClientEntity = (item: ClientEntityResponseItem): ClientEntity => {
  const displayName = item.entityDisplayName?.trim();
  const entityName = item.entityName?.trim();
  const name = displayName || entityName || 'Unnamed Entity';
  const id = item.entityId || slugify(name) || name;
  const aliasSet = new Set([
    ...normalizeAliases(item.aliases),
    ...(displayName ? [displayName] : []),
    ...(entityName ? [entityName] : []),
  ]);
  return {
    id,
    name,
    displayName: displayName || undefined,
    entityName: entityName || undefined,
    status: item.entityStatus?.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    aliases: Array.from(aliasSet).filter(Boolean),
  };
};

export const useClientEntityStore = create<ClientEntityState>((set, get) => ({
  entitiesByClient: {},
  isLoading: false,
  error: null,
  async fetchForClient(clientId, options) {
    if (!clientId) {
      return [];
    }

    const cached = get().entitiesByClient[clientId];
    if (!options?.force && cached && cached.length > 0) {
      logDebug('Using cached entities for client', clientId);
      return cached;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(
        `${API_BASE_URL}/client-entities?clientId=${encodeURIComponent(clientId)}`,
        {
          headers: { Accept: 'application/json' },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to load client entities (${response.status})`);
      }

      const payload = (await response.json()) as ClientEntityResponse;
      const entities = (payload.items ?? [])
        .filter((item) => !item.isDeleted)
        .map(toClientEntity);

      set((state) => ({
        entitiesByClient: { ...state.entitiesByClient, [clientId]: entities },
        isLoading: false,
        error: null,
      }));

      logDebug('Fetched client entities', { clientId, count: entities.length });
      return entities;
    } catch (error) {
      logError('Unable to load client entities', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load entities',
      });
      return [];
    }
  },
  async createEntity(payload) {
    if (!payload.clientId || !payload.entityName) {
      return null;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_BASE_URL}/client-entities`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: payload.clientId,
          entityName: payload.entityName,
          entityDisplayName: payload.entityDisplayName,
          entityStatus: payload.entityStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create entity (${response.status})`);
      }

      await get().fetchForClient(payload.clientId, { force: true });

      const result = (await response.json()) as { item?: ClientEntityResponseItem };
      const entity = result.item ? toClientEntity(result.item) : null;
      logDebug('Created client entity', entity);
      return entity;
    } catch (error) {
      logError('Unable to create entity', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create entity',
      });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },
  async updateEntity(payload) {
    if (!payload.clientId || !payload.entityId || !payload.entityName) {
      return null;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_BASE_URL}/client-entities/${payload.entityId}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: payload.clientId,
          entityName: payload.entityName,
          entityDisplayName: payload.entityDisplayName,
          entityStatus: payload.entityStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update entity (${response.status})`);
      }

      await get().fetchForClient(payload.clientId, { force: true });

      const result = (await response.json()) as { item?: ClientEntityResponseItem };
      const entity = result.item ? toClientEntity(result.item) : null;
      logDebug('Updated client entity', entity);
      return entity;
    } catch (error) {
      logError('Unable to update entity', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to update entity',
      });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },
  async deleteEntity(clientId, entityId) {
    if (!clientId || !entityId) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(
        `${API_BASE_URL}/client-entities/${encodeURIComponent(entityId)}?clientId=${encodeURIComponent(clientId)}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to delete entity (${response.status})`);
      }

      await get().fetchForClient(clientId, { force: true });
      logDebug('Deleted client entity', { clientId, entityId });
      return true;
    } catch (error) {
      logError('Unable to delete entity', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to delete entity',
      });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  reset: () => set({ entitiesByClient: {}, isLoading: false, error: null }),
}));