import parseCurrencyValue from '../utils/parseCurrencyValue';

describe('parseCurrencyValue', () => {
  it('returns the same value for numeric inputs', () => {
    expect(parseCurrencyValue(1234.56)).toBe(1234.56);
  });

  it.each([
    ['50000', 50000],
    ['50,000', 50000],
    ['$50,000.25', 50000.25],
    ['(50,000)', -50000],
    ['$(50,000)', -50000],
    ['($50,000)', -50000],
    ['-50,000', -50000],
    ['-$50,000', -50000],
    ['$-50,000', -50000],
    ['- $50,000.75', -50000.75],
    ['($0)', 0],
    ['0', 0]
  ])('parses %s as %d', (input, expected) => {
    expect(parseCurrencyValue(input)).toBe(expected);
  });

  it('returns 0 for non-numeric values', () => {
    expect(parseCurrencyValue('not a number')).toBe(0);
    expect(parseCurrencyValue(undefined)).toBe(0);
    expect(parseCurrencyValue(null)).toBe(0);
  });
});
