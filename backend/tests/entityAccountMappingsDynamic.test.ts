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

const { saveHandler } = require('../src/functions/entityAccountMappings/index');
const { readJson, json } = require('../src/http');
const {
  listEntityAccountMappingsForAccounts,
  upsertEntityAccountMappings,
} = require('../src/repositories/entityAccountMappingRepository');
const { upsertEntityAccounts } = require('../src/repositories/entityAccountRepository');
const {
  listEntityMappingPresets,
  createEntityMappingPreset,
} = require('../src/repositories/entityMappingPresetRepository');
const {
  listEntityMappingPresetDetails,
  createEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} = require('../src/repositories/entityMappingPresetDetailRepository');
const { upsertEntityScoaActivity } = require('../src/repositories/entityScoaActivityRepository');
const {
  deleteEntityPresetMappings,
  createEntityPresetMappings,
} = require('../src/repositories/entityPresetMappingRepository');

const mockedReadJson = readJson;
const mockedJson = json;
const mockedListMappings = listEntityAccountMappingsForAccounts;
const mockedCreatePreset = createEntityMappingPreset;
const mockedCreateDetails = createEntityMappingPresetDetails;
const mockedUpdateDetail = updateEntityMappingPresetDetail;
const mockedListPresetDetails = listEntityMappingPresetDetails;
const mockedListPresets = listEntityMappingPresets;
const mockedUpsertMappings = upsertEntityAccountMappings;
const mockedUpsertAccounts = upsertEntityAccounts;
const mockedUpsertActivity = upsertEntityScoaActivity;
const mockedDeletePresetMappings = deleteEntityPresetMappings;
const mockedCreatePresetMappings = createEntityPresetMappings;

const expectedEntityMapping = {
  entityId: 'ent-1',
  entityAccountId: 'acct-1',
  mappingType: 'dynamic',
  presetId: 'preset-dynamic',
};

const dynamicPayload = {
  items: [
    {
      entityId: 'ent-1',
      entityAccountId: 'acct-1',
      accountName: 'Dynamic account',
      polarity: 'Debit',
      mappingType: 'dynamic',
      mappingStatus: 'Mapped',
      presetId: 'preset-dynamic',
      exclusionPct: null,
      netChange: 100,
      glMonth: '2025-01-01',
      updatedBy: 'tester',
      splitDefinitions: [
        {
          targetId: 'target-1',
          basisDatapoint: 'basis-1',
          allocationType: 'dynamic',
          allocationValue: 60,
          isCalculated: true,
        },
        {
          targetId: 'target-2',
          basisDatapoint: 'basis-2',
          allocationType: 'dynamic',
          allocationValue: 40,
          isCalculated: true,
        },
      ],
    },
  ],
};

describe('entityAccountMappings save handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReadJson.mockResolvedValue(dynamicPayload);
    mockedListMappings.mockResolvedValue([]);
    mockedListPresetDetails.mockResolvedValue([]);
    mockedListPresets.mockResolvedValue([]);
    mockedCreatePreset.mockResolvedValue(undefined);
    mockedCreateDetails.mockResolvedValue([]);
    mockedUpdateDetail.mockResolvedValue(null);
    mockedUpsertMappings.mockResolvedValue([expectedEntityMapping]);
    mockedUpsertAccounts.mockResolvedValue([]);
    mockedUpsertActivity.mockResolvedValue([]);
    mockedDeletePresetMappings.mockResolvedValue(0);
    mockedCreatePresetMappings.mockResolvedValue([]);
  });

  it('persists dynamic mapping preset records', async () => {
    const req = {};
    const context = {
      log: jest.fn(),
      error: jest.fn(),
    };

    const response = await saveHandler(req, context);

    expect(response).toEqual({ items: [expectedEntityMapping] });
    expect(mockedCreateDetails).toHaveBeenCalled();
    expect(mockedCreatePresetMappings).toHaveBeenCalledTimes(1);

    const [presetParams] = mockedCreatePresetMappings.mock.calls[0];
    expect(presetParams).toHaveLength(2);
    expect(presetParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          basisDatapoint: 'basis-1',
          targetDatapoint: 'target-1',
          appliedPct: 60,
        }),
        expect.objectContaining({
          basisDatapoint: 'basis-2',
          targetDatapoint: 'target-2',
          appliedPct: 40,
        }),
      ]),
    );
  });
});
