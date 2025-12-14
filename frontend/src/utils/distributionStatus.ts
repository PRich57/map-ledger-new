import type { DistributionStatus } from '../types';

const capitalizeValue = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

export const normalizeDistributionStatus = (
  value?: string | null,
): DistributionStatus => {
  if (!value) {
    return 'Undistributed';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Undistributed';
  }
  const normalized = capitalizeValue(trimmed);
  return normalized === 'Distributed' ? 'Distributed' : 'Undistributed';
};
