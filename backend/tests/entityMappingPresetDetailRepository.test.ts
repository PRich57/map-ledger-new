jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { runQuery } from '../src/utils/sqlClient';
import {
  createEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} from '../src/repositories/entityMappingPresetDetailRepository';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

const mockedRunQuery = runQuery as RunQueryMock;

describe('entityMappingPresetDetailRepository', () => {
  beforeEach(() => {
    mockedRunQuery.mockReset();
  });

  it('persists 40.75%/59.25% splits without rescaling and returns the stored values', async () => {
    const inputs = [
      {
        presetGuid: 'preset-1',
        targetDatapoint: 'target-1',
        specifiedPct: 40.75,
      },
      {
        presetGuid: 'preset-1',
        targetDatapoint: 'target-2',
        specifiedPct: 59.25,
      },
    ];

    mockedRunQuery.mockResolvedValueOnce({
      recordset: inputs.map((detail) => ({
        preset_guid: detail.presetGuid,
        basis_datapoint: null,
        target_datapoint: detail.targetDatapoint,
        is_calculated: null,
        specified_pct: detail.specifiedPct / 100,
        inserted_dttm: new Date('2025-01-01T00:00:00Z'),
        updated_dttm: new Date('2025-01-01T00:00:00Z'),
        updated_by: 'tester',
      })),
    } as any);

    const result = await createEntityMappingPresetDetails(inputs);
    expect(mockedRunQuery).toHaveBeenCalledTimes(1);

    const params = mockedRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.specifiedPct0).toBe(0.4075);
    expect(params.specifiedPct1).toBe(0.5925);
    expect(result.map((row) => row.specifiedPct)).toEqual([40.75, 59.25]);
  });

  it('updates specified percentages without rescaling and returns the retrieved row', async () => {
    mockedRunQuery
      .mockResolvedValueOnce({ recordset: [] } as any)
      .mockResolvedValueOnce({
        recordset: [
          {
            preset_guid: 'preset-2',
            basis_datapoint: null,
            target_datapoint: 'target-update',
            is_calculated: null,
            specified_pct: 0.4075,
            inserted_dttm: new Date('2025-02-01T00:00:00Z'),
            updated_dttm: new Date('2025-02-01T00:00:00Z'),
            updated_by: 'updater',
          },
        ],
      } as any);

    const result = await updateEntityMappingPresetDetail('preset-2', null, 'target-update', {
      specifiedPct: 40.75,
      updatedBy: 'updater',
    });

    const updateParams = mockedRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(updateParams.specifiedPct).toBe(0.4075);
    expect(result?.specifiedPct).toBe(40.75);
  });
});
