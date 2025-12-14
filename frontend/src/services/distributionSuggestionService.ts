import type {
  DistributionOperationShare,
  DistributionStatus,
  DistributionType,
} from '../types';
import { normalizeDistributionStatus } from '../utils/distributionStatus';

const env = import.meta.env;
const API_BASE_URL = env.VITE_API_BASE_URL ?? '/api';

type DistributionSuggestionApiOperation = {
  id?: string;
  code?: string;
  name?: string;
  allocation?: number | null;
};

type DistributionSuggestionApiRow = {
  scoaAccountId: string;
  distributionType?: string | null;
  distributionStatus?: string | null;
  presetGuid?: string | null;
  presetDescription?: string | null;
  operations?: DistributionSuggestionApiOperation[] | null;
};

export interface DistributionHistorySuggestion {
  accountId: string;
  type: DistributionType;
  status: DistributionStatus;
  presetId: string | null;
  presetName?: string | null;
  operations: DistributionOperationShare[];
}

const toDistributionType = (value?: string | null): DistributionType => {
  if (!value) {
    return 'direct';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'percentage') {
    return 'percentage';
  }
  if (normalized === 'dynamic') {
    return 'dynamic';
  }
  return 'direct';
};

const sanitizeOperation = (
  operation: DistributionSuggestionApiOperation,
): DistributionOperationShare | null => {
  const id = operation.id?.trim() || operation.code?.trim();
  if (!id) {
    return null;
  }
  const allocation =
    typeof operation.allocation === 'number' && Number.isFinite(operation.allocation)
      ? Math.max(0, Math.min(100, operation.allocation))
      : undefined;
  const name = operation.name?.trim() || id;
  return {
    id,
    code: operation.code?.trim() || id,
    name,
    allocation,
  };
};

const mapApiRow = (row: DistributionSuggestionApiRow): DistributionHistorySuggestion => {
  const type = toDistributionType(row.distributionType);
  const operations = (row.operations ?? [])
    .map(sanitizeOperation)
    .filter((operation): operation is DistributionOperationShare => Boolean(operation));

  return {
    accountId: row.scoaAccountId,
    type,
    status: normalizeDistributionStatus(row.distributionStatus),
    presetId: row.presetGuid ?? null,
    presetName: row.presetDescription ?? null,
    operations,
  };
};

export const fetchDistributionHistory = async (
  entityId: string,
): Promise<DistributionHistorySuggestion[]> => {
  const params = new URLSearchParams({ entityId });
  const response = await fetch(`${API_BASE_URL}/distribution/suggest?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Unable to fetch distribution suggestions (${response.status})`);
  }

  const payload = (await response.json()) as { items?: DistributionSuggestionApiRow[] | null };
  return (payload.items ?? []).map(mapApiRow);
};

export default fetchDistributionHistory;
