export const getFirstStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'number') {
    const normalized = value.toString().trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'number') {
        const normalized = entry.toString().trim();
        if (normalized.length > 0) {
          return normalized;
        }
      }

      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
  }

  return undefined;
};