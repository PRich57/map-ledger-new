const removeAccents = (value: string): string => {
  if (typeof value.normalize === 'function') {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  }
  return value;
};

export const slugify = (value: string): string => {
  const normalized = removeAccents(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .replace(/[_\s]+/g, '-');

  return normalized.replace(/-+/g, '-').replace(/^-|-$/g, '');
};

export default slugify;
