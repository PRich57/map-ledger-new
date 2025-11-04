import { allocateDynamic } from '../utils/dynamicAllocation';

describe('allocateDynamic', () => {
  it('distributes amounts according to basis proportions', () => {
    const result = allocateDynamic(648188, [1156000, 139000, 564000]);

    expect(result.allocations[0]).toBeCloseTo(403069.03, 2);
    expect(result.allocations[1]).toBeCloseTo(48465.91, 2);
    expect(result.allocations[2]).toBeCloseTo(196653.06, 2);
    expect(result.allocations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(648188, 2);
    expect(result.adjustmentIndex).toBeNull();
    expect(result.adjustmentAmount).toBeCloseTo(0, 5);
  });

  it('rounds to cents and adjusts the largest allocation when necessary', () => {
    const result = allocateDynamic(100, [1, 1, 1]);

    expect(result.allocations.length).toBe(3);
    expect(result.allocations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 5);
    expect(result.adjustmentIndex).not.toBeNull();
    if (result.adjustmentIndex !== null) {
      expect(result.allocations[result.adjustmentIndex]).toBeCloseTo(33.34, 2);
    }
  });

  it('returns an empty allocation set when no basis values are provided', () => {
    const result = allocateDynamic(500, []);
    expect(result.allocations).toEqual([]);
    expect(result.adjustmentIndex).toBeNull();
    expect(result.adjustmentAmount).toBe(0);
  });

  it('throws when basis total is zero', () => {
    expect(() => allocateDynamic(250, [0, 0])).toThrow('Basis total is zero; provide nonzero datapoints.');
  });
});
