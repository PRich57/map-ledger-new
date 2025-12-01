import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import {
  insertFileRecords,
  listFileRecords,
  FileRecordInput,
  FileRecordRow,
} from '../../repositories/fileRecordRepository';
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
}

interface IngestSheet {
  sheetName: string;
  glMonth?: string | null;
  isSelected?: boolean;
  firstDataRowIndex?: number | null;
  rows: Record<string, unknown>[];
}

interface IngestPayload {
  fileUploadId: number;
  clientId?: string;
  fileName?: string;
  headerMap: HeaderMap;
  sheets: IngestSheet[];
  entities?: IngestEntity[];
}

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
      const normalizedEntityName = matchedEntity?.name || entityValue || undefined;

      const userDefined1 = getOptionalText(getValueFromRow(row, userDefined1Header));
      const userDefined2 = getOptionalText(getValueFromRow(row, userDefined2Header));
      const userDefined3 = getOptionalText(getValueFromRow(row, userDefined3Header));

      const glMonth = detectGlMonth(row, sheet, fileName);

      return {
        accountId,
        accountName,
        activityAmount,
        entityId: normalizedEntityId,
        entityName: normalizedEntityName,
        glMonth,
        sourceSheet: sheet.sheetName,
        sourceRowNumber: firstRowIndex + index,
        userDefined1,
        userDefined2,
        userDefined3,
      } as FileRecordInput;
    })
    .filter((record): record is FileRecordInput => record !== null);
};

const normalizePayload = (body: unknown): IngestPayload | null => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const fileUploadIdRaw = getFirstStringValue(payload.fileUploadId);
  const fileUploadId = fileUploadIdRaw ? Number(fileUploadIdRaw) : NaN;
  const headerMap = payload.headerMap as HeaderMap;
  const sheets = Array.isArray(payload.sheets)
    ? (payload.sheets as unknown[]).filter(Boolean)
    : [];

  if (!Number.isFinite(fileUploadId) || !headerMap || typeof headerMap !== 'object' || sheets.length === 0) {
    return null;
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
    return null;
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
    fileUploadId,
    clientId: getFirstStringValue(payload.clientId),
    fileName: getFirstStringValue(payload.fileName),
    headerMap,
    sheets: normalizedSheets,
    entities: normalizedEntities,
  };
};

const buildRecords = (payload: IngestPayload): FileRecordInput[] => {
  const headerLookup = buildHeaderLookup(payload.headerMap);
  const entities = payload.entities ?? [];

  return payload.sheets
    .filter((sheet) => sheet.isSelected !== false)
    .flatMap((sheet) => deriveRecordsFromSheet(sheet, headerLookup, entities, payload.fileName));
};

export const ingestFileRecordsHandler = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> => {
  try {
    const parsed = await readJson(request);
    const payload = normalizePayload(parsed);

    if (!payload) {
      return json({ message: 'Invalid ingest payload' }, 400);
    }

    const records = buildRecords(payload);
    if (records.length === 0) {
      return json({ message: 'No valid records found to ingest' }, 400);
    }

    const inserted = await insertFileRecords(payload.fileUploadId, records);

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
    const fileUploadIdParam = getFirstStringValue(request.query.get('fileUploadId'));
    const fileUploadId = fileUploadIdParam ? Number(fileUploadIdParam) : NaN;
    if (!Number.isFinite(fileUploadId)) {
      return json({ message: 'Missing fileUploadId query parameter' }, 400);
    }

    const items: FileRecordRow[] = await listFileRecords(fileUploadId);

    return json({ items, fileUploadId });
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

