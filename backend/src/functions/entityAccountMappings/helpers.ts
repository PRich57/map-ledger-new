import {
  createEntityPresetMappings,
  listEntityPresetMappings,
  updateEntityPresetMappingRecord,
  deleteEntityPresetMappingRecords,
} from '../../repositories/entityPresetMappingRepository';
import type { EntityMappingPresetDetailInput } from '../../repositories/entityMappingPresetDetailRepository';
import type {
  EntityPresetMappingInput,
  EntityPresetMappingRow,
} from '../../repositories/entityPresetMappingRepository';
import type { IncomingSplitDefinition, NormalizedSplitDefinition } from './types';

export interface NormalizationTools {
  normalizeText: (value: unknown) => string | null;
  normalizeNumber: (value: unknown) => number | null;
  resolvePresetType: (value: string | null | undefined) => string;
}

export const normalizeSplitDefinitions = (
  mappingType: string | null,
  splits: IncomingSplitDefinition[] | undefined,
  baseAmount: number | null,
  exclusionPct: number | null,
  tools: NormalizationTools,
): NormalizedSplitDefinition[] => {
  if (!splits || splits.length === 0) {
    return [];
  }

  const normalizedType = tools.resolvePresetType(mappingType);
  const normalizedBaseAmount =
    baseAmount === null || baseAmount === undefined
      ? null
      : Math.abs(baseAmount);

  const normalizedSplits: NormalizedSplitDefinition[] = [];

  splits.forEach((split) => {
    const targetDatapoint = tools.normalizeText(split.targetId);
    const isExclusionSplit = split.isExclusion === true;

    let finalTargetDatapoint: string;
    if (isExclusionSplit) {
      finalTargetDatapoint = 'excluded';
    } else if (!targetDatapoint) {
      return;
    } else {
      finalTargetDatapoint = targetDatapoint;
    }

    const basisDatapoint = tools.normalizeText(split.basisDatapoint);
    const isCalculated = split.isCalculated ?? normalizedType === 'dynamic';
    const allocationType = tools.normalizeText(split.allocationType) ?? 'percentage';
    const allocationValue = tools.normalizeNumber(split.allocationValue);

    let specifiedPct: number | null = null;
    if (normalizedType === 'dynamic') {
      specifiedPct = null;
    } else if (normalizedType === 'direct') {
      specifiedPct = 100;
    } else if (allocationType === 'amount' && normalizedBaseAmount) {
      specifiedPct = Number(
        (((allocationValue ?? 0) / normalizedBaseAmount) * 100).toFixed(3),
      );
    } else {
      specifiedPct = allocationValue ?? null;
    }

    normalizedSplits.push({
      basisDatapoint: basisDatapoint ?? null,
      targetDatapoint: finalTargetDatapoint,
      isCalculated,
      specifiedPct,
      appliedPct: normalizedType === 'dynamic' ? allocationValue ?? null : null,
      recordId: split.recordId ?? null,
    });
  });

  if (
    normalizedType === 'percentage' &&
    typeof exclusionPct === 'number' &&
    exclusionPct > 0
  ) {
    const hasExclusionSplit = normalizedSplits.some(
      (detail) => detail.targetDatapoint === 'excluded',
    );

    if (!hasExclusionSplit) {
      normalizedSplits.push({
        basisDatapoint: null,
        targetDatapoint: 'excluded',
        isCalculated: false,
        specifiedPct: exclusionPct,
        appliedPct: null,
        recordId: null,
      });
    }
  }

  return normalizedSplits;
};

export const mapSplitDefinitionsToPresetDetails = (
  presetGuid: string,
  mappingType: string | null,
  splits: IncomingSplitDefinition[] | undefined,
  updatedBy: string | null,
  baseAmount: number | null,
  exclusionPct: number | null,
  tools: NormalizationTools,
): EntityMappingPresetDetailInput[] => {
  const normalizedSplits = normalizeSplitDefinitions(
    mappingType,
    splits,
    baseAmount,
    exclusionPct,
    tools,
  );

  if (!normalizedSplits.length) {
    return [];
  }

  return normalizedSplits.map((detail) => ({
    presetGuid,
    basisDatapoint: detail.basisDatapoint,
    targetDatapoint: detail.targetDatapoint,
    isCalculated: detail.isCalculated,
    specifiedPct: detail.specifiedPct,
    updatedBy: updatedBy ?? null,
    recordId: detail.recordId ?? null,
  }));
};

export const buildDynamicPresetMappingInputs = (
  presetGuid: string,
  mappingType: string | null,
  splits: IncomingSplitDefinition[] | undefined,
  updatedBy: string | null,
  baseAmount: number | null,
  exclusionPct: number | null,
  tools: NormalizationTools,
): EntityPresetMappingInput[] => {
  const presetType = tools.resolvePresetType(mappingType);
  if (presetType !== 'dynamic') {
    return [];
  }

  const normalizedSplits = normalizeSplitDefinitions(
    mappingType,
    splits,
    baseAmount,
    exclusionPct,
    tools,
  );

  if (!normalizedSplits.length) {
    return [];
  }

  return normalizedSplits.map((detail) => ({
    presetGuid,
    basisDatapoint: detail.basisDatapoint,
    targetDatapoint: detail.targetDatapoint,
    appliedPct: detail.appliedPct,
    updatedBy: updatedBy ?? null,
    recordId: detail.recordId ?? null,
  }));
};

export const determinePresetType = (
  mappingType: string | null,
  splits: IncomingSplitDefinition[] | undefined,
  tools: NormalizationTools,
): string => {
  const normalized = tools.resolvePresetType(mappingType);

  if (normalized === 'dynamic') {
    return 'dynamic';
  }

  if (splits && splits.some((split) => {
    const allocationType = tools.normalizeText(split.allocationType)?.toLowerCase();
    return allocationType === 'dynamic';
  })) {
    return 'dynamic';
  }

  return normalized;
};

const normalizeBasisKey = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  const normalized = value.trim().toLowerCase();
  return normalized;
};

export const syncEntityPresetMappings = async (
  presetGuid: string,
  inputs: EntityPresetMappingInput[],
  updatedBy: string | null,
): Promise<boolean> => {
  if (!presetGuid) {
    return false;
  }

  const existing = await listEntityPresetMappings(presetGuid);
  if (!existing.length && inputs.length === 0) {
    return false;
  }

  const existingByBasis = new Map<string, EntityPresetMappingRow>();
  existing.forEach(row => {
    const key = normalizeBasisKey(row.basisDatapoint);
    existingByBasis.set(key, row);
  });

  const matchedBasis = new Set<string>();
  const creations: EntityPresetMappingInput[] = [];
  const updatePromises: Promise<void>[] = [];

  inputs.forEach(input => {
    const key = normalizeBasisKey(input.basisDatapoint);
    const existingRow = existingByBasis.get(key);
    matchedBasis.add(key);

    if (existingRow) {
      const recordId = existingRow.recordId;
      if (typeof recordId === 'number' && Number.isFinite(recordId) && recordId > 0) {
        updatePromises.push(
          updateEntityPresetMappingRecord(recordId, {
            basisDatapoint: input.basisDatapoint ?? existingRow.basisDatapoint,
            targetDatapoint: input.targetDatapoint,
            appliedPct: input.appliedPct,
            updatedBy,
          }),
        );
      }
    } else {
      creations.push(input);
    }
  });

  const deletionIds = existing
    .filter(row => !matchedBasis.has(normalizeBasisKey(row.basisDatapoint)))
    .map(row => row.recordId ?? null)
    .filter(
      (id): id is number =>
        id !== null &&
        typeof id === 'number' &&
        Number.isFinite(id) &&
        id > 0,
    );

  if (creations.length) {
    await createEntityPresetMappings(creations);
  }

  if (deletionIds.length) {
    await deleteEntityPresetMappingRecords(deletionIds);
  }

  if (updatePromises.length) {
    await Promise.all(updatePromises);
  }

  return Boolean(creations.length || deletionIds.length || updatePromises.length);
};
