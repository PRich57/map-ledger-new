import { act } from '@testing-library/react';
import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';

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
    const targetOption = STANDARD_CHART_OF_ACCOUNTS[0];
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

    const targetOption = STANDARD_CHART_OF_ACCOUNTS[0];
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
});
