import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { createDatapointConfiguration } from '../../repositories/datapointConfigurationRepository';
import { buildErrorResponse, sanitizePayload } from './utils';

export async function createDatapointConfigsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await readJson<Record<string, unknown>>(request);

    if (!body || typeof body !== 'object') {
      return json({ message: 'Missing request body' }, 400);
    }

    const payload = sanitizePayload(body);

    if (!payload.userEmail || !payload.clientId || !payload.clientName) {
      return json({ message: 'userEmail, clientId, and clientName are required' }, 400);
    }

    const created = await createDatapointConfiguration({
      ...payload,
      userEmail: payload.userEmail.toLowerCase(),
    });

    return json(created, 201);
  } catch (error) {
    context.error('Failed to create datapoint configuration', error);
    return json(
      buildErrorResponse('Failed to create datapoint configuration', error),
      500
    );
  }
}

app.http('createDatapointConfigs', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'datapoint-configs',
  handler: createDatapointConfigsHandler,
});

export default createDatapointConfigsHandler;
