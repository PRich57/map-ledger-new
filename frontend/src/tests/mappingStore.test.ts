/**
 * @jest-environment node
 */

import { act } from 'react-dom/test-utils';
import {
  createInitialMappingAccounts,
  selectStatusCounts,
  selectSummaryMetrics,
  selectFilteredAccounts,
  useMappingStore,
} from '../store/mappingStore';
import { useRatioAllocationStore } from '../store/ratioAllocationStore';
import type { GLAccountMappingRow, TrialBalanceRow } from '../types';
import { getChartOfAccountOptions } from '../store/chartOfAccountsStore';

const buildMappingAccount = (
  overrides: Partial<GLAccountMappingRow> & { id: string },
): GLAccountMappingRow => ({
  id: overrides.id,
  entityId: 'ent-1',
  entityName: 'Entity One',
  accountId: '1000',
  accountName: 'Sample Account',
  activity: overrides.netChange ?? 0,
  status: 'Unmapped',
  mappingType: 'direct',
  netChange: 0,
  operation: 'Ops',
  polarity: 'Debit',
  splitDefinitions: [],
  entities: [],
  ...overrides,
});

const findTargetByDescription = (description: string) =>
  getChartOfAccountOptions().find(target => {
    const normalized = description.toLowerCase();
    return (
      target.description?.toLowerCase() === normalized ||
      target.label.toLowerCase().includes(normalized)
    );
  });

describe('mappingStore selectors', () => {
  beforeEach(() => {
    useMappingStore.setState({
      accounts: createInitialMappingAccounts(),
      searchTerm: '',
      activeStatuses: [],
      activeUploadId: null,
      activeUploadMetadata: null,
      activeClientId: null,
      activeEntityId: null,
      activeEntities: [],
      activeEntityIds: [],
      activePeriod: null,
    });
    useRatioAllocationStore.setState({
      allocations: [],
      basisAccounts: [],
      groups: [],
      sourceAccounts: [],
      availablePeriods: [],
      isProcessing: false,
      selectedPeriod: null,
      results: [],
      validationErrors: [],
      auditLog: [],
    });
  });

  it('computes gross, excluded, and net totals from seed data', () => {
    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary).toEqual(
      expect.objectContaining({
        totalAccounts: 4,
        mappedAccounts: 3,
        grossTotal: 700000,
        excludedTotal: 15000,
        netTotal: 685000,
      })
    );
  });

  it('counts percentage, dynamic, and exclusion mappings toward summary coverage', () => {
    act(() => {
      useRatioAllocationStore.setState(state => ({
        ...state,
        allocations: [
          {
            id: 'alloc-dynamic',
            name: 'Dynamic mapping',
            sourceAccount: {
              id: 'acct-3',
              number: '6100',
              description: 'Fuel Expense',
            },
            targetDatapoints: [
              {
                datapointId: 'dynamic-target',
                name: 'Dynamic Target',
                ratioMetric: { id: 'ratio-1', name: 'Basis metric', value: 1 },
                isExclusion: false,
              },
            ],
            effectiveDate: '2024-01-01',
            status: 'active',
          },
        ],
      }));
    });

    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary).toEqual(
      expect.objectContaining({
        totalAccounts: 4,
        mappedAccounts: 4,
      }),
    );
  });

  it('recalculates totals when accounts are excluded', () => {
    act(() => {
      useMappingStore.getState().updateMappingType('acct-2', 'exclude');
      useMappingStore.getState().updateStatus('acct-2', 'Excluded');
    });

    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary.excludedTotal).toBe(135000);
    expect(summary.netTotal).toBe(565000);
  });

  it('calculates exclusions from percentage splits marked as excluded', () => {
    act(() => {
      useMappingStore
        .getState()
        .updateSplitDefinition('acct-2', 'split-2', { isExclusion: true });
    });

    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary.excludedTotal).toBe(15000 + 48000);
    expect(summary.netTotal).toBe(700000 - (15000 + 48000));

    const percentageAccount = useMappingStore
      .getState()
      .accounts.find(account => account.id === 'acct-2');
    expect(percentageAccount?.status).toBe('Mapped');
  });

  it('exposes mapped SCoA accounts to the dynamic allocation basis list', () => {
    const payrollTarget = findTargetByDescription(
      'DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET',
    );

    if (!payrollTarget) {
      throw new Error('Expected chart of account target to be available');
    }

    act(() => {
      useMappingStore.getState().updateTarget('acct-1', payrollTarget.value);
      useMappingStore.getState().updateStatus('acct-1', 'Mapped');
      useMappingStore.getState().updateStatus('acct-2', 'Mapped');
    });

    const basisAccounts = useRatioAllocationStore.getState().basisAccounts;

    expect(basisAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: payrollTarget.id, name: payrollTarget.label }),
      ]),
    );
  });

  it('includes GL account numbers in the ratio source lookup for distribution', () => {
    const fuelSourceAccount = useRatioAllocationStore
      .getState()
      .sourceAccounts.find(account => account.id === '6100');

    expect(fuelSourceAccount).toEqual(
      expect.objectContaining({
        id: '6100',
        value: 65000,
      }),
    );
  });

  it('includes percentage split targets in the basis selection before status is finalized', () => {
    const driverTarget = findTargetByDescription(
      'DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET',
    );
    const nonDriverTarget = findTargetByDescription(
      'NON DRIVER WAGES & BENEFITS - TOTAL ASSET OPERATIONS',
    );

    if (!driverTarget || !nonDriverTarget) {
      throw new Error('Expected standard chart of accounts targets to be available');
    }

    act(() => {
      useMappingStore
        .getState()
        .updateSplitDefinition('acct-2', 'split-1', { allocationValue: 70 });
      useMappingStore
        .getState()
        .updateSplitDefinition('acct-2', 'split-2', { allocationValue: 20 });
    });

    const basisAccounts = useRatioAllocationStore.getState().basisAccounts;

    expect(basisAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: driverTarget.id, name: driverTarget.label }),
        expect.objectContaining({ id: nonDriverTarget.id, name: nonDriverTarget.label }),
      ]),
    );

    const driverEntry = basisAccounts.find(account => account.id === driverTarget.id);
    const nonDriverEntry = basisAccounts.find(account => account.id === nonDriverTarget.id);
    expect(driverEntry?.value).toBeCloseTo((120000 * 70) / 100, 5);
    expect(nonDriverEntry?.value).toBeCloseTo((120000 * 20) / 100, 5);
  });

  it('derives dynamic exclusion totals from allocation results', () => {
    act(() => {
      useMappingStore.setState(state => ({ ...state, activePeriod: '2024-01' }));
      useRatioAllocationStore.setState(state => ({
        ...state,
        selectedPeriod: '2024-01',
        allocations: [
          {
            id: 'alloc-1',
            name: 'Dynamic test',
            sourceAccount: {
              id: 'acct-3',
              number: '6100',
              description: 'Fuel Expense',
            },
            targetDatapoints: [
              {
                datapointId: 'dp-1',
                name: 'Exclude Pool',
                ratioMetric: { id: 'metric-1', name: 'Metric 1', value: 1 },
                isExclusion: true,
              },
              {
                datapointId: 'dp-2',
                name: 'Mapped Pool',
                ratioMetric: { id: 'metric-2', name: 'Metric 2', value: 1 },
                isExclusion: false,
              },
            ],
            effectiveDate: '2024-01-01',
            status: 'active',
          },
        ],
        results: [
          {
            allocationId: 'alloc-1',
            allocationName: 'Dynamic test',
            periodId: '2024-01',
            sourceAccountId: 'acct-3',
            sourceAccountName: 'Fuel Expense',
            sourceValue: 65000,
            basisTotal: 2,
            runAt: new Date().toISOString(),
            allocations: [
              {
                datapointId: 'dp-1',
                targetId: 'dp-1',
                targetName: 'Exclude Pool',
                basisValue: 1,
                value: 20000,
                percentage: 50,
                ratio: 0.5,
                isExclusion: true,
              },
              {
                datapointId: 'dp-2',
                targetId: 'dp-2',
                targetName: 'Mapped Pool',
                basisValue: 1,
                value: 45000,
                percentage: 50,
                ratio: 0.5,
                isExclusion: false,
              },
            ],
          },
        ],
      }));
    });

    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary.excludedTotal).toBe(15000 + 20000);
    expect(summary.netTotal).toBe(700000 - (15000 + 20000));
  });

  it('estimates dynamic exclusions when results are unavailable', () => {
    act(() => {
      useMappingStore.setState(state => ({ ...state, activePeriod: '2024-02' }));
      useRatioAllocationStore.setState(state => ({
        ...state,
        selectedPeriod: '2024-02',
        basisAccounts: [],
        groups: [],
        sourceAccounts: [
          {
            id: 'acct-3',
            name: 'Fuel Expense',
            number: '6100',
            description: 'Fuel Expense',
            value: 65000,
            valuesByPeriod: { '2024-02': 65000 },
          },
        ],
        allocations: [
          {
            id: 'alloc-preview',
            name: 'Dynamic preview',
            sourceAccount: {
              id: 'acct-3',
              number: '6100',
              description: 'Fuel Expense',
            },
            targetDatapoints: [
              {
                datapointId: 'dp-exclude',
                name: 'Excluded share',
                ratioMetric: { id: 'metric-exclude', name: 'Metric exclude', value: 60 },
                isExclusion: true,
              },
              {
                datapointId: 'dp-mapped',
                name: 'Mapped share',
                ratioMetric: { id: 'metric-mapped', name: 'Metric mapped', value: 40 },
                isExclusion: false,
              },
            ],
            effectiveDate: '2024-02-01',
            status: 'active',
          },
        ],
        results: [],
      }));
    });

    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary.excludedTotal).toBeCloseTo(15000 + 39000, 5);
    expect(summary.netTotal).toBeCloseTo(700000 - (15000 + 39000), 5);
  });

  it('safely normalizes client identifiers during import hydration', () => {
    const rows: TrialBalanceRow[] = [
      {
        entity: 'Client Entity',
        accountId: '1000',
        description: 'Test Account',
        netChange: 100,
        glMonth: '2024-01-01',
      },
    ];

    act(() => {
      useMappingStore.getState().loadImportedAccounts({
        uploadId: 'upload-numeric-client',
        clientId: 98765,
        rows,
      });
    });

    expect(useMappingStore.getState().activeClientId).toBe('98765');

    act(() => {
      useMappingStore.getState().loadImportedAccounts({
        uploadId: 'upload-nullish-client',
        clientId: undefined,
        rows,
      });
    });

    expect(useMappingStore.getState().activeClientId).toBeNull();
  });

  it('tracks status counts across all mapping rows', () => {
    const counts = selectStatusCounts(useMappingStore.getState());
    expect(counts).toEqual({
      New: 2,
      Unmapped: 0,
      Mapped: 1,
      Excluded: 1,
    });
  });

  it('filters summary metrics by active entity', () => {
    act(() => {
      useMappingStore.setState(state => ({ ...state, activeEntityId: 'comp-acme' }));
    });

    const summary = selectSummaryMetrics(useMappingStore.getState());
    expect(summary).toEqual(
      expect.objectContaining({
        totalAccounts: 2,
        grossTotal: 620000,
        excludedTotal: 0,
        netTotal: 620000,
      }),
    );
  });

  it('loads imported rows into mapping state', () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: '1000',
        description: 'Cash',
        entity: 'Entity One',
        netChange: 1250,
        glMonth: '2024-01-01',
      },
      {
        accountId: '2000',
        description: 'Revenue',
        entity: 'Entity One',
        netChange: -1250,
        glMonth: '2024-01-01',
      },
    ];

    act(() => {
      useMappingStore
        .getState()
        .loadImportedAccounts({
          uploadId: 'import-1',
          clientId: 'cli-123',
          entityIds: ['ent-1'],
          entities: [{ id: 'ent-1', name: 'Entity One' }],
          period: '2024-01-01',
          rows,
        });
    });

    const state = useMappingStore.getState();
    expect(state.accounts).toHaveLength(2);
    expect(state.accounts[0]).toEqual(
      expect.objectContaining({
        accountId: '1000',
        status: 'Unmapped',
        mappingType: 'direct',
      }),
    );
    expect(state.activeUploadId).toBe('import-1');
    expect(state.activeClientId).toBe('cli-123');
    expect(state.activeEntityId).toBe('ent-1');
    expect(state.activeEntityIds).toEqual(['ent-1']);
    expect(state.activeEntities).toEqual([
      { id: 'ent-1', name: 'Entity One' },
    ]);
    expect(state.activePeriod).toBe('2024-01');
  });

  it('marks duplicate account-month entries for manual company assignment', () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: '4000',
        description: 'Revenue Item',
        entity: '',
        netChange: 1000,
        glMonth: '2025-08-01',
      },
      {
        accountId: '4000',
        description: 'Revenue Item Duplicate',
        entity: '',
        netChange: 2000,
        glMonth: '2025-08-01',
      },
    ];

    act(() => {
      useMappingStore.getState().loadImportedAccounts({
        uploadId: 'import-dup',
        clientId: 'cli-123',
        entityIds: ['comp-1'],
        entities: [{ id: 'comp-1', name: 'AMX Inc.' }],
        period: '2025-08-01',
        rows,
      });
    });

    const state = useMappingStore.getState();
    expect(state.accounts).toHaveLength(2);
    state.accounts.forEach((account) => {
      expect(account.requiresEntityAssignment).toBe(true);
    });

    act(() => {
      useMappingStore.getState().updateAccountEntity(state.accounts[0].id, {
        entityName: 'AMX Inc.',
        entityId: 'comp-1',
      });
      useMappingStore.getState().updateAccountEntity(state.accounts[1].id, {
        entityName: 'AMX Canada',
      });
    });

    const resolved = useMappingStore.getState().accounts;
    expect(resolved.map((account) => account.entityName)).toEqual([
      'AMX Inc.',
      'AMX Canada',
    ]);
    resolved.forEach((account) => {
      expect(account.requiresEntityAssignment).toBe(false);
    });
  });

  it('surfaces the most recent non-zero month per account when viewing all periods', () => {
    const accounts: GLAccountMappingRow[] = [
      buildMappingAccount({
        id: 'acct-jan',
        glMonth: '2024-01-01',
        netChange: 150,
        activity: 150,
        accountName: 'Freight Revenue',
        accountId: '4000',
      }),
      buildMappingAccount({
        id: 'acct-feb',
        glMonth: '2024-02-01',
        netChange: 0,
        activity: 0,
        accountName: 'Freight Revenue',
        accountId: '4000',
      }),
      buildMappingAccount({
        id: 'acct-mar',
        glMonth: '2024-03-01',
        netChange: 275,
        activity: 275,
        accountName: 'COGS',
        accountId: '5000',
      }),
    ];

    act(() => {
      useMappingStore.setState(state => ({
        ...state,
        accounts,
        activePeriod: null,
        activeEntityId: 'ent-1',
        activeEntities: [{ id: 'ent-1', name: 'Entity One' }],
        activeEntityIds: ['ent-1'],
        activeStatuses: [],
        searchTerm: '',
      }));
    });

    const filtered = selectFilteredAccounts(useMappingStore.getState());

    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual(
      expect.objectContaining({ accountId: '5000', glMonth: '2024-03-01', netChange: 275 }),
    );
    expect(filtered[1]).toEqual(
      expect.objectContaining({ accountId: '4000', glMonth: '2024-01-01', netChange: 150 }),
    );
  });

  it('scopes summary metrics to the active reporting period when selected', () => {
    const mappedTarget =
      findTargetByDescription('Revenue') ?? getChartOfAccountOptions()[0] ?? { id: '4100', value: '4100', label: '4100' };

    const accounts: GLAccountMappingRow[] = [
      buildMappingAccount({
        id: 'acct-jan',
        glMonth: '2024-01-01',
        netChange: 1250,
        activity: 1250,
        accountName: 'January Revenue',
        accountId: '4000',
        status: 'Mapped',
        manualCOAId: mappedTarget.id,
      }),
      buildMappingAccount({
        id: 'acct-feb',
        glMonth: '2024-02-01',
        netChange: 875,
        activity: 875,
        accountName: 'February Revenue',
        accountId: '4000',
        status: 'Mapped',
        manualCOAId: mappedTarget.id,
      }),
    ];

    act(() => {
      useMappingStore.setState(state => ({
        ...state,
        accounts,
        activeEntityId: 'ent-1',
        activeEntities: [{ id: 'ent-1', name: 'Entity One' }],
        activeEntityIds: ['ent-1'],
        activePeriod: null,
      }));
    });

    const allSummary = selectSummaryMetrics(useMappingStore.getState());
    expect(allSummary.totalAccounts).toBe(2);
    expect(allSummary.grossTotal).toBe(2125);

    act(() => {
      useMappingStore.setState(state => ({ ...state, activePeriod: '2024-01-01' }));
    });

    const januarySummary = selectSummaryMetrics(useMappingStore.getState());
    expect(januarySummary.totalAccounts).toBe(1);
    expect(januarySummary.grossTotal).toBe(1250);
    expect(januarySummary.mappedAccounts).toBe(1);
  });

  it('clears the mapping workspace when a client switch resets the import', () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: '1000',
        description: 'Cash',
        entity: 'Reset Entity',
        netChange: 500,
        glMonth: '2024-05-01',
      },
      {
        accountId: '2000',
        description: 'Revenue',
        entity: 'Reset Entity',
        netChange: -500,
        glMonth: '2024-05-01',
      },
    ];

    act(() => {
      useMappingStore.getState().loadImportedAccounts({
        uploadId: 'import-reset',
        clientId: 'client-reset',
        entityIds: ['ent-reset'],
        entities: [{ id: 'ent-reset', name: 'Reset Entity' }],
        period: '2024-05-01',
        rows,
      });
    });

    expect(useMappingStore.getState().accounts.length).toBe(2);

    act(() => {
      useMappingStore.getState().clearWorkspace();
    });

    const state = useMappingStore.getState();
    expect(state.accounts).toHaveLength(0);
    expect(state.activeUploadId).toBeNull();
    expect(state.activeClientId).toBeNull();
    expect(state.activeEntities).toEqual([]);
    expect(state.activeEntityIds).toEqual([]);
    expect(state.activeEntityId).toBeNull();
    expect(state.activePeriod).toBeNull();
    expect(state.presetLibrary).toEqual([]);
    expect(state.rowSaveStatuses).toEqual({});
    expect(state.dirtyMappingIds.size).toBe(0);

    const ratioState = useRatioAllocationStore.getState();
    expect(ratioState.allocations).toHaveLength(0);
    expect(ratioState.basisAccounts).toHaveLength(0);
    expect(ratioState.presets).toHaveLength(0);
    expect(ratioState.groups).toHaveLength(0);
    expect(ratioState.sourceAccounts).toHaveLength(0);
    expect(ratioState.availablePeriods).toHaveLength(0);
    expect(ratioState.results).toHaveLength(0);
    expect(ratioState.validationErrors).toHaveLength(0);
    expect(ratioState.auditLog).toHaveLength(0);
    expect(ratioState.selectedPeriod).toBeNull();
    expect(ratioState.lastDynamicMutation).toBeNull();
  });
});
