import { fireEvent, render, screen, within } from './testUtils';
import DistributionTable from '../components/mapping/DistributionTable';
import { useDistributionStore } from '../store/distributionStore';
import { useOrganizationStore } from '../store/organizationStore';

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
});