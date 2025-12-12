import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import {
  insertOperationScoaActivity,
  listOperationScoaActivity,
  updateOperationScoaActivity,
  OperationScoaActivityInput,
} from '../../repositories/operationScoaActivityRepository';

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

const buildInputs = (payload: unknown): OperationScoaActivityInput[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const inputs: OperationScoaActivityInput[] = [];

  for (const entry of payload) {
    const operationCd = getFirstStringValue((entry as Record<string, unknown>)?.operationCd);
    const scoaAccountId = getFirstStringValue((entry as Record<string, unknown>)?.scoaAccountId);
    const activityMonth = getFirstStringValue((entry as Record<string, unknown>)?.activityMonth);
    const activityValue = parseNumber((entry as Record<string, unknown>)?.activityValue);

    if (!operationCd || !scoaAccountId || !activityMonth || activityValue === undefined) {
      continue;
    }

    inputs.push({
      operationCd,
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
    const operationCd = getFirstStringValue(request.query.get('operationCd'));
    if (!operationCd) {
      return json({ message: 'operationCd is required' }, 400);
    }

    const items = await listOperationScoaActivity(operationCd);
    return json({ items });
  } catch (error) {
    context.error('Failed to list operation SCOA activity', error);
    return json(buildErrorResponse('Failed to list operation SCOA activity', error), 500);
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

    const created = await insertOperationScoaActivity(inputs);
    return json({ items: created }, 201);
  } catch (error) {
    context.error('Failed to create operation SCOA activity', error);
    return json(buildErrorResponse('Failed to create operation SCOA activity', error), 500);
  }
};

const updateHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson(request);
    const operationCd = getFirstStringValue(body?.operationCd);
    const scoaAccountId = getFirstStringValue(body?.scoaAccountId);
    const activityMonth = getFirstStringValue(body?.activityMonth);
    const activityValue = parseNumber(body?.activityValue);

    if (!operationCd || !scoaAccountId || !activityMonth) {
      return json({ message: 'operationCd, scoaAccountId, and activityMonth are required' }, 400);
    }

    const updated = await updateOperationScoaActivity(operationCd, scoaAccountId, activityMonth, {
      activityMonth,
      activityValue: activityValue ?? undefined,
      updatedBy: normalizeText(body?.updatedBy),
    });

    if (!updated) {
      return json({ message: 'Activity record not found' }, 404);
    }

    return json(updated);
  } catch (error) {
    context.error('Failed to update operation SCOA activity', error);
    return json(buildErrorResponse('Failed to update operation SCOA activity', error), 500);
  }
};

app.http('operationScoaActivity-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'operationScoaActivity',
  handler: listHandler,
});

app.http('operationScoaActivity-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'operationScoaActivity',
  handler: createHandler,
});

app.http('operationScoaActivity-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'operationScoaActivity',
  handler: updateHandler,
});

export default listHandler;