import { create } from 'zustand';
import type { ClientProfile, UserClientAccess, UserClientCompany, UserClientOperation } from '../types';

interface ClientState {
  clients: ClientProfile[];
  activeClientId: string | null;
  isLoading: boolean;
  error: string | null;
  hydrateFromAccessList: (accessList: UserClientAccess[], activeClientId?: string | null) => void;
  setActiveClientId: (clientId: string | null) => void;
  upsertClient: (client: ClientProfile) => void;
  reset: () => void;
}

const normalizeClientId = (clientId?: string | null): string | null => {
  if (clientId == null) {
    return null;
  }

  const normalizedInput = typeof clientId === 'string' ? clientId : String(clientId);
  const trimmed = normalizedInput.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const storageKey = 'map-ledger-active-client';

const getStoredActiveClientId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeClientId(window.localStorage.getItem(storageKey));
  } catch (error) {
    console.warn('Unable to read stored active client:', error);
    return null;
  }
};

const persistActiveClientId = (clientId: string | null): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (clientId) {
      window.localStorage.setItem(storageKey, clientId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch (error) {
    console.warn('Unable to persist active client:', error);
  }
};

const initialState: Pick<ClientState, 'clients' | 'activeClientId' | 'isLoading' | 'error'> = {
  clients: [],
  activeClientId: getStoredActiveClientId(),
  isLoading: false,
  error: null,
};

const normalizeOperation = (operation: UserClientOperation): UserClientOperation => {
  const id = operation.id || operation.code || operation.name;
  const code = operation.code || id;
  const name = operation.name || code || id;
  return {
    id: id ?? crypto.randomUUID(),
    code: code ?? 'OP',
    name: name ?? 'Operation',
    operationalScac: operation.operationalScac ?? null,
    isActive: operation.isActive,
  } satisfies UserClientOperation;
};

const extractOperations = (companies: UserClientCompany[]): UserClientOperation[] => {
  const operations = new Map<string, UserClientOperation>();
  companies.forEach(company => {
    (company.operations ?? []).forEach(operation => {
      const normalized = normalizeOperation(operation);
      if (!operations.has(normalized.id)) {
        operations.set(normalized.id, normalized);
      }
    });
  });

  return Array.from(operations.values());
};

const toClientProfile = (access: UserClientAccess): ClientProfile => {
  const normalizedOperations = (access.operations ?? []).map(normalizeOperation);
  const companyOperations = extractOperations(access.companies ?? []);
  const operations = normalizedOperations.length > 0 ? normalizedOperations : companyOperations;

  return {
    id: access.clientId,
    clientId: access.clientId,
    name: access.clientName,
    scac: access.clientScac ?? null,
    operations,
  } satisfies ClientProfile;
};

export const useClientStore = create<ClientState>((set, get) => ({
  ...initialState,
  hydrateFromAccessList: (accessList, activeClientId) => {
    try {
      const mappedClients = accessList.map(toClientProfile);
      const preferredClientId = normalizeClientId(activeClientId ?? get().activeClientId);
      const resolvedActiveClientId =
        preferredClientId && mappedClients.some(client => client.clientId === preferredClientId)
          ? preferredClientId
          : mappedClients[0]?.clientId ?? null;

      set({
        clients: mappedClients,
        activeClientId: resolvedActiveClientId,
        isLoading: false,
        error: null,
      });
      persistActiveClientId(resolvedActiveClientId);
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to hydrate clients',
      });
    }
  },
  setActiveClientId: (clientId) => {
    const normalized = normalizeClientId(clientId);
    const { clients, activeClientId } = get();
    const nextActiveClientId =
      normalized === null
        ? clients[0]?.clientId ?? null
        : clients.some(client => client.clientId === normalized)
        ? normalized
        : activeClientId;

    set({ activeClientId: nextActiveClientId });
    persistActiveClientId(nextActiveClientId ?? null);
  },
  upsertClient: (client) =>
    set((state) => {
      const existingIndex = state.clients.findIndex(({ clientId }) => clientId === client.clientId);
      if (existingIndex === -1) {
        return { clients: [...state.clients, client] };
      }

      const nextClients = [...state.clients];
      nextClients[existingIndex] = client;
      return { clients: nextClients };
    }),
  reset: () => {
    persistActiveClientId(null);
    set({ ...initialState, activeClientId: null });
  },
}));
