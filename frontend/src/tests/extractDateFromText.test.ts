import { extractDateFromText, normalizeGlMonth, isValidNormalizedMonth } from '../utils/extractDateFromText';

describe('extractDateFromText', () => {
  describe('User provided examples', () => {
    it('should extract dates from trial balance sheet names with apostrophe format', () => {
      expect(extractDateFromText("Trial balance report (Aug'24)")).toBe('2024-08');
      expect(extractDateFromText("Trial balance report (Sep'24)")).toBe('2024-09');
      expect(extractDateFromText("Trial balance report (Oct'24)")).toBe('2024-10');
      expect(extractDateFromText("Trial balance report (Nov'24)")).toBe('2024-11');
      expect(extractDateFromText("Trial balance report (Dec'24)")).toBe('2024-12');
      expect(extractDateFromText("Trial balance report (Jan'24)")).toBe('2024-01');
      expect(extractDateFromText("Trial balance report (Feb'24)")).toBe('2024-02');
      expect(extractDateFromText("Trial balance report (Mar'24)")).toBe('2024-03');
      expect(extractDateFromText("Trial balance report (Apr'24)")).toBe('2024-04');
    });
  });

  describe('ISO format dates', () => {
    it('should extract ISO format YYYY-MM', () => {
      expect(extractDateFromText('Report 2024-08')).toBe('2024-08');
      expect(extractDateFromText('2025-01 Report')).toBe('2025-01');
      expect(extractDateFromText('Data for 2024-12 period')).toBe('2024-12');
    });

    it('should extract ISO format YYYY-MM-DD and return YYYY-MM', () => {
      expect(extractDateFromText('Report 2024-08-15')).toBe('2024-08');
      expect(extractDateFromText('2025-01-01 Export')).toBe('2025-01');
    });
  });

  describe('MM/YYYY and MM-YYYY formats', () => {
    it('should extract MM/YYYY format', () => {
      expect(extractDateFromText('Report 08/2024')).toBe('2024-08');
      expect(extractDateFromText('01/2025 Data')).toBe('2025-01');
      expect(extractDateFromText('Data for 12/2024')).toBe('2024-12');
    });

    it('should extract MM-YYYY format', () => {
      expect(extractDateFromText('Report 08-2024')).toBe('2024-08');
      expect(extractDateFromText('01-2025 Data')).toBe('2025-01');
    });
  });

  describe('Month name with year', () => {
    it('should extract full month names with 4-digit year', () => {
      expect(extractDateFromText('August 2024 Report')).toBe('2024-08');
      expect(extractDateFromText('Report for January 2025')).toBe('2025-01');
      expect(extractDateFromText('December 2024')).toBe('2024-12');
    });

    it('should extract abbreviated month names with 4-digit year', () => {
      expect(extractDateFromText('Aug 2024 Report')).toBe('2024-08');
      expect(extractDateFromText('Jan 2025 Data')).toBe('2025-01');
      expect(extractDateFromText('Report Dec 2024')).toBe('2024-12');
    });

    it('should extract month names with 2-digit year', () => {
      expect(extractDateFromText('Aug 24 Report')).toBe('2024-08');
      expect(extractDateFromText('Jan 25 Data')).toBe('2025-01');
      expect(extractDateFromText('Report Dec 24')).toBe('2024-12');
    });

    it('should extract month names with apostrophe and 2-digit year', () => {
      expect(extractDateFromText("Aug'24")).toBe('2024-08');
      expect(extractDateFromText("Jan'25")).toBe('2025-01');
      expect(extractDateFromText("December'24")).toBe('2024-12');
    });
  });

  describe('Year with month name', () => {
    it('should extract year followed by month name', () => {
      expect(extractDateFromText('2024 August Report')).toBe('2024-08');
      expect(extractDateFromText('2025_Jan Data')).toBe('2025-01');
      expect(extractDateFromText('2024-December')).toBe('2024-12');
    });
  });

  describe('Compact numeric format', () => {
    it('should extract YYYYMM format', () => {
      expect(extractDateFromText('Report 202408')).toBe('2024-08');
      expect(extractDateFromText('202501 Data')).toBe('2025-01');
      expect(extractDateFromText('TB_202412')).toBe('2024-12');
    });
  });

  describe('Underscore and dash separated formats', () => {
    it('should extract month_year format', () => {
      expect(extractDateFromText('TB_Aug_24')).toBe('2024-08');
      expect(extractDateFromText('Report_Jan_2025')).toBe('2025-01');
      expect(extractDateFromText('Data_December_2024')).toBe('2024-12');
    });

    it('should extract month-year format', () => {
      expect(extractDateFromText('TB-Aug-24')).toBe('2024-08');
      expect(extractDateFromText('Report-Jan-2025')).toBe('2025-01');
    });
  });

  describe('Edge cases', () => {
    it('should return empty string for text without dates', () => {
      expect(extractDateFromText('No date here')).toBe('');
      expect(extractDateFromText('Trial Balance Report')).toBe('');
      expect(extractDateFromText('')).toBe('');
    });

    it('should handle invalid month numbers', () => {
      expect(extractDateFromText('2024-13')).toBe(''); // Invalid month
      expect(extractDateFromText('2024-00')).toBe(''); // Invalid month
      expect(extractDateFromText('15/2024')).toBe(''); // Invalid month
    });

    it('should prefer the first valid date if multiple patterns exist', () => {
      // Should find Aug'24 first
      expect(extractDateFromText("Report (Aug'24) for 2025-01")).toBe('2024-08');
    });
  });
});

describe('normalizeGlMonth', () => {
  it('should normalize ISO format', () => {
    expect(normalizeGlMonth('2024-08')).toBe('2024-08');
    expect(normalizeGlMonth('2024-8')).toBe('2024-08');
    expect(normalizeGlMonth('2024-01-15')).toBe('2024-01');
  });

  it('should normalize MM/YYYY format', () => {
    expect(normalizeGlMonth('08/2024')).toBe('2024-08');
    expect(normalizeGlMonth('8/2024')).toBe('2024-08');
    expect(normalizeGlMonth('01/2025')).toBe('2025-01');
  });

  it('should normalize month name formats', () => {
    expect(normalizeGlMonth('Aug 2024')).toBe('2024-08');
    expect(normalizeGlMonth('August 2024')).toBe('2024-08');
    expect(normalizeGlMonth('Jan 25')).toBe('2025-01');
    expect(normalizeGlMonth('January 25')).toBe('2025-01');
  });

  it('should normalize compact formats', () => {
    expect(normalizeGlMonth('202408')).toBe('2024-08');
    expect(normalizeGlMonth('202501')).toBe('2025-01');
  });

  it('should return empty string for invalid input', () => {
    expect(normalizeGlMonth('')).toBe('');
    expect(normalizeGlMonth('invalid')).toBe('');
  });
});

describe('isValidNormalizedMonth', () => {
  it('should validate correct YYYY-MM format', () => {
    expect(isValidNormalizedMonth('2024-08')).toBe(true);
    expect(isValidNormalizedMonth('2025-01')).toBe(true);
    expect(isValidNormalizedMonth('2024-12')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(isValidNormalizedMonth('2024-8')).toBe(false);
    expect(isValidNormalizedMonth('24-08')).toBe(false);
    expect(isValidNormalizedMonth('2024/08')).toBe(false);
    expect(isValidNormalizedMonth('Aug 2024')).toBe(false);
    expect(isValidNormalizedMonth('')).toBe(false);
  });
});
