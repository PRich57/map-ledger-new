import { DistributionActivityEntry } from '../utils/distributionActivity';

const env = import.meta.env;
const API_BASE_URL = env.VITE_API_BASE_URL ?? '/api';

export interface DistributionActivityPayload {
  entityId: string;
  updatedBy?: string | null;
  entries: DistributionActivityEntry[];
}

export const persistDistributionActivity = async (
  entityId: string | null,
  entries: DistributionActivityEntry[],
  updatedBy: string | null,
): Promise<void> => {
  if (!entityId || !entries.length) {
    return;
  }

  const payload: DistributionActivityPayload = {
    entityId,
    updatedBy,
    entries,
  };

  const response = await fetch(`${API_BASE_URL}/distributionActivity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to persist distribution activity.');
    throw new Error(errorText || 'Unable to persist distribution activity.');
  }
};
