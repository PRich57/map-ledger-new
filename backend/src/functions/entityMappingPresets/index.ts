import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  createEntityMappingPreset,
  listEntityMappingPresetsWithDetails,
  updateEntityMappingPreset,
} from '../../repositories/entityMappingPresetRepository';

const parsePresetGuid = (value: unknown): string | undefined => {
  const guid = getFirstStringValue(value);
  if (!guid) {
    return undefined;
  }
  const trimmed = guid.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const createHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const entityId = getFirstStringValue(body?.entityId);
    const presetType = getFirstStringValue(body?.presetType);
    const presetDescription = normalizeOptionalText(body?.presetDescription);
    const presetGuid = parsePresetGuid(body?.presetGuid) ?? crypto.randomUUID();

    if (!entityId || !presetType) {
      return json({ message: 'entityId and presetType are required' }, 400);
    }

    const created = await createEntityMappingPreset({
      entityId,
      presetType,
      presetDescription,
      presetGuid,
    });

    if (!created) {
      return json({ message: 'Unable to create entity mapping preset' }, 400);
    }

    context.log('Created entity mapping preset', { entityId, presetType });
    return json(created, 201);
  } catch (error) {
    context.error('Failed to create entity mapping preset', error);
    return json(buildErrorResponse('Failed to create entity mapping preset', error), 500);
  }
};

const listHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const entityId = getFirstStringValue(request.query.get('entityId'));
    const presets = await listEntityMappingPresetsWithDetails(entityId ?? undefined);
    return json({ items: presets });
  } catch (error) {
    context.error('Failed to list entity mapping presets', error);
    return json(buildErrorResponse('Failed to list entity mapping presets', error), 500);
  }
};

const updateHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const presetGuid = parsePresetGuid(body?.presetGuid);
    const presetType = getFirstStringValue(body?.presetType);
    const presetDescription = normalizeOptionalText(body?.presetDescription);
    const updatedBy = normalizeOptionalText(body?.updatedBy);

    if (!presetGuid) {
      return json({ message: 'presetGuid is required' }, 400);
    }

    const updated = await updateEntityMappingPreset(presetGuid, {
      presetType: presetType ?? undefined,
      presetDescription: presetDescription ?? undefined,
      updatedBy,
    });

    if (!updated) {
      return json({ message: 'Preset not found or not updated' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update entity mapping preset', error);
    return json(buildErrorResponse('Failed to update entity mapping preset', error), 500);
  }
};

app.http('entityMappingPresets-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityMappingPresets',
  handler: listHandler,
});

app.http('entityMappingPresets-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityMappingPresets',
  handler: createHandler,
});

app.http('entityMappingPresets-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'entityMappingPresets',
  handler: updateHandler,
});

export default listHandler;
