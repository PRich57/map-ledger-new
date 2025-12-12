jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { runQuery } from '../src/utils/sqlClient';
import {
  createEntityDistributionPresetDetails,
  updateEntityDistributionPresetDetail,
} from '../src/repositories/entityDistributionPresetDetailRepository';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

const mockedRunQuery = runQuery as RunQueryMock;

describe('entityDistributionPresetDetailRepository', () => {
  beforeEach(() => {
    mockedRunQuery.mockReset();
  });

  it('persists 100%/20% splits without scaling and returns the stored values', async () => {
    const inputs = [
      {
        presetGuid: 'dist-preset-1',
        operationCd: 'OP1',
        specifiedPct: 100,
      },
      {
        presetGuid: 'dist-preset-1',
        operationCd: 'OP2',
        specifiedPct: 20,
      },
    ];

    mockedRunQuery.mockResolvedValueOnce({
      recordset: inputs.map((detail) => ({
        preset_guid: detail.presetGuid,
        operation_cd: detail.operationCd,
        is_calculated: null,
        specified_pct: detail.specifiedPct / 100,
        inserted_dttm: new Date('2025-03-01T00:00:00Z'),
        updated_dttm: new Date('2025-03-01T00:00:00Z'),
        updated_by: 'tester',
      })),
    } as any);

    const result = await createEntityDistributionPresetDetails(inputs);
    expect(mockedRunQuery).toHaveBeenCalledTimes(1);

    const params = mockedRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.specifiedPct0).toBe(1);
    expect(params.specifiedPct1).toBe(0.2);
    expect(result.map((row) => row.specifiedPct)).toEqual([100, 20]);
  });

  it('updates specified percentages without rescaling and returns the retrieved row', async () => {
    mockedRunQuery
      .mockResolvedValueOnce({ recordset: [] } as any)
      .mockResolvedValueOnce({
        recordset: [
          {
            preset_id: 'dist-preset-2',
            operation_cd: 'OP-update',
            is_calculated: null,
            specified_pct: 1,
            inserted_dttm: new Date('2025-04-01T00:00:00Z'),
            updated_dttm: new Date('2025-04-01T00:00:00Z'),
            updated_by: 'updater',
          },
        ],
      } as any);

    const result = await updateEntityDistributionPresetDetail('dist-preset-2', 'OP-update', {
      specifiedPct: 100,
      updatedBy: 'updater',
    });

    const updateParams = mockedRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(updateParams.specifiedPct).toBe(1);
    expect(result?.specifiedPct).toBe(100);
  });
});
