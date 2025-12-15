import { mapDistributionPresetsToDynamic, type DistributionPresetPayload } from './distributionPresetService';

describe('distributionPresetService', () => {
  test('preserves all dynamic preset rows using basis datapoints', () => {
    const payload: DistributionPresetPayload[] = [
      {
        presetGuid: 'preset-123',
        entityId: 'entity-1',
        presetType: 'dynamic',
        presetDescription: 'Dynamic preset',
        scoaAccountId: '6000',
        metric: null,
        presetDetails: [
          { operationCd: 'ops-a', basisDatapoint: 'BASIS-1' },
          { operationCd: 'ops-b', basisDatapoint: 'BASIS-2' },
        ],
      },
    ];

    const result = mapDistributionPresetsToDynamic(payload);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'preset-123',
      name: 'Dynamic preset',
      rows: [
        { dynamicAccountId: 'BASIS-1', targetAccountId: 'OPS-A' },
        { dynamicAccountId: 'BASIS-2', targetAccountId: 'OPS-B' },
      ],
    });
  });

  test('falls back to SCOA account when basis datapoint is missing', () => {
    const payload: DistributionPresetPayload[] = [
      {
        presetGuid: 'preset-456',
        entityId: 'entity-2',
        presetType: 'dynamic',
        presetDescription: 'No basis preset',
        scoaAccountId: '7000',
        metric: null,
        presetDetails: [{ operationCd: 'ops-c', basisDatapoint: null }],
      },
    ];

    const result = mapDistributionPresetsToDynamic(payload);

    expect(result[0].rows).toEqual([{ dynamicAccountId: '7000', targetAccountId: 'OPS-C' }]);
  });
});
