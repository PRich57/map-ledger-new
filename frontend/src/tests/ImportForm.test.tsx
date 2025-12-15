import { render, screen } from './testUtils';

jest.mock('../store/organizationStore', () => ({
  useOrganizationStore: (selector: (state: unknown) => unknown) =>
    selector({ companies: [], isLoading: false, error: null, fetchForUser: jest.fn() }),
}));

jest.mock('../store/clientEntityStore', () => ({
  useClientEntityStore: (selector: (state: unknown) => unknown) =>
    selector({
      entitiesByClient: {},
      isLoading: false,
      error: null,
      fetchForClient: jest.fn(),
    }),
}));

jest.mock('../store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { email: 'tester@example.com', id: 'user-1' } }),
}));

jest.mock('../utils/parseTrialBalanceWorkbook', () => ({
  parseTrialBalanceWorkbook: jest.fn(async () => []),
}));

jest.mock('../utils/clientHeaderMappings', () => ({
  fetchClientHeaderMappings: jest.fn(async () => []),
  saveClientHeaderMappings: jest.fn(async () => []),
}));
import ImportForm, {
  filterRowsByGlMonth,
  inferEntitySlotsFromRows,
  extractEntitiesFromRows,
  prepareEntityAssignments,
} from '../components/import/ImportForm';
import type { ClientEntity, TrialBalanceRow } from '../types';

it('does not render operation selector', () => {
  render(<ImportForm onImport={jest.fn()} isImporting={false} />);
  expect(screen.queryByLabelText(/operation/i)).toBeNull();
});

describe('filterRowsByGlMonth', () => {
  const baseRows: TrialBalanceRow[] = [
    {
      accountId: '1000',
      description: 'Jan expense',
      netChange: 2500,
      entity: 'Northwind',
      glMonth: '2024-11-01',
      Gl_Month: '2024-01-01',
    },
    {
      accountId: '2000',
      description: 'Feb expense',
      netChange: 1800,
      entity: 'Northwind',
      glMonth: '2024-11-01',
      Gl_Month: '2024-02-01',
    },
  ];

  it('prioritizes row-level GL month values when filtering', () => {
    const filtered = filterRowsByGlMonth(baseRows, '2024-02-01');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].accountId).toBe('2000');
    expect(filtered[0].glMonth).toBe('2024-02-01');
  });

  it('retains all rows when no month is selected and normalizes values', () => {
    const filtered = filterRowsByGlMonth(baseRows, '');
    expect(filtered).toHaveLength(2);
    expect(filtered.map((row) => row.glMonth)).toEqual([
      '2024-01-01',
      '2024-02-01',
    ]);
  });
});

describe('entity slot inference', () => {
  it('detects the maximum duplicate count across multiple GL months', () => {
    const rows: TrialBalanceRow[] = [
      { accountId: '1000', description: 'Jan A', netChange: 10, entity: '', glMonth: '2024-01-01' },
      { accountId: '1000', description: 'Jan B', netChange: 20, entity: '', glMonth: '2024-01-01' },
      { accountId: '2000', description: 'Feb A', netChange: 30, entity: '', glMonth: '2024-02-01' },
      { accountId: '2000', description: 'Feb B', netChange: 40, entity: '', glMonth: '2024-02-01' },
      { accountId: '2000', description: 'Feb C', netChange: 50, entity: '', glMonth: '2024-02-01' },
    ];

    const result = inferEntitySlotsFromRows(rows);

    expect(result.requiredEntities).toBe(3);
    expect(result.rowSlots).toEqual([1, 2, 1, 2, 3]);
    expect(result.slotSummaries.find((summary) => summary.slot === 3)?.glMonths).toContain('2024-02-01');
  });
});

describe('extractEntitiesFromRows', () => {
  it('collects unique entities from mapped data', () => {
    const rows: TrialBalanceRow[] = [
      {
        accountId: '1000',
        description: 'Jan A',
        netChange: 10,
        entity: 'Alpha Logistics',
        entityId: 'alpha-1',
      },
      {
        accountId: '2000',
        description: 'Feb A',
        netChange: 20,
        entity: 'alpha logistics',
        entityId: 'alpha-1',
      },
      {
        accountId: '3000',
        description: 'Mar A',
        netChange: 30,
        entity: 'Beta Freight',
        entityId: 'beta-2',
      },
    ];

    const detected = extractEntitiesFromRows(rows);

    expect(detected).toHaveLength(2);
    expect(detected.find((entity) => entity.id === 'alpha-1')?.detectedCount).toBe(2);
    expect(detected.find((entity) => entity.id === 'beta-2')?.name).toBe('Beta Freight');
  });
});

describe('entity assignment preparation', () => {
  it('fills available entities and leaves custom slots when necessary', () => {
    const available: ClientEntity[] = [
      { id: 'north', name: 'North', aliases: [] },
    ];

    const assignments = prepareEntityAssignments(2, available, []);

    expect(assignments).toHaveLength(2);
    expect(assignments[0]).toMatchObject({ entityId: 'north', name: 'North', isCustom: false });
    expect(assignments[1]).toMatchObject({ entityId: '', name: '', isCustom: true });
  });
});
