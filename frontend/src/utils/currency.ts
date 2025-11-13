const wholeDollarFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const centsFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isWholeDollar = (value: number): boolean => {
  if (!Number.isFinite(value)) {
    return true;
  }
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-6;
};

export const formatCurrencyAmount = (value: number): string => {
  if (!Number.isFinite(value)) {
    return centsFormatter.format(0);
  }

  if (isWholeDollar(value)) {
    return wholeDollarFormatter.format(Math.round(value));
  }

  return centsFormatter.format(value);
};

export default formatCurrencyAmount;
