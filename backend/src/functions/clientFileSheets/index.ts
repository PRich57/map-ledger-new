import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { buildErrorResponse } from '../datapointConfigs/utils';
import { getFirstStringValue } from '../../utils/requestParsers';
import { clientFileExists } from '../../repositories/clientFileRepository';
import {
  insertClientFileSheet,
  listClientFileSheets,
  softDeleteClientFileSheet,
  updateClientFileSheet,
} from '../../repositories/clientFileSheetRepository';

interface ClientFileSheetPayload {
  fileUploadGuid?: string;
  sheetName?: string;
  isSelected?: boolean;
  firstDataRowIndex?: number;
  rowCount?: number;
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
  params?: Partial<{ fileUploadGuid?: string; sheetName?: string }>,
  requireSheetName: boolean = true
): { payload: ClientFileSheetPayload | null; errors: string[] } => {
  if (!body) {
    return { payload: null, errors: ['Missing request body'] };
  }

  const fileUploadGuid =
    normalizeString(body.fileUploadGuid) ??
    normalizeString(params?.fileUploadGuid);
  const sheetName = normalizeString(body.sheetName) ?? normalizeString(params?.sheetName);
  const isSelected = parseBoolean(body.isSelected);
  const firstDataRowIndex = parseNumber(body.firstDataRowIndex);
  const rowCount = parseNumber(body.rowCount);
  const updatedBy = normalizeString(body.updatedBy);

  const errors: string[] = [];

  if (!fileUploadGuid) {
    errors.push('fileUploadGuid is required');
  } else if (fileUploadGuid.length !== 36) {
    errors.push('fileUploadGuid must be a 36-character string');
  }

  if (requireSheetName && !sheetName) {
    errors.push('sheetName is required');
  }

  if (errors.length > 0) {
    return { payload: null, errors };
  }

  const payload: ClientFileSheetPayload = {
    fileUploadGuid: fileUploadGuid as string,
    sheetName: sheetName ?? undefined,
    isSelected,
    firstDataRowIndex,
    rowCount,
    updatedBy,
  };

  return { payload, errors: [] };
};

const ensureClientFileExists = async (
  fileUploadGuid: string,
  context: InvocationContext
): Promise<boolean> => {
  const exists = await clientFileExists(fileUploadGuid);

  if (!exists) {
    context.warn('Client file not found for provided fileUploadGuid', { fileUploadGuid });
  }

  return exists;
};

export const listClientFileSheetsHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const fileUploadGuid = getFirstStringValue(request.query.get('fileUploadGuid'))?.trim();

  if (!fileUploadGuid) {
    return json({ message: 'fileUploadGuid query parameter is required' }, 400);
  }

  if (fileUploadGuid.length !== 36) {
    return json({ message: 'fileUploadGuid must be a 36-character string' }, 400);
  }

  try {
    const exists = await ensureClientFileExists(fileUploadGuid, context);

    if (!exists) {
      return json({ message: 'Client file not found' }, 404);
    }

    const items = await listClientFileSheets(fileUploadGuid);
    return json({ items }, 200);
  } catch (error) {
    context.error('Failed to list client file sheets', error);
    return json(buildErrorResponse('Failed to list client file sheets', error), 500);
  }
};

export const createClientFileSheetHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson<Record<string, unknown> | null>(request);
    const { payload, errors } = buildPayload(body, undefined, true);

    if (!payload || !payload.fileUploadGuid || !payload.sheetName) {
      return json({ message: 'Invalid client file sheet payload', errors }, 400);
    }

    const exists = await ensureClientFileExists(payload.fileUploadGuid, context);

    if (!exists) {
      return json({ message: 'Client file not found' }, 404);
    }

    const created = await insertClientFileSheet({
      fileUploadGuid: payload.fileUploadGuid,
      sheetName: payload.sheetName,
      isSelected: payload.isSelected,
      firstDataRowIndex: payload.firstDataRowIndex,
      rowCount: payload.rowCount,
    });

    return json({ item: created }, 201);
  } catch (error) {
    context.error('Failed to create client file sheet', error);
    return json(buildErrorResponse('Failed to create client file sheet', error), 500);
  }
};

export const updateClientFileSheetHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const body = await readJson<Record<string, unknown> | null>(request);
    const params = request.params as Partial<{ fileUploadGuid?: string; sheetName?: string }>;
    const { payload, errors } = buildPayload(body, params, true);

    if (!payload || !payload.fileUploadGuid || !payload.sheetName) {
      return json({ message: 'Invalid client file sheet payload', errors }, 400);
    }

    const exists = await ensureClientFileExists(payload.fileUploadGuid, context);

    if (!exists) {
      return json({ message: 'Client file not found' }, 404);
    }

    const updated = await updateClientFileSheet({
      fileUploadGuid: payload.fileUploadGuid,
      sheetName: payload.sheetName,
      isSelected: payload.isSelected,
      firstDataRowIndex: payload.firstDataRowIndex,
      rowCount: payload.rowCount,
      updatedBy: payload.updatedBy,
    });

    if (!updated) {
      return json({ message: 'Client file sheet not found' }, 404);
    }

    return json({ item: updated }, 200);
  } catch (error) {
    context.error('Failed to update client file sheet', error);
    return json(buildErrorResponse('Failed to update client file sheet', error), 500);
  }
};

export const deleteClientFileSheetHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const params = request.params as Partial<{ fileUploadGuid?: string; sheetName?: string }>;
    const fileUploadGuid = getFirstStringValue(params?.fileUploadGuid);
    const sheetName = getFirstStringValue(params?.sheetName);

    if (!fileUploadGuid || !sheetName) {
      return json({ message: 'fileUploadGuid and sheetName are required' }, 400);
    }

    if (fileUploadGuid.length !== 36) {
      return json({ message: 'fileUploadGuid must be a 36-character string' }, 400);
    }

    const body = await readJson<Record<string, unknown> | null>(request);
    const updatedBy = body && typeof body === 'object' ? normalizeString(body.updatedBy) : undefined;

    const exists = await ensureClientFileExists(fileUploadGuid, context);

    if (!exists) {
      return json({ message: 'Client file not found' }, 404);
    }

    const deleted = await softDeleteClientFileSheet(fileUploadGuid, sheetName, updatedBy);

    if (!deleted) {
      return json({ message: 'Client file sheet not found' }, 404);
    }

    return json({ message: 'Client file sheet deleted' }, 200);
  } catch (error) {
    context.error('Failed to delete client file sheet', error);
    return json(buildErrorResponse('Failed to delete client file sheet', error), 500);
  }
};

app.http('listClientFileSheets', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client-file-sheets',
  handler: listClientFileSheetsHandler,
});

app.http('createClientFileSheet', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'client-file-sheets',
  handler: createClientFileSheetHandler,
});

app.http('updateClientFileSheet', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'client-file-sheets/{fileUploadGuid}/{sheetName}',
  handler: updateClientFileSheetHandler,
});

app.http('deleteClientFileSheet', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'client-file-sheets/{fileUploadGuid}/{sheetName}',
  handler: deleteClientFileSheetHandler,
});

export default listClientFileSheetsHandler;
