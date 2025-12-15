jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { insertFileRecords, listFileRecords } from '../src/repositories/fileRecordRepository';
import { runQuery } from '../src/utils/sqlClient';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

describe('fileRecordRepository', () => {
  let mockedRunQuery: RunQueryMock;
  const guid = '12345678-1234-1234-1234-1234567890ab';

  beforeEach(() => {
    mockedRunQuery = runQuery as RunQueryMock;
    mockedRunQuery.mockReset();
  });

  it('inserts file records with GUID, metadata, and relies on defaults for timestamps', async () => {
    const inserted = new Date('2024-01-01T00:00:00.000Z');
    mockedRunQuery.mockResolvedValue({ recordset: [{ record_id: 10, inserted_dttm: inserted }, { record_id: 11 }] } as any);

    const insertedRecords = await insertFileRecords(guid, [
      {
        accountId: '100',
        accountName: 'Cash',
        activityAmount: 50,
        entityId: 'ent-1',
        glMonth: '2024-01-01',
        sourceSheetName: 'Sheet1',
        openingBalance: 5,
        closingBalance: 55,
        userDefined1: 'u1',
        userDefined2: 'u2',
        userDefined3: 'u3',
      },
      {
        accountId: '200',
        accountName: 'Receivables',
        activityAmount: -5,
        sourceSheetName: 'Sheet1',
      },
    ]);

    expect(mockedRunQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockedRunQuery.mock.calls[0];
    expect(sql).toContain('FILE_UPLOAD_GUID');
    expect(params).toMatchObject({
      fileUploadGuid: guid,
      glMonth0: '2024-01-01',
      sourceSheetName0: 'Sheet1',
      sourceSheetName1: 'Sheet1',
    });

    expect(insertedRecords[0]).toEqual(
      expect.objectContaining({
        fileUploadGuid: guid,
        insertedDttm: inserted.toISOString(),
        sourceSheetName: 'Sheet1',
      }),
    );
  });

  it('batches large inserts to avoid SQL Server 2100 parameter limit', async () => {
    // Create 150 records to test batching (BATCH_SIZE is 70)
    const records = Array.from({ length: 150 }, (_, i) => ({
      accountId: `${100 + i}`,
      accountName: `Account ${i}`,
      activityAmount: i * 10,
      sourceSheetName: 'Sheet1',
    }));

    // Mock responses for three batches (70 + 70 + 10 records)
    mockedRunQuery
      .mockResolvedValueOnce({
        recordset: Array.from({ length: 70 }, (_, i) => ({ record_id: i + 1 })),
      } as any)
      .mockResolvedValueOnce({
        recordset: Array.from({ length: 70 }, (_, i) => ({ record_id: i + 71 })),
      } as any)
      .mockResolvedValueOnce({
        recordset: Array.from({ length: 10 }, (_, i) => ({ record_id: i + 141 })),
      } as any);

    const insertedRecords = await insertFileRecords(guid, records);

    // Should have called runQuery three times (once per batch)
    expect(mockedRunQuery).toHaveBeenCalledTimes(3);

    // First batch should have 70 records
    const [sql1, params1] = mockedRunQuery.mock.calls[0];
    expect(Object.keys(params1 as object).filter(k => k.startsWith('accountId')).length).toBe(70);

    // Second batch should have 70 records
    const [sql2, params2] = mockedRunQuery.mock.calls[1];
    expect(Object.keys(params2 as object).filter(k => k.startsWith('accountId')).length).toBe(70);

    // Third batch should have 10 records
    const [sql3, params3] = mockedRunQuery.mock.calls[2];
    expect(Object.keys(params3 as object).filter(k => k.startsWith('accountId')).length).toBe(10);

    // Should return all 150 records
    expect(insertedRecords.length).toBe(150);
    expect(insertedRecords[0].recordId).toBe(1);
    expect(insertedRecords[69].recordId).toBe(70);
    expect(insertedRecords[70].recordId).toBe(71);
    expect(insertedRecords[149].recordId).toBe(150);
  });

  it('retrieves file records by GUID', async () => {
    const insertedDttm = new Date('2024-01-02T00:00:00.000Z');
    mockedRunQuery.mockResolvedValue({
      recordset: [
        {
          file_upload_guid: guid,
          record_id: 20,
          source_sheet_name: 'Sheet1',
          source_row_number: 3,
          entity_id: 'ent-1',
          entity_name: 'Entity One',
          account_id: '300',
          account_name: 'Equity',
          opening_balance: 0,
          closing_balance: 100,
          activity_amount: 100,
      gl_month: '2024-02-01',
          user_defined1: 'U1',
          user_defined2: 2,
          user_defined3: 'U3',
          inserted_dttm: insertedDttm,
        },
      ],
    } as any);

    const results = await listFileRecords(guid);

    const [sql, params] = mockedRunQuery.mock.calls[0];
    expect(sql).toContain('FILE_UPLOAD_GUID = @fileUploadGuid');
    expect(params).toEqual({ fileUploadGuid: guid });

    expect(results[0]).toEqual({
      fileUploadGuid: guid,
      recordId: 20,
      sourceSheetName: 'Sheet1',
      entityId: 'ent-1',
      accountId: '300',
      accountName: 'Equity',
      openingBalance: 0,
      closingBalance: 100,
      activityAmount: 100,
      glMonth: '2024-02-01',
      userDefined1: 'U1',
      userDefined2: '2',
      userDefined3: 'U3',
      insertedDttm: insertedDttm.toISOString(),
    });
  });
});
