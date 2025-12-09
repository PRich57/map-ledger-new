import { create } from 'zustand';
import Navbar from '../components/Navbar';
import { useAuthStore } from '../store/authStore';
import { useClientStore } from '../store/clientStore';
import { useMappingStore } from '../store/mappingStore';
import type { UserClientAccess } from '../types';
import { render, screen } from './testUtils';

type MockOrganizationState = {
  companies: unknown[];
  clientAccess: UserClientAccess[];
  configsByClient: Record<string, unknown[]>;
  currentEmail: string | null;
  isLoading: boolean;
  error: string | null;
  fetchForUser: jest.Mock;
  setClientConfigurations: jest.Mock;
};

type MockMappingState = {
  activeClientId: string | null;
  setActiveClientId: jest.Mock;
};

var mockUseOrganizationStore: ReturnType<typeof create<MockOrganizationState>>;
var mockUseMappingStore: ReturnType<typeof create<MockMappingState>>;

jest.mock('../store/organizationStore', () => {
  mockUseOrganizationStore = create<MockOrganizationState>(() => ({
    companies: [],
    clientAccess: [],
    configsByClient: {},
    currentEmail: null,
    isLoading: false,
    error: null,
    fetchForUser: jest.fn(),
    setClientConfigurations: jest.fn(),
  }));

  return {
    __esModule: true,
    useOrganizationStore: mockUseOrganizationStore,
  };
});

jest.mock('../store/mappingStore', () => {
  mockUseMappingStore = create<MockMappingState>(() => ({
    activeClientId: null,
    setActiveClientId: jest.fn(),
  }));

  return {
    __esModule: true,
    useMappingStore: mockUseMappingStore,
  };
});

jest.mock('../utils/msal', () => ({
  msalInstance: {
    getActiveAccount: jest.fn(() => null),
    getAllAccounts: jest.fn(() => []),
  },
  signOut: jest.fn(),
}));

const resetStores = () => {
  useAuthStore.setState({
    account: null,
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isEmployee: false,
    isGuest: true,
    error: null,
  });

  useClientStore.setState({ clients: [], activeClientId: null, isLoading: false, error: null });

  useMappingStore.setState((state) => ({
    ...state,
    activeClientId: null,
  }));

  mockUseOrganizationStore.setState((state) => ({
    ...state,
    companies: [],
    clientAccess: [],
    configsByClient: {},
    currentEmail: null,
    isLoading: false,
    error: null,
  }));
};

describe('Navbar client dropdown', () => {
  beforeEach(() => {
    resetStores();
  });

  it('displays the SCAC returned from ML.V_CLIENT_OPERATIONS', async () => {
    const accessList: UserClientAccess[] = [
      {
        clientId: 'C1',
        clientName: 'Client Alpha',
        clientScac: 'ALPH',
        companies: [
          {
            companyId: 'AL1',
            companyName: 'Alpha Logistics',
            operations: [
              { id: 'OPS-001', code: 'OPS-001', name: 'Linehaul', operationalScac: 'AL1' },
            ],
          },
        ],
        metadata: {
          sourceAccounts: [],
          reportingPeriods: [],
          mappingTypes: [],
          targetSCoAs: [],
          polarities: [],
          presets: [],
          exclusions: [],
        },
      },
    ];

    mockUseOrganizationStore.setState((state) => ({
      ...state,
      clientAccess: accessList,
      currentEmail: 'user@example.com',
    }));

    useClientStore.getState().hydrateFromAccessList(accessList, null);

    render(<Navbar isSidebarOpen onToggleSidebar={() => {}} />);

    const select = await screen.findByLabelText('Client');
    expect(select).toBeInTheDocument();

    const optionTexts = Array.from(
      select.querySelectorAll('option'),
    ).map((option) => option.textContent?.replace(/\s+/g, ' ').trim());
    expect(optionTexts).toContain('Client Alpha (ALPH)');

    const badge = await screen.findByText('ALPH');
    expect(badge).toBeInTheDocument();
  });
});
