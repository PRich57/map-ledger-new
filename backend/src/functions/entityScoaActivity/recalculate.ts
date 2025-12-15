import {
  EntityAccountMappingWithRecord,
  EntityMappingPresetDetailRow,
  listEntityAccountMappingsWithActivityForEntity,
} from '../../repositories/entityAccountMappingRepository';
import {
  EntityPresetMappingRow,
  listEntityPresetMappingsByPresetGuids,
} from '../../repositories/entityPresetMappingRepository';
import {
  EntityScoaActivityInput,
  listEntityScoaActivity,
  upsertEntityScoaActivity,
} from '../../repositories/entityScoaActivityRepository';
import { normalizeGlMonth } from '../../utils/glMonth';

const normalizeActivityMonth = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = typeof value === 'number' ? `${value}` : typeof value === 'string' ? value : '';
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeGlMonth(trimmed);
  if (normalized) {
    return normalized;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = (parsed.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}-01`;
  }

  return null;
};

const normalizeTargetDatapoint = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === 'excluded') {
    return null;
  }
  return trimmed;
};

const resolvePresetType = (value: string | null | undefined): string => {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case 'dynamic':
    case 'd':
      return 'dynamic';
    case 'percentage':
    case 'p':
      return 'percentage';
    case 'direct':
      return 'direct';
    case 'exclude':
    case 'excluded':
    case 'x':
      return 'excluded';
    default:
      return 'direct';
  }
};

const isExcludedMapping = (mappingType?: string | null, mappingStatus?: string | null): boolean => {
  const normalizedType = mappingType?.trim().toLowerCase();
  const normalizedStatus = mappingStatus?.trim().toLowerCase();
  return normalizedType === 'exclude' || normalizedType === 'excluded' || normalizedStatus === 'excluded';
};

const buildPresetSplits = (
  presetDetails: EntityMappingPresetDetailRow[] | undefined,
  mappingType: string,
): { targetId: string; pct: number }[] => {
  if (!presetDetails || presetDetails.length === 0) {
    return [];
  }

  return presetDetails
    .map(detail => {
      const targetId = normalizeTargetDatapoint(detail.targetDatapoint);
      const pct =
        typeof detail.specifiedPct === 'number'
          ? detail.specifiedPct
          : mappingType === 'direct'
            ? 100
            : null;

      if (!targetId || pct === null || Number.isNaN(pct)) {
        return null;
      }

      return { targetId, pct };
    })
    .filter((value): value is { targetId: string; pct: number } => value !== null);
};

const buildDynamicSplits = (
  presetGuid: string | null | undefined,
  presetDetails: EntityMappingPresetDetailRow[] | undefined,
  presetMappingLookup: Map<string, EntityPresetMappingRow[]>,
): { targetId: string; pct: number }[] => {
  const mappedSplits = (presetGuid ? presetMappingLookup.get(presetGuid) : null) ?? [];
  const mappedResults = mappedSplits
    .map(detail => {
      const targetId = normalizeTargetDatapoint(detail.targetDatapoint);
      const pct = typeof detail.appliedPct === 'number' ? detail.appliedPct : null;
      if (!targetId || pct === null || Number.isNaN(pct)) {
        return null;
      }
      return { targetId, pct };
    })
    .filter((value): value is { targetId: string; pct: number } => value !== null);

  if (mappedResults.length) {
    return mappedResults;
  }

  return buildPresetSplits(presetDetails, 'dynamic');
};

const buildEntityScoaTotals = (
  rows: EntityAccountMappingWithRecord[],
  presetMappingLookup: Map<string, EntityPresetMappingRow[]>,
  months: Set<string> | null,
  updatedBy: string | null,
): Map<string, EntityScoaActivityInput> => {
  const totals = new Map<string, EntityScoaActivityInput>();

  rows.forEach(row => {
    const entityId = row.entityId?.trim();
    const baseAmount = Number.isFinite(row.activityAmount ?? NaN)
      ? (row.activityAmount as number)
      : null;
    const activityMonth = normalizeActivityMonth(row.glMonth);
    if (!entityId || baseAmount === null || !activityMonth) {
      return;
    }

    if (months && !months.has(activityMonth)) {
      return;
    }

    if (isExcludedMapping(row.mappingType, row.mappingStatus)) {
      return;
    }

    const resolvedType = resolvePresetType(row.mappingType);
    const splits =
      resolvedType === 'dynamic'
        ? buildDynamicSplits(row.presetId ?? null, row.presetDetails, presetMappingLookup)
        : buildPresetSplits(row.presetDetails, resolvedType);

    splits.forEach(split => {
      const value =
        resolvedType === 'direct' && (split.pct === null || split.pct === undefined)
          ? baseAmount
          : baseAmount * ((split.pct ?? 0) / 100);

      const key = `${entityId}|${split.targetId}|${activityMonth}`;
      const existing = totals.get(key);
      if (existing) {
        existing.activityValue += value;
        return;
      }

      totals.set(key, {
        entityId,
        scoaAccountId: split.targetId,
        activityMonth,
        activityValue: value,
        updatedBy,
      });
    });
  });

  return totals;
};

export const recalculateEntityScoaActivityTotals = async (
  affectedMonths: Map<string, Set<string>>,
  entityUpdatedByLookup: Map<string, string | null>,
): Promise<number> => {
  const upserts: EntityScoaActivityInput[] = [];

  for (const [entityId, months] of affectedMonths.entries()) {
    if (!entityId) {
      continue;
    }

    const monthsList = Array.from(months)
      .map(month => normalizeActivityMonth(month))
      .filter((month): month is string => Boolean(month));

    const normalizedMonths = monthsList.length ? new Set(monthsList) : null;
    const mappings = await listEntityAccountMappingsWithActivityForEntity(
      entityId,
      monthsList.length ? monthsList : undefined,
    );

    const dynamicPresetIds = Array.from(
      new Set(
        mappings
          .filter(row => resolvePresetType(row.mappingType) === 'dynamic')
          .map(row => row.presetId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const presetMappings = dynamicPresetIds.length
      ? await listEntityPresetMappingsByPresetGuids(dynamicPresetIds)
      : [];
    const presetMappingLookup = new Map<string, EntityPresetMappingRow[]>();
    presetMappings.forEach(mapping => {
      if (!mapping.presetGuid) {
        return;
      }
      const existing = presetMappingLookup.get(mapping.presetGuid);
      if (existing) {
        existing.push(mapping);
        return;
      }
      presetMappingLookup.set(mapping.presetGuid, [mapping]);
    });

    const updatedBy =
      entityUpdatedByLookup.get(entityId) ??
      mappings.find(row => row.updatedBy?.trim())?.updatedBy ??
      null;

    const totals = buildEntityScoaTotals(mappings, presetMappingLookup, normalizedMonths, updatedBy);

    const existingActivity = await listEntityScoaActivity(entityId);
    existingActivity
      .filter(row => {
        const month = normalizeActivityMonth(row.activityMonth) ?? row.activityMonth;
        return normalizedMonths ? Boolean(month && normalizedMonths.has(month)) : Boolean(month);
      })
      .forEach(row => {
        const month = normalizeActivityMonth(row.activityMonth) ?? row.activityMonth;
        if (!month) {
          return;
        }
        const key = `${row.entityId}|${row.scoaAccountId}|${month}`;
        if (!totals.has(key)) {
          totals.set(key, {
            entityId: row.entityId,
            scoaAccountId: row.scoaAccountId,
            activityMonth: month,
            activityValue: 0,
            updatedBy,
          });
        }
      });

    upserts.push(...totals.values());
  }

  if (!upserts.length) {
    return 0;
  }

  const result = await upsertEntityScoaActivity(upserts);
  return result.length;
};

export { normalizeActivityMonth };
