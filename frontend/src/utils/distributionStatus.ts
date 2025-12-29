import type { DistributionStatus } from '../types';

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
  const normalized = trimmed.toLowerCase();
  if (normalized === 'distributed') {
    return 'Distributed';
  }
  const collapsed = normalized.replace(/[\s_-]/g, '');
  if (collapsed === 'nobalance') {
    return 'No balance';
  }
  return 'Undistributed';
};
