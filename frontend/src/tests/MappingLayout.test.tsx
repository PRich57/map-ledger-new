jest.mock('exceljs', () => ({
  Workbook: jest.fn(() => ({
    addWorksheet: jest.fn(),
    getWorksheet: jest.fn(),
    xlsx: { read: jest.fn() },
  })),
}));
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { __esModule: true, ...actual, default: actual };
});
jest.mock('../store/organizationStore', () => ({
  useOrganizationStore: (selector: any) =>
    selector({ clientAccess: [], fetchForUser: jest.fn(), hydrateFromAccessList: jest.fn() }),
}));

(globalThis as any).scrollTo = jest.fn();

import { act } from 'react-dom/test-utils';
import { render, screen, waitFor } from './testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Mapping from '../pages/Mapping';
import { useClientStore } from '../store/clientStore';
import { useMappingStore, createInitialMappingAccounts } from '../store/mappingStore';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
import { useDistributionStore } from '../store/distributionStore';
import userEvent from './userEvent';

const clientSnapshot = (() => {
  const { clients } = useClientStore.getState();
  return clients.map(client => ({ ...client }));
})();

const ratioSnapshot = (() => {
  const {
    allocations,
    groups,
    basisAccounts,
    sourceAccounts,
    availablePeriods,
    selectedPeriod,
    validationErrors,
    auditLog,
  } = useRatioAllocationStore.getState();
  return {
    allocations: allocations.map(allocation => ({
      ...allocation,
      sourceAccount: { ...allocation.sourceAccount },
      targetDatapoints: allocation.targetDatapoints.map(target => ({
        ...target,
        ratioMetric: { ...target.ratioMetric },
      })),
    })),
    groups: groups.map(group => ({
      ...group,
      members: group.members.map(member => ({ ...member })),
    })),
    basisAccounts: basisAccounts.map(account => ({ ...account })),
    sourceAccounts: sourceAccounts.map(account => ({ ...account })),
    availablePeriods: availablePeriods.slice(),
    selectedPeriod,
    validationErrors: validationErrors.map(issue => ({
      ...issue,
      targetIds: issue.targetIds ? [...issue.targetIds] : undefined,
    })),
    auditLog: auditLog.map(entry => ({
      ...entry,
      sourceAccount: { ...entry.sourceAccount },
      adjustment: entry.adjustment ? { ...entry.adjustment } : undefined,
      targets: entry.targets.map(target => ({
        ...target,
        basisMembers: target.basisMembers.map(member => ({ ...member })),
      })),
    })),
  };
})();

const resetClientStore = () => {
  useClientStore.setState({
    clients: clientSnapshot.map(client => ({ ...client })),
  });
};

const resetMappingStore = () => {
  useMappingStore.setState({
    accounts: createInitialMappingAccounts(),
    searchTerm: '',
    activeStatuses: [],
    activeEntityId: null,
    activeEntities: [],
    activeUploadId: null,
  });
};

const resetRatioStore = () => {
  useRatioAllocationStore.setState({
    allocations: ratioSnapshot.allocations.map(allocation => ({
      ...allocation,
      sourceAccount: { ...allocation.sourceAccount },
      targetDatapoints: allocation.targetDatapoints.map(target => ({
        ...target,
        ratioMetric: { ...target.ratioMetric },
      })),
    })),
    groups: ratioSnapshot.groups.map(group => ({
      ...group,
      members: group.members.map(member => ({ ...member })),
    })),
    basisAccounts: ratioSnapshot.basisAccounts.map(account => ({ ...account })),
    sourceAccounts: ratioSnapshot.sourceAccounts.map(account => ({ ...account })),
    availablePeriods: ratioSnapshot.availablePeriods.slice(),
    selectedPeriod: ratioSnapshot.selectedPeriod ?? null,
    results: [],
    isProcessing: false,
    validationErrors: ratioSnapshot.validationErrors.map(issue => ({
      ...issue,
      targetIds: issue.targetIds ? [...issue.targetIds] : undefined,
    })),
    auditLog: ratioSnapshot.auditLog.map(entry => ({
      ...entry,
      sourceAccount: { ...entry.sourceAccount },
      adjustment: entry.adjustment ? { ...entry.adjustment } : undefined,
      targets: entry.targets.map(target => ({
        ...target,
        basisMembers: target.basisMembers.map(member => ({ ...member })),
      })),
    })),
  });
};

const resetDistributionStore = () => {
  useDistributionStore.setState({
    rows: [],
    operationsCatalog: [],
    searchTerm: '',
    statusFilters: [],
    currentEntityId: null,
    currentUpdatedBy: null,
    historyByAccount: {},
    historyEntityId: null,
    isAutoSaving: false,
    autoSaveMessage: null,
    isSavingDistributions: false,
    saveError: null,
    saveSuccess: null,
    lastSavedCount: 0,
  });
};

describe('Mapping page layout', () => {
  beforeEach(() => {
    resetClientStore();
    resetMappingStore();
    resetRatioStore();
    resetDistributionStore();
  });

  afterEach(() => {
    resetClientStore();
    resetMappingStore();
    resetRatioStore();
    resetDistributionStore();
  });

  it('renders full-width workspace while preserving responsive padding', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/gl/mapping/demo']}>
        <Routes>
          <Route path="/gl/mapping/:uploadId" element={<Mapping />} />
        </Routes>
      </MemoryRouter>
    );

    const page = screen.getByTestId('mapping-page');
    expect(page).toHaveClass('px-4');
    expect(page).toHaveClass('sm:px-6');
    expect(page).toHaveClass('lg:px-8');

    const workspace = screen.getByRole('region', { name: 'Mapping workspace content' });
    expect(workspace).toHaveClass('w-full');

    expect(container.querySelector('.max-w-7xl')).toBeNull();
  });

  it('switches entity tabs and scopes mapping content to the active entity', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/gl/mapping/demo']}>
        <Routes>
          <Route path="/gl/mapping/:uploadId" element={<Mapping />} />
        </Routes>
      </MemoryRouter>
    );

    const globalTab = screen.getByRole('tab', { name: 'Global Logistics' });
    const heritageTab = screen.getByRole('tab', { name: 'Heritage Transport' });

    expect(globalTab).toHaveAttribute('aria-selected', 'true');
    expect(heritageTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Fuel Expense')).toBeInTheDocument();

    await user.click(heritageTab);

    expect(globalTab).toHaveAttribute('aria-selected', 'false');
    expect(heritageTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Legacy Clearing')).toBeInTheDocument();
    expect(screen.queryByText('Fuel Expense')).not.toBeInTheDocument();
  });

  it('keeps workflow stage selection scoped to each entity tab', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/gl/mapping/demo']}>
        <Routes>
          <Route path="/gl/mapping/:uploadId" element={<Mapping />} />
        </Routes>
      </MemoryRouter>
    );

    const reviewStep = screen.getByRole('button', { name: /^Review/ });
    await user.click(reviewStep);
    expect(reviewStep).toHaveAttribute('aria-current', 'page');

    const acmeTab = screen.getByRole('tab', { name: 'Acme Freight' });
    await user.click(acmeTab);

    const mappingStep = screen.getByRole('button', { name: /^Mapping/ });
    expect(mappingStep).toHaveAttribute('aria-current', 'page');
    expect(reviewStep).not.toHaveAttribute('aria-current', 'page');

    const globalTab = screen.getByRole('tab', { name: 'Global Logistics' });
    await user.click(globalTab);

    expect(screen.getByRole('button', { name: /^Review/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a completed indicator on an entity tab once mapping and distribution are finished', () => {
    const entityId = 'entity-complete';

    act(() => {
      useMappingStore.setState(state => ({
        ...state,
        accounts: [
          {
            id: 'acct-zero',
            entityId,
            entityName: 'Complete Entity',
            accountId: '1000',
            accountName: 'Zero Balance',
            activity: 0,
            status: 'Unmapped',
            mappingType: 'direct',
            netChange: 0,
            operation: 'Ops',
            polarity: 'Debit',
            splitDefinitions: [],
            entities: [],
          },
        ],
        activeEntityId: entityId,
        activeEntities: [{ id: entityId, name: 'Complete Entity' }],
        activeEntityIds: [entityId],
        activeUploadId: 'demo',
        activeStatuses: [],
        searchTerm: '',
        activePeriod: null,
      }));
      useDistributionStore.setState(state => ({
        ...state,
        rows: [
          {
            id: 'dist-zero',
            mappingRowId: 'acct-zero',
            accountId: '1000',
            description: 'Zero balance target',
            activity: 0,
            type: 'direct',
            operations: [],
            presetId: null,
            notes: undefined,
            status: 'Undistributed',
            isDirty: false,
            autoSaveState: 'idle',
            autoSaveError: null,
          },
        ],
        searchTerm: '',
        statusFilters: [],
        currentEntityId: entityId,
      }));
    });

    render(
      <MemoryRouter initialEntries={['/gl/mapping/demo']}>
        <Routes>
          <Route path="/gl/mapping/:uploadId" element={<Mapping />} />
        </Routes>
      </MemoryRouter>,
    );

    const completeTab = screen.getByRole('tab', { name: 'Complete Entity' });
    expect(completeTab).toHaveAttribute('aria-label', 'Complete Entity, Complete');
  });

  it('hydrates entity tabs from fetched upload metadata', async () => {
    const uploadGuid = '12345678-1234-1234-1234-1234567890ab';
    const fetchMock = jest
      .spyOn(globalThis as { fetch: typeof fetch }, 'fetch')
      .mockImplementation((url: RequestInfo | URL) => {
      const target = typeof url === 'string' ? url : url.toString();

      if (target.includes('/file-records')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            fileUploadGuid: uploadGuid,
            upload: { fileName: 'import.xlsx', uploadedAt: '2024-01-01T00:00:00Z' },
            entities: [
              { id: 'north', name: 'North Division', isSelected: true },
              { id: 'south', name: 'South Division', isSelected: false },
            ],
            items: [
              {
                fileUploadGuid: uploadGuid,
                recordId: '1',
                accountId: '1000',
                accountName: 'Revenue',
                activityAmount: 1500,
                entityId: 'north',
              },
            ],
          }),
        } as any);
      }

      if (target.includes('/mapping/suggest')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: [] }) } as any);
      }

      return Promise.reject(new Error(`Unexpected fetch: ${target}`));
    });

    try {
      render(
        <MemoryRouter initialEntries={[`/gl/mapping/${uploadGuid}`]}>
          <Routes>
            <Route path="/gl/mapping/:uploadId" element={<Mapping />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await waitFor(() => expect(screen.getByRole('tab', { name: 'North Division' })).toBeInTheDocument());
      expect(screen.getByRole('tab', { name: 'South Division' })).toBeInTheDocument();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
