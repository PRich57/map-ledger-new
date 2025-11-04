import { create } from 'zustand';
import { ClientProfile } from '../types';

// Sample client data
const sampleClients: ClientProfile[] = [
  {
    id: '1',
    clientId: 'TRNS',
    industry: 'Transportation',
    name: 'TransCo Logistics',
    contactFirstName: 'John',
    contactLastName: 'Smith',
    contactEmail: 'john.smith@transco.com',
    accountingSystem: 'QuickBooks Online'
  },
  {
    id: '2',
    clientId: 'HLTH',
    industry: 'Healthcare',
    name: 'HealthCare Solutions',
    contactFirstName: 'Sarah',
    contactLastName: 'Johnson',
    contactEmail: 'sarah.j@healthcare.com',
    accountingSystem: 'Sage Intacct'
  }
];

interface ClientState {
  clients: ClientProfile[];
  addClient: (client: Omit<ClientProfile, 'id'>) => void;
  updateClient: (id: string, client: Omit<ClientProfile, 'id'>) => void;
  deleteClient: (id: string) => void;
}

export const useClientStore = create<ClientState>((set) => ({
  clients: sampleClients,
  addClient: (client) =>
    set((state) => ({
      clients: [...state.clients, { ...client, id: crypto.randomUUID() }],
    })),
  updateClient: (id, client) =>
    set((state) => ({
      clients: state.clients.map((c) => (c.id === id ? { ...client, id } : c)),
    })),
  deleteClient: (id) =>
    set((state) => ({
      clients: state.clients.filter((c) => c.id !== id),
    })),
}));