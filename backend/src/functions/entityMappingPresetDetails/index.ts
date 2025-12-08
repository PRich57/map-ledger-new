import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  createEntityMappingPresetDetails,
  listEntityMappingPresetDetails,
  updateEntityMappingPresetDetail,
  EntityMappingPresetDetailInput,
} from '../../repositories/entityMappingPresetDetailRepository';

const normalizeBool = (value: unknown): boolean | null => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

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

const parseNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parsePresetGuid = (value: unknown): string | null => {
  const text = normalizeText(value);

  if (!text || /^\d+$/.test(text)) {
    return null;
  }

  return text;
};

const buildInputs = (payload: unknown): EntityMappingPresetDetailInput[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const inputs: EntityMappingPresetDetailInput[] = [];

  for (const entry of payload) {
    const presetGuid =
      parsePresetGuid((entry as Record<string, unknown>)?.presetGuid) ??
      parsePresetGuid((entry as Record<string, unknown>)?.presetId);
    const basisDatapoint = normalizeText(
      getFirstStringValue((entry as Record<string, unknown>)?.basisDatapoint)
    );
    const targetDatapoint = normalizeText(
      getFirstStringValue((entry as Record<string, unknown>)?.targetDatapoint)
    );

    const isCalculated = normalizeBool((entry as Record<string, unknown>)?.isCalculated);
    const specifiedPct = parseNumber((entry as Record<string, unknown>)?.specifiedPct);

    if (!presetGuid || !targetDatapoint) {
      continue;
    }

    if (isCalculated === true && !basisDatapoint) {
      continue;
    }

    inputs.push({
      presetGuid,
      basisDatapoint,
      targetDatapoint,
      isCalculated: isCalculated ?? null,
      specifiedPct: specifiedPct ?? null,
      updatedBy: normalizeText((entry as Record<string, unknown>)?.updatedBy),
    });
  }

  return inputs;
};

const listHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const presetGuid = parsePresetGuid(
      getFirstStringValue(request.query.get('presetGuid') ?? request.query.get('presetId'))
    );

    if (request.query.has('presetGuid') || request.query.has('presetId')) {
      if (!presetGuid) {
        return json({ message: 'presetGuid must be a non-numeric string' }, 400);
      }
    }

    const items = await listEntityMappingPresetDetails(presetGuid ?? undefined);
    return json({ items });
  } catch (error) {
    context.error('Failed to list entity mapping preset details', error);
    return json(buildErrorResponse('Failed to list entity mapping preset details', error), 500);
  }
};

const createHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const inputs = buildInputs(body?.items ?? body);

    if (!inputs.length) {
      return json({ message: 'No valid preset details provided' }, 400);
    }

    const created = await createEntityMappingPresetDetails(inputs);
    return json({ items: created }, 201);
  } catch (error) {
    context.error('Failed to create entity mapping preset details', error);
    return json(buildErrorResponse('Failed to create entity mapping preset details', error), 500);
  }
};

const updateHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const presetGuid = parsePresetGuid(body?.presetGuid ?? body?.presetId);
    const basisDatapoint = normalizeText(getFirstStringValue(body?.basisDatapoint));
    const targetDatapoint = normalizeText(getFirstStringValue(body?.targetDatapoint));
    const isCalculated = normalizeBool(body?.isCalculated);
    const specifiedPct = parseNumber(body?.specifiedPct);

    if (!presetGuid || !targetDatapoint) {
      return json({ message: 'presetGuid and targetDatapoint are required' }, 400);
    }

    if (isCalculated === true && !basisDatapoint) {
      return json({ message: 'basisDatapoint is required for calculated mappings' }, 400);
    }

    const updated = await updateEntityMappingPresetDetail(
      presetGuid,
      basisDatapoint,
      targetDatapoint,
      {
        isCalculated: isCalculated ?? undefined,
        specifiedPct: specifiedPct,
        updatedBy: normalizeText(body?.updatedBy),
      }
    );

    if (!updated) {
      return json({ message: 'Preset detail not found' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update entity mapping preset detail', error);
    return json(buildErrorResponse('Failed to update entity mapping preset detail', error), 500);
  }
};

app.http('entityMappingPresetDetails-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityMappingPresetDetails',
  handler: listHandler,
});

app.http('entityMappingPresetDetails-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityMappingPresetDetails',
  handler: createHandler,
});

app.http('entityMappingPresetDetails-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'entityMappingPresetDetails',
  handler: updateHandler,
});

export default listHandler;
