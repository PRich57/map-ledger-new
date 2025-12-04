jest.mock('../src/repositories/fileRecordRepository', () => ({
  insertFileRecords: jest.fn(),
  listFileRecords: jest.fn(),
}));
jest.mock('../src/repositories/clientFileSheetRepository', () => ({
  insertClientFileSheet: jest.fn(),
}));
jest.mock('../src/repositories/clientFileEntityRepository', () => ({
  insertClientFileEntity: jest.fn(),
}));

import { ingestFileRecordsHandler } from '../src/functions/fileRecords';
import { insertFileRecords } from '../src/repositories/fileRecordRepository';
import { insertClientFileSheet } from '../src/repositories/clientFileSheetRepository';
import { insertClientFileEntity } from '../src/repositories/clientFileEntityRepository';

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
  const mockInsertClientFileSheet =
    insertClientFileSheet as jest.MockedFunction<typeof insertClientFileSheet>;
  const mockInsertClientFileEntity =
    insertClientFileEntity as jest.MockedFunction<typeof insertClientFileEntity>;

  beforeEach(() => {
    jest.clearAllMocks();
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
