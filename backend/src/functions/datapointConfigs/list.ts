import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';
import { listDatapointConfigurations } from '../../repositories/datapointConfigurationRepository';
import { getFirstStringValue } from '../../utils/requestParsers';
import { buildErrorResponse } from './utils';

const headerCandidates = ['x-user-email', 'X-User-Email'];

export async function listDatapointConfigsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const email = getFirstStringValue([
      request.query.get('email'),
      request.query.get('Email'),
      request.query.get('EMAIL'),
      ...headerCandidates.map(header => request.headers.get(header)),
    ]);

    if (!email) {
      return json({ message: 'Missing email query parameter' }, 400);
    }

    const clientId = getFirstStringValue([
      request.query.get('clientId'),
      request.query.get('client_id'),
      request.query.get('clientID'),
    ]);

    const configs = await listDatapointConfigurations(email.toLowerCase(), clientId ?? undefined);

    return json({ items: configs });
  } catch (error) {
    context.error('Failed to load datapoint configurations', error);
    return json(
      buildErrorResponse('Failed to load datapoint configurations', error),
      500
    );
  }
}

app.http('listDatapointConfigs', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'datapoint-configs',
  handler: listDatapointConfigsHandler,
});

export default listDatapointConfigsHandler;
