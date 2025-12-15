import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { json, readJson } from '../../http';
import { withQueryTracking } from '../../utils/sqlClient';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  EntityAccountMappingUpsertInput,
  listEntityAccountMappings,
  listEntityAccountMappingsByFileUpload,
  listEntityAccountMappingsForAccounts,
  listEntityAccountMappingsWithPresets,
  upsertEntityAccountMappings,
} from '../../repositories/entityAccountMappingRepository';
import {
  createEntityMappingPreset,
  EntityMappingPresetDbRow,
  EntityMappingPresetInput,
  listEntityMappingPresetsRaw,
  updateEntityMappingPreset,
  ALLOWED_PRESET_TYPES,
  normalizePresetTypeValue,
} from '../../repositories/entityMappingPresetRepository';
import {
  createEntityMappingPresetDetails,
  deleteEntityMappingPresetDetailsByIds,
  EntityMappingPresetDetailInput,
  listEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} from '../../repositories/entityMappingPresetDetailRepository';
import { EntityAccountInput, upsertEntityAccounts } from '../../repositories/entityAccountRepository';
import { deleteEntityPresetMappings } from '../../repositories/entityPresetMappingRepository';
import {
  normalizeActivityMonth,
  recalculateEntityScoaActivityTotals,
} from '../entityScoaActivity/recalculate';
import {
  mapSplitDefinitionsToPresetDetails,
  buildDynamicPresetMappingInputs,
  determinePresetType,
  syncEntityPresetMappings,
} from './helpers';
import type { NormalizationTools } from './helpers';
import type { IncomingSplitDefinition } from './types';

interface MappingSaveInput {
  entityId?: string;
  entityAccountId?: string;
  accountName?: string | null;
  polarity?: string | null;
  mappingType?: string | null;
  mappingStatus?: string | null;
  presetId?: string | null;
  exclusionPct?: number | null;
  netChange?: number | null;
  glMonth?: string | null;
  updatedBy?: string | null;
  splitDefinitions?: IncomingSplitDefinition[];
  isChanged?: boolean;
}

const normalizeText = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeMappingType = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

const resolvePresetType = (value: string | null | undefined): string => {
  const normalized = normalizeMappingType(value);
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

const normalizationTools: NormalizationTools = {
  normalizeText,
  normalizeNumber,
  resolvePresetType,
};

const isMeaningfulDescription = (value?: string | null): boolean =>
  typeof value === 'string' && value.trim().length > 1;

const isCanonicalPresetType = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ALLOWED_PRESET_TYPES.has(normalized);
};

export const SAVE_ROW_LIMIT = 200;

const normalizePercentageDetails = (
  details: EntityMappingPresetDetailInput[],
): EntityMappingPresetDetailInput[] => {
  // Separate exclusions from regular mappings
  const exclusions = details.filter((detail) => detail.targetDatapoint === 'excluded');
  const nonExclusions = details.filter((detail) => detail.targetDatapoint !== 'excluded');

  // Get numeric details (those with a specified percentage)
  const numericNonExclusions = nonExclusions.filter(
    (detail) => typeof detail.specifiedPct === 'number'
  );
  const numericExclusions = exclusions.filter(
    (detail) => typeof detail.specifiedPct === 'number'
  );

  // Calculate total from all numeric details
  const totalNonExclusion = numericNonExclusions.reduce(
    (sum, detail) => sum + Number(detail.specifiedPct ?? 0),
    0,
  );
  const totalExclusion = numericExclusions.reduce(
    (sum, detail) => sum + Number(detail.specifiedPct ?? 0),
    0,
  );
  const total = totalNonExclusion + totalExclusion;

  // If we have exclusions without percentages, calculate them as the remainder
  const exclusionsWithoutPct = exclusions.filter(
    (detail) => typeof detail.specifiedPct !== 'number'
  );

  if (exclusionsWithoutPct.length > 0 && totalNonExclusion > 0) {
    const remainingPct = Math.max(0, 100 - totalNonExclusion);
    const pctPerExclusion = remainingPct / exclusionsWithoutPct.length;

    const updatedExclusions = exclusions.map((detail) => {
      if (typeof detail.specifiedPct !== 'number') {
        return { ...detail, specifiedPct: Number(pctPerExclusion.toFixed(3)) };
      }
      return detail;
    });

    return [...nonExclusions, ...updatedExclusions];
  }

  // If total is already 100, return as-is
  if (Math.abs(total - 100) < 0.001) {
    return details;
  }

  // If no numeric details or total is 0, return as-is
  const allNumericDetails = [...numericNonExclusions, ...numericExclusions];
  if (!allNumericDetails.length || total === 0) {
    return details;
  }

  // Scale all numeric details proportionally to total 100%
  const factor = 100 / total;
  let runningTotal = 0;
  let numericPosition = 0;

  return details.map((detail) => {
    if (typeof detail.specifiedPct !== 'number') {
      return detail;
    }

    numericPosition += 1;
    if (numericPosition === allNumericDetails.length) {
      const adjusted = Number((100 - runningTotal).toFixed(3));
      return { ...detail, specifiedPct: adjusted };
    }

    const scaled = Number((detail.specifiedPct * factor).toFixed(3));
    runningTotal += scaled;
    return { ...detail, specifiedPct: scaled };
  });
};

const buildPresetDescription = (
  accountIdentifier: string | null | undefined,
): string | null => {
  const source = typeof accountIdentifier === 'string' ? accountIdentifier.trim() : null;
  return source && source.length > 0 ? source : null;
};

const buildUpsertInputs = (payload: unknown): MappingSaveInput[] => {
  if (!payload) {
    return [];
  }

  const payloadRecord = payload as Record<string, unknown>;
  const candidateItems = payloadRecord?.changedRows ?? payloadRecord?.items;
  const rawItems: unknown[] = Array.isArray(candidateItems)
    ? candidateItems
    : Array.isArray(payload)
      ? payload
      : [payload];

  const inputs = rawItems
    .map((entry): MappingSaveInput => {
      const entryRecord = entry as Record<string, unknown>;
      const splitDefinitions = Array.isArray(entryRecord?.splitDefinitions)
        ? (entryRecord.splitDefinitions as IncomingSplitDefinition[])
        : undefined;

      return {
        entityId: getFirstStringValue(entryRecord?.entityId),
        entityAccountId: getFirstStringValue(entryRecord?.entityAccountId),
        accountName: getFirstStringValue(entryRecord?.accountName),
        polarity: normalizeText(entryRecord?.polarity),
        mappingType: normalizeMappingType(entryRecord?.mappingType),
        mappingStatus: normalizeText(entryRecord?.mappingStatus),
        presetId: normalizeText(entryRecord?.presetId),
        exclusionPct: normalizeNumber(entryRecord?.exclusionPct),
        netChange: parseNumber(entryRecord?.netChange),
        glMonth: getFirstStringValue(entryRecord?.glMonth),
        updatedBy: normalizeText(entryRecord?.updatedBy),
        splitDefinitions,
        isChanged: entryRecord?.isChanged !== false,
      };
    })
    .filter(
      (item): item is MappingSaveInput =>
        Boolean(item.entityId && item.entityAccountId && item.isChanged !== false),
    );

  return inputs;
};

const toPresetCacheKey = (entityId: string, entityAccountId: string): string =>
  `${entityId}|${entityAccountId}`;

const buildExistingPresetLookup = async (
  inputs: MappingSaveInput[],
): Promise<{
  presetLookup: Map<string, string>;
  knownPresetGuids: Set<string>;
  presetMetadata: Map<string, EntityMappingPresetDbRow>;
}> => {
  const uniqueMappings: { entityId: string; entityAccountId: string }[] = [];
  const seen = new Set<string>();

  inputs.forEach((input) => {
    if (!input.entityId || !input.entityAccountId) {
      return;
    }

    const key = toPresetCacheKey(input.entityId, input.entityAccountId);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    uniqueMappings.push({
      entityId: input.entityId,
      entityAccountId: input.entityAccountId,
    });
  });

  const existingMappings = uniqueMappings.length
    ? await listEntityAccountMappingsForAccounts(uniqueMappings)
    : [];
  const presetLookup = new Map<string, string>();
  const knownPresetGuids = new Set<string>();
  const presetMetadata = new Map<string, EntityMappingPresetDbRow>();

  existingMappings.forEach((mapping) => {
    if (mapping.presetId) {
      const presetGuid = mapping.presetId;
      presetLookup.set(
        toPresetCacheKey(mapping.entityId, mapping.entityAccountId),
        presetGuid,
      );
      knownPresetGuids.add(presetGuid);
    }
  });

  const entityIds = Array.from(
    new Set(inputs.map((input) => input.entityId).filter(Boolean) as string[]),
  );

  if (entityIds.length) {
    const presetLists = await Promise.all(
      entityIds.map((entityId) => listEntityMappingPresetsRaw(entityId)),
    );

    presetLists.forEach((rows) => {
      rows.forEach((row) => {
        if (row.presetGuid) {
          knownPresetGuids.add(row.presetGuid);
          presetMetadata.set(row.presetGuid, row);
        }
      });
    });
  }

  return { presetLookup, knownPresetGuids, presetMetadata };
};

const isValidRecordId = (value?: number | null): value is number =>
  Number.isFinite(value ?? NaN) && value! > 0;

const syncPresetDetails = async (
  presetGuid: string,
  desiredDetails: EntityMappingPresetDetailInput[],
  updatedBy?: string | null,
  skipPresetMetadataUpdate = false,
): Promise<void> => {
  const existing = await listEntityMappingPresetDetails(presetGuid);
  if (!desiredDetails.length) {
    if (existing.length) {
      const allIds = existing.reduce<number[]>((ids, row) => {
        const recordId = row.recordId;
        if (isValidRecordId(recordId)) {
          ids.push(recordId);
        }
        return ids;
      }, []);
      if (allIds.length) {
        await deleteEntityMappingPresetDetailsByIds(allIds);
        if (!skipPresetMetadataUpdate) {
          await updateEntityMappingPreset(presetGuid, { updatedBy: updatedBy ?? null });
        }
        return;
      }
    }
    return;
  }

  const existingById = new Map<number, typeof existing[number]>();
  existing.forEach(row => {
    if (isValidRecordId(row.recordId)) {
      existingById.set(row.recordId, row);
    }
  });

  const matchedRecordIds = new Set<number>();
  const creations: EntityMappingPresetDetailInput[] = [];
  const updates: Promise<unknown>[] = [];

  const findFallback = (detail: EntityMappingPresetDetailInput) =>
    existing.find(
      (row) =>
        row.targetDatapoint === detail.targetDatapoint &&
        (row.basisDatapoint ?? null) === (detail.basisDatapoint ?? null),
    );

  desiredDetails.forEach((detail) => {
    const detailRecordId = detail.recordId;
    if (isValidRecordId(detailRecordId)) {
      const resolvedDetailRecordId = detailRecordId;
      const match = existingById.get(resolvedDetailRecordId);
      if (match) {
        matchedRecordIds.add(resolvedDetailRecordId);
        updates.push(
          updateEntityMappingPresetDetail(
            presetGuid,
            detail.basisDatapoint ?? null,
            detail.targetDatapoint,
            {
              isCalculated: detail.isCalculated ?? undefined,
              specifiedPct: detail.specifiedPct ?? undefined,
              updatedBy: detail.updatedBy ?? null,
            },
          resolvedDetailRecordId,
          ),
        );
        return;
      }
    }

    const fallback = findFallback(detail);
    const fallbackRecordId = fallback?.recordId;
    if (isValidRecordId(fallbackRecordId)) {
      const resolvedFallbackRecordId = fallbackRecordId;
      matchedRecordIds.add(resolvedFallbackRecordId);
      updates.push(
        updateEntityMappingPresetDetail(
          presetGuid,
          detail.basisDatapoint ?? null,
          detail.targetDatapoint,
          {
            isCalculated: detail.isCalculated ?? undefined,
            specifiedPct: detail.specifiedPct ?? undefined,
            updatedBy: detail.updatedBy ?? null,
          },
          resolvedFallbackRecordId,
        ),
      );
      return;
    }

    creations.push(detail);
  });

  const deletions = existing.reduce<number[]>((ids, row) => {
    const rowRecordId = row.recordId;
    if (isValidRecordId(rowRecordId) && !matchedRecordIds.has(rowRecordId)) {
      ids.push(rowRecordId);
    }
    return ids;
  }, []);

  if (creations.length) {
    await createEntityMappingPresetDetails(creations);
  }

  if (updates.length) {
    await Promise.all(updates);
  }

  if (deletions.length) {
    await deleteEntityMappingPresetDetailsByIds(deletions);
  }

  if (!skipPresetMetadataUpdate && (creations.length > 0 || updates.length > 0 || deletions.length > 0)) {
    await updateEntityMappingPreset(presetGuid, { updatedBy: updatedBy ?? null });
  }
};

const ensurePreset = async (
  entityId: string,
  entityAccountId: string,
  mappingType: string | null,
  presetGuid: string,
  presetLookup: Map<string, string>,
  knownPresetGuids: Set<string>,
  presetMetadata: Map<string, EntityMappingPresetDbRow>,
  presetDescription: string | null,
  updatedBy?: string | null,
): Promise<boolean> => {
  const cacheKey = toPresetCacheKey(entityId, entityAccountId);
  presetLookup.set(cacheKey, presetGuid);

  const targetPresetType = resolvePresetType(mappingType);
  const existingPreset = presetMetadata.get(presetGuid);

  if (existingPreset) {
    const currentPresetType = normalizePresetTypeValue(existingPreset.presetType);
    const needsTypeRepair = !isCanonicalPresetType(existingPreset.presetType);
    const needsTypeUpdate = currentPresetType !== targetPresetType;
    const needsDescriptionRepair =
      presetDescription !== null && !isMeaningfulDescription(existingPreset.presetDescription);

    if (needsTypeRepair || needsTypeUpdate || needsDescriptionRepair) {
      await updateEntityMappingPreset(presetGuid, {
        presetType: needsTypeRepair || needsTypeUpdate ? targetPresetType : undefined,
        presetDescription: needsDescriptionRepair ? presetDescription : undefined,
        updatedBy: updatedBy ?? null,
      });

      presetMetadata.set(presetGuid, {
        ...existingPreset,
        presetType:
          needsTypeRepair || needsTypeUpdate ? targetPresetType : existingPreset.presetType,
        presetDescription: needsDescriptionRepair
          ? presetDescription
          : existingPreset.presetDescription,
        updatedBy: updatedBy ?? existingPreset.updatedBy,
      });
    }
    knownPresetGuids.add(presetGuid);
    return false;
  }

  const presetInput: EntityMappingPresetInput = {
    entityId,
    presetType: targetPresetType,
    presetDescription,
    presetGuid,
  };

  const created = await createEntityMappingPreset(presetInput);
  if (created) {
    presetMetadata.set(presetGuid, {
      presetGuid: created.presetGuid,
      entityId: created.entityId,
      presetType: created.presetType,
      presetDescription: created.presetDescription ?? null,
      insertedDttm: created.insertedDttm ?? null,
      updatedDttm: created.updatedDttm ?? null,
      updatedBy: created.updatedBy ?? null,
    });
    knownPresetGuids.add(presetGuid);
  }
  return Boolean(created);
};

const saveHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  const startedAt = Date.now();
  let dirtyRows = 0;

  try {
    const body = await readJson(request);
    const inputs = buildUpsertInputs(body ?? {});
    dirtyRows = inputs.length;

    if (inputs.length > SAVE_ROW_LIMIT) {
      const limitMessage = `Mapping save request contains ${inputs.length} rows, exceeding the per-request limit of ${SAVE_ROW_LIMIT}.`;
      context.error('Mapping save request exceeds row limit', {
        limit: SAVE_ROW_LIMIT,
        requestedRows: inputs.length,
      });
      return json(
        buildErrorResponse(
          'Too many mapping rows in a single save request. Save in smaller batches or use batch edits.',
          new Error(limitMessage),
        ),
        413,
      );
    }

    if (!inputs.length) {
      return json({ items: [], message: 'No mapping changes to apply' });
    }

    const { result: saveResult, queryCount } = await withQueryTracking(async () => {
      const { presetLookup, knownPresetGuids, presetMetadata } =
        await buildExistingPresetLookup(inputs);
      const freshPresetGuids = new Set<string>();
      const existingMappings = await listEntityAccountMappingsForAccounts(
        inputs.map((input) => ({
          entityId: input.entityId as string,
          entityAccountId: input.entityAccountId as string,
        })),
      );
      const existingLookup = new Map(
        existingMappings.map((mapping) => [
          toPresetCacheKey(mapping.entityId, mapping.entityAccountId),
          mapping,
        ]),
      );
      const upserts: EntityAccountMappingUpsertInput[] = [];
      const entityAccounts: EntityAccountInput[] = [];
      const affectedMonths = new Map<string, Set<string>>();
      const entityUpdatedByLookup = new Map<string, string | null>();

      for (const input of inputs) {
        const cacheKey = toPresetCacheKey(
          input.entityId as string,
          input.entityAccountId as string,
        );
        const presetGuid =
          normalizeText(input.presetId) ??
          presetLookup.get(cacheKey) ??
          crypto.randomUUID();

        const presetType = determinePresetType(
          input.mappingType ?? null,
          input.splitDefinitions,
          normalizationTools,
        );
        const mappingTypeForPersistence =
          presetType === 'dynamic' ? 'dynamic' : input.mappingType;
        const effectiveMappingType = mappingTypeForPersistence ?? input.mappingType;
        const presetDetails = mapSplitDefinitionsToPresetDetails(
          presetGuid,
          presetType,
          input.splitDefinitions,
          input.updatedBy ?? null,
          input.netChange ?? null,
          input.exclusionPct ?? null,
          normalizationTools,
        );
        const presetMappingInputs =
          presetType === 'dynamic'
            ? buildDynamicPresetMappingInputs(
                presetGuid,
                presetType,
                input.splitDefinitions,
                input.updatedBy ?? null,
                input.netChange ?? null,
                input.exclusionPct ?? null,
                normalizationTools,
              )
            : [];
        const presetDescription = buildPresetDescription(
          input.accountName ?? input.entityAccountId ?? null,
        );

        const createdPreset = await ensurePreset(
          input.entityId as string,
          input.entityAccountId as string,
          presetType,
          presetGuid,
          presetLookup,
          knownPresetGuids,
          presetMetadata,
          presetDescription,
          input.updatedBy ?? null,
        );
        if (createdPreset) {
          freshPresetGuids.add(presetGuid);
        }

        const upsertPayload: EntityAccountMappingUpsertInput = {
          entityId: input.entityId as string,
          entityAccountId: input.entityAccountId as string,
          polarity: input.polarity,
          mappingType: mappingTypeForPersistence,
          presetId: presetGuid,
          mappingStatus:
            input.mappingStatus ?? (
              effectiveMappingType?.toLowerCase() === 'exclude' ? 'Excluded' : 'Mapped'
            ),
          exclusionPct: input.exclusionPct,
          updatedBy: input.updatedBy,
        };
        const existing = existingLookup.get(cacheKey);

        const shouldSyncPresetDetails =
          presetDetails.length > 0 || (existing?.presetId && existing.presetId === presetGuid);
        const shouldSyncDynamicMappings =
          presetType === 'dynamic' &&
          (presetMappingInputs.length > 0 ||
            existing?.presetId === presetGuid ||
            presetLookup.has(cacheKey));

        const hasChanges =
          !existing ||
          upsertPayload.polarity !== existing.polarity ||
          upsertPayload.mappingType !== existing.mappingType ||
          upsertPayload.presetId !== existing.presetId ||
          upsertPayload.mappingStatus !== existing.mappingStatus ||
          upsertPayload.exclusionPct !== existing.exclusionPct ||
          shouldSyncPresetDetails ||
          shouldSyncDynamicMappings;

        if (hasChanges) {
          if (shouldSyncPresetDetails) {
            await syncPresetDetails(
              presetGuid,
              presetDetails,
              input.updatedBy ?? null,
              freshPresetGuids.has(presetGuid),
            );
          }

          if (presetType === 'dynamic') {
            if (presetMappingInputs.length) {
              await syncEntityPresetMappings(
                presetGuid,
                presetMappingInputs,
                input.updatedBy ?? null,
              );
            } else if (presetLookup.has(cacheKey) || existing?.presetId === presetGuid) {
              await deleteEntityPresetMappings(presetGuid);
            }
          }

          upserts.push(upsertPayload);
        }

        entityAccounts.push({
          entityId: input.entityId as string,
          accountId: input.entityAccountId as string,
          accountName: input.accountName ?? null,
          updatedBy: input.updatedBy ?? null,
        });

        const monthSet = affectedMonths.get(input.entityId as string) ?? new Set<string>();
        const activityMonth = normalizeActivityMonth(input.glMonth);
        if (activityMonth) {
          monthSet.add(activityMonth);
        }
        affectedMonths.set(input.entityId as string, monthSet);

        if (!entityUpdatedByLookup.has(input.entityId as string) && input.updatedBy) {
          entityUpdatedByLookup.set(input.entityId as string, input.updatedBy ?? null);
        }
      }

      const [mappings] = await Promise.all([
        upsertEntityAccountMappings(upserts),
        upsertEntityAccounts(entityAccounts),
      ]);

      const scoaActivities = await recalculateEntityScoaActivityTotals(
        affectedMonths,
        entityUpdatedByLookup,
      );

      return {
        mappings,
        accounts: entityAccounts.length,
        scoaActivities,
      };
    });

    const durationMs = Date.now() - startedAt;
    context.log('Saved entity account mappings', {
      mappings: saveResult.mappings.length,
      accounts: saveResult.accounts,
      scoaActivities: saveResult.scoaActivities,
      dirtyRows,
      queryCount,
      durationMs,
    });

    return json({ items: saveResult.mappings });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const queryCount = (error as { queryCount?: number })?.queryCount ?? 0;

    context.error('Failed to save entity account mappings', {
      durationMs,
      queryCount,
      dirtyRows,
      error,
    });
    return json(buildErrorResponse('Failed to save entity account mappings', error), 500);
  }
};

const listHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const entityId = getFirstStringValue(request.query.get('entityId'));
    const fileUploadGuid = getFirstStringValue(request.query.get('fileUploadGuid'));
    const includePresetDetails =
      getFirstStringValue(request.query.get('includePresetDetails'))?.toLowerCase() === 'true';

    if (!entityId && !fileUploadGuid) {
      return json({ message: 'entityId or fileUploadGuid is required' }, 400);
    }

    const items = fileUploadGuid
      ? await listEntityAccountMappingsByFileUpload(fileUploadGuid)
      : includePresetDetails
        ? await listEntityAccountMappingsWithPresets(entityId as string)
        : await listEntityAccountMappings(entityId);

    return json({ items });
  } catch (error) {
    context.error('Failed to list entity account mappings', error);
    return json(buildErrorResponse('Failed to list entity account mappings', error), 500);
  }
};

app.http('entityAccountMappings-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityAccountMappings',
  handler: listHandler,
});

app.http('entityAccountMappings-save', {
  methods: ['POST', 'PUT'],
  authLevel: 'anonymous',
  route: 'entityAccountMappings',
  handler: saveHandler,
});

export { saveHandler };

export default listHandler;
