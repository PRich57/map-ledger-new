jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { runQuery } from '../src/utils/sqlClient';
import { upsertEntityAccountMappings } from '../src/repositories/entityAccountMappingRepository';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

const mockedRunQuery = runQuery as RunQueryMock;

describe('entityAccountMappingRepository upsert', () => {
  beforeEach(() => {
    mockedRunQuery.mockReset();
    mockedRunQuery.mockResolvedValue({ recordset: [] } as any);
  });

  it('uses a single bulk transaction for multiple mapping changes', async () => {
    await upsertEntityAccountMappings([
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-1',
        mappingType: 'direct',
        mappingStatus: 'Mapped',
        presetId: 'preset-1',
      },
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-2',
        mappingType: 'exclude',
        mappingStatus: 'Excluded',
        presetId: 'preset-2',
      },
    ]);

    expect(mockedRunQuery).toHaveBeenCalledTimes(1);
    const [query] = mockedRunQuery.mock.calls[0];
    expect(query).toContain('BEGIN TRANSACTION');
    expect(query).toContain('MERGE ml.ENTITY_ACCOUNT_MAPPING');
  });
});
