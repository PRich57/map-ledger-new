/**
 * Utility to extract dates from arbitrary text (like sheet names, file names, etc.)
 * Handles many different date formats and returns normalized YYYY-MM-01 format
 */

const monthNameMap: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const formatMonthStart = (year: string | number, month: string): string =>
  `${year}-${month.padStart(2, '0')}-01`;

/**
 * Normalizes a date string to YYYY-MM-01 format
 * This is a standalone version that can be reused
 */
export function normalizeGlMonth(value: string): string {
  if (!value) return '';

  const trimmed = value.trim();
  // ISO format: 2024-01 or 2024-01-15
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (isoMatch) {
    const [, year, rawMonth] = isoMatch;
    return formatMonthStart(year, rawMonth);
  }

  // Month/Year: 01/2024 or 01-2024
  const monthYearMatch = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
  if (monthYearMatch) {
    const [, rawMonth, year] = monthYearMatch;
    return formatMonthStart(year, rawMonth);
  }

  // US format: 01/15/2024 or 01-15-2024
  const usMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (usMatch) {
    const [, rawMonth, , year] = usMatch;
    return formatMonthStart(year, rawMonth);
  }

  // Compact numeric: 202401
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})$/);
  if (compactMatch) {
    const [, year, rawMonth] = compactMatch;
    return formatMonthStart(year, rawMonth);
  }

  // Text month with year: "Jan 2024", "January 2024", "Jan-2024"
  const textMatch = trimmed.match(/^([A-Za-z]{3,9})[\s-](\d{2,4})$/);
  if (textMatch) {
    const [, monthName, yearPart] = textMatch;
    const normalizedMonthName = monthName.toLowerCase();
    const month = monthNameMap[normalizedMonthName];
    if (month) {
      const numericYear = parseInt(yearPart, 10);
      if (!Number.isNaN(numericYear)) {
        const year =
          yearPart.length === 2
            ? (numericYear < 50 ? 2000 + numericYear : 1900 + numericYear)
            : numericYear;
        return formatMonthStart(year, month);
      }
    }
  }

  // Compact named: 2024 M01
  const compactNamedMatch = trimmed.match(/^(\d{4})\s*M(\d{2})$/i);
  if (compactNamedMatch) {
    const [, year, rawMonth] = compactNamedMatch;
    return formatMonthStart(year, rawMonth);
  }

  // Try parsing as a JavaScript Date
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = (parsed.getUTCMonth() + 1).toString().padStart(2, '0');
    return formatMonthStart(year, month);
  }

  return '';
}

/**
 * Validates that a string matches the normalized YYYY-MM-01 format
 */
export function isValidNormalizedMonth(value: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(value);
}

/**
 * Extracts a date from arbitrary text (like sheet names)
 * Handles many different formats embedded in larger text strings
 *
 * Examples:
 * - "Trial balance report (Aug'24)" -> "2024-08-01"
 * - "Trial balance report (Sep'24)" -> "2024-09-01"
 * - "Report for 2024-08" -> "2024-08-01"
 * - "August 2025 Report" -> "2025-08-01"
 * - "TB_Jan_2024" -> "2024-01-01"
 * - "2025-08-15 Export" -> "2025-08-01"
 */
export function extractDateFromText(text: string): string {
  if (!text) return '';

  const normalized = text.trim();

  // Pattern 1: Month abbreviation with 2-digit year in parentheses or quotes
  // Examples: (Aug'24), (Sep'24), "Aug'24", 'Aug'24'
  const monthApostropheMatch = normalized.match(/(?:[()'"\s])([A-Za-z]{3,9})[''](\d{2})(?:[)'")\s]|$)/i);
  if (monthApostropheMatch) {
    const [, monthName, yearPart] = monthApostropheMatch;
    const normalizedMonthName = monthName.toLowerCase();
    const month = monthNameMap[normalizedMonthName];
    if (month) {
      const numericYear = parseInt(yearPart, 10);
      if (!Number.isNaN(numericYear)) {
        const year = numericYear < 50 ? 2000 + numericYear : 1900 + numericYear;
        return formatMonthStart(year, month);
      }
    }
  }

  // Pattern 2: ISO format in text: 2024-01, 2024-01-15
  const isoMatch = normalized.match(/(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (isoMatch) {
    const [, year, rawMonth] = isoMatch;
    const month = rawMonth.padStart(2, '0');
    // Validate it's a valid month (01-12)
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return formatMonthStart(year, month);
    }
  }

  // Pattern 3: Month name with 2 or 4 digit year
  // Examples: "August 2024", "Aug 2024", "January 25", "Jan'25"
  const monthYearMatch = normalized.match(/\b([A-Za-z]{3,9})[\s'-]+(\d{2,4})\b/i);
  if (monthYearMatch) {
    const [, monthName, yearPart] = monthYearMatch;
    const normalizedMonthName = monthName.toLowerCase();
    const month = monthNameMap[normalizedMonthName];
    if (month) {
      const numericYear = parseInt(yearPart, 10);
      if (!Number.isNaN(numericYear)) {
        const year =
          yearPart.length === 2
            ? (numericYear < 50 ? 2000 + numericYear : 1900 + numericYear)
            : numericYear;
        return formatMonthStart(year, month);
      }
    }
  }

  // Pattern 4: Year with month name
  // Examples: "2024 August", "2024_Aug", "2024-January"
  const yearMonthMatch = normalized.match(/\b(\d{4})[\s_-]+([A-Za-z]{3,9})\b/i);
  if (yearMonthMatch) {
    const [, year, monthName] = yearMonthMatch;
    const normalizedMonthName = monthName.toLowerCase();
    const month = monthNameMap[normalizedMonthName];
    if (month) {
      return formatMonthStart(year, month);
    }
  }

  // Pattern 5: MM/YYYY or MM-YYYY
  // Examples: "08/2024", "08-2025"
  const mmYyyyMatch = normalized.match(/\b(\d{1,2})[-/](\d{4})\b/);
  if (mmYyyyMatch) {
    const [, rawMonth, year] = mmYyyyMatch;
    const month = rawMonth.padStart(2, '0');
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return formatMonthStart(year, month);
    }
  }

  // Pattern 6: Compact numeric format: 202408
  const compactMatch = normalized.match(/\b(\d{4})(\d{2})\b/);
  if (compactMatch) {
    const [, year, rawMonth] = compactMatch;
    const monthNum = parseInt(rawMonth, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return formatMonthStart(year, rawMonth);
    }
  }

  // Pattern 7: Month_Year or Month-Year with underscores/dashes
  // Examples: "Aug_24", "Jan-2024", "August_2025"
  const monthUnderscoreMatch = normalized.match(/\b([A-Za-z]{3,9})[_-](\d{2,4})\b/i);
  if (monthUnderscoreMatch) {
    const [, monthName, yearPart] = monthUnderscoreMatch;
    const normalizedMonthName = monthName.toLowerCase();
    const month = monthNameMap[normalizedMonthName];
    if (month) {
      const numericYear = parseInt(yearPart, 10);
      if (!Number.isNaN(numericYear)) {
        const year =
          yearPart.length === 2
            ? (numericYear < 50 ? 2000 + numericYear : 1900 + numericYear)
            : numericYear;
        return formatMonthStart(year, month);
      }
    }
  }

  return '';
}

/**
 * Extracts all possible dates from text and returns the first valid one
 * This is useful when text might contain multiple date-like patterns
 */
export function extractFirstValidDate(text: string): string {
  const date = extractDateFromText(text);
  if (date && isValidNormalizedMonth(date)) {
    return date;
  }
  return '';
}
