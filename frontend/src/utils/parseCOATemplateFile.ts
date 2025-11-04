import Papa from 'papaparse';
import * as ExcelJS from 'exceljs';

export interface COARow {
  [key: string]: string | number;
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseCOATemplateFile(file: File): Promise<COARow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const allowed = ['gl_id', 'detail_level', 'gl_name'];
  const allowedNormalized = allowed.map(normalize);

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse<COARow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => {
          const filtered = (r.data as COARow[]).map((row) => {
            const obj: COARow = {};
            Object.entries(row).forEach(([key, val]) => {
              if (allowedNormalized.includes(normalize(key))) {
                obj[key.trim()] = typeof val === 'string' ? val.trim() : val;
              }
            });
            return obj;
          });
          resolve(filtered);
        },
        error: (e) => reject(e),
      });
    });
  }

  if (ext === 'xlsx') {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headerRow = sheet.getRow(1);
    const rawHeaders = headerRow.values
      ? (headerRow.values as Array<string>).slice(1).map((h) => String(h))
      : [];
    const headerMap: { index: number; name: string }[] = [];
    rawHeaders.forEach((h, i) => {
      if (allowedNormalized.includes(normalize(h))) {
        headerMap.push({ index: i + 1, name: h });
      }
    });
    const rows: COARow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const vals = row.values as Array<string | number>;
      if (!Array.isArray(vals)) return;
      const obj: COARow = {};
      headerMap.forEach(({ index, name }) => {
        const val = vals[index];
        if (val !== undefined && val !== null && val !== '') {
          obj[name] = typeof val === 'string' ? val.trim() : val;
        }
      });
      if (Object.keys(obj).length > 0) rows.push(obj);
    });
    return rows;
  }
  throw new Error('Unsupported file type');
}
