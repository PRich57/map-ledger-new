import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  EntityAccountMappingUpsertInput,
  listEntityAccountMappings,
  listEntityAccountMappingsByFileUpload,
  upsertEntityAccountMappings,
} from '../../repositories/entityAccountMappingRepository';
import {
  createEntityMappingPreset,
  EntityMappingPresetInput,
} from '../../repositories/entityMappingPresetRepository';
import {
  createEntityMappingPresetDetails,
  EntityMappingPresetDetailInput,
  listEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
} from '../../repositories/entityMappingPresetDetailRepository';

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
  polarity?: string | null;
  mappingType?: string | null;
  mappingStatus?: string | null;
  presetId?: string | null;
  exclusionPct?: number | null;
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

const normalizeMappingType = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

const requiresPreset = (mappingType?: string | null): boolean => {
  if (!mappingType) {
    return false;
  }
  return ['percentage', 'dynamic'].includes(mappingType.trim().toLowerCase());
};

const mapSplitDefinitionsToPresetDetails = (
  presetGuid: string,
  mappingType: string | null,
  splits?: IncomingSplitDefinition[],
  updatedBy?: string | null,
): EntityMappingPresetDetailInput[] => {
  if (!splits || splits.length === 0) {
    return [];
  }

  return splits
    .map((split) => {
      const targetDatapoint = normalizeText(split.targetId);
      if (!targetDatapoint) {
        return null;
      }

      const isCalculated = split.isCalculated ?? mappingType === 'dynamic';

      return {
        presetGuid,
        basisDatapoint: normalizeText(split.basisDatapoint),
        targetDatapoint,
        isCalculated,
        specifiedPct: normalizeNumber(split.allocationValue),
        updatedBy,
      } satisfies EntityMappingPresetDetailInput;
    })
    .filter((input): input is EntityMappingPresetDetailInput => Boolean(input));
};

const buildUpsertInputs = (payload: unknown): MappingSaveInput[] => {
  if (!payload) {
    return [];
  }

  const rawItems = Array.isArray((payload as Record<string, unknown>)?.items)
    ? (payload as Record<string, unknown>).items
    : Array.isArray(payload)
      ? payload
      : [payload];

  return rawItems
    .map((entry) => ({
      entityId: getFirstStringValue((entry as Record<string, unknown>)?.entityId),
      entityAccountId: getFirstStringValue((entry as Record<string, unknown>)?.entityAccountId),
      polarity: normalizeText((entry as Record<string, unknown>)?.polarity),
      mappingType: normalizeMappingType((entry as Record<string, unknown>)?.mappingType),
      mappingStatus: normalizeText((entry as Record<string, unknown>)?.mappingStatus),
      presetId: normalizeText((entry as Record<string, unknown>)?.presetId),
      exclusionPct: normalizeNumber((entry as Record<string, unknown>)?.exclusionPct),
      updatedBy: normalizeText((entry as Record<string, unknown>)?.updatedBy),
      splitDefinitions: (entry as Record<string, unknown>)?.splitDefinitions as
        | IncomingSplitDefinition[]
        | undefined,
    }))
    .filter((item) => item.entityId && item.entityAccountId) as MappingSaveInput[];
};

const syncPresetDetails = async (
  presetGuid: string,
  mappingType: string | null,
  splitDefinitions: IncomingSplitDefinition[] | undefined,
  updatedBy: string | null,
): Promise<void> => {
  const desiredDetails = mapSplitDefinitionsToPresetDetails(
    presetGuid,
    mappingType,
    splitDefinitions,
    updatedBy,
  );

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
            updatedBy,
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
  mappingType: string | null,
  presetId: string | null,
): Promise<string | null> => {
  if (!requiresPreset(mappingType)) {
    return presetId;
  }

  const normalizedPreset = presetId?.trim();
  if (normalizedPreset) {
    return normalizedPreset;
  }

  const presetInput: EntityMappingPresetInput = {
    entityId,
    presetType: mappingType ?? 'mapping',
    presetDescription: `Auto-generated preset for ${entityId}`,
    presetGuid: crypto.randomUUID(),
  };

  const created = await createEntityMappingPreset(presetInput);
  return created?.presetGuid ?? presetInput.presetGuid ?? null;
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

    const upserts: EntityAccountMappingUpsertInput[] = [];

    for (const input of inputs) {
      const presetGuid = await ensurePreset(
        input.entityId as string,
        input.mappingType ?? null,
        input.presetId ?? null,
      );

      if (presetGuid && input.splitDefinitions) {
        await syncPresetDetails(
          presetGuid,
          input.mappingType ?? null,
          input.splitDefinitions,
          input.updatedBy ?? null,
        );
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
    }

    const items = await upsertEntityAccountMappings(upserts);
    context.log('Saved entity account mappings', { count: items.length });
    return json({ items });
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

    if (!entityId && !fileUploadGuid) {
      return json({ message: 'entityId or fileUploadGuid is required' }, 400);
    }

    const items = fileUploadGuid
      ? await listEntityAccountMappingsByFileUpload(fileUploadGuid)
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
