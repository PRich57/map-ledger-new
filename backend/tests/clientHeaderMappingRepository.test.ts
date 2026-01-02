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
          file_upload_guid: '12345678-1234-1234-1234-1234567890ab',
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
        fileUploadGuid: '12345678-1234-1234-1234-1234567890ab',
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
      {
        templateHeader: 'GL ID',
        sourceHeader: 'Account Number',
        fileUploadGuid: '12345678-1234-1234-1234-1234567890ab',
      },
      { templateHeader: 'Account Description', sourceHeader: '' },
    ]);

    const mergeCall = mockedRunQuery.mock.calls.find(([query]) =>
      typeof query === 'string' && query.includes('MERGE')
    );

    expect(mergeCall?.[1]).toMatchObject({
      clientId: 'C1',
      templateHeader0: 'GL ID',
      sourceHeader0: 'Account Number',
      fileUploadGuid0: '12345678-1234-1234-1234-1234567890ab',
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

  it('skips updates when mappings are unchanged', async () => {
    let mergeQuery = '';

    mockedRunQuery.mockImplementation((query: string) => {
      if (query.includes('MERGE')) {
        mergeQuery = query;
        return Promise.resolve({ recordset: [] } as any);
      }

      return Promise.resolve({
        recordset: [
          {
            mapping_id: 3,
            client_id: 'C1',
            template_header: 'GL ID',
            source_header: 'Account Number',
            mapping_method: 'automated',
            inserted_dttm: new Date('2024-05-01T00:00:00Z'),
            updated_dttm: null,
            updated_by: null,
          },
        ],
      } as any);
    });

    const result = await upsertClientHeaderMappings('C1', [
      { templateHeader: 'GL ID', sourceHeader: 'Account Number', mappingMethod: 'manual' },
    ]);

    expect(mergeQuery).toContain('WHEN MATCHED AND (');
    expect(mergeQuery).not.toContain('target.UPDATED_BY');
    expect(result).toEqual([
      {
        mappingId: 3,
        clientId: 'C1',
        templateHeader: 'GL ID',
        sourceHeader: 'Account Number',
        mappingMethod: 'automated',
        fileUploadGuid: null,
        insertedAt: '2024-05-01T00:00:00.000Z',
        updatedBy: null,
      },
    ]);
  });

  it('retains automated mapping method when entries are unchanged', async () => {
    mockedRunQuery.mockImplementation((query: string) => {
      if (query.includes('MERGE')) {
        return Promise.resolve({ recordset: [] } as any);
      }

      return Promise.resolve({
        recordset: [
          {
            mapping_id: 4,
            client_id: 'C1',
            template_header: 'GL ID',
            source_header: 'Account Number',
            mapping_method: 'automated',
            inserted_dttm: new Date('2024-03-01T00:00:00Z'),
            updated_dttm: null,
            updated_by: null,
          },
        ],
      } as any);
    });

    const result = await upsertClientHeaderMappings('C1', [
      { templateHeader: 'GL ID', sourceHeader: 'Account Number' },
    ]);

    const mergeParameters = mockedRunQuery.mock.calls.find(([query]) =>
      typeof query === 'string' && query.includes('MERGE')
    )?.[1];

    expect(mergeParameters).toMatchObject({ mappingMethod0: 'automated' });
    expect(result).toEqual([
      {
        mappingId: 4,
        clientId: 'C1',
        templateHeader: 'GL ID',
        sourceHeader: 'Account Number',
        mappingMethod: 'automated',
        fileUploadGuid: null,
        insertedAt: '2024-03-01T00:00:00.000Z',
        updatedBy: null,
      },
    ]);
  });

  it('updates timestamps and user when mappings change while preserving insert time', async () => {
    let selectCall = 0;
    mockedRunQuery.mockImplementation((query: string, parameters?: Record<string, unknown>) => {
      if (query.includes('MERGE')) {
        expect(parameters).toMatchObject({ updatedBy0: 'tester@example.com' });
        return Promise.resolve({ recordset: [] } as any);
      }

      if (selectCall === 0) {
        selectCall += 1;
        return Promise.resolve({
          recordset: [
            {
              mapping_id: 5,
              client_id: 'C1',
              template_header: 'GL ID',
              source_header: 'Account Number',
              mapping_method: 'automated',
              inserted_dttm: new Date('2024-05-01T00:00:00Z'),
              updated_dttm: null,
              updated_by: null,
            },
          ],
        } as any);
      }

      return Promise.resolve({
        recordset: [
          {
            mapping_id: 5,
            client_id: 'C1',
            template_header: 'GL ID',
            source_header: 'Updated Header',
            mapping_method: 'manual',
            inserted_dttm: new Date('2024-05-01T00:00:00Z'),
            updated_dttm: new Date('2024-06-01T12:00:00Z'),
            updated_by: 'tester@example.com',
          },
        ],
      } as any);
    });

    const result = await upsertClientHeaderMappings('C1', [
      {
        templateHeader: 'GL ID',
        sourceHeader: 'Updated Header',
        updatedBy: 'tester@example.com',
      },
    ]);

    expect(result).toEqual([
      {
        mappingId: 5,
        clientId: 'C1',
        templateHeader: 'GL ID',
        sourceHeader: 'Updated Header',
        mappingMethod: 'manual',
        fileUploadGuid: null,
        insertedAt: '2024-05-01T00:00:00.000Z',
        updatedAt: '2024-06-01T12:00:00.000Z',
        updatedBy: 'tester@example.com',
      },
    ]);
  });
});
