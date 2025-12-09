jest.mock('../src/repositories/fileRecordRepository', () => ({
  insertFileRecords: jest.fn(),
  listFileRecords: jest.fn(),
}));
jest.mock('../src/repositories/clientFileSheetRepository', () => ({
  insertClientFileSheet: jest.fn(),
}));
jest.mock('../src/repositories/clientFileEntityRepository', () => ({
  insertClientFileEntity: jest.fn(),
  listClientFileEntities: jest.fn(),
}));
jest.mock('../src/repositories/clientEntityRepository', () => ({
  listClientEntities: jest.fn(),
}));
jest.mock('../src/repositories/clientFileRepository', () => ({
  getClientFileByGuid: jest.fn(),
}));

import { ingestFileRecordsHandler, listFileRecordsHandler } from '../src/functions/fileRecords';
import { insertFileRecords, listFileRecords } from '../src/repositories/fileRecordRepository';
import { insertClientFileSheet } from '../src/repositories/clientFileSheetRepository';
import {
  insertClientFileEntity,
  listClientFileEntities,
} from '../src/repositories/clientFileEntityRepository';
import { listClientEntities } from '../src/repositories/clientEntityRepository';
import { getClientFileByGuid } from '../src/repositories/clientFileRepository';

const basePayload = {
  fileUploadGuid: '12345678-1234-1234-1234-1234567890ab',
  headerMap: {
    'GL ID': 'Account ID',
    'Account Description': 'Account Name',
    NetChange: 'Amount',
  },
  sheets: [
    {
      sheetName: 'Sheet1',
      rows: [
        {
          'Account ID': '100',
          'Account Name': 'Cash',
          Amount: 25,
        },
      ],
    },
  ],
};

describe('fileRecords.ingestFileRecordsHandler', () => {
  const mockInsertFileRecords = insertFileRecords as jest.MockedFunction<typeof insertFileRecords>;
  const mockListFileRecords = listFileRecords as jest.MockedFunction<typeof listFileRecords>;
  const mockInsertClientFileSheet =
    insertClientFileSheet as jest.MockedFunction<typeof insertClientFileSheet>;
  const mockInsertClientFileEntity =
    insertClientFileEntity as jest.MockedFunction<typeof insertClientFileEntity>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListFileRecords.mockResolvedValue([] as any);
    mockInsertClientFileSheet.mockResolvedValue({
      fileUploadGuid: basePayload.fileUploadGuid,
      sheetName: basePayload.sheets[0].sheetName,
    } as any);
    mockInsertClientFileEntity.mockResolvedValue({} as any);
  });

  it('ingests records when a valid GUID is provided', async () => {
    mockInsertFileRecords.mockResolvedValue([
      {
        recordId: 1,
        fileUploadGuid: basePayload.fileUploadGuid,
        accountId: '100',
        accountName: 'Cash',
        activityAmount: 25,
      },
    ]);

    const request = { json: jest.fn().mockResolvedValue(basePayload) } as any;
    const context = { warn: jest.fn(), info: jest.fn(), error: jest.fn() } as any;

    const response = await ingestFileRecordsHandler(request, context);

    expect(mockInsertFileRecords).toHaveBeenCalledWith(basePayload.fileUploadGuid, expect.any(Array));
    expect(mockInsertClientFileSheet).toHaveBeenCalledTimes(basePayload.sheets.length);
    expect(mockInsertClientFileEntity).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
  });

  it('rejects requests when the GUID is missing', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({ ...basePayload, fileUploadGuid: undefined }),
    } as any;
    const context = { warn: jest.fn(), info: jest.fn(), error: jest.fn() } as any;

    const response = await ingestFileRecordsHandler(request, context);

    expect(response.status).toBe(400);
    expect(mockInsertFileRecords).not.toHaveBeenCalled();
    expect(mockInsertClientFileSheet).not.toHaveBeenCalled();
    expect(mockInsertClientFileEntity).not.toHaveBeenCalled();
  });
});

describe('fileRecords.listFileRecordsHandler', () => {
  const mockListFileRecords = listFileRecords as jest.MockedFunction<typeof listFileRecords>;
  const mockListClientEntities = listClientEntities as jest.MockedFunction<typeof listClientEntities>;
  const mockListClientFileEntities =
    listClientFileEntities as jest.MockedFunction<typeof listClientFileEntities>;
  const mockGetClientFileByGuid = getClientFileByGuid as jest.MockedFunction<typeof getClientFileByGuid>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListFileRecords.mockResolvedValue([] as any);
    mockListClientEntities.mockResolvedValue([] as any);
    mockListClientFileEntities.mockResolvedValue([] as any);
    mockGetClientFileByGuid.mockResolvedValue(null as any);
  });

  it('logs and rejects invalid GUIDs', async () => {
    const request = { query: new URLSearchParams({ fileUploadGuid: 'short-guid' }) } as any;
    const context = { warn: jest.fn(), error: jest.fn() } as any;

    const response = await listFileRecordsHandler(request, context);

    expect(response.status).toBe(400);
    expect(context.warn).toHaveBeenCalledWith('Invalid fileUploadGuid provided', {
      fileUploadGuid: 'short-guid',
    });
    expect(mockListFileRecords).not.toHaveBeenCalled();
  });

  it('hydrates entity names and selections from metadata', async () => {
    const guid = '123456781234123412341234567890ab';
    const formattedGuid = '12345678-1234-1234-1234-1234567890ab';
    mockListFileRecords.mockResolvedValue([
      { recordId: 1, fileUploadGuid: formattedGuid, entityId: '10', accountId: '100', accountName: 'Cash', activityAmount: 50 },
    ] as any);
    mockListClientFileEntities.mockResolvedValue([
      { fileUploadGuid: formattedGuid, entityId: 10, isSelected: true },
    ] as any);
    mockListClientEntities.mockResolvedValue([
      {
        entityId: '10',
        clientId: 'cli-1',
        entityName: 'North Region',
        entityDisplayName: 'North Region',
        entityStatus: 'ACTIVE',
        aliases: [],
      },
    ] as any);
    mockGetClientFileByGuid.mockResolvedValue({
      fileUploadGuid: formattedGuid,
      clientId: 'cli-1',
      fileName: 'upload.xlsx',
      insertedDttm: '2024-01-01T00:00:00Z',
    } as any);

    const request = { query: new URLSearchParams({ fileUploadGuid: guid }) } as any;
    const context = { warn: jest.fn(), error: jest.fn() } as any;

    const response = await listFileRecordsHandler(request, context);
    const body = JSON.parse(response.body as string);

    expect(response.status).toBe(200);
    expect(mockListFileRecords).toHaveBeenCalledWith(formattedGuid);
    expect(body.entities).toEqual([
      { id: '10', name: 'North Region', isSelected: true },
    ]);
    expect(body.items?.[0]).toEqual(
      expect.objectContaining({ entityName: 'North Region', entityId: '10' }),
    );
  });
});
