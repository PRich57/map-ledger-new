import { act, fireEvent, render, screen, within } from './testUtils';
import DistributionTable from '../components/mapping/DistributionTable';
import { useDistributionStore } from '../store/distributionStore';
import { useOrganizationStore } from '../store/organizationStore';
import type { DistributionRow, DistributionStatus } from '../types';

const resetDistributionStore = () => {
  useDistributionStore.setState({ rows: [], searchTerm: '', statusFilters: [] });
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

describe('DistributionTable', () => {
  beforeEach(() => {
    resetDistributionStore();
    seedOrganizationStore();
  });

  test('renders distribution rows with required columns', async () => {
    render(<DistributionTable />);

    expect(screen.getByText('Account ID')).toBeInTheDocument();
    expect(screen.getByText('Standard COA Description')).toBeInTheDocument();
    expect(
      await screen.findByText('FREIGHT REVENUE LINEHAUL - COMPANY FLEET'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET'),
    ).toBeInTheDocument();
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

  test('sorts distribution rows by activity when the column header is clicked', async () => {
    const { container } = render(<DistributionTable />);
    applyCustomDistributionRows();
    await screen.findByText('Distributed account description');

    const getVisibleAccountOrder = (): string[] =>
      Array.from(container.querySelectorAll('tbody tr'))
        .map(row => row.querySelector('td:nth-child(3)'))
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

  test('status filter honors normalized status values before matching', async () => {
    render(<DistributionTable />);
    applyNormalizedStatusRows();
    const distributedFilter = screen.getByRole('button', { name: /^Distributed$/i });

    fireEvent.click(distributedFilter);
    expect(screen.getByText('Normalized distributed account')).toBeInTheDocument();
    expect(screen.queryByText('Normalized undistributed account')).toBeNull();
  });
});
