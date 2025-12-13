import { fireEvent, render, screen, waitFor } from './testUtils';
import ReviewPane from '../components/mapping/ReviewPane';
import { useMappingStore } from '../store/mappingStore';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
import { exportOperationScoaWorkbook } from '../utils/exportScoaActivity';

jest.mock('../utils/exportScoaActivity', () => {
  const actual = jest.requireActual('../utils/exportScoaActivity');
  return {
    __esModule: true,
    ...actual,
    exportOperationScoaWorkbook: jest.fn(async () => undefined),
  };
});

const initialMappingSnapshot = (() => {
  const snapshot = useMappingStore.getState();
  return {
    accounts: snapshot.accounts.map(account => ({
      ...account,
      companies: account.companies.map(company => ({ ...company })),
      splitDefinitions: account.splitDefinitions.map(split => ({ ...split })),
    })),
    searchTerm: snapshot.searchTerm,
    activeStatuses: snapshot.activeStatuses.slice(),
  };
})();

const initialRatioSnapshot = (() => {
  const snapshot = useRatioAllocationStore.getState();
  return {
    allocations: snapshot.allocations.map(allocation => ({
      ...allocation,
      sourceAccount: { ...allocation.sourceAccount },
      targetDatapoints: allocation.targetDatapoints.map(target => ({
        ...target,
        ratioMetric: { ...target.ratioMetric },
      })),
    })),
    groups: snapshot.groups.map(group => ({
      ...group,
      members: group.members.map(member => ({ ...member })),
    })),
    basisAccounts: snapshot.basisAccounts.map(account => ({ ...account })),
    sourceAccounts: snapshot.sourceAccounts.map(account => ({ ...account })),
    availablePeriods: snapshot.availablePeriods.slice(),
    selectedPeriod: snapshot.selectedPeriod,
    results: snapshot.results.map(result => ({
      ...result,
      allocations: result.allocations.map(allocation => ({ ...allocation })),
    })),
    isProcessing: snapshot.isProcessing,
    validationErrors: snapshot.validationErrors.map(issue => ({
      ...issue,
      targetIds: issue.targetIds ? [...issue.targetIds] : undefined,
    })),
    auditLog: snapshot.auditLog.map(entry => ({
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

const resetStores = () => {
  useMappingStore.setState({
    accounts: initialMappingSnapshot.accounts.map(account => ({
      ...account,
      companies: account.companies.map(company => ({ ...company })),
      splitDefinitions: account.splitDefinitions.map(split => ({ ...split })),
    })),
    searchTerm: initialMappingSnapshot.searchTerm,
    activeStatuses: initialMappingSnapshot.activeStatuses.slice(),
  });

  useRatioAllocationStore.setState({
    allocations: initialRatioSnapshot.allocations.map(allocation => ({
      ...allocation,
      sourceAccount: { ...allocation.sourceAccount },
      targetDatapoints: allocation.targetDatapoints.map(target => ({
        ...target,
        ratioMetric: { ...target.ratioMetric },
      })),
    })),
    groups: initialRatioSnapshot.groups.map(group => ({
      ...group,
      members: group.members.map(member => ({ ...member })),
    })),
    basisAccounts: initialRatioSnapshot.basisAccounts.map(account => ({ ...account })),
    sourceAccounts: initialRatioSnapshot.sourceAccounts.map(account => ({ ...account })),
    availablePeriods: initialRatioSnapshot.availablePeriods.slice(),
    selectedPeriod: initialRatioSnapshot.selectedPeriod,
    results: initialRatioSnapshot.results.map(result => ({
      ...result,
      allocations: result.allocations.map(allocation => ({ ...allocation })),
    })),
    isProcessing: false,
    validationErrors: initialRatioSnapshot.validationErrors.map(issue => ({
      ...issue,
      targetIds: issue.targetIds ? [...issue.targetIds] : undefined,
    })),
    auditLog: initialRatioSnapshot.auditLog.map(entry => ({
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

describe('ReviewPane', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders per-operation sections and publish log', () => {
    render(<ReviewPane />);

    expect(screen.getByRole('heading', { name: /Operation Linehaul/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Operation Shared Services/i })).toBeInTheDocument();
    expect(screen.getByText('Publish log')).toBeInTheDocument();
    expect(screen.getByText('Acme Freight')).toBeInTheDocument();
  });

  test('runs checks and updates status message', () => {
    render(<ReviewPane />);

    const runChecks = screen.getByText('Run checks');
    fireEvent.click(runChecks);

    expect(
      screen.getByText(/Validation checks passed|Checks completed/i)
    ).toBeInTheDocument();
  });

  test('publishes mappings when no warnings exist', () => {
    render(<ReviewPane />);

    const publishButton = screen.getByText('Publish mappings');
    fireEvent.click(publishButton);

    expect(screen.getByText('Mappings published successfully.')).toBeInTheDocument();
  });

  test('renders per-operation totals for mapped activity', () => {
    render(<ReviewPane />);

    expect(screen.getByText(/\$500,000 total mapped activity/i)).toBeInTheDocument();
    expect(screen.getByText(/\$120,000 total mapped activity/i)).toBeInTheDocument();
  });

  test('exports SCoA activity when export button is clicked', async () => {
    const mockedExport = exportOperationScoaWorkbook as jest.MockedFunction<
      typeof exportOperationScoaWorkbook
    >;
    mockedExport.mockResolvedValue();

    render(<ReviewPane />);

    const exportButton = screen.getByRole('button', { name: /Download SCoA export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockedExport).toHaveBeenCalled();
    });
  });
});
