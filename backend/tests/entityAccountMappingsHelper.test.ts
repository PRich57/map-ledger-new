import {
  buildDynamicPresetMappingInputs,
  normalizeSplitDefinitions,
} from '../src/functions/entityAccountMappings/helpers';

const DYNAMIC_SPLITS = [
  {
    targetId: 'target-one',
    basisDatapoint: 'basis-one',
    allocationType: 'percentage',
    allocationValue: 60,
    isCalculated: true,
  },
  {
    targetId: 'target-two',
    basisDatapoint: 'basis-two',
    allocationType: 'percentage',
    allocationValue: 40,
    isCalculated: true,
  },
];

const textNormalizer = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const numberNormalizer = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolutionTools = {
  normalizeText: textNormalizer,
  normalizeNumber: numberNormalizer,
  resolvePresetType: (value: string | null | undefined): string => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : null;
    if (normalized === 'percentage' || normalized === 'dynamic') {
      return normalized;
    }
    return 'direct';
  },
};

describe('entityAccountMappings helpers', () => {
  it('normalizes dynamic split definitions with calculated flags and no specified percentages', () => {
    const normalized = normalizeSplitDefinitions(
      'dynamic',
      DYNAMIC_SPLITS,
      null,
      null,
      resolutionTools,
    );

    expect(normalized).toEqual([
      {
        basisDatapoint: 'basis-one',
        targetDatapoint: 'target-one',
        isCalculated: true,
        specifiedPct: null,
        appliedPct: 60,
      },
      {
        basisDatapoint: 'basis-two',
        targetDatapoint: 'target-two',
        isCalculated: true,
        specifiedPct: null,
        appliedPct: 40,
      },
    ]);
  });

  it('builds preset mapping inputs for dynamic splits with applied percentages', () => {
    const result = buildDynamicPresetMappingInputs(
      'dynamic-preset',
      'dynamic',
      DYNAMIC_SPLITS,
      'tester',
      null,
      null,
      resolutionTools,
    );

    expect(result).toEqual([
      {
        presetGuid: 'dynamic-preset',
        basisDatapoint: 'basis-one',
        targetDatapoint: 'target-one',
        appliedPct: 60,
        updatedBy: 'tester',
      },
      {
        presetGuid: 'dynamic-preset',
        basisDatapoint: 'basis-two',
        targetDatapoint: 'target-two',
        appliedPct: 40,
        updatedBy: 'tester',
      },
    ]);
  });
});
