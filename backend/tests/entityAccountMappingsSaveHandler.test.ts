jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn().mockResolvedValue({ recordset: [] }),
}));

jest.mock('../src/http', () => ({
  readJson: jest.fn(),
  json: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('../src/repositories/entityAccountMappingRepository', () => ({
  listEntityAccountMappingsForAccounts: jest.fn(),
  upsertEntityAccountMappings: jest.fn(),
}));

jest.mock('../src/repositories/entityAccountRepository', () => ({
  upsertEntityAccounts: jest.fn(),
}));

jest.mock('../src/repositories/entityMappingPresetRepository', () => ({
  listEntityMappingPresets: jest.fn(),
  createEntityMappingPreset: jest.fn(),
}));

jest.mock('../src/repositories/entityMappingPresetDetailRepository', () => ({
  listEntityMappingPresetDetails: jest.fn(),
  createEntityMappingPresetDetails: jest.fn(),
  updateEntityMappingPresetDetail: jest.fn(),
}));

jest.mock('../src/repositories/entityScoaActivityRepository', () => ({
  upsertEntityScoaActivity: jest.fn(),
}));

jest.mock('../src/repositories/entityPresetMappingRepository', () => ({
  deleteEntityPresetMappings: jest.fn(),
  createEntityPresetMappings: jest.fn(),
}));

import { SAVE_ROW_LIMIT, saveHandler } from '../src/functions/entityAccountMappings';
import { readJson, json } from '../src/http';
import {
  listEntityAccountMappingsForAccounts,
  upsertEntityAccountMappings,
} from '../src/repositories/entityAccountMappingRepository';
import { upsertEntityAccounts } from '../src/repositories/entityAccountRepository';
import { listEntityMappingPresets } from '../src/repositories/entityMappingPresetRepository';
import { upsertEntityScoaActivity } from '../src/repositories/entityScoaActivityRepository';
import { deleteEntityPresetMappings, createEntityPresetMappings } from '../src/repositories/entityPresetMappingRepository';
import {
  createEntityMappingPresetDetails,
  listEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} from '../src/repositories/entityMappingPresetDetailRepository';
import { createEntityMappingPreset } from '../src/repositories/entityMappingPresetRepository';

type ReadJsonMock = jest.MockedFunction<typeof readJson>;
type JsonMock = jest.MockedFunction<typeof json>;
type UpsertMappingsMock = jest.MockedFunction<typeof upsertEntityAccountMappings>;
type ListMappingsMock = jest.MockedFunction<typeof listEntityAccountMappingsForAccounts>;
type ListPresetsMock = jest.MockedFunction<typeof listEntityMappingPresets>;
type UpsertAccountsMock = jest.MockedFunction<typeof upsertEntityAccounts>;
type UpsertActivityMock = jest.MockedFunction<typeof upsertEntityScoaActivity>;
type DeletePresetMappingMock = jest.MockedFunction<typeof deleteEntityPresetMappings>;
type CreatePresetMappingMock = jest.MockedFunction<typeof createEntityPresetMappings>;
type CreatePresetDetailsMock = jest.MockedFunction<typeof createEntityMappingPresetDetails>;
type ListPresetDetailsMock = jest.MockedFunction<typeof listEntityMappingPresetDetails>;
type UpdatePresetDetailMock = jest.MockedFunction<typeof updateEntityMappingPresetDetail>;
type CreatePresetMock = jest.MockedFunction<typeof createEntityMappingPreset>;

const mockedReadJson = readJson as ReadJsonMock;
const mockedJson = json as JsonMock;
const mockedUpsertMappings = upsertEntityAccountMappings as UpsertMappingsMock;
const mockedListMappings = listEntityAccountMappingsForAccounts as ListMappingsMock;
const mockedListPresets = listEntityMappingPresets as ListPresetsMock;
const mockedUpsertAccounts = upsertEntityAccounts as UpsertAccountsMock;
const mockedUpsertActivity = upsertEntityScoaActivity as UpsertActivityMock;
const mockedDeletePresetMappings = deleteEntityPresetMappings as DeletePresetMappingMock;
const mockedCreatePresetMappings = createEntityPresetMappings as CreatePresetMappingMock;
const mockedCreatePresetDetails = createEntityMappingPresetDetails as CreatePresetDetailsMock;
const mockedListPresetDetails = listEntityMappingPresetDetails as ListPresetDetailsMock;
const mockedUpdatePresetDetail = updateEntityMappingPresetDetail as UpdatePresetDetailMock;
const mockedCreatePreset = createEntityMappingPreset as CreatePresetMock;

describe('entityAccountMappings save handler change detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedListMappings.mockResolvedValue([]);
    mockedListPresets.mockResolvedValue([]);
    mockedReadJson.mockResolvedValue({});
    mockedUpsertMappings.mockResolvedValue([]);
    mockedUpsertAccounts.mockResolvedValue([]);
    mockedUpsertActivity.mockResolvedValue([]);
    mockedDeletePresetMappings.mockResolvedValue(0 as any);
    mockedCreatePresetMappings.mockResolvedValue([] as any);
    mockedCreatePresetDetails.mockResolvedValue([] as any);
    mockedListPresetDetails.mockResolvedValue([] as any);
    mockedUpdatePresetDetail.mockResolvedValue(null as any);
    mockedCreatePreset.mockResolvedValue(undefined as any);
  });

  it('short-circuits when no changed rows are provided', async () => {
    mockedReadJson.mockResolvedValue({ changedRows: [] });

    const response = await saveHandler({} as any, { log: jest.fn(), error: jest.fn() } as any);

    expect(response).toEqual({ items: [], message: 'No mapping changes to apply' });
    expect(mockedUpsertMappings).not.toHaveBeenCalled();
    expect(mockedUpsertAccounts).not.toHaveBeenCalled();
    expect(mockedUpsertActivity).not.toHaveBeenCalled();
  });

  it('skips unchanged mappings when incoming data matches stored values', async () => {
    const payload = {
      changedRows: [
        {
          entityId: 'ent-1',
          entityAccountId: 'acct-1',
          accountName: 'Same account',
          mappingType: 'direct',
          mappingStatus: 'Mapped',
          presetId: 'preset-1',
          polarity: 'Debit',
          exclusionPct: null,
          updatedBy: 'tester',
        },
      ],
    };

    mockedReadJson.mockResolvedValue(payload);
    mockedListMappings.mockResolvedValue([
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-1',
        mappingType: 'direct',
        mappingStatus: 'Mapped',
        presetId: 'preset-1',
        polarity: 'Debit',
        exclusionPct: null,
      },
    ] as any);

    const response = await saveHandler({} as any, { log: jest.fn(), error: jest.fn() } as any);

    expect(response).toEqual({ items: [] });
    expect(mockedUpsertMappings).toHaveBeenCalledWith([]);
    expect(mockedCreatePresetDetails).not.toHaveBeenCalled();
    expect(mockedDeletePresetMappings).not.toHaveBeenCalled();
  });

  it('rejects save requests that exceed the configured row limit', async () => {
    const overLimitRows = SAVE_ROW_LIMIT + 1;
    const payload = {
      items: Array.from({ length: overLimitRows }, (_value, index) => ({
        entityId: `ent-${index}`,
        entityAccountId: `acct-${index}`,
        accountName: `Account ${index + 1}`,
        mappingType: 'direct',
        polarity: 'Debit',
      })),
    };
    mockedReadJson.mockResolvedValue(payload);

    const context = { log: jest.fn(), error: jest.fn() } as any;
    const response = await saveHandler({} as any, context);

    const expectedMessage =
      'Too many mapping rows in a single save request. Save in smaller batches or use batch edits.';

    expect(mockedUpsertMappings).not.toHaveBeenCalled();
    expect(mockedUpsertAccounts).not.toHaveBeenCalled();
    expect(mockedUpsertActivity).not.toHaveBeenCalled();
    expect(mockedJson).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expectedMessage,
        details: expect.stringContaining(
          `exceeding the per-request limit of ${SAVE_ROW_LIMIT}`,
        ),
      }),
      413,
    );
    expect(response).toEqual(
      expect.objectContaining({
        message: expectedMessage,
        details: expect.stringContaining(
          `exceeding the per-request limit of ${SAVE_ROW_LIMIT}`,
        ),
      }),
    );
    expect(context.error).toHaveBeenCalledWith(
      'Mapping save request exceeds row limit',
      expect.objectContaining({
        limit: SAVE_ROW_LIMIT,
        requestedRows: overLimitRows,
      }),
    );
  });
});
