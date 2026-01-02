import type { Worksheet } from 'exceljs';
import { extractDateFromText } from './extractDateFromText';

export interface ParsedRow {
  [key: string]: string | number;
}

export interface ParsedUpload {
  sheetName: string;
  period: string;
  headers: string[];
  rows: ParsedRow[];
  firstDataRowIndex?: number;
  metadata: Record<string, string>; // stores entity, glMonth, etc.
}

let excelJsModulePromise: Promise<typeof import('exceljs')> | null = null;

async function loadExcelJs() {
  if (!excelJsModulePromise) {
    excelJsModulePromise = import('exceljs');
  }

  return excelJsModulePromise;
}

function getCellValue(sheet: Worksheet, cellRef: string): string {
  const cell = sheet.getCell(cellRef);
  return (typeof cell.value === 'string' || typeof cell.value === 'number') ? cell.value.toString().trim() : '';
}

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  return '';
}

const TRIAL_BALANCE_HEADER_SCAN_LIMIT = 25;
const TRIAL_BALANCE_REQUIRED_HEADERS = ['ACCOUNT', 'DESCRIPTION'];
const TRIAL_BALANCE_HEADERS = [
  'ACCOUNT',
  'DESCRIPTION',
  'BEGINNING BALANCE',
  'OPENING BALANCE',
  'DEBIT',
  'CREDIT',
  'NET CHANGE',
  'ENDING BALANCE',
  'CLOSING BALANCE',
];

function isNumericLike(value: string): boolean {
  if (!value) return false;
  return /^[-+]?[$(]?\d[\d.,]*(?:\)?)?$/.test(value.replace(/\s+/g, ''));
}

function shouldCombineWithHeader(values: unknown[]): boolean {
  const trimmed = values.map(toTrimmedString);
  const nonEmpty = trimmed.filter(part => part.length > 0);
  if (nonEmpty.length === 0) {
    return false;
  }

  return values.every((val, idx) => {
    if (val === null || val === undefined) {
      return true;
    }

    if (typeof val === 'number') {
      return false;
    }

    if (typeof val === 'string') {
      const segment = trimmed[idx];
      if (!segment) {
        return true;
      }

      return !isNumericLike(segment);
    }

    return false;
  });
}

function buildCombinedHeaders(headerRows: string[][]): string[] {
  const columnCount = headerRows.reduce((max, row) => Math.max(max, row.length), 0);

  return Array.from({ length: columnCount }, (_, idx) => {
    const placeholder = `Column ${String.fromCharCode(65 + idx)}`;
    const parts = headerRows
      .map(row => (row[idx] ?? '').toString().trim())
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter(part => part.length > 0);

    const nonPlaceholderParts = parts.filter(part => part !== placeholder);
    const combinedParts = (nonPlaceholderParts.length > 0 ? nonPlaceholderParts : parts);
    const combined = combinedParts.join(' ').replace(/\s+/g, ' ').trim();

    return combined.length > 0 ? combined : placeholder;
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const extractRichTextValue = (richText: unknown): string => {
  if (!Array.isArray(richText)) {
    return '';
  }

  return richText
    .map((segment) => {
      if (!isRecord(segment)) {
        return '';
      }
      const text = segment['text'];
      return typeof text === 'string' ? text : '';
    })
    .join('');
};

const normalizeCellValue = (value: unknown): string | number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isRecord(value)) {
    const recordValue = value as Record<string, unknown>;

    if ('result' in recordValue) {
      const resolved = normalizeCellValue(recordValue['result']);
      if (resolved !== undefined) {
        return resolved;
      }
    }

    const richTextValue = extractRichTextValue(recordValue['richText']);
    if (richTextValue.trim().length > 0) {
      return richTextValue.trim();
    }

    const textValue = recordValue['text'];
    if (typeof textValue === 'string' && textValue.trim().length > 0) {
      return textValue.trim();
    }

    const hyperlinkValue = recordValue['hyperlink'];
    if (typeof hyperlinkValue === 'string') {
      if (typeof textValue === 'string' && textValue.trim().length > 0) {
        return textValue.trim();
      }
      return hyperlinkValue.trim();
    }
  }

  return undefined;
};

const normalizeHeaderCandidate = (value: unknown): string => {
  const normalized = normalizeCellValue(value);
  if (normalized === undefined) {
    return '';
  }
  return `${normalized}`.trim().toUpperCase().replace(/\s+/g, ' ');
};

const matchesHeaderCandidate = (candidate: string, header: string): boolean =>
  candidate === header || candidate.includes(header);

const isTrialBalanceHeaderRow = (values: unknown[]): boolean => {
  const normalized = values
    .map(normalizeHeaderCandidate)
    .filter((candidate) => candidate.length > 0);
  if (normalized.length === 0) {
    return false;
  }

  const hasRequiredHeaders = TRIAL_BALANCE_REQUIRED_HEADERS.every((header) =>
    normalized.some((candidate) => matchesHeaderCandidate(candidate, header)),
  );
  if (!hasRequiredHeaders) {
    return false;
  }

  const matchCount = TRIAL_BALANCE_HEADERS.filter((header) =>
    normalized.some((candidate) => matchesHeaderCandidate(candidate, header)),
  ).length;

  return matchCount >= 4;
};

const findTrialBalanceHeaderRow = (sheet: Worksheet): number | undefined => {
  const limit = Math.min(sheet.rowCount, TRIAL_BALANCE_HEADER_SCAN_LIMIT);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    if (isTrialBalanceHeaderRow(values)) {
      return rowNumber;
    }
  }
  return undefined;
};

export async function parseTrialBalanceWorkbook(file: File): Promise<ParsedUpload[]> {
  const buffer = await file.arrayBuffer();
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const results: ParsedUpload[] = [];

  workbook.worksheets.forEach((sheet) => {
    let headers: string[] = [];
    let headerRowFound = false;
    const headerExtensionRows = new Set<number>();
    const rows: ParsedRow[] = [];
    let firstDataRowIndex: number | undefined;
    const forcedHeaderRowNumber = findTrialBalanceHeaderRow(sheet);

    // Extract date from sheet name (e.g., "Trial balance report (Aug'24)" -> "2024-08")
    const sheetNameDate = extractDateFromText(sheet.name);

    const metadata: Record<string, string> = {
      entity: getCellValue(sheet, 'B1'),
      glMonth: getCellValue(sheet, 'B4'),
      reportName: getCellValue(sheet, 'B2'),
      sheetNameDate, // Add extracted date from sheet name
    };

    sheet.eachRow((row, rowNumber) => {
      if (headerExtensionRows.has(rowNumber)) {
        return;
      }

      const rawValues = row.values;
      if (!Array.isArray(rawValues)) return;
      const values = rawValues.slice(1);

      if (forcedHeaderRowNumber && rowNumber < forcedHeaderRowNumber) {
        return;
      }

      const isHeaderCandidate =
        !headerRowFound &&
        (forcedHeaderRowNumber
          ? rowNumber === forcedHeaderRowNumber
          : values.filter(Boolean).length > 2);

      if (isHeaderCandidate) {
        const primaryHeader = values.map((val, i) => {
          if (typeof val === 'string') return val.trim();
          if (typeof val === 'number') return val.toString();
          return `Column ${String.fromCharCode(65 + i)}`;
        });

        const combinedHeaderRows: string[][] = [primaryHeader];

        let lookaheadRowNumber = rowNumber + 1;
        while (lookaheadRowNumber <= sheet.rowCount) {
          const lookaheadRow = sheet.getRow(lookaheadRowNumber);
          const lookaheadValues = Array.isArray(lookaheadRow.values)
            ? lookaheadRow.values.slice(1)
            : [];

          if (lookaheadValues.length === 0) {
            break;
          }

          if (!shouldCombineWithHeader(lookaheadValues)) {
            break;
          }

          combinedHeaderRows.push(lookaheadValues.map(toTrimmedString));
          headerExtensionRows.add(lookaheadRowNumber);
          lookaheadRowNumber += 1;
        }

        headers = buildCombinedHeaders(combinedHeaderRows);
        headerRowFound = true;
        return;
      }

      if (headerRowFound && values.filter(Boolean).length > 0) {
        const rowObj: ParsedRow = {};
        values.forEach((val, i) => {
          const key = headers[i] || `Column ${String.fromCharCode(65 + i)}`;
          const normalizedValue = normalizeCellValue(val);
          if (normalizedValue !== undefined) {
            rowObj[key] = normalizedValue;
          }
        });
        if (firstDataRowIndex === undefined) {
          firstDataRowIndex = rowNumber;
        }
        rows.push(rowObj);
      }
    });

    if (rows.length > 0 && headers.length > 0) {
      results.push({
        sheetName: sheet.name,
        period: sheet.name.replace('Export ', ''),
        headers,
        rows,
        firstDataRowIndex,
        metadata
      });
    }
  });

  return results;
}
