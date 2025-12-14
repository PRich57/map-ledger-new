jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

import { runQuery } from '../src/utils/sqlClient';
import { createEntityMappingPreset } from '../src/repositories/entityMappingPresetRepository';
import type { EntityMappingPresetInput } from '../src/repositories/entityMappingPresetRepository';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

const mockedRunQuery = runQuery as RunQueryMock;

describe('entityMappingPresetRepository', () => {
  beforeEach(() => {
    mockedRunQuery.mockReset();
    mockedRunQuery.mockResolvedValue({
      recordset: [
        {
          preset_guid: 'preset-guid',
          entity_id: 'ent-1',
          preset_type: 'dynamic',
          preset_description: 'preset-desc',
          inserted_dttm: new Date(),
        },
      ],
    } as any);
  });

  it.each([
    { inputType: 'd', expectedType: 'dynamic' },
    { inputType: 'dynamic', expectedType: 'dynamic' },
    { inputType: 'p', expectedType: 'percentage' },
    { inputType: 'percentage', expectedType: 'percentage' },
    { inputType: 'x', expectedType: 'excluded' },
    { inputType: 'exclude', expectedType: 'excluded' },
    { inputType: 'direct', expectedType: 'direct' },
  ])('normalizes %s preset type to the expected value', async ({ inputType, expectedType }) => {
    const input: EntityMappingPresetInput = {
      entityId: 'ent-1',
      presetType: inputType,
      presetDescription: 'preset-desc',
    };

    await createEntityMappingPreset(input);

    expect(mockedRunQuery).toHaveBeenCalledTimes(1);
    const params = mockedRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.presetType).toBe(expectedType);
  });
});
