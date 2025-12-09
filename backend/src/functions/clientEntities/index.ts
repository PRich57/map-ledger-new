import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getClientPrincipal, json, readJson } from '../../http';
import {
  createClientEntity,
  listClientEntities,
  softDeleteClientEntity,
  updateClientEntity,
} from '../../repositories/clientEntityRepository';
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

const resolveUpdatedBy = (request: HttpRequest): string | undefined => {
  const principal = getClientPrincipal(request);
  return principal?.userDetails || principal?.userId || undefined;
};

export const createClientEntityHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    if (!payload) {
      return json({ message: 'Request body is required' }, 400);
    }

    const clientId = getFirstStringValue(payload.clientId);
    const entityName = getFirstStringValue(payload.entityName);
    const entityDisplayName = getFirstStringValue(payload.entityDisplayName);
    const entityStatus = getFirstStringValue(payload.entityStatus);

    if (!clientId || !entityName) {
      return json({ message: 'clientId and entityName are required' }, 400);
    }

    const created = await createClientEntity({
      clientId,
      entityName,
      entityDisplayName,
      entityStatus,
      updatedBy: resolveUpdatedBy(request),
    });

    if (!created) {
      return json({ message: 'Failed to create client entity' }, 400);
    }

    return json({ item: created }, 201);
  } catch (error) {
    context.error('Failed to create client entity', error);
    return json(buildErrorResponse('Failed to create client entity', error), 500);
  }
};

export const updateClientEntityHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    if (!payload) {
      return json({ message: 'Request body is required' }, 400);
    }

    const params = request.params as Partial<{ entityId?: string }> | undefined;
    const entityId = getFirstStringValue(params?.entityId) || getFirstStringValue(payload.entityId);
    const clientId = getFirstStringValue(payload.clientId);
    const entityName = getFirstStringValue(payload.entityName);
    const entityDisplayName = getFirstStringValue(payload.entityDisplayName);
    const entityStatus = getFirstStringValue(payload.entityStatus);

    if (!clientId || !entityId || !entityName) {
      return json({ message: 'clientId, entityId, and entityName are required' }, 400);
    }

    const updated = await updateClientEntity({
      clientId,
      entityId,
      entityName,
      entityDisplayName,
      entityStatus,
      updatedBy: resolveUpdatedBy(request),
    });

    if (!updated.record) {
      if (updated.rowsAffected === 0) {
        return json({ message: 'Client entity not found' }, 404);
      }

      context.error('Client entity updated without returning a record', {
        entityId,
        clientId,
      });
      return json({ message: 'Failed to update client entity' }, 500);
    }

    return json({ item: updated.record }, 200);
  } catch (error) {
    context.error('Failed to update client entity', error);
    return json(buildErrorResponse('Failed to update client entity', error), 500);
  }
};

export const deleteClientEntityHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const params = request.params as Partial<{ entityId?: string }> | undefined;
    const entityId = getFirstStringValue(params?.entityId);
    const clientId = getFirstStringValue(request.query.get('clientId'));

    if (!clientId || !entityId) {
      return json({ message: 'clientId and entityId are required' }, 400);
    }

    const deleted = await softDeleteClientEntity({
      clientId,
      entityId,
      updatedBy: resolveUpdatedBy(request),
    });

    if (!deleted) {
      return json({ message: 'Client entity not found' }, 404);
    }

    return json({ item: deleted }, 200);
  } catch (error) {
    context.error('Failed to delete client entity', error);
    return json(buildErrorResponse('Failed to delete client entity', error), 500);
  }
};

app.http('listClientEntities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client-entities',
  handler: listClientEntitiesHandler,
});

app.http('createClientEntity', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'client-entities',
  handler: createClientEntityHandler,
});

app.http('updateClientEntity', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'client-entities/{entityId}',
  handler: updateClientEntityHandler,
});

app.http('deleteClientEntity', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'client-entities/{entityId}',
  handler: deleteClientEntityHandler,
});

export default listClientEntitiesHandler;
