import type { ChartOfAccountOption, DistributionRow, GLAccountMappingRow } from '../types';
import { STANDARD_CHART_OF_ACCOUNTS } from '../data/standardChartOfAccounts';
import { getChartOfAccountOptions } from '../store/chartOfAccountsStore';
import {
  buildDistributionActivityEntries,
  type DistributionActivityEntry,
} from './distributionActivity';

type OperationKey = string;

interface ScoaLookup {
  byId: Map<string, ChartOfAccountOption>;
  byValue: Map<string, ChartOfAccountOption>;
}

const DEFAULT_DETAIL_LEVEL = 1;
const DEFAULT_OPERATION_CODE = 'UNASSIGNED';
const MONTH_HEADER_SUFFIX = '-01';

const FALLBACK_SCOA_OPTIONS: ChartOfAccountOption[] = STANDARD_CHART_OF_ACCOUNTS.map(option => ({
  id: option.id,
  value: option.value,
  label: option.label,
  accountNumber: option.value,
  coreAccount: null,
  operationalGroup: null,
  laborGroup: null,
  accountType: null,
  category: null,
  subCategory: null,
  description: option.label,
}));

const buildStaticScoaOptions = (): ChartOfAccountOption[] => {
  const options = getChartOfAccountOptions();
  return options.length > 0 ? options : FALLBACK_SCOA_OPTIONS;
};

const buildScoaLookup = (options: ChartOfAccountOption[]): ScoaLookup => {
  const byId = new Map<string, ChartOfAccountOption>();
  const byValue = new Map<string, ChartOfAccountOption>();

  options.forEach(option => {
    const idKey = option.id?.trim();
    const valueKey = option.value?.trim();
    if (idKey) {
      byId.set(idKey, option);
    }
    if (valueKey) {
      byValue.set(valueKey, option);
    }
  });

  return { byId, byValue };
};

const resolveGlId = (scoaAccountId: string, lookups: ScoaLookup): string | null => {
  const normalized = scoaAccountId.trim();
  if (!normalized) {
    return null;
  }
  const option = lookups.byId.get(normalized) ?? lookups.byValue.get(normalized);
  return option ? option.value : null;
};

const normalizeOperationCode = (value?: string): string => {
  if (!value) {
    return DEFAULT_OPERATION_CODE;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_OPERATION_CODE;
};

const normalizeGlMonth = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const monthCandidates: string[] = [];

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    monthCandidates.push(`${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`);
  }

  const compactMatch = trimmed.match(/^(\d{4})(\d{2})$/);
  if (compactMatch) {
    monthCandidates.push(`${compactMatch[1]}-${compactMatch[2]}`);
  }

  for (const candidate of monthCandidates) {
    const [, monthPart] = candidate.split('-');
    const monthNum = Number(monthPart);
    if (Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return `${candidate}${MONTH_HEADER_SUFFIX}`;
    }
  }

  return null;
};

const sanitizeSheetNameValue = (value: string): string => value.replace(/[\[\]\*\/\\\?\:]/g, '_').trim();

const buildSheetName = (value: string, fallback: string, index: number): string => {
  const base = sanitizeSheetNameValue(value) || fallback;
  const suffix = index === 0 ? '' : `_${index + 1}`;
  const maxLength = 31;
  const allowedBaseLength = Math.max(0, maxLength - suffix.length);
  return `${base.slice(0, allowedBaseLength)}${suffix}`;
};

const sanitizeFilenameValue = (value: string): string => {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'Operation';
};

const buildExportDateStamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export interface OperationScoaRow {
  glId: string;
  detailLevel: number;
  glName: string;
  monthValues: Record<string, number>;
}

export interface OperationScoaSheet {
  operationCd: string;
  months: string[];
  rows: OperationScoaRow[];
}

const buildLegacyContributions = (accounts: GLAccountMappingRow[]): DistributionActivityEntry[] => {
  const contributions: DistributionActivityEntry[] = [];

  accounts.forEach(account => {
    const operationCd = normalizeOperationCode(account.operation);
    const scoaAccountId = (account.manualCOAId ?? account.suggestedCOAId ?? '').trim();
    const glMonth = normalizeGlMonth(account.glMonth);
    if (!scoaAccountId || !glMonth) {
      return;
    }
    const amount = Number.isFinite(account.netChange) ? account.netChange : 0;
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }
    contributions.push({
      operationCd,
      scoaAccountId,
      glMonth,
      glValue: amount,
    });
  });

  return contributions;
};

export const buildOperationScoaActivitySheets = (
  accounts: GLAccountMappingRow[],
  distributionRows: DistributionRow[],
): OperationScoaSheet[] => {
  const scoaOptions = buildStaticScoaOptions();
  if (!scoaOptions.length) {
    return [];
  }

  const lookup = buildScoaLookup(scoaOptions);
  const contributions =
    distributionRows.length > 0
      ? buildDistributionActivityEntries(distributionRows, accounts)
      : buildLegacyContributions(accounts);

  if (!contributions.length) {
    return [];
  }

  const operations = new Map<
    OperationKey,
    {
      months: Set<string>;
      values: Map<string, Map<string, number>>;
    }
  >();

  contributions.forEach(entry => {
    const operationCd = normalizeOperationCode(entry.operationCd);
    const glId = resolveGlId(entry.scoaAccountId, lookup);
    if (!glId) {
      return;
    }
    const monthKey = entry.glMonth;
    const bucket = operations.get(operationCd) ?? {
      months: new Set<string>(),
      values: new Map<string, Map<string, number>>(),
    };
    bucket.months.add(monthKey);
    operations.set(operationCd, bucket);

    const monthMap = bucket.values.get(glId) ?? new Map<string, number>();
    monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + entry.glValue);
    bucket.values.set(glId, monthMap);
  });

  const sortedEntries = Array.from(operations.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return sortedEntries
    .map(([operationCd, entry]) => {
      const months = Array.from(entry.months).sort((a, b) => a.localeCompare(b));
      if (!months.length) {
        return null;
      }

      const rows = scoaOptions.map(option => {
        const monthValues: Record<string, number> = {};
        months.forEach(month => {
          monthValues[month] = entry.values.get(option.value)?.get(month) ?? 0;
        });
        return {
          glId: option.value,
          detailLevel: DEFAULT_DETAIL_LEVEL,
          glName: option.label,
          monthValues,
        };
      });

      return { operationCd, months, rows };
    })
    .filter((sheet): sheet is OperationScoaSheet => Boolean(sheet));
};

let excelJsModulePromise: Promise<typeof import('exceljs')> | null = null;

async function loadExcelJs() {
  if (!excelJsModulePromise) {
    excelJsModulePromise = import('exceljs');
  }
  return excelJsModulePromise;
}

export const exportOperationScoaWorkbook = async (sheets: OperationScoaSheet[]): Promise<void> => {
  if (!sheets.length) {
    return;
  }

  const ExcelJS = await loadExcelJs();
  const dateStamp = buildExportDateStamp(new Date());

  for (const sheet of sheets) {
    const workbook = new ExcelJS.Workbook();
    const sheetName = buildSheetName(sheet.operationCd, 'SCoA', 0);
    const worksheet = workbook.addWorksheet(sheetName);
    const headers = ['OPERATION_CD', 'GL_ID', 'DETAIL_LEVEL', 'GL_NAME', ...sheet.months];

    worksheet.addRow(headers);

    sheet.rows.forEach(row => {
      const rowValues = [
        sheet.operationCd,
        row.glId,
        row.detailLevel,
        row.glName,
        ...sheet.months.map(month => row.monthValues[month] ?? 0),
      ];
      worksheet.addRow(rowValues);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFilenameValue(sheet.operationCd)} ${dateStamp}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
};
