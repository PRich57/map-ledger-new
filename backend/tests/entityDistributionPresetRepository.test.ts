jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { runQuery } from '../src/utils/sqlClient';
import { createEntityDistributionPreset } from '../src/repositories/entityDistributionPresetRepository';
import type { EntityDistributionPresetInput } from '../src/repositories/entityDistributionPresetRepository';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

const mockedRunQuery = runQuery as RunQueryMock;

describe('entityDistributionPresetRepository', () => {
  beforeEach(() => {
    mockedRunQuery.mockReset();
  });

  it('updates an existing preset when the entity and SCOA account already have one', async () => {
    mockedRunQuery
      // Existing preset lookup
      .mockResolvedValueOnce({
        recordset: [
          {
            preset_guid: 'preset-existing',
            entity_id: 'ent-1',
            preset_type: 'direct',
            preset_description: 'Existing desc',
            scoa_account_id: 'SCOA-1',
            metric: 'old-metric',
            inserted_dttm: new Date('2023-01-01T00:00:00Z'),
          },
        ],
      } as any)
      // Update statement
      .mockResolvedValueOnce({ rowsAffected: [1] } as any)
      // Reload after update
      .mockResolvedValueOnce({
        recordset: [
          {
            preset_guid: 'preset-existing',
            entity_id: 'ent-1',
            preset_type: 'percentage',
            preset_description: 'Updated desc',
            scoa_account_id: 'SCOA-1',
            metric: 'metric-new',
            inserted_dttm: new Date('2023-01-01T00:00:00Z'),
            updated_dttm: new Date('2023-01-02T00:00:00Z'),
          },
        ],
      } as any);

    const input: EntityDistributionPresetInput = {
      entityId: 'ent-1',
      presetType: 'percentage',
      presetDescription: 'Updated desc',
      scoaAccountId: 'SCOA-1',
      metric: 'metric-new',
    };

    const result = await createEntityDistributionPreset(input);

    expect(mockedRunQuery).toHaveBeenCalledTimes(3);
    expect((mockedRunQuery.mock.calls[1]?.[0] as string).toLowerCase()).toContain(
      'update ml.entity_distribution_presets',
    );
    expect(result).toMatchObject({
      presetGuid: 'preset-existing',
      presetType: 'percentage',
      presetDescription: 'Updated desc',
      scoaAccountId: 'SCOA-1',
      metric: 'metric-new',
    });
  });

  it('creates a new preset when no matching record exists', async () => {
    mockedRunQuery
      // Existing preset lookup returns nothing
      .mockResolvedValueOnce({ recordset: [] } as any)
      // Insert new preset
      .mockResolvedValueOnce({
        recordset: [
          {
            preset_guid: 'new-guid',
            entity_id: 'ent-2',
            preset_type: 'direct',
            preset_description: 'New preset',
            scoa_account_id: 'SCOA-2',
            metric: null,
            inserted_dttm: new Date('2023-01-03T00:00:00Z'),
          },
        ],
      } as any);

    const input: EntityDistributionPresetInput = {
      entityId: 'ent-2',
      presetType: 'direct',
      presetDescription: 'New preset',
      scoaAccountId: 'SCOA-2',
    };

    const result = await createEntityDistributionPreset(input);

    expect(mockedRunQuery).toHaveBeenCalledTimes(2);
    expect((mockedRunQuery.mock.calls[1]?.[0] as string).toLowerCase()).toContain(
      'insert into ml.entity_distribution_presets',
    );
    expect(result).toMatchObject({
      presetGuid: 'new-guid',
      entityId: 'ent-2',
      scoaAccountId: 'SCOA-2',
      presetType: 'direct',
      presetDescription: 'New preset',
    });
  });
});
