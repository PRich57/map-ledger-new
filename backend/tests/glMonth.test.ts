import { extractDateFromText, normalizeGlMonth } from '../src/utils/glMonth';

describe('glMonth utilities', () => {
  it('normalizes MM.YY format', () => {
    expect(normalizeGlMonth('11.25')).toBe('2025-11-01');
    expect(normalizeGlMonth('3.24')).toBe('2024-03-01');
  });

  it('extracts MM.YY format from text', () => {
    expect(extractDateFromText('NTS 11.25 TB.xlsx')).toBe('2025-11-01');
    expect(extractDateFromText('Report 03.24')).toBe('2024-03-01');
  });
});
