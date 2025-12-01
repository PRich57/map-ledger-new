jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { runQuery } from '../src/utils/sqlClient';
import {
  listClientHeaderMappings,
  replaceClientHeaderMappings,
  upsertClientHeaderMappings,
} from '../src/repositories/clientHeaderMappingRepository';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

const mockedRunQuery = runQuery as RunQueryMock;

describe('clientHeaderMappingRepository', () => {
  beforeEach(() => {
    mockedRunQuery.mockReset();
  });

  it('returns an empty list when no client id is provided', async () => {
    const result = await listClientHeaderMappings('');
    expect(result).toEqual([]);
    expect(mockedRunQuery).not.toHaveBeenCalled();
  });

  it('parses rows returned from the database', async () => {
    mockedRunQuery.mockResolvedValue({
      recordset: [
        {
          mapping_id: 7,
          client_id: 'C1',
          template_header: 'GL ID',
          source_header: 'Account Number',
          mapping_method: 'manual',
          inserted_dttm: new Date('2023-12-31T00:00:00Z'),
          updated_dttm: new Date('2024-01-01T00:00:00Z'),
          updated_by: 'tester',
        },
      ],
    } as any);

    const result = await listClientHeaderMappings('C1');

    expect(mockedRunQuery).toHaveBeenCalled();
    expect(result).toEqual([
      {
        mappingId: 7,
        clientId: 'C1',
        templateHeader: 'GL ID',
        sourceHeader: 'Account Number',
        mappingMethod: 'manual',
        insertedAt: '2023-12-31T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        updatedBy: 'tester',
      },
    ]);
  });

  it('merges new mappings for a client', async () => {
    mockedRunQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT')) {
        return Promise.resolve({
          recordset: [
            {
              client_id: 'C1',
              template_header: 'GL ID',
              source_header: 'Account Number',
              updated_dttm: null,
            },
          ],
        } as any);
      }

      return Promise.resolve({ recordset: [] } as any);
    });

    const result = await upsertClientHeaderMappings('C1', [
      { templateHeader: 'GL ID', sourceHeader: 'Account Number' },
      { templateHeader: 'Account Description', sourceHeader: '' },
    ]);

    const mergeCall = mockedRunQuery.mock.calls.find(([query]) =>
      typeof query === 'string' && query.includes('MERGE')
    );

    expect(mergeCall?.[1]).toMatchObject({
      clientId: 'C1',
      templateHeader0: 'GL ID',
      sourceHeader0: 'Account Number',
    });
    expect(result).toHaveLength(1);
  });

  it('replaces mappings and removes null entries for a client', async () => {
    mockedRunQuery.mockImplementation((query: string) => {
      if (query.includes('SELECT')) {
        return Promise.resolve({
          recordset: [
            {
              client_id: 'C1',
              template_header: 'GL ID',
              source_header: 'Updated',
              updated_dttm: null,
            },
          ],
        } as any);
      }

      return Promise.resolve({ recordset: [] } as any);
    });

    const result = await replaceClientHeaderMappings('C1', [
      { templateHeader: 'GL ID', sourceHeader: 'Updated' },
      { templateHeader: 'Account Description', sourceHeader: null },
    ]);

    const mergeCall = mockedRunQuery.mock.calls.find(([query]) =>
      typeof query === 'string' && query.includes('MERGE')
    );

    expect(mergeCall?.[1]).toMatchObject({
      clientId: 'C1',
      templateHeader0: 'GL ID',
      sourceHeader0: 'Updated',
    });
    expect(
      mockedRunQuery.mock.calls.some(([query]) =>
        typeof query === 'string' && query.includes('DELETE FROM')
      )
    ).toBe(false);
    expect(result[0]?.sourceHeader).toBe('Updated');
  });
});
