import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  DatapointConfigurationUpdate,
  updateDatapointConfiguration,
} from '../../repositories/datapointConfigurationRepository';
import { json, readJson } from '../../http';
import { buildErrorResponse, isNotFoundError, sanitizePayload } from './utils';

const buildUpdatePayload = (
  body: Record<string, unknown>,
  paramsId?: string
): DatapointConfigurationUpdate => ({
  id:
    typeof body.id === 'string'
      ? body.id.trim()
      : paramsId
      ? paramsId.trim()
      : '',
  ...sanitizePayload(body),
});

export async function updateDatapointConfigsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await readJson<Record<string, unknown>>(request);

    if (!body || typeof body !== 'object') {
      return json({ message: 'Missing request body' }, 400);
    }

    const payload = buildUpdatePayload(
      body,
      (request.params as Record<string, string | undefined> | undefined)?.id
    );

    if (!payload.id) {
      return json({ message: 'id is required for updates' }, 400);
    }

    if (!payload.userEmail || !payload.clientId || !payload.clientName) {
      return json({ message: 'userEmail, clientId, and clientName are required' }, 400);
    }

    const updated = await updateDatapointConfiguration({
      ...payload,
      userEmail: payload.userEmail.toLowerCase(),
    });

    return json(updated);
  } catch (error) {
    context.error('Failed to update datapoint configuration', error);
    if (isNotFoundError(error)) {
      return json({ message: 'Datapoint configuration not found' }, 404);
    }
    return json(
      buildErrorResponse('Failed to update datapoint configuration', error),
      500
    );
  }
}

app.http('updateDatapointConfigs', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'datapoint-configs/{id?}',
  handler: updateDatapointConfigsHandler,
});

export default updateDatapointConfigsHandler;
