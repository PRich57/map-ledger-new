import { act, fireEvent, render, screen, waitFor } from './testUtils';
import { getChartOfAccountOptions } from '../store/chartOfAccountsStore';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
import RatioAllocationBuilder from '../components/mapping/RatioAllocationBuilder';

const resetStore = () => {
  useRatioAllocationStore.setState({
    allocations: [],
    basisAccounts: [],
    presets: [],
    sourceAccounts: [],
    availablePeriods: [],
    isProcessing: false,
    selectedPeriod: null,
    results: [],
    validationErrors: [],
    auditLog: [],
  });
};

const getTargetOptions = () => getChartOfAccountOptions();

const openSearchableSelect = async (input: HTMLElement) => {
  fireEvent.focus(input);
  await waitFor(() => {
    expect(screen.queryAllByRole('option').length).toBeGreaterThan(0);
  });
};

const getSearchableSelectOptionValues = async (input: HTMLElement) => {
  const inputId = input.getAttribute('id') ?? '';
  await openSearchableSelect(input);
  const values = screen
    .queryAllByRole('option')
    .map(option => option.getAttribute('id') ?? '')
    .filter(id => inputId && id.startsWith(`${inputId}-option-`))
    .map(id => id.replace(`${inputId}-option-`, ''));
  fireEvent.mouseDown(document.body);
  return values;
};

const selectSearchableSelectOption = async (input: HTMLElement, value: string) => {
  const inputId = input.getAttribute('id') ?? '';
  await openSearchableSelect(input);
  const option = screen
    .queryAllByRole('option')
    .find(node => node.getAttribute('id') === `${inputId}-option-${value}`);
  if (!option) {
    throw new Error(`Option ${value} not found`);
  }
  const button = option.querySelector('button');
  if (!button) {
    throw new Error(`Option ${value} missing button`);
  }
  fireEvent.click(button);
};

describe('ratioAllocationStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('toggles dynamic allocation presets on an allocation', () => {
    const basisAccount = {
      id: 'basis-1',
      name: 'Operations hours',
      description: 'Operations driver',
      value: 1200,
      mappedTargetId: 'ops-target',
      valuesByPeriod: { '2024-01': 1200 },
    };
    const targetOption = getTargetOptions()[0];
    const preset = {
      id: 'preset-1',
      name: 'Operations preset',
      rows: [
        { dynamicAccountId: basisAccount.id, targetAccountId: targetOption.id },
      ],
    };
    const allocation = {
      id: 'allocation-1',
      name: 'Operations allocation',
      sourceAccount: {
        id: '4000',
        number: '4000',
        description: 'Operations revenue',
      },
      targetDatapoints: [],
      effectiveDate: new Date().toISOString(),
      status: 'active' as const,
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts: [basisAccount],
        presets: [preset],
        allocations: [allocation],
      }));
    });

    act(() => {
      useRatioAllocationStore
        .getState()
        .toggleAllocationPresetTargets('allocation-1', 'preset-1');
    });

    let updatedAllocation = useRatioAllocationStore.getState().allocations[0];
    expect(updatedAllocation.targetDatapoints).toHaveLength(1);
    expect(updatedAllocation.targetDatapoints[0]).toMatchObject({
      datapointId: targetOption.id,
      groupId: preset.id,
      name: targetOption.label,
    });
    expect(updatedAllocation.targetDatapoints[0].ratioMetric).toMatchObject({
      id: basisAccount.id,
      name: basisAccount.name,
      value: 1200,
    });

    act(() => {
      useRatioAllocationStore
        .getState()
        .toggleAllocationPresetTargets('allocation-1', 'preset-1');
    });

    updatedAllocation = useRatioAllocationStore.getState().allocations[0];
    expect(updatedAllocation.targetDatapoints).toHaveLength(0);
  });

  it('applies new presets to the selected allocation when requested', () => {
    const basisAccount = {
      id: 'basis-auto',
      name: 'Basis auto',
      description: 'Basis auto',
      value: 500,
      mappedTargetId: 'ops-target',
      valuesByPeriod: { '2024-01': 500 },
    };
    const targetOption = getTargetOptions()[1];
    const allocation = {
      id: 'allocation-auto',
      name: 'Allocation auto',
      sourceAccount: {
        id: '5000',
        number: '5000',
        description: 'Auto source',
      },
      targetDatapoints: [],
      effectiveDate: new Date().toISOString(),
      status: 'active' as const,
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts: [basisAccount],
        allocations: [allocation],
        selectedPeriod: '2024-01',
      }));
    });

    act(() => {
      useRatioAllocationStore.getState().createPreset({
        name: 'Auto applied',
        rows: [{ dynamicAccountId: basisAccount.id, targetAccountId: targetOption.id }],
        applyToAllocationId: allocation.id,
      });
    });

    const { allocations: updatedAllocations, presets } = useRatioAllocationStore.getState();
    expect(presets).toHaveLength(1);
    expect(updatedAllocations[0].targetDatapoints).toHaveLength(1);
    expect(updatedAllocations[0].targetDatapoints[0]).toMatchObject({
      datapointId: targetOption.id,
      groupId: presets[0].id,
    });
  });

  it('toggles exclusions independently when datapoints share a target id', () => {
    const basisAccounts = [
      {
        id: 'basis-1',
        name: 'Operations hours',
        description: 'Operations driver',
        value: 1200,
        mappedTargetId: 'ops-target',
        valuesByPeriod: { '2024-01': 1200 },
      },
      {
        id: 'basis-2',
        name: 'Operations units',
        description: 'Operations driver',
        value: 800,
        mappedTargetId: 'ops-target',
        valuesByPeriod: { '2024-01': 800 },
      },
    ];

    const targetOption = getTargetOptions()[0];
    const presets = [
      {
        id: 'preset-1',
        name: 'Operations preset A',
        rows: [
          { dynamicAccountId: basisAccounts[0].id, targetAccountId: targetOption.id },
        ],
      },
      {
        id: 'preset-2',
        name: 'Operations preset B',
        rows: [
          { dynamicAccountId: basisAccounts[1].id, targetAccountId: targetOption.id },
        ],
      },
    ];

    const allocation = {
      id: 'allocation-1',
      name: 'Operations allocation',
      sourceAccount: {
        id: '4000',
        number: '4000',
        description: 'Operations revenue',
      },
      targetDatapoints: [],
      effectiveDate: new Date().toISOString(),
      status: 'active' as const,
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        presets,
        allocations: [allocation],
      }));
    });

    act(() => {
      const store = useRatioAllocationStore.getState();
      store.toggleAllocationPresetTargets('allocation-1', 'preset-1');
      store.toggleAllocationPresetTargets('allocation-1', 'preset-2');
    });

    let updatedAllocation = useRatioAllocationStore.getState().allocations[0];
    expect(updatedAllocation.targetDatapoints).toHaveLength(2);

    act(() => {
      useRatioAllocationStore
        .getState()
        .toggleTargetExclusion('allocation-1', targetOption.id, 'preset-1');
    });

    updatedAllocation = useRatioAllocationStore.getState().allocations[0];
    const firstTarget = updatedAllocation.targetDatapoints.find(
      target => target.groupId === 'preset-1',
    );
    const secondTarget = updatedAllocation.targetDatapoints.find(
      target => target.groupId === 'preset-2',
    );

    expect(firstTarget?.isExclusion).toBe(true);
    expect(secondTarget?.isExclusion).toBeFalsy();

    act(() => {
      useRatioAllocationStore
        .getState()
        .toggleTargetExclusion('allocation-1', targetOption.id, 'preset-2');
    });

    updatedAllocation = useRatioAllocationStore.getState().allocations[0];
    const refreshedFirst = updatedAllocation.targetDatapoints.find(
      target => target.groupId === 'preset-1',
    );
    const refreshedSecond = updatedAllocation.targetDatapoints.find(
      target => target.groupId === 'preset-2',
    );

    expect(refreshedFirst?.isExclusion).toBe(true);
    expect(refreshedSecond?.isExclusion).toBe(true);
  });

  it('rejects duplicate basis selections and basis-target overlaps across preset rows', () => {
    const [first, second, third, fourth, fifth, sixth, seventh] = getTargetOptions();

    act(() => {
      useRatioAllocationStore.getState().createPreset({
        name: 'No duplicates',
        rows: [
          { dynamicAccountId: first.id, targetAccountId: second.id },
          { dynamicAccountId: third.id, targetAccountId: fourth.id },
          { dynamicAccountId: first.id, targetAccountId: fifth.id },
          { dynamicAccountId: sixth.id, targetAccountId: second.id },
          { dynamicAccountId: second.id, targetAccountId: seventh.id },
          { dynamicAccountId: seventh.id, targetAccountId: first.id },
        ],
      });
    });

    const createdPreset = useRatioAllocationStore.getState().presets[0];
    expect(createdPreset.rows).toEqual([
      { dynamicAccountId: first.id, targetAccountId: second.id },
      { dynamicAccountId: third.id, targetAccountId: fourth.id },
      { dynamicAccountId: sixth.id, targetAccountId: second.id },
    ]);
  });

  it('excludes used account ids from preset availability helpers', () => {
    const [first, second, third, fourth, fifth] = getTargetOptions();
    const basisAccounts = [first, second, third, fourth, fifth].map((option, index) => ({
      id: option.id,
      name: `Basis ${index + 1}`,
      description: `Basis ${index + 1}`,
      value: (index + 1) * 100,
      mappedTargetId: option.id,
      valuesByPeriod: {},
    }));
    const preset = {
      id: 'preset-availability',
      name: 'Availability',
      rows: [
        { dynamicAccountId: first.id, targetAccountId: second.id },
        { dynamicAccountId: third.id, targetAccountId: fourth.id },
      ],
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        presets: [preset],
      }));
    });

    const store = useRatioAllocationStore.getState();
    const availableDynamics = store
      .getPresetAvailableDynamicAccounts('preset-availability')
      .map(account => account.id);
    expect(availableDynamics).toEqual([fifth.id]);

    const availableTargets = store
      .getPresetAvailableTargetAccounts('preset-availability')
      .map(option => option.id);
    expect(availableTargets).not.toContain(first.id);
    expect(availableTargets).not.toContain(third.id);
    expect(availableTargets).toContain(second.id);
    expect(availableTargets).toContain(fourth.id);

    const editableDynamics = store
      .getPresetAvailableDynamicAccounts('preset-availability', 0)
      .map(account => account.id);
    expect(editableDynamics).toEqual([first.id, second.id, fifth.id]);
  });

  it('hides already selected accounts in new preset builder rows', async () => {
    const [first, second, third] = getTargetOptions();
    const basisAccounts = [first, second, third].map((option, index) => ({
      id: option.id,
      name: `Basis ${index + 1}`,
      description: `Basis ${index + 1}`,
      value: (index + 1) * 100,
      mappedTargetId: '',
      valuesByPeriod: {},
    }));
    const sourceAccount = {
      id: 'source-1',
      name: 'Source Account',
      number: '4000',
      description: 'Source account',
      value: 1000,
      valuesByPeriod: {},
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        sourceAccounts: [sourceAccount],
        allocations: [
          {
            id: 'allocation-1',
            name: 'Allocation 1',
            sourceAccount: {
              id: sourceAccount.id,
              number: sourceAccount.number,
              description: sourceAccount.description,
            },
            targetDatapoints: [],
            effectiveDate: new Date().toISOString(),
            status: 'active' as const,
          },
        ],
        presets: [],
        availablePeriods: [],
        selectedPeriod: null,
      }));
    });

    render(<RatioAllocationBuilder initialSourceAccountId={sourceAccount.id} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /create preset/i }));
      });

      const initialBasisSelect = await screen.findByLabelText(/basis datapoint/i);
      await act(async () => {
        fireEvent.change(initialBasisSelect, { target: { value: first.id } });
      });

      const initialTargetSelects = await screen.findAllByLabelText(/target account/i);
      await act(async () => {
        await selectSearchableSelectOption(initialTargetSelects[0], second.id);
      });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    });

    await waitFor(() => expect(screen.getAllByLabelText(/basis datapoint/i)).toHaveLength(2));

      const basisSelects = screen.getAllByLabelText(/basis datapoint/i);
      const secondBasisSelect = basisSelects[1];
      const basisOptions = Array.from(secondBasisSelect.querySelectorAll('option')).map(
        option => option.value,
      );
      const availableBasisOptions = basisOptions.filter(Boolean);
      expect(availableBasisOptions).toEqual([second.id, third.id]);

      const targetSelects = screen.getAllByLabelText(/target account/i);
      const secondTargetSelect = targetSelects[1];
      const targetOptions = await getSearchableSelectOptionValues(secondTargetSelect);
      expect(targetOptions).not.toContain(first.id);
      expect(targetOptions).toContain(second.id);
    });

  it('prevents reusing a canonical target when creating a preset', async () => {
    const [targetAlpha, targetBeta, targetGamma] = getTargetOptions();
    const basisAccounts = [
      {
        id: 'basis-alpha',
        name: 'Basis Alpha',
        description: 'Basis Alpha',
        value: 100,
        mappedTargetId: targetAlpha.id,
        valuesByPeriod: {},
      },
      {
        id: 'basis-beta',
        name: 'Basis Beta',
        description: 'Basis Beta',
        value: 200,
        mappedTargetId: targetBeta.id,
        valuesByPeriod: {},
      },
      {
        id: 'basis-gamma',
        name: 'Basis Gamma',
        description: 'Basis Gamma',
        value: 300,
        mappedTargetId: targetGamma.id,
        valuesByPeriod: {},
      },
    ];
    const sourceAccount = {
      id: 'source-2',
      name: 'Source 2',
      number: '4100',
      description: 'Source 2',
      value: 1000,
      valuesByPeriod: {},
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        sourceAccounts: [sourceAccount],
        allocations: [
          {
            id: 'allocation-2',
            name: 'Allocation 2',
            sourceAccount: {
              id: sourceAccount.id,
              number: sourceAccount.number,
              description: sourceAccount.description,
            },
            targetDatapoints: [],
            effectiveDate: new Date().toISOString(),
            status: 'active' as const,
          },
        ],
        presets: [],
        availablePeriods: [],
        selectedPeriod: null,
      }));
    });

    render(<RatioAllocationBuilder initialSourceAccountId={sourceAccount.id} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create preset/i }));
    });

    const initialBasisSelect = await screen.findByLabelText(/basis datapoint/i);
    await act(async () => {
      fireEvent.change(initialBasisSelect, { target: { value: 'basis-beta' } });
    });

    const initialTargetSelect = screen.getByLabelText(/target account/i);
    await act(async () => {
      await selectSearchableSelectOption(initialTargetSelect, targetAlpha.id);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    });

    await waitFor(() => expect(screen.getAllByLabelText(/basis datapoint/i)).toHaveLength(2));

    const basisSelects = screen.getAllByLabelText(/basis datapoint/i);
    const secondBasisOptions = Array.from(basisSelects[1].querySelectorAll('option')).map(
      option => option.value,
    );
    expect(secondBasisOptions).toContain('basis-gamma');
    expect(secondBasisOptions).not.toContain('basis-alpha');
    expect(secondBasisOptions).not.toContain('basis-beta');

    const targetSelects = screen.getAllByLabelText(/target account/i);
    const secondTargetOptions = await getSearchableSelectOptionValues(targetSelects[1]);
    expect(secondTargetOptions).toContain(targetGamma.id);
    expect(secondTargetOptions).toContain(targetAlpha.id);
    expect(secondTargetOptions).not.toContain(targetBeta.id);
  });

  it('prevents reusing a canonical target when editing a preset', async () => {
    const [targetAlpha, targetBeta, targetGamma] = getTargetOptions();
    const basisAccounts = [
      {
        id: 'basis-alpha',
        name: 'Basis Alpha',
        description: 'Basis Alpha',
        value: 100,
        mappedTargetId: targetAlpha.id,
        valuesByPeriod: {},
      },
      {
        id: 'basis-beta',
        name: 'Basis Beta',
        description: 'Basis Beta',
        value: 200,
        mappedTargetId: targetBeta.id,
        valuesByPeriod: {},
      },
      {
        id: 'basis-gamma',
        name: 'Basis Gamma',
        description: 'Basis Gamma',
        value: 300,
        mappedTargetId: targetGamma.id,
        valuesByPeriod: {},
      },
    ];
    const sourceAccount = {
      id: 'source-3',
      name: 'Source 3',
      number: '4200',
      description: 'Source 3',
      value: 900,
      valuesByPeriod: {},
    };
    const preset = {
      id: 'preset-canonical',
      name: 'Canonical preset',
      rows: [{ dynamicAccountId: 'basis-alpha', targetAccountId: targetGamma.id }],
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        sourceAccounts: [sourceAccount],
        allocations: [
          {
            id: 'allocation-3',
            name: 'Allocation 3',
            sourceAccount: {
              id: sourceAccount.id,
              number: sourceAccount.number,
              description: sourceAccount.description,
            },
            targetDatapoints: [],
            effectiveDate: new Date().toISOString(),
            status: 'active' as const,
          },
        ],
        presets: [preset],
        availablePeriods: [],
        selectedPeriod: null,
      }));
    });

    render(<RatioAllocationBuilder initialSourceAccountId={sourceAccount.id} />);

    await act(async () => {
      fireEvent.click(screen.getByTitle('Add row'));
    });

    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(2));

    const presetTargetSelects = screen.getAllByRole('combobox');
    const newRowTargetOptions = await getSearchableSelectOptionValues(
      presetTargetSelects[presetTargetSelects.length - 1],
    );
    expect(newRowTargetOptions).toContain(targetBeta.id);
    expect(newRowTargetOptions).not.toContain(targetAlpha.id);
    expect(newRowTargetOptions).toContain(targetGamma.id);
  });

  it('normalizes allocation result percentages that would otherwise total 99.99%', async () => {
    const [targetA, targetB, targetC] = getTargetOptions();
    const targetOptions = [targetA, targetB, targetC];
    const basisAccounts = [
      {
        id: 'basis-1',
        name: 'Basis 1',
        description: 'Basis 1',
        value: 1,
        mappedTargetId: targetA.id,
        valuesByPeriod: { '2024-01': 1 },
      },
      {
        id: 'basis-2',
        name: 'Basis 2',
        description: 'Basis 2',
        value: 1,
        mappedTargetId: targetB.id,
        valuesByPeriod: { '2024-01': 1 },
      },
      {
        id: 'basis-3',
        name: 'Basis 3',
        description: 'Basis 3',
        value: 1,
        mappedTargetId: targetC.id,
        valuesByPeriod: { '2024-01': 1 },
      },
    ];
    const sourceAccount = {
      id: 'source-1',
      name: 'Source 1',
      number: '5000',
      description: 'Source account',
      value: 300,
      valuesByPeriod: { '2024-01': 300 },
    };
    const allocation = {
      id: 'allocation-even',
      name: 'Even allocation',
      sourceAccount: {
        id: sourceAccount.id,
        number: sourceAccount.number,
        description: sourceAccount.description,
      },
      targetDatapoints: basisAccounts.map((basis, index) => ({
        datapointId: targetOptions[index].id,
        name: targetOptions[index].label,
        ratioMetric: {
          id: basis.id,
          name: basis.name,
          value: basis.valuesByPeriod['2024-01'],
        },
        isExclusion: false,
      })),
      effectiveDate: new Date().toISOString(),
      status: 'active' as const,
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        sourceAccounts: [sourceAccount],
        allocations: [allocation],
        presets: [],
        availablePeriods: ['2024-01'],
        selectedPeriod: '2024-01',
      }));
    });

    await act(async () => {
      await useRatioAllocationStore.getState().calculateAllocations('2024-01');
    });

    const results = useRatioAllocationStore.getState().results;
    expect(results).toHaveLength(1);
    const scaledTotal = results[0].allocations.reduce(
      (sum, target) => sum + Math.round(target.percentage * 100),
      0,
    );
    expect(scaledTotal).toBe(10000);
    expect(results[0].allocations.some(target => target.percentage.toFixed(2) === '33.34')).toBe(
      true,
    );

    const auditRecords = useRatioAllocationStore
      .getState()
      .auditLog.filter(record => record.allocationId === allocation.id && record.periodId === '2024-01');
    expect(auditRecords.length).toBeGreaterThan(0);
    auditRecords.forEach(record => {
      const auditScaledTotal = record.targets.reduce(
        (sum, target) => sum + Math.round(target.percentage * 100),
        0,
      );
      expect(auditScaledTotal).toBe(10000);
    });
  });

  it('normalizes allocation result percentages that would otherwise total 100.01%', async () => {
    const [targetA, targetB, targetC] = getTargetOptions();
    const targetOptions = [targetA, targetB, targetC];
    const basisAccounts = [
      {
        id: 'basis-1',
        name: 'Basis 1',
        description: 'Basis 1',
        value: 16665,
        mappedTargetId: targetA.id,
        valuesByPeriod: { '2024-01': 16665 },
      },
      {
        id: 'basis-2',
        name: 'Basis 2',
        description: 'Basis 2',
        value: 16665,
        mappedTargetId: targetB.id,
        valuesByPeriod: { '2024-01': 16665 },
      },
      {
        id: 'basis-3',
        name: 'Basis 3',
        description: 'Basis 3',
        value: 66670,
        mappedTargetId: targetC.id,
        valuesByPeriod: { '2024-01': 66670 },
      },
    ];
    const sourceAccount = {
      id: 'source-2',
      name: 'Source 2',
      number: '6000',
      description: 'Source account',
      value: 1200,
      valuesByPeriod: { '2024-01': 1200 },
    };
    const allocation = {
      id: 'allocation-weighted',
      name: 'Weighted allocation',
      sourceAccount: {
        id: sourceAccount.id,
        number: sourceAccount.number,
        description: sourceAccount.description,
      },
      targetDatapoints: basisAccounts.map((basis, index) => ({
        datapointId: targetOptions[index].id,
        name: targetOptions[index].label,
        ratioMetric: {
          id: basis.id,
          name: basis.name,
          value: basis.valuesByPeriod['2024-01'],
        },
        isExclusion: false,
      })),
      effectiveDate: new Date().toISOString(),
      status: 'active' as const,
    };

    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        basisAccounts,
        sourceAccounts: [sourceAccount],
        allocations: [allocation],
        presets: [],
        availablePeriods: ['2024-01'],
        selectedPeriod: '2024-01',
      }));
    });

    await act(async () => {
      await useRatioAllocationStore.getState().calculateAllocations('2024-01');
    });

    const results = useRatioAllocationStore.getState().results;
    expect(results).toHaveLength(1);
    const scaledTotal = results[0].allocations.reduce(
      (sum, target) => sum + Math.round(target.percentage * 100),
      0,
    );
    expect(scaledTotal).toBe(10000);
    expect(results[0].allocations.every(target => Number.isFinite(target.percentage))).toBe(true);

    const auditRecords = useRatioAllocationStore
      .getState()
      .auditLog.filter(record => record.allocationId === allocation.id && record.periodId === '2024-01');
    expect(auditRecords.length).toBeGreaterThan(0);
    auditRecords.forEach(record => {
      const auditScaledTotal = record.targets.reduce(
        (sum, target) => sum + Math.round(target.percentage * 100),
        0,
      );
      expect(auditScaledTotal).toBe(10000);
    });
  });
});
