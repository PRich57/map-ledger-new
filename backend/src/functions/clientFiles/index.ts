import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  listClientFiles,
  saveClientFileMetadata,
  ImportStatus,
  NewClientFileRecord,
  coerceImportStatus,
  softDeleteClientFile,
} from '../../repositories/clientFileRepository';
import { getFirstStringValue } from '../../utils/requestParsers';
import { buildErrorResponse } from '../datapointConfigs/utils';

export interface ClientFileMetadataPayload {
  clientId?: string;
  id?: string;
  fileUploadGuid?: string;
  fileUploadId?: string;
  insertedBy?: string;
  uploadedBy?: string;
  importedBy?: string;
  sourceFileName?: string;
  fileName?: string;
  fileStorageUri?: string;
  status?: ImportStatus;
  fileStatus?: ImportStatus;
  glPeriodStart?: string;
  glPeriodEnd?: string;
  period?: string;
  lastStepCompletedDttm?: string;
}

const PLACEHOLDER_FILE_STORAGE_URI = 'https://storage.invalid/client-file-placeholder';

const parseInteger = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeMonthToDate = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const monthMatch = /^\d{4}-(\d{2})(-\d{2})?$/.exec(trimmed);
  if (monthMatch) {
    const [year, month] = trimmed.split('-');
    const day = trimmed.split('-')[2] ?? '01';
    return `${year}-${month}-${day}`;
  }

  return trimmed;
};

export const validateRecord = (
  payload: ClientFileMetadataPayload | unknown
): { record: NewClientFileRecord | null; errors: string[] } => {
  if (!payload || typeof payload !== 'object') {
    return { record: null, errors: ['Payload is not an object'] };
  }

  const bag = payload as Record<string, unknown>;

  const clientId = toOptionalString(bag.clientId);
  const sourceFileName = toOptionalString(bag.sourceFileName ?? bag.fileName);
  const rawStatus = toOptionalString(bag.fileStatus ?? bag.status);
  const fileStatus = coerceImportStatus(rawStatus);
  const fileStorageUri =
    toOptionalString(bag.fileStorageUri) ?? PLACEHOLDER_FILE_STORAGE_URI;
  const fileUploadGuid =
    toOptionalString(bag.fileUploadGuid ?? bag.fileUploadId ?? bag.id) ?? undefined;
  const insertedBy = toOptionalString(
    bag.insertedBy ?? bag.uploadedBy ?? bag.importedBy
  );

  const missingFields = [
    !clientId ? 'clientId is required' : null,
    !sourceFileName ? 'sourceFileName is required' : null,
    !insertedBy ? 'insertedBy (uploader email) is required' : null,
  ].filter(Boolean) as string[];

  if (missingFields.length > 0) {
    return { record: null, errors: missingFields };
  }

  const requiredClientId = clientId as string;
  const requiredSourceFileName = sourceFileName as string;
  const requiredFileStorageUri = fileStorageUri as string;

  const baseRecord: NewClientFileRecord = {
    clientId: requiredClientId,
    fileUploadGuid,
    insertedBy,
    sourceFileName: requiredSourceFileName,
    fileStorageUri: requiredFileStorageUri,
    status: fileStatus,
    glPeriodStart: normalizeMonthToDate(
      toOptionalString(bag.glPeriodStart ?? bag.period)
    ),
    glPeriodEnd: normalizeMonthToDate(
      toOptionalString(bag.glPeriodEnd ?? bag.period)
    ),
    lastStepCompletedDttm: toOptionalString(bag.lastStepCompletedDttm),
  };

  return { record: baseRecord, errors: [] };
};

export const listClientFilesHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const clientId = getFirstStringValue(request.query.get('clientId'));
    const page = parseInteger(request.query.get('page'), 1);
    const pageSize = parseInteger(request.query.get('pageSize'), 10);

    const result = await listClientFiles(clientId, page, pageSize);

    return json(result, 200);
  } catch (error) {
    context.error('Failed to load client file history', error);
    return json(buildErrorResponse('Failed to load client file history', error), 500);
  }
};

export const saveClientFileHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const parsed = await readJson(request);
    const { record, errors } = validateRecord(parsed);

    if (!record) {
      context.warn('Invalid client file payload', {
        errors,
        payloadPreview: parsed,
      });
      return json({ message: 'Invalid client file payload', errors }, 400);
    }

    context.info('Persisting client file metadata', {
      clientId: record.clientId,
      sourceFileName: record.sourceFileName,
      fileStatus: record.status,
    });

    const saved = await saveClientFileMetadata(record);

    return json({ item: saved }, 201);
  } catch (error) {
    context.error('Failed to persist client file metadata', error);
    return json(
      buildErrorResponse('Failed to persist client file metadata', error),
      500
    );
  }
};

export const deleteClientFileHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const params = request.params as Partial<{ fileUploadGuid?: string }> | undefined;
    const fileUploadGuid = getFirstStringValue(params?.fileUploadGuid);

    if (!fileUploadGuid) {
      return json({ message: 'fileUploadGuid is required' }, 400);
    }

    if (fileUploadGuid.length !== 36) {
      return json({ message: 'fileUploadGuid must be a 36-character string' }, 400);
    }

    const deleted = await softDeleteClientFile(fileUploadGuid);

    if (!deleted) {
      return json({ message: 'Client file not found' }, 404);
    }

    return json({ message: 'Client file deleted' }, 200);
  } catch (error) {
    context.error('Failed to delete client file', error);
    return json(buildErrorResponse('Failed to delete client file', error), 500);
  }
};

app.http('listClientFiles', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'client-files',
  handler: listClientFilesHandler,
});

app.http('saveClientFile', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'client-files',
  handler: saveClientFileHandler,
});

app.http('deleteClientFile', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'client-files/{fileUploadGuid}',
  handler: deleteClientFileHandler,
});