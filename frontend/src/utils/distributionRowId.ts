const normalizeSegment = (value?: string | number | null): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = typeof value === 'string' ? value.trim() : String(value).trim();
  return text.length > 0 ? text : null;
};

export const createDistributionRowId = (
  mappingRowId: string,
  targetId: string,
  suffix?: string | number | null,
): string => {
  const base = `${mappingRowId}::${targetId}`;
  const normalizedSuffix = normalizeSegment(suffix);
  return normalizedSuffix ? `${base}::${normalizedSuffix}` : base;
};
