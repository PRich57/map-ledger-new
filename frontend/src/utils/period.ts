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

const formatToYearMonth = (date: Date): string => {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
};

export const formatPeriodLabel = (
  value: string,
  _locales: Intl.LocalesArgument = 'default'
): string => {
  if (!value) {
    return '';
  }

  const parts = value.split(/\s+-\s+/).filter((part) => part.length > 0);

  if (parts.length > 1) {
    const formattedParts = parts
      .map((part) => parsePeriodString(part))
      .map((parsed) => (parsed ? formatToYearMonth(parsed) : null))
      .filter((part): part is string => Boolean(part));

    if (formattedParts.length === parts.length) {
      const first = formattedParts[0];
      const last = formattedParts[formattedParts.length - 1];
      if (first === last) {
        return first;
      }
      return `${first} - ${last}`;
    }
  }

  const parsed = parsePeriodString(value);

  if (parsed) {
    return formatToYearMonth(parsed);
  }

  return value;
};
