const PERIOD_MATCHER = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:T.*)?$/;

export const parsePeriodString = (value: string): Date | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const isoMatch = PERIOD_MATCHER.exec(trimmed);

  if (isoMatch) {
    const [, yearPart, monthPart, dayPart] = isoMatch;
    const year = Number(yearPart);
    const monthIndex = Number(monthPart) - 1;
    const day = dayPart ? Number(dayPart) : 1;

    if (Number.isNaN(year) || Number.isNaN(monthIndex) || Number.isNaN(day)) {
      return null;
    }

    return new Date(year, monthIndex, day);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
};

export const formatPeriodLabel = (
  value: string,
  locales: Intl.LocalesArgument = 'default'
): string => {
  const parsed = parsePeriodString(value);

  if (parsed) {
    return parsed.toLocaleDateString(locales, {
      month: 'long',
      year: 'numeric',
    });
  }

  return value;
};
