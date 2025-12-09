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

const initialState: Pick<ClientState, 'clients' | 'activeClientId' | 'isLoading' | 'error'> = {
  clients: [],
  activeClientId: null,
  isLoading: false,
  error: null,
};

const normalizeClientId = (clientId?: string | null): string | null => {
  if (!clientId) {
    return null;
  }
  const trimmed = clientId.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to hydrate clients',
      });
    }
  },
  setActiveClientId: clientId =>
    set(state => {
      const normalized = normalizeClientId(clientId);
      if (normalized === null) {
        return { activeClientId: state.clients[0]?.clientId ?? null };
      }

      const exists = state.clients.some(client => client.clientId === normalized);
      return { activeClientId: exists ? normalized : state.activeClientId };
    }),
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