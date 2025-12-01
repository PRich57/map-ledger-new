import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  listClientFiles,
  saveClientFileMetadata,
  NewClientFileRecord,
} from '../../repositories/clientFileRepository';
import { getFirstStringValue } from '../../utils/requestParsers';
import { buildErrorResponse } from '../datapointConfigs/utils';

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

const validateRecord = (payload: unknown): { record: NewClientFileRecord | null; errors: string[] } => {
  if (!payload || typeof payload !== 'object') {
    return { record: null, errors: ['Payload is not an object'] };
  }

  const bag = payload as Record<string, unknown>;

  const clientId = toOptionalString(bag.clientId);
  const sourceFileName = toOptionalString(bag.sourceFileName ?? bag.fileName);
  const fileStorageUri = toOptionalString(bag.fileStorageUri);
  const fileStatus = toOptionalString(bag.fileStatus ?? bag.status);

  const errors: string[] = [];

  if (!clientId) {
    errors.push('clientId is required');
  }
  if (!sourceFileName) {
    errors.push('sourceFileName is required');
  }
  if (!fileStorageUri) {
    errors.push('fileStorageUri is required');
  }
  if (!fileStatus) {
    errors.push('fileStatus is required');
  }

  if (errors.length > 0) {
    return { record: null, errors };
  }

  const baseRecord: NewClientFileRecord = {
    clientId,
    userId: toOptionalString(bag.userId),
    uploadedBy: toOptionalString(bag.uploadedBy ?? bag.importedBy),
    sourceFileName,
    fileStorageUri,
    fileSize:
      typeof bag.fileSize === 'number' && Number.isFinite(bag.fileSize)
        ? bag.fileSize
        : undefined,
    fileType: toOptionalString(bag.fileType),
    status: fileStatus,
    glPeriodStart: toOptionalString(bag.glPeriodStart ?? bag.period),
    glPeriodEnd: toOptionalString(bag.glPeriodEnd ?? bag.period),
    rowCount:
      typeof bag.rowCount === 'number' && Number.isFinite(bag.rowCount)
        ? bag.rowCount
        : undefined,
    lastStepCompletedDttm: toOptionalString(bag.lastStepCompletedDttm ?? bag.timestamp),
  };

  if (Array.isArray(bag.sheets)) {
    baseRecord.sheets = bag.sheets
      .filter(Boolean)
      .map((entry) => {
        const sheet = entry as Record<string, unknown>;
        const firstDataRowIndex =
          typeof sheet.firstDataRowIndex === 'number' &&
          Number.isFinite(sheet.firstDataRowIndex)
            ? sheet.firstDataRowIndex
            : undefined;
        const isSelected = (() => {
          if (typeof sheet.isSelected === 'boolean') {
            return sheet.isSelected;
          }

          if (typeof sheet.isSelected === 'number') {
            return sheet.isSelected !== 0;
          }

          if (typeof sheet.isSelected === 'string') {
            return sheet.isSelected.trim() !== '0';
          }

          return true;
        })();
        return {
          sheetName: String(sheet.sheetName ?? '').trim(),
          glMonth:
            typeof sheet.glMonth === 'string' && sheet.glMonth.trim()
              ? sheet.glMonth.trim()
              : undefined,
          rowCount: Number(sheet.rowCount ?? 0),
          isSelected,
          firstDataRowIndex,
        };
      })
      .filter((entry) => entry.sheetName.length > 0 && Number.isFinite(entry.rowCount));
  }

  if (Array.isArray(bag.entities)) {
    baseRecord.entities = bag.entities
      .filter(Boolean)
      .map((entry) => {
        const entity = entry as Record<string, unknown>;
        const entityId = toOptionalString(entity.entityId ?? entity.id);
        const displayName = toOptionalString(
          entity.displayName ?? entity.entityDisplayName ?? entity.entityName ?? entity.name
        );
        const entityName =
          displayName ?? toOptionalString(entity.entityName ?? entity.name) ?? '';
        const isSelected = (() => {
          if (typeof entity.isSelected === 'boolean') {
            return entity.isSelected;
          }

          if (typeof entity.isSelected === 'number') {
            return entity.isSelected !== 0;
          }

          if (typeof entity.isSelected === 'string') {
            return entity.isSelected.trim() !== '0';
          }

          return true;
        })();
        return {
          entityId: entityId ?? undefined,
          entityName,
          displayName: displayName ?? undefined,
          rowCount: Number(entity.rowCount ?? 0),
          isSelected,
        };
      })
      .filter(
        (entry) => entry.entityName.length > 0 && Number.isFinite(entry.rowCount)
      );
  }

  return { record: baseRecord, errors: [] };
};

export const listClientFilesHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    const userId = getFirstStringValue(request.query.get('userId'));
    const clientId = getFirstStringValue(request.query.get('clientId'));
    const page = parseInteger(request.query.get('page'), 1);
    const pageSize = parseInteger(request.query.get('pageSize'), 10);

    const result = await listClientFiles(userId, clientId, page, pageSize);

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
      sheetCount: record.sheets?.length ?? 0,
      entityCount: record.entities?.length ?? 0,
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
