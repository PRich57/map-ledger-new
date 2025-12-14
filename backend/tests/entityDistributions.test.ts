import { buildDetailInputs } from '../src/functions/entityDistributions/index';

describe('buildDetailInputs', () => {
  it('marks direct distributions as non-calculated and assigns 100% to the first operation', () => {
    const operations = [
      { operationCd: 'OP-PRIMARY', allocation: 0 },
    ];
    const result = buildDetailInputs(operations, 'preset-1', 'direct', 'tester');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      operationCd: 'OP-PRIMARY',
      presetGuid: 'preset-1',
      isCalculated: false,
      specifiedPct: 100,
      basisDatapoint: null,
    });
  });

  it('uses provided allocation percentages for percentage distributions', () => {
    const operations = [
      { operationCd: 'OP-ONE', allocation: 50 },
      { operationCd: 'OP-TWO', allocation: 50 },
    ];
    const result = buildDetailInputs(operations, 'preset-2', 'percentage', 'tester');

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.specifiedPct)).toEqual([50, 50]);
    result.forEach((row) => {
      expect(row.isCalculated).toBe(false);
      expect(row.basisDatapoint).toBeNull();
    });
  });

  it('treats dynamic distributions as calculated and preserves basis datapoints', () => {
    const operations = [
      { operationCd: 'OP-DYN-1', basisDatapoint: ' basis-one ' },
      { operationCd: 'OP-DYN-2', basisDatapoint: 'basis-two' },
    ];
    const result = buildDetailInputs(operations, 'preset-3', 'dynamic', 'tester');

    expect(result).toHaveLength(2);
    result.forEach((row, index) => {
      expect(row.isCalculated).toBe(true);
      expect(row.specifiedPct).toBeNull();
      expect(row.basisDatapoint).toBe(operations[index].basisDatapoint?.trim() ?? null);
    });
  });
});
