import type { DynamicAllocationPreset, DynamicAllocationPresetRow } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface DistributionPresetDetailPayload {
  operationCd: string;
  isCalculated?: boolean | null;
  specifiedPct?: number | null;
}

export interface DistributionPresetPayload {
  presetGuid: string;
  entityId: string;
  presetType?: string | null;
  presetDescription?: string | null;
  scoaAccountId: string;
  metric?: string | null;
  presetDetails?: DistributionPresetDetailPayload[];
}

export const fetchDistributionPresetsFromApi = async (
  entityId: string,
): Promise<DistributionPresetPayload[]> => {
  const params = new URLSearchParams({ entityId });
  const response = await fetch(`${API_BASE_URL}/entityDistributionPresets?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Unable to fetch distribution presets (${response.status})`);
  }
  const payload = (await response.json()) as { items?: DistributionPresetPayload[] };
  return payload.items ?? [];
};

const normalizeOperationCode = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
};

const buildPresetRow = (
  preset: DistributionPresetPayload,
  detail: DistributionPresetDetailPayload,
): DynamicAllocationPresetRow | null => {
  const operationCd = normalizeOperationCode(detail.operationCd);
  const accountId = preset.scoaAccountId?.trim() ?? '';
  if (!operationCd || !accountId) {
    return null;
  }
  return {
    dynamicAccountId: accountId,
    targetAccountId: operationCd,
  };
};

export const mapDistributionPresetsToDynamic = (
  presets: DistributionPresetPayload[],
): DynamicAllocationPreset[] => {
  const grouped = new Map<string, { meta: DistributionPresetPayload; rows: DynamicAllocationPresetRow[] }>();

  presets.forEach(preset => {
    const rows = (preset.presetDetails ?? [])
      .map(detail => buildPresetRow(preset, detail))
      .filter((row): row is DynamicAllocationPresetRow => Boolean(row));
    if (!rows.length) {
      return;
    }
    const existing = grouped.get(preset.presetGuid);
    if (existing) {
      existing.rows.push(...rows);
      return;
    }
    grouped.set(preset.presetGuid, { meta: preset, rows: [...rows] });
  });

  return Array.from(grouped.values()).map(({ meta, rows }) => ({
    id: meta.presetGuid,
    name: meta.presetDescription?.trim() || meta.presetGuid,
    rows,
    notes: meta.metric ?? undefined,
  }));
};
