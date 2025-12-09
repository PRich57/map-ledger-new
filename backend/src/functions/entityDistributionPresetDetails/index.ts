import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  createEntityDistributionPresetDetails,
  listEntityDistributionPresetDetails,
  updateEntityDistributionPresetDetail,
  EntityDistributionPresetDetailInput,
} from '../../repositories/entityDistributionPresetDetailRepository';

const parseGuid = (value: unknown): string | undefined => {
  const text = getFirstStringValue(value);
  return text && text.length > 0 ? text : undefined;
};

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

const buildInputs = (payload: unknown): EntityDistributionPresetDetailInput[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const inputs: EntityDistributionPresetDetailInput[] = [];

  for (const entry of payload) {
    const presetId =
      parseGuid((entry as Record<string, unknown>)?.presetGuid) ??
      parseGuid((entry as Record<string, unknown>)?.presetId);
    const operationCd = getFirstStringValue((entry as Record<string, unknown>)?.operationCd);

    if (!presetId || !operationCd) {
      continue;
    }

    inputs.push({
      presetId,
      operationCd,
      isCalculated: normalizeBool((entry as Record<string, unknown>)?.isCalculated) ?? null,
      specifiedPct: parseNumber((entry as Record<string, unknown>)?.specifiedPct) ?? null,
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
    const presetId =
      parseGuid(request.query.get('presetGuid')) ??
      parseGuid(request.query.get('presetId'));
    const items = await listEntityDistributionPresetDetails(presetId);
    return json({ items });
  } catch (error) {
    context.error('Failed to list entity distribution preset details', error);
    return json(buildErrorResponse('Failed to list entity distribution preset details', error), 500);
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

    const created = await createEntityDistributionPresetDetails(inputs);
    return json({ items: created }, 201);
  } catch (error) {
    context.error('Failed to create entity distribution preset details', error);
    return json(buildErrorResponse('Failed to create entity distribution preset details', error), 500);
  }
};

const updateHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const presetId =
      parseGuid(body?.presetGuid) ?? parseGuid(body?.presetId);
    const operationCd = getFirstStringValue(body?.operationCd);

    if (!presetId || !operationCd) {
      return json({ message: 'presetGuid and operationCd are required' }, 400);
    }

    const updated = await updateEntityDistributionPresetDetail(presetId, operationCd, {
      isCalculated: normalizeBool(body?.isCalculated) ?? undefined,
      specifiedPct: parseNumber(body?.specifiedPct),
      updatedBy: normalizeText(body?.updatedBy),
    });

    if (!updated) {
      return json({ message: 'Preset detail not found' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update entity distribution preset detail', error);
    return json(buildErrorResponse('Failed to update entity distribution preset detail', error), 500);
  }
};

app.http('entityDistributionPresetDetails-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityDistributionPresetDetails',
  handler: listHandler,
});

app.http('entityDistributionPresetDetails-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityDistributionPresetDetails',
  handler: createHandler,
});

app.http('entityDistributionPresetDetails-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'entityDistributionPresetDetails',
  handler: updateHandler,
});

export default listHandler;
