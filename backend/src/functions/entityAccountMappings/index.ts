import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { json, readJson } from '../../http';
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
  EntityMappingPresetInput,
  listEntityMappingPresets,
} from '../../repositories/entityMappingPresetRepository';
import {
  createEntityMappingPresetDetails,
  EntityMappingPresetDetailInput,
  listEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} from '../../repositories/entityMappingPresetDetailRepository';
import { EntityAccountInput, upsertEntityAccounts } from '../../repositories/entityAccountRepository';
import { EntityScoaActivityInput, upsertEntityScoaActivity } from '../../repositories/entityScoaActivityRepository';

interface IncomingSplitDefinition {
  targetId?: string | null;
  basisDatapoint?: string | null;
  allocationType?: string | null;
  allocationValue?: number | null;
  isCalculated?: boolean | null;
}

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
  if (normalized === 'percentage' || normalized === 'dynamic') {
    return normalized;
  }
  return 'direct';
};

const normalizePercentageDetails = (
  details: EntityMappingPresetDetailInput[],
): EntityMappingPresetDetailInput[] => {
  const numericDetails = details.filter(
    (detail) => typeof detail.specifiedPct === 'number'
  );

  if (!numericDetails.length) {
    return details;
  }

  const total = numericDetails.reduce(
    (sum, detail) => sum + Number(detail.specifiedPct ?? 0),
    0,
  );

  if (Math.abs(total - 100) < 0.001) {
    return details;
  }

  const factor = total === 0 ? 0 : 100 / total;
  let runningTotal = 0;
  let numericPosition = 0;

  return details.map((detail) => {
    if (typeof detail.specifiedPct !== 'number') {
      return detail;
    }

    numericPosition += 1;
    if (numericPosition === numericDetails.length) {
      const adjusted = Number((100 - runningTotal).toFixed(3));
      return { ...detail, specifiedPct: adjusted };
    }

    const scaled = Number((detail.specifiedPct * factor).toFixed(3));
    runningTotal += scaled;
    return { ...detail, specifiedPct: scaled };
  });
};

const mapSplitDefinitionsToPresetDetails = (
  presetGuid: string,
  mappingType: string | null,
  splits?: IncomingSplitDefinition[],
  updatedBy?: string | null,
  baseAmount?: number | null,
): EntityMappingPresetDetailInput[] => {
  if (!splits || splits.length === 0) {
    return [];
  }

  const normalizedType = resolvePresetType(mappingType);
  const normalizedBaseAmount =
    baseAmount === null || baseAmount === undefined
      ? null
      : Math.abs(baseAmount);

  const rawDetails = splits.reduce<EntityMappingPresetDetailInput[]>((results, split) => {
    const targetDatapoint = normalizeText(split.targetId);
    if (!targetDatapoint) {
      return results;
    }

    const basisDatapoint = normalizeText(split.basisDatapoint);
    const isCalculated = split.isCalculated ?? normalizedType === 'dynamic';
    const allocationType = normalizeText(split.allocationType) ?? 'percentage';
    const allocationValue = normalizeNumber(split.allocationValue);

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

    results.push({
      presetGuid,
      basisDatapoint: basisDatapoint ?? null,
      targetDatapoint,
      isCalculated,
      specifiedPct,
      updatedBy: updatedBy ?? null,
    });

    return results;
  }, []);

  if (normalizedType === 'percentage') {
    return normalizePercentageDetails(rawDetails);
  }

  return rawDetails;
};

const buildPresetDescription = (
  accountName: string | null | undefined,
  mappingType: string | null,
  details: EntityMappingPresetDetailInput[],
): string | null => {
  const source = normalizeText(accountName);
  const normalizedType = resolvePresetType(mappingType);

  if (normalizedType === 'dynamic') {
    return source ?? 'Dynamic mapping preset';
  }

  const targets = details
    .map((detail) => normalizeText(detail.targetDatapoint))
    .filter((value): value is string => Boolean(value));

  if (!targets.length) {
    return source;
  }

  const descriptionSource = source ?? 'Mapping';
  return `${descriptionSource} -> ${targets.join(', ')}`;
};

const buildUpsertInputs = (payload: unknown): MappingSaveInput[] => {
  if (!payload) {
    return [];
  }

  const payloadRecord = payload as Record<string, unknown>;
  const candidateItems = payloadRecord?.items;
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
      };
    })
    .filter((item): item is MappingSaveInput => Boolean(item.entityId && item.entityAccountId));

  return inputs;
};

const buildScoaActivities = (
  input: MappingSaveInput,
): EntityScoaActivityInput[] => {
  const isExcluded =
    input.mappingType?.toLowerCase() === 'exclude' ||
    input.mappingStatus?.toLowerCase() === 'excluded';

  const { entityId, glMonth } = input;

  if (!entityId || !glMonth || isExcluded) {
    return [];
  }

  const splits = input.splitDefinitions ?? [];
  if (!splits.length) {
    return [];
  }

  const baseAmount = input.netChange ?? null;
  if (baseAmount === null) {
    return [];
  }

  return splits.reduce<EntityScoaActivityInput[]>((results, split) => {
    const scoaAccountId = normalizeText(split.targetId);
    if (!scoaAccountId) {
      return results;
    }

    const allocationValue = parseNumber(split.allocationValue) ?? 0;
    const allocationType = split.allocationType ?? 'percentage';
    const calculatedValue =
      allocationType === 'amount'
        ? allocationValue
        : baseAmount * (allocationValue / 100);

    results.push({
      entityId,
      scoaAccountId,
      activityMonth: glMonth,
      activityValue: calculatedValue,
      updatedBy: input.updatedBy ?? null,
    });

    return results;
  }, []);
};

const toPresetCacheKey = (entityId: string, entityAccountId: string): string =>
  `${entityId}|${entityAccountId}`;

const buildExistingPresetLookup = async (
  inputs: MappingSaveInput[],
): Promise<{
  presetLookup: Map<string, string>;
  knownPresetGuids: Set<string>;
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
      entityIds.map((entityId) => listEntityMappingPresets(entityId)),
    );

    presetLists.forEach((rows) => {
      rows.forEach((row) => {
        if (row.presetGuid) {
          knownPresetGuids.add(row.presetGuid);
        }
      });
    });
  }

  return { presetLookup, knownPresetGuids };
};

const syncPresetDetails = async (
  presetGuid: string,
  desiredDetails: EntityMappingPresetDetailInput[],
  updatedBy?: string | null,
): Promise<void> => {
  if (!desiredDetails.length) {
    return;
  }

  const existing = await listEntityMappingPresetDetails(presetGuid);
  const updates: Promise<unknown>[] = [];
  const creations: EntityMappingPresetDetailInput[] = [];

  desiredDetails.forEach((detail) => {
    const match = existing.find(
      (row) =>
        row.presetGuid === presetGuid &&
        row.targetDatapoint === detail.targetDatapoint &&
        (row.basisDatapoint ?? null) === (detail.basisDatapoint ?? null),
    );

    if (match) {
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
        ),
      );
    } else {
      creations.push(detail);
    }
  });

  if (creations.length) {
    await createEntityMappingPresetDetails(creations);
  }

  if (updates.length) {
    await Promise.all(updates);
  }
};

const ensurePreset = async (
  entityId: string,
  entityAccountId: string,
  mappingType: string | null,
  presetGuid: string,
  presetLookup: Map<string, string>,
  knownPresetGuids: Set<string>,
  presetDescription: string | null,
): Promise<void> => {
  const cacheKey = toPresetCacheKey(entityId, entityAccountId);
  presetLookup.set(cacheKey, presetGuid);

  if (knownPresetGuids.has(presetGuid)) {
    return;
  }

  const presetInput: EntityMappingPresetInput = {
    entityId,
    presetType: resolvePresetType(mappingType),
    presetDescription,
    presetGuid,
  };

  await createEntityMappingPreset(presetInput);
  knownPresetGuids.add(presetGuid);
};

const saveHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const inputs = buildUpsertInputs(body ?? {});

    if (!inputs.length) {
      return json({ message: 'No mapping records provided' }, 400);
    }

    const { presetLookup, knownPresetGuids } = await buildExistingPresetLookup(inputs);
    const upserts: EntityAccountMappingUpsertInput[] = [];
    const entityAccounts: EntityAccountInput[] = [];
    const scoaActivityLookup = new Map<string, EntityScoaActivityInput>();

    for (const input of inputs) {
      const cacheKey = toPresetCacheKey(
        input.entityId as string,
        input.entityAccountId as string,
      );
      const presetGuid =
        normalizeText(input.presetId) ??
        presetLookup.get(cacheKey) ??
        crypto.randomUUID();

      const presetType = resolvePresetType(input.mappingType);
      const presetDetails = mapSplitDefinitionsToPresetDetails(
        presetGuid,
        presetType,
        input.splitDefinitions,
        input.updatedBy ?? null,
        input.netChange ?? null,
      );
      const presetDescription = buildPresetDescription(
        input.accountName ?? input.entityAccountId ?? null,
        presetType,
        presetDetails,
      );

      await ensurePreset(
        input.entityId as string,
        input.entityAccountId as string,
        presetType,
        presetGuid,
        presetLookup,
        knownPresetGuids,
        presetDescription,
      );

      if (presetDetails.length) {
        await syncPresetDetails(presetGuid, presetDetails, input.updatedBy ?? null);
      }

      upserts.push({
        entityId: input.entityId as string,
        entityAccountId: input.entityAccountId as string,
        polarity: input.polarity,
        mappingType: input.mappingType,
        presetId: presetGuid,
        mappingStatus:
          input.mappingStatus ??
          (input.mappingType?.toLowerCase() === 'exclude' ? 'Excluded' : 'Mapped'),
        exclusionPct: input.exclusionPct,
        updatedBy: input.updatedBy,
      });

      entityAccounts.push({
        entityId: input.entityId as string,
        accountId: input.entityAccountId as string,
        accountName: input.accountName ?? null,
        updatedBy: input.updatedBy ?? null,
      });

      const activities = buildScoaActivities(input);
      activities.forEach((activity) => {
        const key = `${activity.entityId}|${activity.scoaAccountId}|${activity.activityMonth}`;
        const existing = scoaActivityLookup.get(key);
        if (existing) {
          existing.activityValue += activity.activityValue;
          return;
        }
        scoaActivityLookup.set(key, activity);
      });
    }

    const [mappings] = await Promise.all([
      upsertEntityAccountMappings(upserts),
      upsertEntityAccounts(entityAccounts),
      upsertEntityScoaActivity(Array.from(scoaActivityLookup.values())),
    ]);

    context.log('Saved entity account mappings', {
      mappings: mappings.length,
      accounts: entityAccounts.length,
      scoaActivities: scoaActivityLookup.size,
    });

    return json({ items: mappings });
  } catch (error) {
    context.error('Failed to save entity account mappings', error);
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

export default listHandler;