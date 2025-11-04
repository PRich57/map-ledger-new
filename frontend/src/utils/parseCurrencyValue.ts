export function parseCurrencyValue(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  let sanitized = value.trim();
  if (!sanitized) {
    return 0;
  }

  let isNegative = false;

  if (sanitized.includes('(') && sanitized.includes(')')) {
    isNegative = true;
  }

  sanitized = sanitized.replace(/[()]/g, '');

  if (sanitized.includes('-')) {
    isNegative = true;
  }

  sanitized = sanitized.replace(/-/g, '');
  sanitized = sanitized.replace(/\s+/g, '');
  sanitized = sanitized.replace(/[$]/g, '');
  sanitized = sanitized.replace(/,/g, '');

  if (!sanitized) {
    return 0;
  }

  const numericValue = Number.parseFloat(sanitized);

  if (Number.isNaN(numericValue)) {
    return 0;
  }

  const result = isNegative ? -numericValue : numericValue;

  return result === 0 ? 0 : result;
}

export default parseCurrencyValue;
