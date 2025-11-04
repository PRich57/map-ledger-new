import { fireEvent, render, screen, within } from '@testing-library/react';
import DistributionTable from '../components/mapping/DistributionTable';
import { useDistributionStore } from '../store/distributionStore';

const initialDistributionSnapshot = (() => {
  const snapshot = useDistributionStore.getState();
  return {
    rows: snapshot.rows.map(row => ({
      ...row,
      operations: row.operations.map(operation => ({ ...operation })),
    })),
    searchTerm: snapshot.searchTerm,
    statusFilters: snapshot.statusFilters.slice(),
  };
})();

const resetDistributionStore = () => {
  useDistributionStore.setState({
    rows: initialDistributionSnapshot.rows.map(row => ({
      ...row,
      operations: row.operations.map(operation => ({ ...operation })),
    })),
    searchTerm: initialDistributionSnapshot.searchTerm,
    statusFilters: initialDistributionSnapshot.statusFilters.slice(),
  });
};

describe('DistributionTable', () => {
  beforeEach(() => {
    resetDistributionStore();
  });

  test('renders distribution rows with required columns', () => {
    render(<DistributionTable />);

    expect(screen.getByText('Account ID')).toBeInTheDocument();
    expect(screen.getByText('FREIGHT REVENUE LINEHAUL - COMPANY FLEET')).toBeInTheDocument();
    expect(
      screen.getByText('DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Dynamic/)).toBeInTheDocument();
  });

  test('allows editing operations for percentage rows', () => {
    render(<DistributionTable />);

    const driverBenefitsRow = screen
      .getByText('DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET')
      .closest('tr');
    expect(driverBenefitsRow).not.toBeNull();

    const editButton = within(driverBenefitsRow as HTMLTableRowElement).getByText('Edit operations');
    fireEvent.click(editButton);

    const intermodalToggle = screen.getByLabelText('Intermodal');
    fireEvent.click(intermodalToggle);

    const intermodalContainer = intermodalToggle.closest('label');
    expect(intermodalContainer).not.toBeNull();

    const allocationInput = within(intermodalContainer as HTMLLabelElement).getByLabelText('Allocation %');
    fireEvent.change(allocationInput, { target: { value: '25' } });

    fireEvent.click(screen.getByText('Save operations'));

    expect(screen.getByText(/Intermodal \(25%\)/)).toBeInTheDocument();
  });

  test('opens dynamic allocation builder for dynamic rows', () => {
    render(<DistributionTable />);

    const fuelRow = screen.getByText('FUEL EXPENSE - COMPANY FLEET').closest('tr');
    expect(fuelRow).not.toBeNull();

    const editButton = within(fuelRow as HTMLTableRowElement).getByText('Edit operations');
    fireEvent.click(editButton);

    const builderButton = screen.getByText('Open dynamic allocation builder');
    fireEvent.click(builderButton);

    expect(screen.getByText('Dynamic datapoints')).toBeInTheDocument();
  });
});
