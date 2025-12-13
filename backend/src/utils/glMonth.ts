/**
 * Utility helpers for normalizing and extracting GL month values from
 * arbitrary text (file names, sheet names, column values, etc.).
 *
 * The implementation mirrors the frontend helper in
 * `frontend/src/utils/extractDateFromText.ts` to keep detection
 * consistent across the stack.
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

const formatMonthStart = (year: string | number, month: string): string => {
  return `${year}-${month.padStart(2, '0')}-01`;
};

/**
 * Normalizes a date string to YYYY-MM-01 format.
 */
export const normalizeGlMonth = (value: string): string => {
  if (!value) return '';

  const trimmed = value.trim();

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (isoMatch) {
    const [, year, rawMonth] = isoMatch;
    return formatMonthStart(year, rawMonth);
  }

  const monthYearMatch = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
  if (monthYearMatch) {
    const [, rawMonth, year] = monthYearMatch;
    return formatMonthStart(year, rawMonth);
  }

  const usMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (usMatch) {
    const [, rawMonth, , year] = usMatch;
    return formatMonthStart(year, rawMonth);
  }

  const compactMatch = trimmed.match(/^(\d{4})(\d{2})$/);
  if (compactMatch) {
    const [, year, rawMonth] = compactMatch;
    return formatMonthStart(year, rawMonth);
  }

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
            ? numericYear < 50
              ? 2000 + numericYear
              : 1900 + numericYear
            : numericYear;
        return formatMonthStart(year, month);
      }
    }
  }

  const compactNamedMatch = trimmed.match(/^(\d{4})\s*M(\d{2})$/i);
  if (compactNamedMatch) {
    const [, year, rawMonth] = compactNamedMatch;
    return formatMonthStart(year, rawMonth);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    return formatMonthStart(year, month);
  }

  return '';
};

export const isValidNormalizedMonth = (value: string): boolean =>
  /^\d{4}-\d{2}-01$/.test(value);

export const extractDateFromText = (text: string): string => {
  if (!text) return '';

  const normalized = text.trim();

  const monthApostropheMatch = normalized.match(
    /(?:[()'"\s])([A-Za-z]{3,9})[''](\d{2})(?:[)'")\s]|$)/i,
  );
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

  const isoMatch = normalized.match(/(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (isoMatch) {
    const [, year, rawMonth] = isoMatch;
    const month = rawMonth.padStart(2, '0');
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return formatMonthStart(year, month);
    }
  }

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
              ? numericYear < 50
                ? 2000 + numericYear
                : 1900 + numericYear
              : numericYear;
          return formatMonthStart(year, month);
        }
    }
  }

  const yearMonthMatch = normalized.match(/\b(\d{4})[\s_-]+([A-Za-z]{3,9})\b/i);
  if (yearMonthMatch) {
    const [, year, monthName] = yearMonthMatch;
    const normalizedMonthName = monthName.toLowerCase();
    const month = monthNameMap[normalizedMonthName];
    if (month) {
      return formatMonthStart(year, month);
    }
  }

  const mmYyyyMatch = normalized.match(/\b(\d{1,2})[-/](\d{4})\b/);
  if (mmYyyyMatch) {
    const [, rawMonth, year] = mmYyyyMatch;
    const month = rawMonth.padStart(2, '0');
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return formatMonthStart(year, month);
    }
  }

  const compactMatch = normalized.match(/\b(\d{4})(\d{2})\b/);
  if (compactMatch) {
    const [, year, rawMonth] = compactMatch;
    const monthNum = parseInt(rawMonth, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return formatMonthStart(year, rawMonth);
    }
  }

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
              ? numericYear < 50
                ? 2000 + numericYear
                : 1900 + numericYear
              : numericYear;
          return formatMonthStart(year, month);
        }
    }
  }

  return '';
};

export const extractFirstValidDate = (text: string): string => {
  const date = extractDateFromText(text);
  if (date && isValidNormalizedMonth(date)) {
    return date;
  }
  return '';
};

export const detectGlMonthFromRow = (row: Record<string, unknown>): string => {
  const normalizeCandidate = (value: unknown): string => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }

    const normalized = normalizeGlMonth(value.toString());
    return isValidNormalizedMonth(normalized) ? normalized : '';
  };

  const normalizedEntries = Object.entries(row);

  const keyMatches = [
    (key: string) => key.includes('glmonth'),
    (key: string) => key.includes('period'),
    (key: string) => key.endsWith('month') || key === 'month',
  ];

  for (const matcher of keyMatches) {
    for (const [key, value] of normalizedEntries) {
      if (key === 'glMonth') continue;
      const normalizedKey = key.replace(/[\s_-]/g, '').toLowerCase();
      if (!matcher(normalizedKey)) continue;

      const normalizedValue = normalizeCandidate(value);
      if (normalizedValue) {
        return normalizedValue;
      }
    }
  }

  return normalizeCandidate(row.glMonth);
};
