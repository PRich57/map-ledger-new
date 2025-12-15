import { fireEvent, render, screen, waitFor, within } from './testUtils';
import ReviewPane from '../components/mapping/ReviewPane';
import { useMappingStore } from '../store/mappingStore';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
import { useDistributionStore } from '../store/distributionStore';
import { exportOperationScoaWorkbook } from '../utils/exportScoaActivity';
import type { GLAccountMappingRow } from '../types';

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

const TEST_PERIOD = '2024-01-01';

const buildMappedAccounts = (): GLAccountMappingRow[] => [
  {
    id: 'acct-linehaul',
    entityId: 'entity-acme',
    entityName: 'Acme Freight',
    accountId: '4000',
    accountName: 'Linehaul Revenue',
    activity: 500000,
    status: 'Mapped',
    mappingType: 'direct',
    netChange: 500000,
    operation: 'Linehaul',
    suggestedCOAId: '4000',
    manualCOAId: '4000',
    polarity: 'Credit',
    splitDefinitions: [],
    entities: [{ id: 'entity-acme', entity: 'Acme Freight', balance: 500000 }],
    glMonth: TEST_PERIOD,
  },
  {
    id: 'acct-ss-direct',
    entityId: 'entity-acme',
    entityName: 'Acme Freight',
    accountId: '5300',
    accountName: 'Shared Services Payroll',
    activity: 60000,
    status: 'Mapped',
    mappingType: 'direct',
    netChange: 60000,
    operation: 'Shared Services',
    suggestedCOAId: '5300',
    manualCOAId: '5300',
    polarity: 'Debit',
    splitDefinitions: [],
    entities: [{ id: 'entity-acme', entity: 'Acme Freight', balance: 60000 }],
    glMonth: TEST_PERIOD,
  },
  {
    id: 'acct-ss-split',
    entityId: 'entity-acme',
    entityName: 'Acme Freight',
    accountId: '5200',
    accountName: 'Payroll Taxes',
    activity: 120000,
    status: 'Mapped',
    mappingType: 'direct',
    netChange: 120000,
    operation: 'Shared Services',
    suggestedCOAId: '5200',
    manualCOAId: '5200',
    polarity: 'Debit',
    splitDefinitions: [],
    entities: [
      { id: 'entity-acme', entity: 'Acme Freight', balance: 60000 },
      { id: 'entity-acme-ops', entity: 'Acme Freight Ops', balance: 60000 },
    ],
    glMonth: TEST_PERIOD,
  },
];

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
    accounts: buildMappedAccounts(),
    searchTerm: initialMappingSnapshot.searchTerm,
    activeStatuses: initialMappingSnapshot.activeStatuses.slice(),
    activePeriod: TEST_PERIOD,
    activeEntityId: 'entity-acme',
    activeEntities: [{ id: 'entity-acme', name: 'Acme Freight' }],
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

const buildDistributionRows = () => [
  {
    id: 'row-linehaul',
    mappingRowId: 'acct-linehaul',
    accountId: '4000',
    description: 'Linehaul Revenue',
    activity: 500000,
    type: 'direct',
    operations: [{ id: 'linehaul', code: 'Linehaul', name: 'Linehaul' }],
    status: 'Distributed',
  },
  {
    id: 'row-ss-direct',
    mappingRowId: 'acct-ss-direct',
    accountId: '5300',
    description: 'Shared Services Payroll',
    activity: 60000,
    type: 'direct',
    operations: [{ id: 'shared_services', code: 'Shared Services', name: 'Shared Services' }],
    status: 'Distributed',
  },
  {
    id: 'row-ss-split',
    mappingRowId: 'acct-ss-split',
    accountId: '5200',
    description: 'Payroll Taxes',
    activity: 120000,
    type: 'percentage',
    operations: [
      { id: 'shared_services', code: 'Shared Services', name: 'Shared Services', allocation: 50 },
      { id: 'fleet', code: 'Fleet', name: 'Fleet', allocation: 50 },
    ],
    status: 'Distributed',
  },
];

const resetDistributionStore = () => {
  useDistributionStore.setState({
    rows: buildDistributionRows(),
    searchTerm: '',
    statusFilters: [],
  });
};

describe('ReviewPane', () => {
  beforeEach(() => {
    resetStores();
    resetDistributionStore();
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

  test('shows allocated activity amounts for split distributions', () => {
    render(<ReviewPane />);

    const payrollRow = screen.getByText('Payroll Taxes').closest('tr');
    expect(payrollRow).toBeInTheDocument();
    const allocatedCell = within(payrollRow!).getByText('$60,000');
    expect(allocatedCell).toBeInTheDocument();
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
