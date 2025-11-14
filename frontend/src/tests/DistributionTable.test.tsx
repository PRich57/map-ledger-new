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
              { id: 'ops-log', name: 'Logistics' },
              { id: 'ops-otr', name: 'Over-the-Road' },
              { id: 'ops-ded', name: 'Dedicated' },
              { id: 'ops-ltl', name: 'Less-than-Truckload' },
              { id: 'ops-int', name: 'Intermodal' },
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

    const intermodalToggle = await screen.findByLabelText(/ops-int/i);
    fireEvent.click(intermodalToggle);

    const intermodalContainer = intermodalToggle.closest('label');
    expect(intermodalContainer).not.toBeNull();

    const allocationInput = within(intermodalContainer as HTMLLabelElement).getByLabelText('Allocation %');
    fireEvent.change(allocationInput, { target: { value: '25' } });

    fireEvent.click(screen.getByText('Save operations'));

    expect(await screen.findByText(/ops-int.*25%/i)).toBeInTheDocument();
  });

  test('opens dynamic allocation builder for dynamic rows', async () => {
    render(<DistributionTable />);

    const fuelCell = await screen.findByText('FUEL EXPENSE - COMPANY FLEET');
    const fuelRow = fuelCell.closest('tr');
    expect(fuelRow).not.toBeNull();

    const toggleButton = within(fuelRow as HTMLTableRowElement).getByLabelText(/operations for/i);
    fireEvent.click(toggleButton);

    const builderButton = await screen.findByText('Open dynamic allocation builder');
    fireEvent.click(builderButton);

    expect(await screen.findByText('Dynamic allocations')).toBeInTheDocument();
  });
});
