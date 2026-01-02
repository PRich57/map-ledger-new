import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  createEntityDistributionPreset,
  listEntityDistributionPresetsWithDetails,
  updateEntityDistributionPreset,
} from '../../repositories/entityDistributionPresetRepository';

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

const normalizeIdentifier = (value: unknown): string | null => {
  const normalized = normalizeOptionalText(value);
  return normalized && normalized.length > 1 ? normalized : null;
};

const createHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const entityId = getFirstStringValue(body?.entityId);
    const entityAccountId = normalizeIdentifier(body?.entityAccountId);
    const presetType = getFirstStringValue(body?.presetType);
    const scoaAccountId = normalizeIdentifier(body?.scoaAccountId);
    const presetDescription = normalizeOptionalText(body?.presetDescription);
    const metric = normalizeOptionalText(body?.metric);
    const presetGuid = parsePresetGuid(body?.presetGuid) ?? crypto.randomUUID();

    if (!entityId || !entityAccountId || !presetType || !scoaAccountId) {
      return json(
        { message: 'entityId, entityAccountId, presetType, and scoaAccountId are required' },
        400,
      );
    }

    const created = await createEntityDistributionPreset({
      entityId,
      entityAccountId,
      presetType,
      presetDescription,
      presetGuid,
      scoaAccountId,
      metric,
    });

    if (!created) {
      return json({ message: 'Unable to create entity distribution preset' }, 400);
    }

    context.log('Created entity distribution preset', { entityId, presetType, presetGuid });
    return json(created, 201);
  } catch (error) {
    context.error('Failed to create entity distribution preset', error);
    return json(buildErrorResponse('Failed to create entity distribution preset', error), 500);
  }
};

const listHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const entityId = getFirstStringValue(request.query.get('entityId'));
    const presets = await listEntityDistributionPresetsWithDetails(entityId ?? undefined);
    return json({ items: presets });
  } catch (error) {
    context.error('Failed to list entity distribution presets', error);
    return json(buildErrorResponse('Failed to list entity distribution presets', error), 500);
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
    const entityAccountId = normalizeIdentifier(body?.entityAccountId);
    const scoaAccountId = normalizeIdentifier(body?.scoaAccountId);
    const metric = normalizeOptionalText(body?.metric);
    const updatedBy = normalizeOptionalText(body?.updatedBy);

    if (!presetGuid) {
      return json({ message: 'presetGuid is required' }, 400);
    }

    const updated = await updateEntityDistributionPreset(presetGuid, {
      presetType: presetType ?? undefined,
      presetDescription: presetDescription ?? undefined,
      entityAccountId: entityAccountId ?? undefined,
      scoaAccountId: scoaAccountId ?? undefined,
      metric: metric ?? undefined,
      updatedBy,
    });

    if (!updated) {
      return json({ message: 'Preset not found or not updated' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update entity distribution preset', error);
    return json(buildErrorResponse('Failed to update entity distribution preset', error), 500);
  }
};

app.http('entityDistributionPresets-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityDistributionPresets',
  handler: listHandler,
});

app.http('entityDistributionPresets-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityDistributionPresets',
  handler: createHandler,
});

app.http('entityDistributionPresets-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'entityDistributionPresets',
  handler: updateHandler,
});

export default listHandler;
