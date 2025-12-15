jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn().mockResolvedValue({ recordset: [] }),
  withQueryTracking: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => ({
    result: await fn(),
    queryCount: 0,
  })),
}));

jest.mock('../src/http', () => ({
  readJson: jest.fn(),
  json: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('../src/repositories/entityAccountMappingRepository', () => ({
  listEntityAccountMappingsForAccounts: jest.fn(),
  listEntityAccountMappingsWithActivityForEntity: jest.fn(),
  upsertEntityAccountMappings: jest.fn(),
}));

jest.mock('../src/repositories/entityAccountRepository', () => ({
  upsertEntityAccounts: jest.fn(),
}));

jest.mock('../src/repositories/entityMappingPresetRepository', () => ({
  listEntityMappingPresets: jest.fn(),
  listEntityMappingPresetsRaw: jest.fn(),
  createEntityMappingPreset: jest.fn(),
  updateEntityMappingPreset: jest.fn(),
  normalizePresetTypeValue: jest.requireActual('../src/repositories/entityMappingPresetRepository')
    .normalizePresetTypeValue,
  ALLOWED_PRESET_TYPES: jest.requireActual('../src/repositories/entityMappingPresetRepository')
    .ALLOWED_PRESET_TYPES,
}));

jest.mock('../src/repositories/entityMappingPresetDetailRepository', () => ({
  listEntityMappingPresetDetails: jest.fn(),
  createEntityMappingPresetDetails: jest.fn(),
  updateEntityMappingPresetDetail: jest.fn(),
}));

jest.mock('../src/repositories/entityScoaActivityRepository', () => ({
  listEntityScoaActivity: jest.fn(),
  upsertEntityScoaActivity: jest.fn(),
}));

jest.mock('../src/repositories/entityPresetMappingRepository', () => ({
  deleteEntityPresetMappings: jest.fn(),
  createEntityPresetMappings: jest.fn(),
  listEntityPresetMappings: jest.fn(),
  listEntityPresetMappingsByPresetGuids: jest.fn(),
}));

import { SAVE_ROW_LIMIT, saveHandler } from '../src/functions/entityAccountMappings';
import { readJson, json } from '../src/http';
import {
  listEntityAccountMappingsForAccounts,
  listEntityAccountMappingsWithActivityForEntity,
  upsertEntityAccountMappings,
} from '../src/repositories/entityAccountMappingRepository';
import { upsertEntityAccounts } from '../src/repositories/entityAccountRepository';
import {
  listEntityMappingPresets,
  createEntityMappingPreset,
  updateEntityMappingPreset,
  listEntityMappingPresetsRaw,
} from '../src/repositories/entityMappingPresetRepository';
import { listEntityScoaActivity, upsertEntityScoaActivity } from '../src/repositories/entityScoaActivityRepository';
import { deleteEntityPresetMappings, createEntityPresetMappings, listEntityPresetMappingsByPresetGuids, listEntityPresetMappings } from '../src/repositories/entityPresetMappingRepository';
import {
  createEntityMappingPresetDetails,
  listEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} from '../src/repositories/entityMappingPresetDetailRepository';

type ReadJsonMock = jest.MockedFunction<typeof readJson>;
type JsonMock = jest.MockedFunction<typeof json>;
type UpsertMappingsMock = jest.MockedFunction<typeof upsertEntityAccountMappings>;
type ListMappingsMock = jest.MockedFunction<typeof listEntityAccountMappingsForAccounts>;
type ListMappingsWithActivityMock = jest.MockedFunction<typeof listEntityAccountMappingsWithActivityForEntity>;
type ListPresetsMock = jest.MockedFunction<typeof listEntityMappingPresets>;
type ListPresetsRawMock = jest.MockedFunction<typeof listEntityMappingPresetsRaw>;
type UpsertAccountsMock = jest.MockedFunction<typeof upsertEntityAccounts>;
type UpsertActivityMock = jest.MockedFunction<typeof upsertEntityScoaActivity>;
type ListEntityActivityMock = jest.MockedFunction<typeof listEntityScoaActivity>;
type DeletePresetMappingMock = jest.MockedFunction<typeof deleteEntityPresetMappings>;
type CreatePresetMappingMock = jest.MockedFunction<typeof createEntityPresetMappings>;
type ListPresetMappingsMock = jest.MockedFunction<typeof listEntityPresetMappingsByPresetGuids>;
type ListPresetMappingsExistingMock = jest.MockedFunction<typeof listEntityPresetMappings>;
type CreatePresetDetailsMock = jest.MockedFunction<typeof createEntityMappingPresetDetails>;
type ListPresetDetailsMock = jest.MockedFunction<typeof listEntityMappingPresetDetails>;
type UpdatePresetDetailMock = jest.MockedFunction<typeof updateEntityMappingPresetDetail>;
type CreatePresetMock = jest.MockedFunction<typeof createEntityMappingPreset>;
type UpdatePresetMock = jest.MockedFunction<typeof updateEntityMappingPreset>;

const mockedReadJson = readJson as ReadJsonMock;
const mockedJson = json as JsonMock;
const mockedUpsertMappings = upsertEntityAccountMappings as UpsertMappingsMock;
const mockedListMappings = listEntityAccountMappingsForAccounts as ListMappingsMock;
const mockedListMappingsWithActivity = listEntityAccountMappingsWithActivityForEntity as ListMappingsWithActivityMock;
const mockedListPresets = listEntityMappingPresets as ListPresetsMock;
const mockedListPresetsRaw = listEntityMappingPresetsRaw as ListPresetsRawMock;
const mockedUpsertAccounts = upsertEntityAccounts as UpsertAccountsMock;
const mockedUpsertActivity = upsertEntityScoaActivity as UpsertActivityMock;
const mockedListEntityScoaActivity = listEntityScoaActivity as ListEntityActivityMock;
const mockedDeletePresetMappings = deleteEntityPresetMappings as DeletePresetMappingMock;
const mockedCreatePresetMappings = createEntityPresetMappings as CreatePresetMappingMock;
const mockedListPresetMappings = listEntityPresetMappingsByPresetGuids as ListPresetMappingsMock;
const mockedListPresetMappingsExisting = listEntityPresetMappings as ListPresetMappingsExistingMock;
const mockedCreatePresetDetails = createEntityMappingPresetDetails as CreatePresetDetailsMock;
const mockedListPresetDetails = listEntityMappingPresetDetails as ListPresetDetailsMock;
const mockedUpdatePresetDetail = updateEntityMappingPresetDetail as UpdatePresetDetailMock;
const mockedCreatePreset = createEntityMappingPreset as CreatePresetMock;
const mockedUpdatePreset = updateEntityMappingPreset as UpdatePresetMock;

const resetSaveHandlerMocks = () => {
  mockedListMappings.mockResolvedValue([]);
  mockedListMappingsWithActivity.mockResolvedValue([] as any);
  mockedListPresets.mockResolvedValue([]);
  mockedListPresetsRaw.mockResolvedValue([]);
  mockedReadJson.mockResolvedValue({});
  mockedUpsertMappings.mockResolvedValue([]);
  mockedUpsertAccounts.mockResolvedValue([]);
  mockedUpsertActivity.mockResolvedValue([]);
  mockedListEntityScoaActivity.mockResolvedValue([] as any);
  mockedDeletePresetMappings.mockResolvedValue(0 as any);
  mockedCreatePresetMappings.mockResolvedValue([] as any);
  mockedListPresetMappingsExisting.mockResolvedValue([] as any);
  mockedListPresetMappings.mockResolvedValue([] as any);
  mockedCreatePresetDetails.mockResolvedValue([] as any);
  mockedListPresetDetails.mockResolvedValue([] as any);
  mockedUpdatePresetDetail.mockResolvedValue(null as any);
  mockedCreatePreset.mockResolvedValue(undefined as any);
  mockedUpdatePreset.mockResolvedValue(null as any);
};

describe('entityAccountMappings save handler change detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSaveHandlerMocks();
  });

  it('short-circuits when no changed rows are provided', async () => {
    mockedReadJson.mockResolvedValue({ changedRows: [] });

    const response = await saveHandler({} as any, { log: jest.fn(), error: jest.fn() } as any);

    expect(response).toEqual({ items: [], message: 'No mapping changes to apply' });
    expect(mockedUpsertMappings).not.toHaveBeenCalled();
    expect(mockedUpsertAccounts).not.toHaveBeenCalled();
    expect(mockedUpsertActivity).not.toHaveBeenCalled();
  });

  it('processes unchanged mappings when preset refresh is needed', async () => {
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
    expect(mockedUpsertMappings).toHaveBeenCalledWith([
      expect.objectContaining({
        entityId: 'ent-1',
        entityAccountId: 'acct-1',
        mappingType: 'direct',
        mappingStatus: 'Mapped',
        presetId: 'preset-1',
        polarity: 'Debit',
        exclusionPct: null,
        updatedBy: 'tester',
      }),
    ]);
    expect(mockedCreatePresetDetails).not.toHaveBeenCalled();
    expect(mockedDeletePresetMappings).not.toHaveBeenCalled();
  });

  it('aggregates SCOA activity totals across mapped accounts for affected months', async () => {
    const payload = {
      items: [
        {
          entityId: 'ent-1',
          entityAccountId: 'acct-2',
          accountName: 'Second account',
          mappingType: 'percentage',
          mappingStatus: 'Mapped',
          presetId: 'preset-2',
          netChange: 50,
          glMonth: '2024-01',
          updatedBy: 'tester',
          splitDefinitions: [
            {
              targetId: 'scoa-1',
              allocationType: 'percentage',
              allocationValue: 100,
            },
          ],
        },
      ],
    };

    mockedReadJson.mockResolvedValue(payload);
    mockedListMappingsWithActivity.mockResolvedValue([
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-1',
        accountName: 'Existing account',
        activityAmount: 120,
        glMonth: '2024-01',
        mappingType: 'direct',
        mappingStatus: 'Mapped',
        presetId: 'preset-1',
        presetDetails: [{ targetDatapoint: 'scoa-1', specifiedPct: 100 }],
      },
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-2',
        accountName: 'Second account',
        activityAmount: 50,
        glMonth: '2024-01',
        mappingType: 'percentage',
        mappingStatus: 'Mapped',
        presetId: 'preset-2',
        presetDetails: [{ targetDatapoint: 'scoa-1', specifiedPct: 100 }],
      },
    ] as any);
    mockedUpsertMappings.mockResolvedValue([
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-2',
        mappingType: 'percentage',
        mappingStatus: 'Mapped',
        presetId: 'preset-2',
      },
    ] as any);

    const response = await saveHandler({} as any, { log: jest.fn(), error: jest.fn() } as any);

    expect(response).toEqual({ items: [{ entityId: 'ent-1', entityAccountId: 'acct-2', mappingType: 'percentage', mappingStatus: 'Mapped', presetId: 'preset-2' }] });
    expect(mockedListMappingsWithActivity).toHaveBeenCalledWith('ent-1', ['2024-01-01']);
    expect(mockedUpsertActivity).toHaveBeenCalledTimes(1);
    expect(mockedUpsertActivity).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: 'ent-1',
          scoaAccountId: 'scoa-1',
          activityMonth: '2024-01-01',
          activityValue: 170,
          updatedBy: 'tester',
        }),
      ]),
    );
    expect(mockedListEntityScoaActivity).toHaveBeenCalledWith('ent-1');
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

  it('updates preset type when mapping type changes for an existing preset', async () => {
    const payload = {
      changedRows: [
        {
          entityId: 'ent-1',
          entityAccountId: 'acct-1',
          accountName: 'Account One',
          mappingType: 'percentage',
          mappingStatus: 'Mapped',
          presetId: 'preset-1',
          polarity: 'Debit',
          exclusionPct: null,
          updatedBy: 'tester@example.com',
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
    mockedListPresetsRaw.mockResolvedValue([
      {
        presetGuid: 'preset-1',
        entityId: 'ent-1',
        presetType: 'direct',
        presetDescription: 'Existing preset',
        insertedDttm: null,
        updatedDttm: null,
        updatedBy: null,
      },
    ]);
    mockedUpsertMappings.mockResolvedValue([
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-1',
        mappingType: 'percentage',
        mappingStatus: 'Mapped',
        presetId: 'preset-1',
        polarity: 'Debit',
        exclusionPct: null,
      },
    ]);

    const response = await saveHandler({} as any, { log: jest.fn(), error: jest.fn() } as any);

    expect(response).toEqual({
      items: [
        expect.objectContaining({
          entityId: 'ent-1',
          entityAccountId: 'acct-1',
          mappingType: 'percentage',
          presetId: 'preset-1',
        }),
      ],
    });
    expect(mockedUpdatePreset).toHaveBeenCalledWith(
      'preset-1',
      expect.objectContaining({
        presetType: 'percentage',
        updatedBy: 'tester@example.com',
      }),
    );
  });
});

describe('entityAccountMappings preset creation', () => {
  const context = { log: jest.fn(), error: jest.fn() } as any;
  const accountName = 'Driver Payroll Taxes';
  beforeEach(() => {
    jest.clearAllMocks();
    resetSaveHandlerMocks();
    context.log.mockClear();
    context.error.mockClear();
  });
  const payloadFor = (mappingType: string, mappingStatus: string) => ({
    items: [
      {
        entityId: 'ent-1',
        entityAccountId: 'acct-1',
        accountName,
        polarity: 'Debit',
        mappingType,
        mappingStatus,
        netChange: 100,
        updatedBy: 'tester',
      },
    ],
  });

  it.each([
    {
      label: 'dynamic shorthand',
      mappingType: 'd',
      expectedType: 'dynamic',
      status: 'Mapped',
    },
    {
      label: 'percentage shorthand',
      mappingType: 'p',
      expectedType: 'percentage',
      status: 'Mapped',
    },
    {
      label: 'excluded shorthand',
      mappingType: 'x',
      expectedType: 'excluded',
      status: 'Excluded',
    },
    {
      label: 'direct mapping',
      mappingType: 'direct',
      expectedType: 'direct',
      status: 'Mapped',
    },
  ])('normalizes %s preset type and description', async ({ mappingType, expectedType, status }) => {
    mockedReadJson.mockResolvedValue(payloadFor(mappingType, status));
    const response = await saveHandler({} as any, context);

    expect(mockedCreatePreset).toHaveBeenCalledTimes(1);
    const [presetInput] = mockedCreatePreset.mock.calls[0];
    expect(presetInput.presetType).toBe(expectedType);
    expect(presetInput.presetDescription).toBe(accountName);
    expect(response).toEqual({ items: [] });
  });
});
