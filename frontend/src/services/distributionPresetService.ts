import type { DynamicAllocationPreset, DynamicAllocationPresetRow, MappingType } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface DistributionPresetDetailPayload {
  operationCd: string;
  basisDatapoint?: string | null;
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

const normalizeDistributionPresetType = (value?: string | null): MappingType => {
  if (!value) {
    return 'percentage';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dynamic' || normalized === 'd') {
    return 'dynamic';
  }
  if (normalized === 'direct') {
    return 'direct';
  }
  if (normalized === 'exclude' || normalized === 'excluded' || normalized === 'x') {
    return 'exclude';
  }
  return 'percentage';
};

export const toDistributionPresetType = (value?: string | null): MappingType =>
  normalizeDistributionPresetType(value);

export const isDynamicDistributionPresetType = (value?: string | null): boolean =>
  normalizeDistributionPresetType(value) === 'dynamic';

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
  const basisDatapoint = detail.basisDatapoint?.trim() ?? null;
  const sourceAccountId = basisDatapoint ?? preset.scoaAccountId?.trim() ?? '';
  if (!operationCd || !sourceAccountId) {
    return null;
  }
  return {
    dynamicAccountId: sourceAccountId,
    targetAccountId: operationCd,
  };
};

export const mapDistributionPresetsToDynamic = (
  presets: DistributionPresetPayload[],
): DynamicAllocationPreset[] => {
  const grouped = new Map<string, { meta: DistributionPresetPayload; rows: DynamicAllocationPresetRow[] }>();

  presets.forEach(preset => {
    if (!isDynamicDistributionPresetType(preset.presetType)) {
      return;
    }
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
