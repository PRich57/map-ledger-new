import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as XLSX from 'xlsx';
import { json, readJson } from '../../http';
import {
  addColumns,
  createIndustryTable,
  deleteMissingRows,
  detectMissingRows,
  dropColumns,
  dropIndustryTable,
  ensureCostTypeColumn,
  ensureIsFinancialColumn,
  getIndustryTableState,
  IndustryNotFoundError,
  insertRows,
  InvalidIndustryNameError,
  InvalidIndustryTableError,
  upsertRows,
} from '../../repositories/coaManagerImportRepository';
import { getFirstStringValue } from '../../utils/requestParsers';

const COST_TYPE_COLUMN = 'COST_TYPE';
const IS_FINANCIAL_COLUMN = 'IS_FINANCIAL';
const RECORD_ID_COLUMN = 'RECORD_ID';
const SAMPLE_ROW_COUNT = 5;
const TRIAL_BALANCE_HEADER_ROW_SEARCH_LIMIT = 25;
const TRIAL_BALANCE_HEADERS = [
  'ACCOUNT',
  'DESCRIPTION',
  'BEGINNING BALANCE',
  'DEBIT',
  'CREDIT',
  'NET CHANGE',
  'ENDING BALANCE',
];
const TRIAL_BALANCE_REQUIRED_HEADERS = ['ACCOUNT', 'DESCRIPTION'];

const isZipBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;

const isCfbBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 4 &&
  buffer[0] === 0xd0 &&
  buffer[1] === 0xcf &&
  buffer[2] === 0x11 &&
  buffer[3] === 0xe0;

interface ParsedSpreadsheet {
  headers: { original: string; normalized: string }[];
  normalizedHeaders: string[];
  rows: Record<string, string | null>[];
}

interface ImportOptions {
  industry: string;
  action?: 'preview' | 'import';
  strategy?: 'overwrite' | 'upsert';
  selectedColumns?: string[];
  keyColumns?: string[];
  allowAddColumns?: boolean;
  dropMissingColumns?: boolean;
  removeMissingRows?: boolean;
}

interface MultipartData {
  fields: Record<string, string>;
  files: {
    fieldName: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
  }[];
}

const normalizeHeader = (value: string, fallbackIndex: number, existing: Set<string>): string => {
  const base = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  const initial = base || `COLUMN_${fallbackIndex + 1}`;
  let candidate = initial;
  let counter = 2;

  while (existing.has(candidate)) {
    candidate = `${initial}_${counter}`;
    counter += 1;
  }

  existing.add(candidate);
  return candidate;
};

const normalizeHeaderCandidate = (value: unknown): string =>
  `${value ?? ''}`.trim().toUpperCase().replace(/\s+/g, ' ');

const matchesTrialBalanceHeader = (candidate: string, header: string): boolean =>
  candidate === header || candidate.includes(header);

const isTrialBalanceHeaderRow = (row: unknown[]): boolean => {
  const normalized = row.map(normalizeHeaderCandidate).filter((value) => value.length > 0);
  if (normalized.length === 0) {
    return false;
  }

  const hasRequiredHeaders = TRIAL_BALANCE_REQUIRED_HEADERS.every((header) =>
    normalized.some((candidate) => matchesTrialBalanceHeader(candidate, header)),
  );
  if (!hasRequiredHeaders) {
    return false;
  }

  const matchCount = TRIAL_BALANCE_HEADERS.filter((header) =>
    normalized.some((candidate) => matchesTrialBalanceHeader(candidate, header)),
  ).length;

  return matchCount >= 5;
};

const findTrialBalanceHeaderRowIndex = (rawRows: unknown[][]): number | null => {
  const limit = Math.min(rawRows.length, TRIAL_BALANCE_HEADER_ROW_SEARCH_LIMIT);
  for (let index = 0; index < limit; index += 1) {
    if (isTrialBalanceHeaderRow(rawRows[index])) {
      return index;
    }
  }
  return null;
};

const normalizeCostTypeValue = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes('overhead') || normalized === 'oh' || normalized.startsWith('over')) {
    return 'Overhead';
  }
  if (normalized.includes('variable') || normalized === 'var' || normalized.startsWith('var')) {
    return 'Variable';
  }

  return null;
};

const normalizeIsFinancialValue = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized.includes('financial') ||
    normalized === 'fin' ||
    normalized.startsWith('fin')
  ) {
    return '1';
  }
  if (
    normalized === 'false' ||
    normalized === '0' ||
    normalized === 'no' ||
    normalized === 'n' ||
    normalized.includes('operational') ||
    normalized === 'ops' ||
    normalized.startsWith('oper')
  ) {
    return '0';
  }

  return null;
};

const normalizeCellValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return `${value}`.trim() || null;
};

const readCsvWorkbook = (buffer: Buffer): XLSX.WorkBook => {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return XLSX.read(text, { type: 'string', raw: false });
};

const parseWorkbook = (workbook: XLSX.WorkBook): ParsedSpreadsheet => {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet file is missing worksheets.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown[][];

  if (rawRows.length === 0) {
    throw new Error('Spreadsheet file is empty.');
  }

  const headerRowIndex = findTrialBalanceHeaderRowIndex(rawRows) ?? 0;
  const rawHeaders = rawRows[headerRowIndex].map((value) => `${value ?? ''}`);
  const existing = new Set<string>();
  const headers = rawHeaders.map((header, index) => ({
    original: header,
    normalized: normalizeHeader(header, index, existing),
  }));

  const normalizedHeaders = headers.map((header) => header.normalized);
  const dataRows = rawRows.slice(headerRowIndex + 1).map((row) => {
    const record: Record<string, string | null> = {};
    normalizedHeaders.forEach((header, index) => {
      record[header] = normalizeCellValue(row[index]);
    });
    return record;
  });

  const rows = dataRows.filter((row) =>
    normalizedHeaders.some((header) => row[header] !== null && row[header] !== ''),
  );

  return { headers, normalizedHeaders, rows };
};

const parseSpreadsheetBuffer = (buffer: Buffer): ParsedSpreadsheet => {
  const isBinaryWorkbook = isZipBuffer(buffer) || isCfbBuffer(buffer);

  if (isBinaryWorkbook) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
      return parseWorkbook(workbook);
    } catch (error) {
      try {
        return parseWorkbook(readCsvWorkbook(buffer));
      } catch {
        throw error;
      }
    }
  }

  return parseWorkbook(readCsvWorkbook(buffer));
};

const readRequestBuffer = async (request: HttpRequest): Promise<Buffer | null> => {
  const requestAny = request as HttpRequest & { arrayBuffer?: () => Promise<ArrayBuffer> };

  if (typeof requestAny.arrayBuffer === 'function') {
    const data = await requestAny.arrayBuffer();
    return Buffer.from(data);
  }

  const body = request.body as unknown;
  if (!body) {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  const maybeReadable = body as {
    getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> };
  };
  if (typeof maybeReadable?.getReader === 'function') {
    const reader = maybeReadable.getReader();
    const chunks: Uint8Array[] = [];

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }

    if (chunks.length === 0) {
      return null;
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  return null;
};

const parseMultipartFormData = (buffer: Buffer, boundary: string): MultipartData => {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  const files: MultipartData['files'] = [];
  const fields: Record<string, string> = {};

  let offset = buffer.indexOf(boundaryBuffer);
  while (offset !== -1) {
    offset += boundaryBuffer.length;
    if (buffer.slice(offset, offset + 2).equals(Buffer.from('--'))) {
      break;
    }

    if (buffer.slice(offset, offset + 2).equals(Buffer.from('\r\n'))) {
      offset += 2;
    }

    const nextBoundary = buffer.indexOf(boundaryBuffer, offset);
    const endBoundary = buffer.indexOf(endBoundaryBuffer, offset);
    const boundaryIndex =
      nextBoundary !== -1 ? nextBoundary : endBoundary !== -1 ? endBoundary : buffer.length;
    const partBuffer = buffer.slice(offset, boundaryIndex - 2);

    const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) {
      offset = boundaryIndex;
      continue;
    }

    const headerText = partBuffer.slice(0, headerEnd).toString('utf8');
    const content = partBuffer.slice(headerEnd + 4);

    const headerLines = headerText.split('\r\n');
    const disposition = headerLines.find((line) => line.toLowerCase().startsWith('content-disposition'));
    if (!disposition) {
      offset = boundaryIndex;
      continue;
    }

    const nameMatch = disposition.match(/name="([^"]+)"/);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const fieldName = nameMatch?.[1];

    const contentTypeLine = headerLines.find((line) => line.toLowerCase().startsWith('content-type'));
    const contentType = contentTypeLine?.split(':')[1]?.trim();

    if (fieldName) {
      if (filenameMatch) {
        files.push({
          fieldName,
          filename: filenameMatch[1],
          contentType,
          data: content,
        });
      } else {
        fields[fieldName] = content.toString('utf8').trim();
      }
    }

    offset = boundaryIndex;
  }

  return { fields, files };
};

const parseArrayField = (value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => `${entry}`);
    }
  } catch {
    // fallback to CSV parsing
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const parseBooleanField = (value?: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
};

const buildPreviewResponse = (
  industry: string,
  tableName: string,
  tableExists: boolean,
  parsed: ParsedSpreadsheet,
  selectedColumns: string[],
  rows: Record<string, string | null>[],
  differences: {
    newColumns: string[];
    removedColumns: string[];
    removedRows?: { count: number; sample: Record<string, string | null>[] };
  },
  keyColumns: string[],
): Record<string, unknown> => ({
  industry,
  tableName,
  tableExists,
  headers: parsed.headers,
  normalizedHeaders: parsed.normalizedHeaders,
  selectedColumns,
  keyColumns,
  rowCount: rows.length,
  sampleRows: rows.slice(0, SAMPLE_ROW_COUNT),
  differences,
});

const normalizeColumnSelections = (
  selections: string[] | undefined,
  available: string[],
): string[] => {
  if (!selections || selections.length === 0) {
    return available;
  }

  const availableSet = new Set(available);
  return selections
    .map((selection) => selection.trim().toUpperCase())
    .map((selection) => selection.replace(/[^A-Z0-9_]+/g, '_'))
    .filter((selection) => selection.length > 0 && availableSet.has(selection));
};

const handleIndustryError = (
  error: unknown,
  context: InvocationContext,
  action: string,
): HttpResponseInit => {
  if (error instanceof InvalidIndustryNameError) {
    return json({ message: error.message }, 400);
  }
  if (error instanceof IndustryNotFoundError) {
    return json({ message: error.message }, 404);
  }
  if (error instanceof InvalidIndustryTableError) {
    return json({ message: error.message }, 400);
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  context.error(`Failed to ${action}`, error);
  return json({ message: `Unable to ${action}`, detail: message }, 500);
};

const parseRequest = async (
  request: HttpRequest,
): Promise<{ options: ImportOptions; fileBuffer: Buffer | null }> => {
  const headersAny = request.headers as unknown;
  const getHeaderValue = (name: string): string | undefined => {
    if (!headersAny || typeof headersAny !== 'object') {
      return undefined;
    }

    const maybeGet = (headersAny as { get?: unknown }).get;
    if (typeof maybeGet === 'function') {
      return (maybeGet as (headerName: string) => string | null)(name) ?? undefined;
    }

    return (headersAny as Record<string, string | undefined>)[name];
  };
  const contentType = getHeaderValue('content-type') ?? getHeaderValue('Content-Type');

  if (contentType?.includes('multipart/form-data')) {
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    const boundary = boundaryMatch?.[1];
    const buffer = await readRequestBuffer(request);
    if (!boundary || !buffer) {
      return { options: { industry: '' }, fileBuffer: null };
    }

    const parsed = parseMultipartFormData(buffer, boundary);
    const file = parsed.files[0];

    return {
      options: {
        industry: parsed.fields.industry ?? '',
        action: parsed.fields.action as ImportOptions['action'],
        strategy: parsed.fields.strategy as ImportOptions['strategy'],
        selectedColumns: parseArrayField(parsed.fields.selectedColumns),
        keyColumns: parseArrayField(parsed.fields.keyColumns),
        allowAddColumns: parseBooleanField(parsed.fields.allowAddColumns),
        dropMissingColumns: parseBooleanField(parsed.fields.dropMissingColumns),
        removeMissingRows: parseBooleanField(parsed.fields.removeMissingRows),
      },
      fileBuffer: file?.data ?? null,
    };
  }

  const payload = (await readJson<Record<string, unknown>>(request)) ?? {};
  const fileBase64 = getFirstStringValue(payload.fileBase64 ?? payload.file);
  const buffer = fileBase64 ? Buffer.from(fileBase64, 'base64') : await readRequestBuffer(request);

  return {
    options: {
      industry: getFirstStringValue(payload.industry ?? payload.industryId ?? payload.industryName) ?? '',
      action: payload.action as ImportOptions['action'],
      strategy: payload.strategy as ImportOptions['strategy'],
      selectedColumns: Array.isArray(payload.selectedColumns)
        ? payload.selectedColumns.map((entry) => `${entry}`)
        : undefined,
      keyColumns: Array.isArray(payload.keyColumns)
        ? payload.keyColumns.map((entry) => `${entry}`)
        : undefined,
      allowAddColumns: payload.allowAddColumns as boolean | undefined,
      dropMissingColumns: payload.dropMissingColumns as boolean | undefined,
      removeMissingRows: payload.removeMissingRows as boolean | undefined,
    },
    fileBuffer: buffer,
  };
};

const buildRowPayloads = (
  parsed: ParsedSpreadsheet,
  selectedColumns: string[],
): Record<string, string | null>[] => {
  const rows: Record<string, string | null>[] = [];

  parsed.rows.forEach((row) => {
    const payload: Record<string, string | null> = {};
    selectedColumns.forEach((column) => {
      payload[column] = row[column] ?? null;
    });

    const rawCostType = row[COST_TYPE_COLUMN] ?? null;
    payload[COST_TYPE_COLUMN] = normalizeCostTypeValue(rawCostType);
    const rawIsFinancial = row[IS_FINANCIAL_COLUMN] ?? null;
    payload[IS_FINANCIAL_COLUMN] = normalizeIsFinancialValue(rawIsFinancial);

    rows.push(payload);
  });

  return rows;
};

export async function coaManagerImportHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const { options, fileBuffer } = await parseRequest(request);
  const industryQuery = getFirstStringValue(request.query.get('industry'));
  const industry = (options.industry || industryQuery || '').trim();

  if (!industry) {
    return json({ message: 'industry is required' }, 400);
  }

  if (!fileBuffer) {
    return json({ message: 'Spreadsheet file is required' }, 400);
  }

  let parsed: ParsedSpreadsheet;
  try {
    parsed = parseSpreadsheetBuffer(fileBuffer);
  } catch (error) {
    return json({ message: 'Unable to parse spreadsheet file', detail: String(error) }, 400);
  }

  const availableColumns = parsed.normalizedHeaders.filter(
    (column) =>
      column !== RECORD_ID_COLUMN &&
      column !== COST_TYPE_COLUMN &&
      column !== IS_FINANCIAL_COLUMN,
  );

  const normalizedSelections = normalizeColumnSelections(options.selectedColumns, availableColumns);
  const selectedColumns = normalizedSelections.length > 0 ? normalizedSelections : availableColumns;

  if (selectedColumns.length === 0) {
    return json({ message: 'No columns detected in the uploaded file.' }, 400);
  }

  const tableColumns = [...selectedColumns, COST_TYPE_COLUMN, IS_FINANCIAL_COLUMN];
  const rows = buildRowPayloads(parsed, selectedColumns);

  const keyColumns = normalizeColumnSelections(
    options.keyColumns,
    selectedColumns.length > 0 ? selectedColumns : availableColumns,
  );
  const resolvedKeyColumns = keyColumns.length > 0 ? keyColumns : [selectedColumns[0]];

  if (!resolvedKeyColumns[0]) {
    return json({ message: 'Unable to determine key columns for upsert.' }, 400);
  }

  try {
    const tableState = await getIndustryTableState(industry);
    const existingColumns = tableState.columns.map((column) => column.toUpperCase());
    const incomingColumns = [RECORD_ID_COLUMN, ...tableColumns.map((column) => column.toUpperCase())];

    const newColumns = tableColumns.filter(
      (column) => !existingColumns.includes(column.toUpperCase()),
    );
    const enforcedColumns = [COST_TYPE_COLUMN, IS_FINANCIAL_COLUMN];
    const unmanagedNewColumns = newColumns.filter(
      (column) => !enforcedColumns.includes(column),
    );
    const removedColumns = existingColumns.filter(
      (column) =>
        column !== RECORD_ID_COLUMN &&
        column !== COST_TYPE_COLUMN &&
        column !== IS_FINANCIAL_COLUMN &&
        !incomingColumns.includes(column.toUpperCase()),
    );

    if (options.action !== 'import') {
      const removedRows =
        tableState.exists && resolvedKeyColumns.length > 0
          ? await detectMissingRows(tableState.tableName, resolvedKeyColumns, rows)
          : { count: 0, sample: [] };

      return json(
        buildPreviewResponse(
          industry,
          tableState.tableName,
          tableState.exists,
          parsed,
          selectedColumns,
          rows,
          {
            newColumns,
            removedColumns,
            removedRows,
          },
          resolvedKeyColumns,
        ),
      );
    }

    if (!tableState.exists) {
      await createIndustryTable(tableState.tableName, selectedColumns);
      await insertRows(tableState.tableName, tableColumns, rows);
      return json({
        industry,
        tableName: tableState.tableName,
        inserted: rows.length,
        strategy: 'create',
      });
    }

    if (!options.strategy) {
      return json(
        {
          message: 'Table exists. Choose overwrite or upsert strategy.',
          tableName: tableState.tableName,
          tableExists: true,
          availableStrategies: ['overwrite', 'upsert'],
        },
        409,
      );
    }

    if (options.strategy === 'overwrite') {
      await dropIndustryTable(tableState.tableName);
      await createIndustryTable(tableState.tableName, selectedColumns);
      await insertRows(tableState.tableName, tableColumns, rows);
      return json({
        industry,
        tableName: tableState.tableName,
        inserted: rows.length,
        strategy: 'overwrite',
      });
    }

    if (unmanagedNewColumns.length > 0 && !options.allowAddColumns) {
      return json(
        {
          message: 'New columns detected. Set allowAddColumns to true to add them.',
          newColumns,
        },
        409,
      );
    }

    if (removedColumns.length > 0 && options.dropMissingColumns === undefined) {
      return json(
        {
          message:
            'Columns are missing from the incoming file. Set dropMissingColumns to true to remove them or false to retain them.',
          removedColumns,
        },
        409,
      );
    }

    if (unmanagedNewColumns.length > 0) {
      await addColumns(tableState.tableName, unmanagedNewColumns);
    }

    if (removedColumns.length > 0 && options.dropMissingColumns) {
      await dropColumns(tableState.tableName, removedColumns);
    }

    await ensureCostTypeColumn(tableState.tableName);
    await ensureIsFinancialColumn(tableState.tableName);

    const removedRows = await detectMissingRows(tableState.tableName, resolvedKeyColumns, rows);

    if (removedRows.count > 0 && options.removeMissingRows === undefined) {
      return json(
        {
          message:
            'Rows are missing from the incoming file. Set removeMissingRows to true to delete them or false to retain them.',
          removedRows,
        },
        409,
      );
    }

    await upsertRows(tableState.tableName, tableColumns, resolvedKeyColumns, rows);

    if (removedRows.count > 0 && options.removeMissingRows) {
      await deleteMissingRows(tableState.tableName, resolvedKeyColumns, rows);
    }

    return json({
      industry,
      tableName: tableState.tableName,
      strategy: 'upsert',
      upserted: rows.length,
      removedRows: options.removeMissingRows ? removedRows.count : 0,
    });
  } catch (error) {
    return handleIndustryError(error, context, 'import COA file');
  }
}

app.http('coaManager-import', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'coa-manager/import',
  handler: coaManagerImportHandler,
});

export default coaManagerImportHandler;
