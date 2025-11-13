import { fireEvent, render, screen, within } from '@testing-library/react';
import MappingTable from '../components/mapping/MappingTable';
import { createInitialMappingAccounts, useMappingStore } from '../store/mappingStore';
import { COA_SEED_DATAPOINTS } from '../data/coaSeeds';
import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';
import type { MappingSplitDefinition, TargetScoaOption } from '../types';

const resetMappingStore = () => {
  useMappingStore.setState({
    accounts: createInitialMappingAccounts(),
    searchTerm: '',
    activeStatuses: [],
  });
};

const buildPercentageSplit = (
  index: number,
  target: TargetScoaOption,
  allocationValue: number,
): MappingSplitDefinition => ({
  id: `test-split-${index}`,
  targetId: target.id,
  targetName: target.label,
  allocationType: 'percentage',
  allocationValue,
});

const seedPayrollTaxesWithThreeSplits = () => {
  const [targetOne, targetTwo, targetThree] = STANDARD_CHART_OF_ACCOUNTS;

  if (!targetOne || !targetTwo || !targetThree) {
    throw new Error('Standard chart of accounts must include at least three entries.');
  }

  useMappingStore.setState(state => ({
    accounts: state.accounts.map(account => {
      if (account.accountName !== 'Payroll Taxes') {
        return account;
      }

      return {
        ...account,
        mappingType: 'percentage',
        splitDefinitions: [
          buildPercentageSplit(1, targetOne, 50),
          buildPercentageSplit(2, targetTwo, 30),
          buildPercentageSplit(3, targetThree, 20),
        ],
      };
    }),
  }));
};

describe('MappingTable', () => {
  beforeEach(() => {
    resetMappingStore();
  });

  test('updates mapping type when a new option is selected', () => {
    render(<MappingTable />);

    const mappingTypeSelect = screen.getByLabelText('Select mapping type for Payroll Taxes');
    expect(mappingTypeSelect).toHaveValue('percentage');

    fireEvent.change(mappingTypeSelect, { target: { value: 'direct' } });

    const updatedAccount = useMappingStore
      .getState()
      .accounts.find(account => account.accountName === 'Payroll Taxes');
    expect(updatedAccount?.mappingType).toBe('direct');
    expect(mappingTypeSelect).toHaveValue('direct');
  });

  test('initializes two blank splits when switching to percentage mapping', () => {
    render(<MappingTable />);

    const linehaulSelect = screen.getByLabelText('Select mapping type for Linehaul Revenue');
    expect(linehaulSelect).toHaveValue('direct');

    fireEvent.change(linehaulSelect, { target: { value: 'percentage' } });

    const updatedAccount = useMappingStore
      .getState()
      .accounts.find(account => account.accountName === 'Linehaul Revenue');

    expect(updatedAccount).toBeDefined();
    expect(updatedAccount?.mappingType).toBe('percentage');
    expect(updatedAccount?.splitDefinitions).toHaveLength(2);
    updatedAccount?.splitDefinitions.forEach(split => {
      expect(split.targetId).toBe('');
      expect(split.allocationType).toBe('percentage');
      expect(split.allocationValue).toBe(0);
    });
  });

  test('lists all COA datapoints in the target selector', () => {
    render(<MappingTable />);

    const targetSelect = screen.getByLabelText('Select target SCoA for Linehaul Revenue');
    const optionLabels = within(targetSelect)
      .getAllByRole('option')
      .map(option => option.textContent?.trim())
      .filter((label): label is string => Boolean(label));

    const expectedLabels = new Set<string>([
      ...Object.values(COA_SEED_DATAPOINTS)
        .flat()
        .map(datapoint => datapoint.accountName),
      ...STANDARD_CHART_OF_ACCOUNTS.map(option => option.label),
    ]);

    expectedLabels.forEach(name => {
      expect(optionLabels).toContain(name);
    });
  });

  test('shows only the company name in the company column', () => {
    render(<MappingTable />);

    expect(
      screen.getByRole('columnheader', { name: /Company/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Company / Company')).not.toBeInTheDocument();

    const companyCells = screen.getAllByText('Acme Freight');
    expect(companyCells.length).toBeGreaterThan(0);
    expect(screen.queryByText('Acme Freight Operations')).not.toBeInTheDocument();
  });

  test('shows dynamic allocation helper when expanding a dynamic mapping row', () => {
    render(<MappingTable />);

    const toggleButton = screen.getByLabelText('Show split details for Fuel Expense');
    fireEvent.click(toggleButton);

    expect(
      screen.getByText(
        /No dynamic ratios are configured yet. Launch the builder to choose basis datapoints/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open dynamic allocation builder/ })).toBeInTheDocument();
  });

  test('does not redistribute percentages when excluding one of three splits', () => {
    seedPayrollTaxesWithThreeSplits();
    render(<MappingTable />);

    const toggleButton = screen.getByLabelText('Show split details for Payroll Taxes');
    fireEvent.click(toggleButton);

    const percentageInputs = screen.getAllByLabelText('Enter percentage allocation');
    expect(percentageInputs).toHaveLength(3);
    const [regionAInput, , regionCInput] = percentageInputs;

    const excludeCheckboxes = screen.getAllByLabelText('Exclude');
    expect(excludeCheckboxes).toHaveLength(3);
    fireEvent.click(excludeCheckboxes[1]);

    fireEvent.change(regionCInput, { target: { value: '75' } });

    expect(regionAInput).toHaveDisplayValue('50.00');

    const payrollAccount = useMappingStore
      .getState()
      .accounts.find(account => account.accountName === 'Payroll Taxes');
    const regionASplit = payrollAccount?.splitDefinitions.find(split => split.id === 'test-split-1');
    const regionCSplit = payrollAccount?.splitDefinitions.find(split => split.id === 'test-split-3');

    expect(regionASplit?.allocationValue).toBe(50);
    expect(regionCSplit?.allocationValue).toBe(75);
  });
});

