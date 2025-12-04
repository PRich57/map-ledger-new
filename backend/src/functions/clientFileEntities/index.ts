import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  insertClientFileEntity,
  listClientFileEntities,
  softDeleteClientFileEntity,
  updateClientFileEntity,
} from '../../repositories/clientFileEntityRepository';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';

interface ClientFileEntityPayload {
  fileUploadGuid?: string;
  entityId?: number;
  isSelected?: boolean;
  updatedBy?: string;
}

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
};

const buildPayload = (
  body: Record<string, unknown> | null,
  params?: Partial<{ fileUploadGuid?: string; entityId?: string }>,
  requireEntityId: boolean = true
): { payload: ClientFileEntityPayload | null; errors: string[] } => {
  if (!body) {
    return { payload: null, errors: ['Missing request body'] };
  }

  const fileUploadGuid =
    normalizeString(body.fileUploadGuid) ??
    normalizeString(params?.fileUploadGuid);
  const entityId = parseNumber(body.entityId ?? params?.entityId);
  const isSelected = parseBoolean(body.isSelected);
  const updatedBy = normalizeString(body.updatedBy);

  const errors: string[] = [];

  if (!fileUploadGuid) {
    errors.push('fileUploadGuid is required');
  } else if (fileUploadGuid.length !== 36) {
    errors.push('fileUploadGuid must be a 36-character string');
  }

  if (requireEntityId && (entityId === undefined || entityId === null)) {
    errors.push('entityId is required');
  }

  if (errors.length > 0) {
    return { payload: null, errors };
  }

  const payload: ClientFileEntityPayload = {
    fileUploadGuid: fileUploadGuid as string,
    entityId: entityId as number,
  };

  if (isSelected !== undefined) {
    payload.isSelected = isSelected;
  }

  if (updatedBy !== undefined) {
    payload.updatedBy = updatedBy;
  }

  return { payload, errors: [] };
};

export const listClientFileEntitiesHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const fileUploadGuid = getFirstStringValue(request.query.get('fileUploadGuid'));
  const normalizedGuid = fileUploadGuid?.trim();

  if (!normalizedGuid) {
    return json({ message: 'fileUploadGuid query parameter is required' }, 400);
  }

  if (normalizedGuid.length !== 36) {
    return json({ message: 'fileUploadGuid must be a 36-character string' }, 400);
  }

  try {
    const items = await listClientFileEntities(normalizedGuid);
    return json({ items }, 200);
  } catch (error) {
    context.error('Failed to list client file entities', error);
    return json(
      buildErrorResponse('Failed to list client file entities', error),
      500
    );
  }
};

export const createClientFileEntityHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson<Record<string, unknown> | null>(request);
    const { payload, errors } = buildPayload(body, undefined, true);

    if (!payload) {
      return json({ message: 'Invalid client file entity payload', errors }, 400);
    }

    const created = await insertClientFileEntity({
      fileUploadGuid: payload.fileUploadGuid as string,
      entityId: payload.entityId as number,
      isSelected: payload.isSelected,
    });

    return json({ item: created }, 201);
  } catch (error) {
    context.error('Failed to create client file entity', error);
    return json(buildErrorResponse('Failed to create client file entity', error), 500);
  }
};

export const updateClientFileEntityHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson<Record<string, unknown> | null>(request);
    const params = request.params as Partial<{ fileUploadGuid?: string; entityId?: string }>;
    const { payload, errors } = buildPayload(body, params, true);

    if (!payload) {
      return json({ message: 'Invalid client file entity payload', errors }, 400);
    }

    const updated = await updateClientFileEntity({
      fileUploadGuid: payload.fileUploadGuid as string,
      entityId: payload.entityId as number,
      isSelected: payload.isSelected,
      updatedBy: payload.updatedBy,
    });

    if (!updated) {
      return json({ message: 'Client file entity not found' }, 404);
    }

    return json({ item: updated }, 200);
  } catch (error) {
    context.error('Failed to update client file entity', error);
    return json(buildErrorResponse('Failed to update client file entity', error), 500);
  }
};

export const deleteClientFileEntityHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const params = request.params as Partial<{ fileUploadGuid?: string; entityId?: string }>;
    const fileUploadGuid = getFirstStringValue(params?.fileUploadGuid);
    const entityId = parseNumber(params?.entityId);

    if (!fileUploadGuid || !entityId) {
      return json({ message: 'fileUploadGuid and entityId are required' }, 400);
    }

    if (fileUploadGuid.length !== 36) {
      return json({ message: 'fileUploadGuid must be a 36-character string' }, 400);
    }

    const body = await readJson<Record<string, unknown> | null>(request);
    const updatedBy = body && typeof body === 'object' ? normalizeString(body.updatedBy) : undefined;

    const deleted = await softDeleteClientFileEntity(fileUploadGuid, entityId, updatedBy);

    if (!deleted) {
      return json({ message: 'Client file entity not found' }, 404);
    }

    return json({ message: 'Client file entity deleted' }, 200);
  } catch (error) {
    context.error('Failed to delete client file entity', error);
    return json(buildErrorResponse('Failed to delete client file entity', error), 500);
  }
};

app.http('listClientFileEntities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client-file-entities',
  handler: listClientFileEntitiesHandler,
});

app.http('createClientFileEntity', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'client-file-entities',
  handler: createClientFileEntityHandler,
});

app.http('updateClientFileEntity', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'client-file-entities/{fileUploadGuid}/{entityId}',
  handler: updateClientFileEntityHandler,
});

app.http('deleteClientFileEntity', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'client-file-entities/{fileUploadGuid}/{entityId}',
  handler: deleteClientFileEntityHandler,
});

export default listClientFileEntitiesHandler;
