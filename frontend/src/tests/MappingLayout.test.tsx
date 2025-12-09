import { render, screen } from './testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Mapping from '../pages/Mapping';
import { useClientStore } from '../store/clientStore';
import { useMappingStore, createInitialMappingAccounts } from '../store/mappingStore';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
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

describe('Mapping page layout', () => {
  beforeEach(() => {
    resetClientStore();
    resetMappingStore();
    resetRatioStore();
  });

  afterEach(() => {
    resetClientStore();
    resetMappingStore();
    resetRatioStore();
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
});