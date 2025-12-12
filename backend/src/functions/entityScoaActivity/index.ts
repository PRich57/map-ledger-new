import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  insertEntityScoaActivity,
  listEntityScoaActivity,
  updateEntityScoaActivity,
  EntityScoaActivityInput,
} from '../../repositories/entityScoaActivityRepository';

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

const buildInputs = (payload: unknown): EntityScoaActivityInput[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const inputs: EntityScoaActivityInput[] = [];

  for (const entry of payload) {
    const entityId = getFirstStringValue((entry as Record<string, unknown>)?.entityId);
    const scoaAccountId = getFirstStringValue((entry as Record<string, unknown>)?.scoaAccountId);
    const activityMonth = getFirstStringValue((entry as Record<string, unknown>)?.activityMonth);
    const activityValue = parseNumber((entry as Record<string, unknown>)?.activityValue);

    if (!entityId || !scoaAccountId || !activityMonth || activityValue === undefined) {
      continue;
    }

    inputs.push({
      entityId,
      scoaAccountId,
      activityMonth,
      activityValue,
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

    const items = await listEntityScoaActivity(entityId);
    return json({ items });
  } catch (error) {
    context.error('Failed to list entity SCOA activity', error);
    return json(buildErrorResponse('Failed to list entity SCOA activity', error), 500);
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
      return json({ message: 'No valid activity items provided' }, 400);
    }

    const created = await insertEntityScoaActivity(inputs);
    return json({ items: created }, 201);
  } catch (error) {
    context.error('Failed to create entity SCOA activity', error);
    return json(buildErrorResponse('Failed to create entity SCOA activity', error), 500);
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
    const activityMonth = getFirstStringValue(body?.activityMonth);
    const activityValue = parseNumber(body?.activityValue);

    if (!entityId || !scoaAccountId || !activityMonth) {
      return json({ message: 'entityId, scoaAccountId, and activityMonth are required' }, 400);
    }

    const updated = await updateEntityScoaActivity(entityId, scoaAccountId, activityMonth, {
      activityMonth,
      activityValue: activityValue ?? undefined,
      updatedBy: normalizeText(body?.updatedBy),
    });

    if (!updated) {
      return json({ message: 'Activity record not found' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update entity SCOA activity', error);
    return json(buildErrorResponse('Failed to update entity SCOA activity', error), 500);
  }
};

app.http('entityScoaActivity-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'entityScoaActivity',
  handler: listHandler,
});

app.http('entityScoaActivity-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'entityScoaActivity',
  handler: createHandler,
});

app.http('entityScoaActivity-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'entityScoaActivity',
  handler: updateHandler,
});

export default listHandler;