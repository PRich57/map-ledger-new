import { act, fireEvent, render, screen, within } from './testUtils';
import DistributionTable from '../components/mapping/DistributionTable';
import { selectDistributionProgress, useDistributionStore } from '../store/distributionStore';
import { createInitialMappingAccounts, useMappingStore } from '../store/mappingStore';
import { useOrganizationStore } from '../store/organizationStore';
import type { DistributionRow, DistributionStatus } from '../types';

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

const resetOrganizationStore = () => {
  useOrganizationStore.setState({
    companies: [],
    clientAccess: [],
    configsByClient: {},
    currentEmail: null,
    isLoading: false,
    error: null,
  });
};

const seedOrganizationStore = () => {
  resetOrganizationStore();
  useOrganizationStore.setState({
    companies: [
      {
        id: 'company-1',
        name: 'Test Logistics',
        clients: [
          {
            id: 'client-1',
            name: 'Client One',
            operations: [
              { id: 'ops-log', code: 'OP-LOG', name: 'Logistics' },
              { id: 'ops-otr', code: 'OP-OTR', name: 'Over-the-Road' },
              { id: 'ops-ded', code: 'OP-DED', name: 'Dedicated' },
              { id: 'ops-ltl', code: 'OP-LTL', name: 'Less-than-Truckload' },
              { id: 'ops-int', code: 'OP-INT', name: 'Intermodal' },
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
        ],
      },
    ],
  });
};

const SEGMENTED_ACCOUNT_IDS = ['1111-11', '1111-0-0', '1111-0-0-11', '2222.22.22'];

const seedMappingStore = (accountIds: string[] = SEGMENTED_ACCOUNT_IDS) => {
  const baseAccounts = createInitialMappingAccounts();
  const accounts = baseAccounts.map((account, index) => ({
    ...account,
    accountId: accountIds[index % accountIds.length],
  }));
  useMappingStore.setState({
    accounts,
    activeEntityId: null,
    activePeriod: null,
    searchTerm: '',
    activeStatuses: [],
    userDefinedHeaders: [],
  });
};

const CUSTOM_DISTRIBUTION_ROWS: DistributionRow[] = [
  {
    id: 'custom-row-distributed',
    mappingRowId: 'custom-mapping-1',
    accountId: 'ACC-001',
    description: 'Distributed account description',
    activity: 500,
    type: 'direct',
    operations: [{ id: 'OP-001', code: 'OP-001', name: 'Operation 001' }],
    presetId: null,
    notes: undefined,
    status: 'Distributed',
    isDirty: false,
    autoSaveState: 'idle',
    autoSaveError: null,
  },
  {
    id: 'custom-row-undistributed',
    mappingRowId: 'custom-mapping-2',
    accountId: 'ACC-002',
    description: 'Undistributed account description',
    activity: 200,
    type: 'direct',
    operations: [],
    presetId: null,
    notes: undefined,
    status: 'Undistributed',
    isDirty: false,
    autoSaveState: 'idle',
    autoSaveError: null,
  },
];

const applyCustomDistributionRows = () => {
  act(() => {
    useDistributionStore.setState({
      rows: CUSTOM_DISTRIBUTION_ROWS,
      searchTerm: '',
      statusFilters: [],
    });
  });
};

const NORMALIZED_STATUS_ROWS: DistributionRow[] = [
  {
    id: 'normalized-row-distributed',
    mappingRowId: 'normalized-mapping-1',
    accountId: 'ACC-003',
    description: 'Normalized distributed account',
    activity: 300,
    type: 'direct',
    operations: [{ id: 'OP-102', code: 'OP-102', name: 'Normalized Operation' }],
    presetId: null,
    notes: undefined,
    status: ' distributed ' as unknown as DistributionStatus,
    isDirty: false,
    autoSaveState: 'idle',
    autoSaveError: null,
  },
  {
    id: 'normalized-row-undistributed',
    mappingRowId: 'normalized-mapping-2',
    accountId: 'ACC-004',
    description: 'Normalized undistributed account',
    activity: 100,
    type: 'direct',
    operations: [],
    presetId: null,
    notes: undefined,
    status: 'UNDISTRIBUTED' as unknown as DistributionStatus,
    isDirty: false,
    autoSaveState: 'idle',
    autoSaveError: null,
  },
];

const applyNormalizedStatusRows = () => {
  act(() => {
    useDistributionStore.setState({
      rows: NORMALIZED_STATUS_ROWS,
      searchTerm: '',
      statusFilters: [],
    });
  });
};

const NO_BALANCE_ROWS: DistributionRow[] = [
  {
    id: 'custom-row-no-balance',
    mappingRowId: 'custom-mapping-3',
    accountId: 'ACC-003',
    description: 'No balance account description',
    activity: 0,
    type: 'direct',
    operations: [],
    presetId: null,
    notes: undefined,
    status: 'No balance',
    isDirty: false,
    autoSaveState: 'idle',
    autoSaveError: null,
  },
  {
    id: 'custom-row-distributed-2',
    mappingRowId: 'custom-mapping-4',
    accountId: 'ACC-004',
    description: 'Another distributed account description',
    activity: 150,
    type: 'direct',
    operations: [{ id: 'OP-002', code: 'OP-002', name: 'Operation 002' }],
    presetId: null,
    notes: undefined,
    status: 'Distributed',
    isDirty: false,
    autoSaveState: 'idle',
    autoSaveError: null,
  },
];

const applyNoBalanceRows = () => {
  act(() => {
    useDistributionStore.setState({
      rows: NO_BALANCE_ROWS,
      searchTerm: '',
      statusFilters: [],
    });
  });
};

describe('DistributionTable', () => {
  beforeEach(() => {
    resetDistributionStore();
    seedOrganizationStore();
    seedMappingStore();
  });

  test('renders distribution rows with required columns', async () => {
    render(<DistributionTable />);

    expect(screen.getByText('GL Account')).toBeInTheDocument();
    expect(screen.getByText('GL Description')).toBeInTheDocument();
    expect(screen.getByText('SCoA ID')).toBeInTheDocument();
    expect(screen.getByText('SCoA Description')).toBeInTheDocument();
    expect(
      await screen.findByText('FREIGHT REVENUE LINEHAUL - COMPANY FLEET'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET'),
    ).toBeInTheDocument();
    const splitToggle = screen.getByRole('button', { name: /Split GL Account/i });
    fireEvent.click(splitToggle);
    expect(screen.getAllByRole('button', { name: /Filter GL Segment/i })).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Sort GL Segment 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sort GL Segment 4/i })).toBeInTheDocument();
  });

  test('allows editing operations for percentage rows', async () => {
    render(<DistributionTable />);

    const driverCell = await screen.findByText(
      'DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET',
    );
    const driverRow = driverCell.closest('tr');
    expect(driverRow).not.toBeNull();

    const toggleButton = within(driverRow as HTMLTableRowElement).getByLabelText(/operations for/i);
    fireEvent.click(toggleButton);

    const detailHeading = await screen.findByRole('heading', {
      name: /distribution details for/i,
    });
    const detailRow = detailHeading.closest('tr');
    expect(detailRow).not.toBeNull();

    const addOperationButton = within(detailRow as HTMLTableRowElement).getByRole('button', {
      name: /add operation/i,
    });
    fireEvent.click(addOperationButton);

    const [operationSelect] = within(detailRow as HTMLTableRowElement).getAllByLabelText(
      'Select target operation',
    );
    fireEvent.change(operationSelect, { target: { value: 'OP-INT' } });

    const [allocationInput] = within(detailRow as HTMLTableRowElement).getAllByLabelText(
      'Enter allocation percentage',
    );
    fireEvent.change(allocationInput, { target: { value: '25' } });
    fireEvent.blur(allocationInput);

    fireEvent.click(screen.getByText('Save operations'));

    expect(await screen.findByText(/OP-INT.*25%/i)).toBeInTheDocument();
  });

  test('opens dynamic allocation builder for dynamic rows', async () => {
    render(<DistributionTable />);

    const fuelCell = await screen.findByText('FUEL EXPENSE - COMPANY FLEET');
    const fuelRow = fuelCell.closest('tr');
    expect(fuelRow).not.toBeNull();

    const toggleButton = within(fuelRow as HTMLTableRowElement).getByLabelText(/operations for/i);
    fireEvent.click(toggleButton);

    const builderButton = await screen.findByText('Open preset builder');
    fireEvent.click(builderButton);

    expect(await screen.findByText('Dynamic allocations')).toBeInTheDocument();
    expect(await screen.findByText('Target operation')).toBeInTheDocument();
  });

  test('treats zero-activity rows as distributed for completion calculations', () => {
    resetDistributionStore();
    act(() => {
      useDistributionStore.setState(state => ({
        ...state,
        rows: [
          {
            id: 'row-zero',
            mappingRowId: 'map-zero',
            accountId: 'ZERO',
            description: 'Zero activity row',
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
      }));
    });

    const progress = selectDistributionProgress(useDistributionStore.getState());
    expect(progress.distributedRows).toBe(1);
    expect(progress.isComplete).toBe(true);
  });

  test('sorts distribution rows by activity when the column header is clicked', async () => {
    const { container } = render(<DistributionTable />);
    applyCustomDistributionRows();
    await screen.findByText('Distributed account description');

    const columnIndex = Array.from(container.querySelectorAll('thead th')).findIndex(header =>
      header.textContent?.includes('SCoA ID'),
    ) + 1;
    expect(columnIndex).toBeGreaterThan(0);

    const getVisibleAccountOrder = (): string[] =>
      Array.from(container.querySelectorAll('tbody tr'))
        .map(row => row.querySelector(`td:nth-child(${columnIndex})`))
        .filter((cell): cell is HTMLElement => cell !== null)
        .map(cell => cell.textContent?.trim() ?? '')
        .filter(Boolean);

    const activityHeader = screen.getByRole('button', { name: /Activity/i });
    fireEvent.click(activityHeader);
    expect(getVisibleAccountOrder()).toEqual(['ACC-002', 'ACC-001']);
    fireEvent.click(activityHeader);
    expect(getVisibleAccountOrder()).toEqual(['ACC-001', 'ACC-002']);
  });

  test('filters distribution rows based on status toggles', async () => {
    render(<DistributionTable />);
    applyCustomDistributionRows();
    await screen.findByText('Distributed account description');

    const distributedFilter = screen.getByRole('button', { name: /^Distributed$/i });
    const undistributedFilter = screen.getByRole('button', { name: /^Undistributed$/i });
    const clearFiltersButton = screen.getByRole('button', { name: /Clear filters/i });

    fireEvent.click(distributedFilter);
    expect(screen.getByText('Distributed account description')).toBeInTheDocument();
    expect(screen.queryByText('Undistributed account description')).toBeNull();

    fireEvent.click(clearFiltersButton);
    fireEvent.click(undistributedFilter);
    expect(screen.getByText('Undistributed account description')).toBeInTheDocument();
    expect(screen.queryByText('Distributed account description')).toBeNull();
  });

  test('filters distribution rows based on no balance status', async () => {
    render(<DistributionTable />);
    applyNoBalanceRows();
    await screen.findByText('No balance account description');

    const noBalanceFilter = screen.getByRole('button', { name: /^No balance$/i });
    fireEvent.click(noBalanceFilter);

    expect(screen.getByText('No balance account description')).toBeInTheDocument();
    expect(screen.queryByText('Another distributed account description')).toBeNull();
  });

  test('status filter honors normalized status values before matching', async () => {
    render(<DistributionTable />);
    applyNormalizedStatusRows();
    const distributedFilter = screen.getByRole('button', { name: /^Distributed$/i });

    fireEvent.click(distributedFilter);
    expect(screen.getByText('Normalized distributed account')).toBeInTheDocument();
    expect(screen.queryByText('Normalized undistributed account')).toBeNull();
  });
});
