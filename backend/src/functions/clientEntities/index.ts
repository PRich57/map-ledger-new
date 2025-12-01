import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json } from '../../http';
import { listClientEntities } from '../../repositories/clientEntityRepository';
import { getFirstStringValue } from '../../utils/requestParsers';
import { buildErrorResponse } from '../datapointConfigs/utils';

export const listClientEntitiesHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const clientId = getFirstStringValue(request.query.get('clientId'));

  if (!clientId) {
    return json({ message: 'clientId query parameter is required' }, 400);
  }

  try {
    const entities = await listClientEntities(clientId);
    return json({ items: entities }, 200);
  } catch (error) {
    context.error('Failed to load client entities', error);
    return json(buildErrorResponse('Failed to load client entities', error), 500);
  }
};

app.http('listClientEntities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client-entities',
  handler: listClientEntitiesHandler,
});

export default listClientEntitiesHandler;
