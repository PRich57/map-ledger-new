import { act, fireEvent, render, screen, waitFor, within } from './testUtils';
import MappingTable from '../components/mapping/MappingTable';
import {
  createInitialMappingAccounts,
  RowSaveMetadata,
  useMappingStore,
} from '../store/mappingStore';
import {
  SAVE_ROW_LIMIT,
  SAVE_WARNING_THRESHOLD,
} from '../components/mapping/MappingToolbar';
import { COA_SEED_DATAPOINTS } from '../data/coaSeeds';
import type { MappingSplitDefinition, TargetScoaOption } from '../types';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
import { getChartOfAccountOptions } from '../store/chartOfAccountsStore';

const resetMappingStore = () => {
  useMappingStore.setState({
    accounts: createInitialMappingAccounts(),
    searchTerm: '',
    activeStatuses: [],
    dirtyMappingIds: new Set<string>(),
    rowSaveStatuses: {},
    isSavingMappings: false,
    saveError: null,
    lastSavedCount: 0,
  });
};

const resetRatioStore = () => {
  useRatioAllocationStore.setState({
    allocations: [],
    basisAccounts: [],
    presets: [],
    groups: [],
    sourceAccounts: [],
    availablePeriods: [],
    selectedPeriod: null,
    results: [],
    validationErrors: [],
    auditLog: [],
    isProcessing: false,
  });
};

const getTargetCatalog = () => getChartOfAccountOptions();

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
  const [targetOne, targetTwo, targetThree] = getTargetCatalog();

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

const seedDynamicPresetExclusions = () => {
  const basisAccounts = [
    {
      id: 'basis-mileage',
      name: 'Mileage driver',
      description: 'Mileage basis',
      value: 600,
      mappedTargetId: 'ops-fuel-a',
      valuesByPeriod: { '2024-01': 600 },
    },
    {
      id: 'basis-hours',
      name: 'Hours driver',
      description: 'Hours basis',
      value: 400,
      mappedTargetId: 'ops-fuel-b',
      valuesByPeriod: { '2024-01': 400 },
    },
  ];

  const targetA = { id: 'ops-fuel-a', label: 'Operations Fuel A' };
  const targetB = { id: 'ops-fuel-b', label: 'Operations Fuel B' };

  const preset = {
    id: 'preset-fuel',
    name: 'Fuel preset',
    rows: [
      { dynamicAccountId: basisAccounts[0].id, targetAccountId: targetA.id },
      { dynamicAccountId: basisAccounts[1].id, targetAccountId: targetB.id },
    ],
  };

  const allocation = {
    id: 'allocation-fuel',
    name: 'Fuel allocation',
    sourceAccount: {
      id: 'acct-3',
      number: '6100',
      description: 'Fuel Expense',
    },
    targetDatapoints: [
      {
        datapointId: targetA.id,
        name: targetA.label,
        groupId: preset.id,
        ratioMetric: {
          id: basisAccounts[0].id,
          name: basisAccounts[0].name,
          value: basisAccounts[0].value,
        },
        isExclusion: false,
      },
      {
        datapointId: targetB.id,
        name: targetB.label,
        groupId: preset.id,
        ratioMetric: {
          id: basisAccounts[1].id,
          name: basisAccounts[1].name,
          value: basisAccounts[1].value,
        },
        isExclusion: false,
      },
    ],
    effectiveDate: new Date().toISOString(),
    status: 'active' as const,
  };

  act(() => {
    useRatioAllocationStore.setState(state => ({
      ...state,
      basisAccounts,
      presets: [preset],
      groups: [
        {
          ...preset,
          members: [
            {
              accountId: basisAccounts[0].id,
              accountName: basisAccounts[0].name,
              basisValue: 600,
              targetAccountId: targetA.id,
              targetName: targetA.label,
            },
            {
              accountId: basisAccounts[1].id,
              accountName: basisAccounts[1].name,
              basisValue: 400,
              targetAccountId: targetB.id,
              targetName: targetB.label,
            },
          ],
        },
      ],
      allocations: [allocation],
      sourceAccounts: [
        {
          id: 'acct-3',
          name: 'Fuel Expense',
          number: '6100',
          description: 'Fuel Expense',
          value: 65000,
          valuesByPeriod: { '2024-01': 65000 },
        },
      ],
      selectedPeriod: '2024-01',
      availablePeriods: ['2024-01'],
      results: [],
      validationErrors: [],
    }));
  });
};

const buildLargeAccountSet = (count: number) => {
  const sampleAccount = createInitialMappingAccounts()[0];
  return Array.from({ length: count }, (_value, index) => ({
    ...sampleAccount,
    id: `${sampleAccount.id}-${index}`,
    accountId: `${sampleAccount.accountId}-${index}`,
    accountName: `${sampleAccount.accountName} ${index + 1}`,
  }));
};

describe('MappingTable', () => {
  beforeEach(() => {
    resetMappingStore();
    resetRatioStore();
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

  test('shows a divider for the current GL month alongside older periods', () => {
    const [templateOne, templateTwo] = createInitialMappingAccounts();
    const accounts = [
      {
        ...templateOne,
        id: 'current-account',
        accountId: '1000',
        accountName: 'Current Month Account',
        glMonth: '2024-12-01',
      },
      {
        ...templateTwo,
        id: 'prior-account',
        accountId: '2000',
        accountName: 'Prior Month Account',
        glMonth: '2024-11-01',
      },
    ];

    act(() => {
      useMappingStore.setState(state => ({
        ...state,
        accounts,
      }));
    });

    render(<MappingTable />);

    expect(screen.getByText('Current GL month 2024-12-01')).toBeInTheDocument();
    expect(screen.getByText('Records from GL month 2024-11-01')).toBeInTheDocument();
  });

  test('lists all COA datapoints in the target selector', () => {
    render(<MappingTable />);

    const targetSelect = screen.getByLabelText('Select target SCoA for Linehaul Revenue');
      const optionLabels = within(targetSelect)
        .getAllByRole('option')
        .map((option: HTMLOptionElement) => option.textContent?.trim() ?? null)
        .filter((label): label is string => Boolean(label));

    const expectedLabels = new Set<string>([
      ...Object.values(COA_SEED_DATAPOINTS)
        .flat()
        .map(datapoint => datapoint.accountName),
      ...getTargetCatalog().map(option => option.label),
    ]);

    expectedLabels.forEach(name => {
      expect(optionLabels).toContain(name);
    });
  });

  test('shows only the company name in the company column', () => {
    render(<MappingTable />);

    expect(
      screen.getByRole('columnheader', { name: /Entity/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Entity / Entity')).not.toBeInTheDocument();

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

  test('dynamic preset exclusions immediately update activity and excluded columns', async () => {
    seedDynamicPresetExclusions();
    render(<MappingTable />);

    const fuelRow = screen.getByText('Fuel Expense').closest('tr');
    expect(fuelRow).toBeTruthy();
    if (!fuelRow) {
      throw new Error('Fuel Expense row must exist in the table.');
    }

    expect(within(fuelRow).getByText('$65,000.00')).toBeInTheDocument();
    expect(within(fuelRow).queryByText(/Original:/i)).not.toBeInTheDocument();

    const toggleButton = screen.getByLabelText('Show split details for Fuel Expense');
    fireEvent.click(toggleButton);

    const excludeCheckboxes = screen.getAllByRole('checkbox', { name: /Exclude/i });
    expect(excludeCheckboxes.length).toBeGreaterThan(1);
    fireEvent.click(excludeCheckboxes[1]);

    await waitFor(() => {
      expect(within(fuelRow).getByText('$39,000.00')).toBeInTheDocument();
    });

    expect(within(fuelRow).getByText('Original: $65,000.00')).toBeInTheDocument();
    expect(within(fuelRow).getByText('40.00%')).toBeInTheDocument();
  });

  test('keeps the table interactive while saving large unmapped sets', () => {
    const sampleAccount = createInitialMappingAccounts()[1];
    const largeAccounts = Array.from({ length: 180 }, (_value, index) => ({
      ...sampleAccount,
      id: `${sampleAccount.id}-${index}`,
      accountId: `${sampleAccount.accountId}-${index}`,
      accountName: `${sampleAccount.accountName} ${index + 1}`,
    }));
    const dirtyChunk = largeAccounts.slice(0, 6).map(account => account.id);
    const savingStatuses: Record<string, RowSaveMetadata> = {};
    dirtyChunk.slice(0, 3).forEach(id => {
      savingStatuses[id] = { status: 'saving' };
    });

    useMappingStore.setState({
      accounts: largeAccounts,
      dirtyMappingIds: new Set<string>(dirtyChunk),
      rowSaveStatuses: savingStatuses,
      isSavingMappings: true,
      activeStatuses: [],
    });

    render(<MappingTable />);

    const searchInput = screen.getByLabelText('Search mappings');
    expect(searchInput).toBeEnabled();
    fireEvent.change(searchInput, { target: { value: 'Fuel' } });
    expect(useMappingStore.getState().searchTerm).toBe('Fuel');
    expect(screen.getAllByRole('row').length).toBeGreaterThan(5);
  });

  test('shows per-row saving and error indicators', () => {
    const errorMessage = 'Entity conflict detected';
    useMappingStore.setState({
      dirtyMappingIds: new Set(['acct-1', 'acct-2']),
      rowSaveStatuses: {
        'acct-1': { status: 'saving' },
        'acct-2': { status: 'error', message: errorMessage },
      },
      isSavingMappings: true,
    });

    render(<MappingTable />);

    const savingRow = screen.getByText('Linehaul Revenue').closest('tr');
    expect(savingRow).toBeTruthy();
    if (!savingRow) {
      throw new Error('Linehaul Revenue row must exist');
    }
    expect(within(savingRow).getByText(/Saving changes/i)).toBeInTheDocument();

    const errorRow = screen.getByText('Payroll Taxes').closest('tr');
    expect(errorRow).toBeTruthy();
    if (!errorRow) {
      throw new Error('Payroll Taxes row must exist');
    }
    expect(within(errorRow).getByText(`Save failed: ${errorMessage}`)).toBeInTheDocument();
  });

  test('warns when saving a large batch of rows', () => {
    const rowsToSave = SAVE_WARNING_THRESHOLD + 10;
    const largeAccounts = buildLargeAccountSet(rowsToSave);
    useMappingStore.setState({
      accounts: largeAccounts,
      dirtyMappingIds: new Set(largeAccounts.map(account => account.id)),
      rowSaveStatuses: {},
      isSavingMappings: false,
      saveError: null,
      lastSavedCount: 0,
    });

    render(<MappingTable />);

    const warningMessage = `Saving ${rowsToSave} rows at once may exceed the ${SAVE_ROW_LIMIT}-row limit. Consider using batch edits or saving in smaller chunks.`;
    expect(screen.getByText(warningMessage)).toBeInTheDocument();
  });

  test('does not warn when save size remains under the threshold', () => {
    const accounts = buildLargeAccountSet(SAVE_WARNING_THRESHOLD + 5);
    const rowsToSave = Math.max(1, SAVE_WARNING_THRESHOLD - 5);
    useMappingStore.setState({
      accounts,
      dirtyMappingIds: new Set(accounts.slice(0, rowsToSave).map(account => account.id)),
      rowSaveStatuses: {},
      isSavingMappings: false,
      saveError: null,
      lastSavedCount: 0,
    });

    render(<MappingTable />);

    expect(
      screen.queryByText(
        /may exceed the \d+-row limit\. Consider using batch edits or saving in smaller chunks\./,
      ),
    ).not.toBeInTheDocument();
  });
});
