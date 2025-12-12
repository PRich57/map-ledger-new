jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import {
  saveClientFileMetadata,
  type NewClientFileRecord,
} from '../src/repositories/clientFileRepository';
import crypto from 'node:crypto';
import {
  listClientFiles,
  softDeleteClientFile,
} from '../src/repositories/clientFileRepository';
import { runQuery } from '../src/utils/sqlClient';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

describe('clientFileRepository.saveClientFileMetadata', () => {
  let mockedRunQuery: RunQueryMock;
  const guid = '12345678-1234-1234-1234-1234567890ab';

  beforeEach(() => {
    mockedRunQuery = runQuery as RunQueryMock;
    mockedRunQuery.mockReset();
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(guid);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates and returns a 36-character file upload GUID', async () => {
    mockedRunQuery
      .mockResolvedValueOnce({ recordset: [{ file_upload_id: 7, file_upload_guid: guid }] } as any);

    const record: NewClientFileRecord = {
      clientId: 'client-1',
      insertedBy: 'uploader@example.com',
      sourceFileName: 'file.csv',
      fileStorageUri: 'https://storage.example.com/file.csv',
      status: 'completed',
    };

    const saved = await saveClientFileMetadata(record);

    expect(saved.fileUploadGuid).toBe(guid);
    expect(saved.fileUploadGuid).toHaveLength(36);
    expect(mockedRunQuery.mock.calls[0][1]).toMatchObject({
      fileUploadGuid: guid,
      insertedBy: 'uploader@example.com',
    });
  });

  it('normalizes month-only periods to the first day before inserting', async () => {
    mockedRunQuery.mockResolvedValueOnce({ recordset: [{ file_upload_guid: guid }] } as any);

    const record: NewClientFileRecord = {
      clientId: 'client-1',
      insertedBy: 'uploader@example.com',
      sourceFileName: 'file.csv',
      fileStorageUri: 'https://storage.example.com/file.csv',
      status: 'completed',
      glPeriodStart: '2024-01',
      glPeriodEnd: '2024-02',
    };

    await saveClientFileMetadata(record);

    expect(mockedRunQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        glPeriodStart: '2024-01-01',
        glPeriodEnd: '2024-02-01',
      })
    );
  });

  it('returns last-step timestamps only when provided', async () => {
    mockedRunQuery.mockResolvedValueOnce({ recordset: [{ file_upload_guid: guid }] } as any);

    const record: NewClientFileRecord = {
      clientId: 'client-1',
      insertedBy: 'uploader@example.com',
      sourceFileName: 'file.csv',
      fileStorageUri: 'https://storage.example.com/file.csv',
      status: 'completed',
    };

    const saved = await saveClientFileMetadata(record);

    expect(saved.id).toBe(guid);
    expect(saved.lastStepCompletedDttm).toBeUndefined();
    expect(mockedRunQuery).toHaveBeenCalledTimes(1);
  });
});

describe('clientFileRepository.softDeleteClientFile', () => {
  let mockedRunQuery: RunQueryMock;

  beforeEach(() => {
    mockedRunQuery = runQuery as RunQueryMock;
    mockedRunQuery.mockReset();
  });

  it('marks a file as deleted by GUID', async () => {
    mockedRunQuery.mockResolvedValue({ recordset: [] } as any);

    await softDeleteClientFile('abcd-1234');

    expect(mockedRunQuery).toHaveBeenCalledWith(
      expect.stringContaining('SET IS_DELETED = 1'),
      expect.objectContaining({ fileUploadGuid: 'abcd-1234' })
    );
  });
});

describe('clientFileRepository.listClientFiles', () => {
  let mockedRunQuery: RunQueryMock;

  beforeEach(() => {
    mockedRunQuery = runQuery as RunQueryMock;
    mockedRunQuery.mockReset();
  });

  it('excludes soft-deleted records and uses GUIDs for related lookups', async () => {
    mockedRunQuery
      .mockResolvedValueOnce({ recordset: [{ total: 1 }] } as any)
      .mockResolvedValueOnce({
        recordset: [
          {
            fileUploadGuid: 'guid-1',
            clientId: 'client-1',
            insertedBy: 'user@example.com',
            sourceFileName: 'file.csv',
            fileStorageUri: 'uri',
            fileStatus: 'completed',
            glPeriodStart: '2023-01',
            glPeriodEnd: '2023-02',
            lastStepCompletedDttm: new Date().toISOString(),
          },
        ],
      } as any)
      .mockResolvedValueOnce({ recordset: [] } as any)
      .mockResolvedValueOnce({ recordset: [] } as any);

    const result = await listClientFiles(undefined, 1, 10);

    expect(mockedRunQuery.mock.calls[0][0]).toContain('cf.IS_DELETED = 0');
    expect(mockedRunQuery.mock.calls[1][0]).toContain('cf.IS_DELETED = 0');
    expect(mockedRunQuery.mock.calls[2][1]).toMatchObject({ sheetFileGuid0: 'guid-1' });
    expect(mockedRunQuery.mock.calls[3][1]).toMatchObject({ entityFileGuid0: 'guid-1' });
    expect(result.items[0].fileUploadGuid).toBe('guid-1');
  });
});
