import { create } from 'zustand';
import type { ClientProfile, UserClientAccess, UserClientCompany, UserClientOperation } from '../types';

interface ClientState {
  clients: ClientProfile[];
  isLoading: boolean;
  error: string | null;
  hydrateFromAccessList: (accessList: UserClientAccess[], activeClientId?: string | null) => void;
  upsertClient: (client: ClientProfile) => void;
  reset: () => void;
}

const initialState: Pick<ClientState, 'clients' | 'isLoading' | 'error'> = {
  clients: [],
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

const toClientProfile = (access: UserClientAccess): ClientProfile => ({
  id: access.clientId,
  clientId: access.clientId,
  name: access.clientName,
  scac: access.clientScac ?? access.clientId,
  operations: extractOperations(access.companies ?? []),
});

export const useClientStore = create<ClientState>((set) => ({
  ...initialState,
  hydrateFromAccessList: (accessList, activeClientId) => {
    try {
      const mappedClients = accessList.map(toClientProfile);
      const preferredClientId = activeClientId?.trim();
      const sortedClients = preferredClientId
        ? mappedClients.sort((a, b) => {
            if (a.clientId === preferredClientId) return -1;
            if (b.clientId === preferredClientId) return 1;
            return a.name.localeCompare(b.name);
          })
        : mappedClients;

      set({ clients: sortedClients, isLoading: false, error: null });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to hydrate clients',
      });
    }
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
  reset: () => set(initialState),
}));