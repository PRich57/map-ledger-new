import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  listClientHeaderMappings,
  upsertClientHeaderMappings,
  replaceClientHeaderMappings,
  ClientHeaderMappingInput,
} from '../../repositories/clientHeaderMappingRepository';
import { getFirstStringValue } from '../../utils/requestParsers';
import { buildErrorResponse } from '../datapointConfigs/utils';

interface ClientHeaderMappingPayload {
  clientId: string;
  mappings: ClientHeaderMappingInput[];
}

const parseClientId = (request: HttpRequest): string | undefined =>
  getFirstStringValue([
    request.query.get('clientId'),
    request.query.get('client_id'),
    request.query.get('clientID'),
  ]);

const normalizePayload = (
  body: unknown
): ClientHeaderMappingPayload | null => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const clientId = getFirstStringValue(payload.clientId);
  const mappingsInput = Array.isArray(payload.mappings)
    ? (payload.mappings as unknown[])
    : [];

  const mappings: ClientHeaderMappingInput[] = mappingsInput
    .map((entry): ClientHeaderMappingInput | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const mapping = entry as Record<string, unknown>;
      if (typeof mapping.templateHeader !== 'string') {
        return null;
      }

      const sourceHeader =
        typeof mapping.sourceHeader === 'string'
          ? mapping.sourceHeader
          : mapping.sourceHeader === null
            ? null
            : undefined;

      const mappingMethod =
        typeof mapping.mappingMethod === 'string'
          ? mapping.mappingMethod
          : undefined;

      return {
        templateHeader: mapping.templateHeader,
        ...(sourceHeader !== undefined ? { sourceHeader } : {}),
        ...(mappingMethod !== undefined ? { mappingMethod } : {}),
      };
    })
    .filter((entry): entry is ClientHeaderMappingInput => entry !== null);

  if (!clientId || mappings.length === 0) {
    return null;
  }

  return { clientId, mappings };
};

export const getClientHeaderMappingsHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const clientId = parseClientId(request);
    if (!clientId) {
      return json({ message: 'Missing clientId query parameter' }, 400);
    }

    const mappings = await listClientHeaderMappings(clientId);
    return json({ items: mappings });
  } catch (error) {
    context.error('Failed to fetch client header mappings', error);
    return json(
      buildErrorResponse('Failed to fetch client header mappings', error),
      500
    );
  }
};

export const createClientHeaderMappingsHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const parsed = await readJson(request);
    const payload = normalizePayload(parsed);

    if (!payload) {
      return json({ message: 'Invalid client header mapping payload' }, 400);
    }

    const mappings = await upsertClientHeaderMappings(
      payload.clientId,
      payload.mappings
    );

    return json({ items: mappings }, 201);
  } catch (error) {
    context.error('Failed to persist client header mappings', error);
    return json(
      buildErrorResponse('Failed to persist client header mappings', error),
      500
    );
  }
};

export const updateClientHeaderMappingsHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const parsed = await readJson(request);
    const payload = normalizePayload(parsed);

    if (!payload) {
      return json({ message: 'Invalid client header mapping payload' }, 400);
    }

    const mappings = await replaceClientHeaderMappings(
      payload.clientId,
      payload.mappings
    );

    return json({ items: mappings });
  } catch (error) {
    context.error('Failed to update client header mappings', error);
    return json(
      buildErrorResponse('Failed to update client header mappings', error),
      500
    );
  }
};

app.http('getClientHeaderMappings', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client-header-mappings',
  handler: getClientHeaderMappingsHandler,
});

app.http('createClientHeaderMappings', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'client-header-mappings',
  handler: createClientHeaderMappingsHandler,
});

app.http('updateClientHeaderMappings', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'client-header-mappings',
  handler: updateClientHeaderMappingsHandler,
});

export default getClientHeaderMappingsHandler;
