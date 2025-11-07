import type { Worksheet } from 'exceljs';

export interface ParsedRow {
  [key: string]: string | number;
}

export interface ParsedUpload {
  sheetName: string;
  period: string;
  headers: string[];
  rows: ParsedRow[];
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

    const metadata: Record<string, string> = {
      entity: getCellValue(sheet, 'B1'),
      glMonth: getCellValue(sheet, 'B4'),
      reportName: getCellValue(sheet, 'B2')
    };

    sheet.eachRow((row, rowNumber) => {
      if (headerExtensionRows.has(rowNumber)) {
        return;
      }

      const rawValues = row.values;
      if (!Array.isArray(rawValues)) return;
      const values = rawValues.slice(1);

      if (!headerRowFound && values.filter(Boolean).length > 2) {
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
          if (val !== null && val !== undefined) {
            if (typeof val === 'string') {
              rowObj[key] = val.trim();
            } else if (typeof val === 'number') {
              rowObj[key] = val;
            } else {
              rowObj[key] = val.toString();
            }
          }
        });
        rows.push(rowObj);
      }
    });

    if (rows.length > 0 && headers.length > 0) {
      results.push({
        sheetName: sheet.name,
        period: sheet.name.replace('Export ', ''),
        headers,
        rows,
        metadata
      });
    }
  });

  return results;
}
