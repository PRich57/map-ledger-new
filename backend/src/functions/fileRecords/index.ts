import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  insertFileRecords,
  listFileRecords,
  FileRecordInput,
  FileRecordRow,
} from '../../repositories/fileRecordRepository';
import { getClientFileByGuid } from '../../repositories/clientFileRepository';
import {
  insertClientFileSheet,
  NewClientFileSheetInput,
} from '../../repositories/clientFileSheetRepository';
import {
  insertClientFileEntity,
  NewClientFileEntityInput,
} from '../../repositories/clientFileEntityRepository';
import { buildErrorResponse } from '../datapointConfigs/utils';
import {
  detectGlMonthFromRow,
  extractDateFromText,
  isValidNormalizedMonth,
  normalizeGlMonth,
} from '../../utils/glMonth';
import { getFirstStringValue } from '../../utils/requestParsers';

type HeaderMap = Record<string, string | null>;

interface IngestEntity {
  id?: string;
  name: string;
  aliases?: string[];
  isSelected?: boolean;
}

interface IngestSheet {
  sheetName: string;
  glMonth?: string | null;
  isSelected?: boolean;
  firstDataRowIndex?: number | null;
  rows: Record<string, unknown>[];
}

interface IngestPayload {
  fileUploadGuid?: string;
  clientId?: string;
  fileName?: string;
  headerMap: HeaderMap;
  sheets: IngestSheet[];
  entities?: IngestEntity[];
}

type ResolvedIngestPayload = IngestPayload & { fileUploadGuid: string };

const normalizeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return '';
};

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const normalized = trimmed
    .replace(/[$,]/g, '')
    .replace(/[()]/g, (match) => (match === '(' ? '-' : ''))
    .replace(/\s+/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeHeader = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildHeaderLookup = (headerMap: HeaderMap): Map<string, string> => {
  const lookup = new Map<string, string>();
  Object.entries(headerMap).forEach(([templateHeader, sourceHeader]) => {
    const normalizedTemplate = templateHeader.replace(/\s+/g, '').toLowerCase();
    const normalizedSource = normalizeHeader(sourceHeader);
    if (normalizedTemplate && normalizedSource) {
      lookup.set(normalizedTemplate, normalizedSource);
    }
  });
  return lookup;
};

const getValueFromRow = (
  row: Record<string, unknown>,
  headerName: string | null,
): unknown => {
  if (!headerName) {
    return undefined;
  }

  const normalizedHeader = headerName.replace(/\s+/g, '').toLowerCase();
  const direct = row[headerName];
  if (direct !== undefined) {
    return direct;
  }

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.replace(/\s+/g, '').toLowerCase();
    if (normalizedKey === normalizedHeader) {
      return value;
    }
  }

  return undefined;
};

const normalizeEntityValue = (value: string | undefined | null): string => {
  if (!value) {
    return '';
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const slug = normalized.replace(/[^a-z0-9]/g, '');
  return slug.length > 0 ? slug : normalized;
};

const matchEntity = (
  entityName: string | undefined,
  entities: IngestEntity[],
): { id: string; name: string } | null => {
  if (!entityName && entities.length === 1) {
    const [single] = entities;
    return { id: single.id ?? single.name, name: single.name };
  }

  const normalized = normalizeEntityValue(entityName ?? '');
  if (!normalized) {
    return null;
  }

  for (const entity of entities) {
    const candidates = [entity.name, entity.id, ...(entity.aliases ?? [])]
      .filter(Boolean)
      .map((value) => normalizeEntityValue(value));

    if (candidates.includes(normalized)) {
      return { id: entity.id ?? entity.name, name: entity.name };
    }
  }

  return null;
};

const detectGlMonth = (
  row: Record<string, unknown>,
  sheet: IngestSheet,
  fileName?: string,
): string | null => {
  const fromRow = detectGlMonthFromRow(row);
  if (fromRow && isValidNormalizedMonth(fromRow)) {
    return fromRow;
  }

  const fromSheet = normalizeGlMonth(sheet.glMonth ?? '') || extractDateFromText(sheet.sheetName);
  if (fromSheet && isValidNormalizedMonth(fromSheet)) {
    return fromSheet;
  }

  const fromFile = extractDateFromText(fileName ?? '');
  return fromFile && isValidNormalizedMonth(fromFile) ? fromFile : null;
};

const deriveRecordsFromSheet = (
  sheet: IngestSheet,
  headerLookup: Map<string, string>,
  entities: IngestEntity[],
  fileName?: string,
): FileRecordInput[] => {
  const accountIdHeader =
    headerLookup.get('glid') ?? headerLookup.get('accountid') ?? null;
  const accountNameHeader =
    headerLookup.get('accountdescription') ?? headerLookup.get('accountname') ?? null;
  const activityHeader =
    headerLookup.get('netchange') ||
    headerLookup.get('activity') ||
    headerLookup.get('amount') ||
    null;
  const entityHeader = headerLookup.get('entity') ?? headerLookup.get('entityname') ?? null;
  const userDefined1Header = headerLookup.get('userdefined1') ?? null;
  const userDefined2Header = headerLookup.get('userdefined2') ?? null;
  const userDefined3Header = headerLookup.get('userdefined3') ?? null;

  const firstRowIndex =
    typeof sheet.firstDataRowIndex === 'number' && Number.isFinite(sheet.firstDataRowIndex)
      ? sheet.firstDataRowIndex
      : 1;

  const getOptionalText = (value: unknown): string | null => {
    const normalized = normalizeText(value);
    return normalized ? normalized : null;
  };

  return sheet.rows
    .map((row, index) => {
      const accountId = normalizeText(getValueFromRow(row, accountIdHeader));
      const accountName = normalizeText(getValueFromRow(row, accountNameHeader));
      if (!accountId || !accountName) {
        return null;
      }

      const rawActivity = getValueFromRow(row, activityHeader);
      const activityAmount = parseNumber(rawActivity);

      const entityValue = normalizeText(getValueFromRow(row, entityHeader));
      const matchedEntity = matchEntity(entityValue, entities);
      const normalizedEntityId = matchedEntity?.id || undefined;

      const userDefined1 = getOptionalText(getValueFromRow(row, userDefined1Header));
      const userDefined2 = getOptionalText(getValueFromRow(row, userDefined2Header));
      const userDefined3 = getOptionalText(getValueFromRow(row, userDefined3Header));

      const glMonth = detectGlMonth(row, sheet, fileName);

      return {
        accountId,
        accountName,
        activityAmount,
        entityId: normalizedEntityId,
        glMonth,
        sourceSheetName: sheet.sheetName,
        userDefined1,
        userDefined2,
        userDefined3,
      } as FileRecordInput;
    })
    .filter((record): record is FileRecordInput => record !== null);
};

const normalizePayload = (body: unknown): { payload: IngestPayload | null; errors: string[] } => {
  if (!body || typeof body !== 'object') {
    return { payload: null, errors: ['Payload is not an object'] };
  }

  const payload = body as Record<string, unknown>;
  const fileUploadGuid =
    getFirstStringValue(payload.fileUploadGuid)?.trim() ??
    getFirstStringValue(payload.fileUploadId)?.trim();

  const normalizedFileUploadGuid = fileUploadGuid;
  const headerMap = payload.headerMap as HeaderMap;
  const sheets = Array.isArray(payload.sheets)
    ? (payload.sheets as unknown[]).filter(Boolean)
    : [];

  const errors: string[] = [];

  if (!normalizedFileUploadGuid) {
    errors.push('fileUploadGuid is required');
  }

  if (normalizedFileUploadGuid && normalizedFileUploadGuid.length !== 36) {
    errors.push('fileUploadGuid must be a 36-character string');
  }

  if (!headerMap || typeof headerMap !== 'object') {
    errors.push('headerMap is required');
  }

  if (sheets.length === 0) {
    errors.push('at least one sheet is required');
  }

  if (errors.length > 0) {
    return { payload: null, errors };
  }

  const normalizedSheets: IngestSheet[] = sheets
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const sheet = entry as Record<string, unknown>;
      const rows = Array.isArray(sheet.rows) ? (sheet.rows as Record<string, unknown>[]) : [];

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      const glMonth = sheet.glMonth
        ? normalizeGlMonth(normalizeText(sheet.glMonth)) ?? null
        : null;

      const normalizedSheet: IngestSheet = {
        sheetName: normalizeText(sheet.sheetName),
        rows,
      };

      if (glMonth !== null) {
        normalizedSheet.glMonth = glMonth;
      }

      if (sheet.isSelected !== undefined) {
        normalizedSheet.isSelected = sheet.isSelected !== false;
      }

      if (typeof sheet.firstDataRowIndex === 'number') {
        normalizedSheet.firstDataRowIndex = sheet.firstDataRowIndex;
      }

      return normalizedSheet;
    })
    .filter((sheet): sheet is IngestSheet => !!sheet && sheet.sheetName.length > 0);

  if (normalizedSheets.length === 0) {
    return { payload: null, errors: ['No sheets contained row data'] };
  }

  const normalizedEntities: IngestEntity[] = Array.isArray(payload.entities)
    ? (payload.entities as unknown[])
        .filter(Boolean)
        .map((rawEntity) => {
          if (!rawEntity || typeof rawEntity !== 'object') {
            return null;
          }

          const raw = rawEntity as Record<string, unknown>;
          const name = normalizeText(raw.name);
          if (!name) {
            return null;
          }

          const aliases = Array.isArray(raw.aliases)
            ? (raw.aliases as unknown[])
                .map((alias) => normalizeText(alias))
                .filter((alias) => alias.length > 0)
            : [];

          const id = getFirstStringValue(raw.id);

          const entity: IngestEntity = {
            name,
          };

          if (id) {
            entity.id = id;
          }

          if (aliases.length > 0) {
            entity.aliases = aliases;
          }

          return entity;
        })
        .filter((entity): entity is IngestEntity => entity !== null)
    : [];

  return {
    payload: {
      fileUploadGuid: normalizedFileUploadGuid,
      clientId: getFirstStringValue(payload.clientId),
      fileName: getFirstStringValue(payload.fileName),
      headerMap,
      sheets: normalizedSheets,
      entities: normalizedEntities,
    },
    errors: [],
  };
};

const buildRecords = (payload: ResolvedIngestPayload): FileRecordInput[] => {
  const headerLookup = buildHeaderLookup(payload.headerMap);
  const entities = payload.entities ?? [];

  return payload.sheets
    .filter((sheet) => sheet.isSelected !== false)
    .flatMap((sheet) => deriveRecordsFromSheet(sheet, headerLookup, entities, payload.fileName));
};

const buildSheetInserts = (
  payload: ResolvedIngestPayload,
): NewClientFileSheetInput[] =>
  payload.sheets.map((sheet) => ({
    fileUploadGuid: payload.fileUploadGuid,
    sheetName: sheet.sheetName,
    isSelected: sheet.isSelected,
    firstDataRowIndex:
      typeof sheet.firstDataRowIndex === 'number' && Number.isFinite(sheet.firstDataRowIndex)
        ? sheet.firstDataRowIndex
        : undefined,
    rowCount: Array.isArray(sheet.rows) ? sheet.rows.length : undefined,
  }));

const toEntityId = (value?: string | null): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildEntityInserts = (
  payload: ResolvedIngestPayload,
  records: FileRecordInput[],
  existingRecords: FileRecordRow[],
): NewClientFileEntityInput[] => {
  const entityLookup = new Map<string, IngestEntity>();
  (payload.entities ?? []).forEach((entity) => {
    const key = entity.id ?? entity.name;
    if (key) {
      entityLookup.set(key, entity);
    }
  });

  const aggregated = new Map<number, NewClientFileEntityInput>();
  const recordEntityKeys = [...records, ...existingRecords]
    .map((record) =>
      record.entityId !== null && record.entityId !== undefined
        ? String(record.entityId)
        : null
    )
    .filter((key): key is string => key !== null);

  const candidateKeys = new Set<string>([
    ...recordEntityKeys,
    ...Array.from(entityLookup.keys()),
  ]);

  candidateKeys.forEach((key) => {
    const entityId = toEntityId(key);
    if (entityId === null) {
      return;
    }

    const details = entityLookup.get(key);
    const existing = aggregated.get(entityId);
    const isSelected = details?.isSelected === true || existing?.isSelected === true;

    aggregated.set(entityId, {
      fileUploadGuid: payload.fileUploadGuid,
      entityId,
      isSelected,
    });
  });

  return Array.from(aggregated.values());
};

export const ingestFileRecordsHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const parsed = await readJson(request);
    const { payload, errors } = normalizePayload(parsed);

    if (!payload) {
      context.warn('Invalid ingest payload', { errors, payloadPreview: parsed });
      return json({ message: 'Invalid ingest payload', errors }, 400);
    }

    const resolvedPayload: ResolvedIngestPayload = {
      ...payload,
      fileUploadGuid: payload.fileUploadGuid as string,
    };

    const records = buildRecords(resolvedPayload);
    if (records.length === 0) {
      context.warn('No valid records found to ingest', {
        fileUploadGuid: resolvedPayload.fileUploadGuid,
        sheetCount: payload.sheets.length,
        headerMapKeys: Object.keys(payload.headerMap ?? {}),
      });
      return json({ message: 'No valid records found to ingest' }, 400);
    }

    context.info('Persisting file records', {
      fileUploadGuid: resolvedPayload.fileUploadGuid,
      recordCount: records.length,
      sheetCount: payload.sheets.length,
    });

    const sheetInserts = buildSheetInserts(resolvedPayload);
    const existingFileRecords = await listFileRecords(resolvedPayload.fileUploadGuid);
    const entityInserts = buildEntityInserts(
      resolvedPayload,
      records,
      existingFileRecords,
    );

    if (sheetInserts.length > 0) {
      await Promise.all(sheetInserts.map((sheet) => insertClientFileSheet(sheet)));
    }

    if (entityInserts.length > 0) {
      await Promise.all(entityInserts.map((entity) => insertClientFileEntity(entity)));
    }

    const inserted = await insertFileRecords(resolvedPayload.fileUploadGuid, records);

    return json({ items: inserted }, 201);
  } catch (error) {
    context.error('Failed to ingest file records', error);
    return json(buildErrorResponse('Failed to ingest file records', error), 500);
  }
};

export const listFileRecordsHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const fileUploadGuid = getFirstStringValue(request.query.get('fileUploadGuid'));
    const normalizedFileUploadGuid = fileUploadGuid?.trim();

    if (!normalizedFileUploadGuid || normalizedFileUploadGuid.length !== 36) {
      return json({ message: 'fileUploadGuid is required' }, 400);
    }

    const [items, metadata] = await Promise.all<[
      FileRecordRow[],
      Awaited<ReturnType<typeof getClientFileByGuid>>,
    ]>([
      listFileRecords(normalizedFileUploadGuid),
      getClientFileByGuid(normalizedFileUploadGuid),
    ]);

    return json({
      items,
      fileUploadGuid: normalizedFileUploadGuid,
      upload:
        metadata && metadata.timestamp
          ? { fileName: metadata.fileName, uploadedAt: metadata.timestamp }
          : metadata
            ? { fileName: metadata.fileName, uploadedAt: metadata.insertedDttm }
            : undefined,
    });
  } catch (error) {
    context.error('Failed to list file records', error);
    return json(buildErrorResponse('Failed to list file records', error), 500);
  }
};

app.http('ingestFileRecords', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'file-records/ingest',
  handler: ingestFileRecordsHandler,
});

app.http('listFileRecords', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'file-records',
  handler: listFileRecordsHandler,
});

export default ingestFileRecordsHandler;
