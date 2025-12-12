/**
 * @jest-environment node
 */

import { getChartOfAccountOptions, isKnownChartOfAccount } from '../store/chartOfAccountsStore';
import { useMappingStore } from '../store/mappingStore';
import { trackMappingSaveAttempt } from '../utils/telemetry';
import type { GLAccountMappingRow } from '../types';

jest.mock('../utils/telemetry', () => ({
  trackMappingSaveAttempt: jest.fn(),
  trackMappingSaveTriggered: jest.fn(),
}));

const defaultTarget = getChartOfAccountOptions()[0];
const defaultTargetId = defaultTarget?.value ?? 'coa-default';

const buildAccount = (
  overrides: Partial<GLAccountMappingRow> & { id: string; accountId: string },
): GLAccountMappingRow => ({
  id: overrides.id,
  entityId: 'entity-1',
  entityName: 'Entity One',
  accountId: overrides.accountId,
  accountName: `Account ${overrides.accountId}`,
  activity: overrides.activity ?? 0,
  status: overrides.status ?? 'Mapped',
  mappingType: overrides.mappingType ?? 'direct',
  netChange: overrides.netChange ?? 100,
  operation: 'Ops',
  suggestedCOAId: overrides.suggestedCOAId,
  aiConfidence: overrides.aiConfidence,
  manualCOAId: overrides.manualCOAId ?? defaultTargetId,
  polarity: overrides.polarity ?? 'Debit',
  presetId: overrides.presetId,
  exclusionPct: overrides.exclusionPct,
  notes: overrides.notes,
  splitDefinitions: overrides.splitDefinitions ?? [],
  entities: overrides.entities ?? [],
  dynamicExclusionAmount: overrides.dynamicExclusionAmount,
  glMonth: overrides.glMonth,
  requiresEntityAssignment: overrides.requiresEntityAssignment,
});

const resetStore = (accounts: GLAccountMappingRow[]) => {
  useMappingStore.setState(state => ({
    ...state,
    accounts,
    dirtyMappingIds: new Set<string>(),
    activeEntityId: null,
    activeEntities: state.activeEntities ?? [],
    activeEntityIds: [],
    activeStatuses: [],
    searchTerm: '',
    lastSavedCount: 0,
    saveError: null,
  }));
};

describe('dirty save behavior', () => {
  let fetchMock: jest.Mock;
  const mockedTrackMappingSaveAttempt = trackMappingSaveAttempt as jest.MockedFunction<
    typeof trackMappingSaveAttempt
  >;

  beforeEach(() => {
    fetchMock = jest.fn().mockImplementation(async (_url, init) => {
      const parsedBody =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as { items?: unknown[] }) : { items: [] };

      return {
        ok: true,
        json: async () => ({ items: parsedBody.items ?? [] }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('saves only the dirty row after a single edit', async () => {
    const accounts = [
      buildAccount({ id: 'acct-1', accountId: '1000' }),
      buildAccount({ id: 'acct-2', accountId: '2000' }),
    ];
    resetStore(accounts);

    useMappingStore.getState().updateNotes('acct-1', 'Updated note');

    const savedCount = await useMappingStore.getState().saveMappings();

    expect(savedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}',
    ) as { items?: { entityAccountId?: string }[] };

    expect(body.items).toHaveLength(1);
    expect(body.items?.[0]?.entityAccountId).toBe('1000');
    expect(useMappingStore.getState().dirtyMappingIds.has('acct-1')).toBe(false);
    expect(useMappingStore.getState().dirtyMappingIds.has('acct-2')).toBe(false);
  });

  it('sends all dirty rows for bulk updates', async () => {
    const accounts = [
      buildAccount({ id: 'acct-1', accountId: '1000' }),
      buildAccount({ id: 'acct-2', accountId: '2000' }),
    ];
    resetStore(accounts);

    const manualTargets = useMappingStore
      .getState()
      .accounts.map(account => account.manualCOAId);
    expect(manualTargets.every(target => isKnownChartOfAccount(target))).toBe(true);

    useMappingStore
      .getState()
      .applyBatchMapping(['acct-1', 'acct-2'], { polarity: 'Credit' });

    expect(useMappingStore.getState().dirtyMappingIds.size).toBe(2);
    expect(Array.from(useMappingStore.getState().dirtyMappingIds)).toEqual(
      expect.arrayContaining(['acct-1', 'acct-2']),
    );
    expect(useMappingStore.getState().accounts.map(account => account.status)).toEqual(
      expect.arrayContaining(['Mapped', 'Mapped']),
    );

    const savedCount = await useMappingStore.getState().saveMappings();

    expect(savedCount).toBe(2);
    expect(useMappingStore.getState().saveError).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}',
    ) as { items?: { entityAccountId?: string; splitDefinitions?: unknown[] }[] };

    expect(body.items).toHaveLength(2);
    const entityIds = body.items?.map(item => item.entityAccountId);
    expect(entityIds).toEqual(expect.arrayContaining(['1000', '2000']));
  });

  it('does not trigger a save when no rows are dirty', async () => {
    const accounts = [buildAccount({ id: 'acct-1', accountId: '1000' })];
    resetStore(accounts);

    const savedCount = await useMappingStore.getState().saveMappings();

    expect(savedCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useMappingStore.getState().saveError).toBe('No changes ready to save.');
  });

  it('emits telemetry only when saves are attempted', async () => {
    const accounts = [buildAccount({ id: 'acct-1', accountId: '1000' })];
    resetStore(accounts);

    const savedCount = await useMappingStore.getState().saveMappings();
    expect(savedCount).toBe(0);
    expect(mockedTrackMappingSaveAttempt).not.toHaveBeenCalled();

    useMappingStore.getState().updateNotes('acct-1', 'Updated note for telemetry');

    const telemetrySavedCount = await useMappingStore.getState().saveMappings();
    expect(telemetrySavedCount).toBe(1);
    expect(mockedTrackMappingSaveAttempt).toHaveBeenCalledTimes(1);
    expect(mockedTrackMappingSaveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        dirtyRows: 1,
        payloadRows: 1,
        success: true,
      }),
    );
  });
});
