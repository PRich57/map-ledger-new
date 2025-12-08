import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  insertEntityScoaDistributions,
  listEntityScoaDistributions,
  updateEntityScoaDistribution,
  EntityScoaDistributionInput,
} from '../../repositories/entityScoaDistributionRepository';

const parseNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

const buildInputs = (payload: unknown): EntityScoaDistributionInput[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const inputs: EntityScoaDistributionInput[] = [];

  for (const entry of payload) {
    const entityId = getFirstStringValue((entry as Record<string, unknown>)?.entityId);
    const scoaAccountId = getFirstStringValue((entry as Record<string, unknown>)?.scoaAccountId);
    const distributionType = getFirstStringValue((entry as Record<string, unknown>)?.distributionType);

    if (!entityId || !scoaAccountId || !distributionType) {
      continue;
    }

    inputs.push({
      entityId,
      scoaAccountId,
      distributionType,
      presetId: parseNumber((entry as Record<string, unknown>)?.presetId) ?? null,
      distributionStatus: normalizeText((entry as Record<string, unknown>)?.distributionStatus),
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
    const entityId = getFirstStringValue(request.query.get('entityId'));
    if (!entityId) {
      return json({ message: 'entityId is required' }, 400);
    }

    const items = await listEntityScoaDistributions(entityId);
    return json({ items });
  } catch (error) {
    context.error('Failed to list entity SCOA distributions', error);
    return json(buildErrorResponse('Failed to list entity SCOA distributions', error), 500);
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
      return json({ message: 'No valid distribution items provided' }, 400);
    }

    const created = await insertEntityScoaDistributions(inputs);
    return json({ items: created }, 201);
  } catch (error) {
    context.error('Failed to create entity SCOA distributions', error);
    return json(buildErrorResponse('Failed to create entity SCOA distributions', error), 500);
  }
};

const updateHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const entityId = getFirstStringValue(body?.entityId);
    const scoaAccountId = getFirstStringValue(body?.scoaAccountId);
    const distributionType = getFirstStringValue(body?.distributionType);
    const presetId = parseNumber(body?.presetId);

    if (!entityId || !scoaAccountId || !distributionType) {
      return json({ message: 'entityId, scoaAccountId, and distributionType are required' }, 400);
    }

    const updated = await updateEntityScoaDistribution(entityId, scoaAccountId, distributionType, {
      presetId: presetId ?? undefined,
      distributionStatus: normalizeText(body?.distributionStatus),
      updatedBy: normalizeText(body?.updatedBy),
    });

    if (!updated) {
      return json({ message: 'Distribution record not found' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update entity SCOA distribution', error);
    return json(buildErrorResponse('Failed to update entity SCOA distribution', error), 500);
  }
};

app.http('entityScoaDistribution-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityScoaDistribution',
  handler: listHandler,
});

app.http('entityScoaDistribution-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityScoaDistribution',
  handler: createHandler,
});

app.http('entityScoaDistribution-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'entityScoaDistribution',
  handler: updateHandler,
});

export default listHandler;
