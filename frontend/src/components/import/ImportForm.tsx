import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, X, Download } from 'lucide-react';
import Select from '../ui/Select';
import MultiSelect from '../ui/MultiSelect';
import { useOrganizationStore } from '../../store/organizationStore';
import {
  parseTrialBalanceWorkbook,
  ParsedUpload,
  ParsedRow,
} from '../../utils/parseTrialBalanceWorkbook';
import parseCurrencyValue from '../../utils/parseCurrencyValue';
import ColumnMatcher from './ColumnMatcher';
import {
  getClientTemplateMapping,
  ClientTemplateConfig,
} from '../../utils/getClientTemplateMapping';
import PreviewTable from './PreviewTable';
import type { TrialBalanceRow } from '../../types';
import { normalizeGlMonth, isValidNormalizedMonth } from '../../utils/extractDateFromText';

const templateHeaders = [
  'GL ID',
  'Account Description',
  'Net Change',
  'Company',
  'User Defined 1',
  'User Defined 2',
  'User Defined 3',
];

const extractRowGlMonth = (row: ParsedRow | TrialBalanceRow): string => {
  const normalizeCandidate = (value: unknown): string => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }

    const normalized = normalizeGlMonth(value.toString());
    return isValidNormalizedMonth(normalized) ? normalized : '';
  };

  const normalizedEntries = Object.entries(row);

  const keyMatches = [
    (key: string) => key.includes('glmonth'),
    (key: string) => key.includes('period'),
    (key: string) => key.endsWith('month') || key === 'month',
  ];

  for (const matcher of keyMatches) {
    for (const [key, value] of normalizedEntries) {
      if (key === 'glMonth') continue;
      const normalizedKey = key.replace(/[\s_-]/g, '').toLowerCase();
      if (!matcher(normalizedKey)) continue;

      const normalizedValue = normalizeCandidate(value);
      if (normalizedValue) {
        return normalizedValue;
      }
    }
  }

  return normalizeCandidate('glMonth' in row ? row.glMonth : undefined);
};

const extractGlMonthsFromRows = (rows: TrialBalanceRow[]): string[] => {
  const monthsSet = new Set<string>();

  rows.forEach((row) => {
    const detectedMonth = extractRowGlMonth(row);
    if (detectedMonth && isValidNormalizedMonth(detectedMonth)) {
      monthsSet.add(detectedMonth);
    }
  });

  return Array.from(monthsSet).sort();
};

interface ImportFormProps {
  onImport: (
    uploads: TrialBalanceRow[],
    clientId: string,
    companyIds: string[],
    headerMap: Record<string, string | null>,
    glMonths: string[],
    fileName: string,
    file: File
  ) => void | Promise<void>;
  isImporting: boolean;
}

export default function ImportForm({ onImport, isImporting }: ImportFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const companies = useOrganizationStore((state) => state.companies);
  const isLoadingClients = useOrganizationStore((state) => state.isLoading);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploads, setUploads] = useState<ParsedUpload[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<number[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<
    string,
    string | null
  > | null>(null);
  const [combinedRows, setCombinedRows] = useState<TrialBalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const previewSampleRows = useMemo(() => {
    if (uploads.length === 0 || selectedSheets.length === 0) return [] as Record<string, unknown>[];
    const sheetRows = uploads[selectedSheets[0]]?.rows ?? [];
    return sheetRows.slice(0, 20);
  }, [uploads, selectedSheets]);

  const previewSampleCount = previewSampleRows.length;

  const previewSummaryMessage = useMemo(() => {
    if (uploads.length === 0 || selectedSheets.length === 0) return null;

    if (selectedSheets.length === 1) {
      const totalRows = uploads[selectedSheets[0]]?.rows.length ?? 0;
      if (totalRows === 0) {
        return 'No rows detected in this sheet. Check that the header row and data are present.';
      }

      if (totalRows > previewSampleCount) {
        return `Showing the first ${previewSampleCount.toLocaleString()} of ${totalRows.toLocaleString()} rows to help match your headers.`;
      }

      return `Showing all ${totalRows.toLocaleString()} rows from the uploaded sheet.`;
    } else {
      const totalRows = selectedSheets.reduce((sum, idx) => {
        return sum + (uploads[idx]?.rows.length ?? 0);
      }, 0);
      return `Previewing first sheet. ${selectedSheets.length} sheets selected with ${totalRows.toLocaleString()} total rows.`;
    }
  }, [uploads, selectedSheets, previewSampleCount]);

  const clientOptions = useMemo(() => {
    const all = companies.flatMap((company) => company.clients);
    return all.filter(
      (c, idx) => all.findIndex((cc) => cc.id === c.id) === idx
    );
  }, [companies]);

  const singleClientId = clientOptions.length === 1 ? clientOptions[0].id : null;

  const companyOptions = useMemo(() => {
    if (!clientId) return [];
    return companies.filter((company) =>
      company.clients.some((c) => c.id === clientId)
    );
  }, [clientId, companies]);

  useEffect(() => {
    if (companies.length === 1) {
      setCompanyIds([companies[0].id]);
    }
  }, [companies]);

  useEffect(() => {
    if (singleClientId) {
      setClientId(singleClientId);
    }
  }, [singleClientId]);

  useEffect(() => {
    const available = companyOptions.map((company) => company.id);
    if (available.length === 1) {
      setCompanyIds([available[0]]);
    } else {
      setCompanyIds([]);
    }
  }, [clientId, companyOptions]);

  useEffect(() => {
    if (uploads.length > 0 && selectedSheets.length === 0) {
      // Auto-select first sheet when file is uploaded
      setSelectedSheets([0]);
    }
  }, [uploads, selectedSheets.length]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = async (file: File) => {
    try {
      if (!clientId || companyIds.length === 0) {
        setError('Please select a client and company before uploading.');
        setSelectedFile(null);
        setSelectedSheets([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const clientConfig: ClientTemplateConfig | null =
        await getClientTemplateMapping(clientId);
      console.log('Fetched client config:', clientConfig);

      const parsed = await parseTrialBalanceWorkbook(file); // Future: pass config to this function
      if (parsed.length === 0)
        throw new Error('No valid data found in any sheet.');

      setUploads(parsed);
      setSelectedSheets([]);  // Will be auto-set by useEffect
      setSelectedFile(file);
      setHeaderMap(null);
      setCombinedRows([]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setUploads([]);
      setSelectedSheets([]);
      setSelectedFile(null);
      setHeaderMap(null);
      setCombinedRows([]);
    }
  };

  const handleColumnMatch = (map: Record<string, string | null>) => {
    setHeaderMap(map);

    const keyMap = Object.entries(map).reduce(
      (acc, [dest, src]) => {
        if (src) acc[dest] = src;
        return acc;
      },
      {} as Record<string, string>
    );

    // Map all sheets (we'll filter by selectedSheets later)
    const mappedSheets = uploads.map((sheet) => {
      // Try to get GL month from metadata (cell B4)
      const normalizedSheetMonth = normalizeGlMonth(
        sheet.metadata.glMonth || ''
      );

      // Try to get GL month from sheet name (e.g., "Trial balance report (Aug'24)")
      const sheetNameMonth = sheet.metadata.sheetNameDate || '';

      return sheet.rows
        .map((row) => {
          const accountIdValue = keyMap['GL ID']
            ? row[keyMap['GL ID']]
            : '';
          const descriptionValue = keyMap['Account Description']
            ? row[keyMap['Account Description']]
            : '';

          const accountId =
            accountIdValue !== undefined && accountIdValue !== null
              ? accountIdValue.toString().trim()
              : '';
          const description =
            descriptionValue !== undefined && descriptionValue !== null
              ? descriptionValue.toString().trim()
              : '';

          if (!accountId || !description) {
            return null;
          }

          const entityValue = keyMap['Company']
            ? row[keyMap['Company']]
            : '';
          const netChangeValue = keyMap['Net Change']
            ? row[keyMap['Net Change']]
            : 0;

          const entity =
            entityValue !== undefined && entityValue !== null
              ? entityValue.toString().trim()
              : '';

          // Extract GL month with priority: row data > cell B4 > sheet name
          const detectedRowMonth = extractRowGlMonth(row);
          const effectiveMonth = detectedRowMonth || normalizedSheetMonth || sheetNameMonth;

          return {
            accountId,
            description,
            netChange: parseCurrencyValue(netChangeValue),
            entity,
            ...(effectiveMonth && { glMonth: effectiveMonth }),
            ...row,
          } as TrialBalanceRow;
        })
        .filter((row): row is TrialBalanceRow => row !== null);
    });

    // Combine selected sheets into one dataset
    const combined = selectedSheets.flatMap((sheetIdx) => {
      return mappedSheets[sheetIdx] ?? [];
    });

    setCombinedRows(combined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      selectedFile &&
      clientId &&
      companyIds.length > 0 &&
      combinedRows.length > 0 &&
      headerMap
    ) {
      const glMonths = extractGlMonthsFromRows(combinedRows);

      await onImport(
        combinedRows,
        clientId,
        companyIds,
        headerMap,
        glMonths,
        selectedFile.name,
        selectedFile
      );
    } else {
      setError(
        'Please complete all steps including column matching and sheet selection.'
      );
    }
  };

  const downloadTemplate = () => {
    const template = `GL_Month_Quarter,GL_Account,GL_Description,Net_Change\n2024-01,5000-000,Sample Expense,1000\n2024-01,5100-000,Another Expense,2000`;
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mapledger_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
          {clientOptions.length > 1 && (
            <Select
              label="Client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              disabled={clientOptions.length === 0 || isLoadingClients}
            >
              <option value="">Select a client</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}

          {!isLoadingClients && clientOptions.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No clients are currently linked to your account. Please contact an
              administrator to request access.
            </div>
          )}

      <MultiSelect
        label="Company"
        options={companyOptions.map((company) => ({
          value: company.id,
          label: company.name,
        }))}
        value={companyIds}
        onChange={setCompanyIds}
        disabled={!clientId || isLoadingClients}
      />


      <div
        className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="space-y-1 text-center">
          {selectedFile ? (
            <div className="flex items-center justify-center space-x-2">
              <span className="text-sm text-gray-900">{selectedFile.name}</span>
              <button
                type="button"
              onClick={() => {
                setSelectedFile(null);
                setUploads([]);
                setSelectedSheets([]);
                setHeaderMap(null);
                setCombinedRows([]);
                setClientId(singleClientId ?? '');
                setCompanyIds([]);
              }}
                className="text-gray-500 hover:text-red-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500"
                >
                  <span>Upload a file</span>
                  <input
                    id="file-upload"
                    ref={fileInputRef}
                    name="file-upload"
                    type="file"
                    accept=".csv, .xlsx"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">
                Excel files with multiple sheets supported
              </p>
            </>
          )}
        </div>
      </div>

      {uploads.length > 1 && (
        <MultiSelect
          label="Sheet Selection"
          options={uploads.map((u, idx) => ({
            value: idx.toString(),
            label: u.sheetName,
          }))}
          value={selectedSheets.map(idx => idx.toString())}
          onChange={(values) => {
            setSelectedSheets(values.map(v => parseInt(v, 10)));
          }}
        />
      )}

      {uploads.length > 0 && selectedSheets.length > 0 && !headerMap && (
        <div className="space-y-6">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ColumnMatcher
              sourceHeaders={uploads[selectedSheets[0]].headers}
              destinationHeaders={templateHeaders}
              onComplete={handleColumnMatch}
            />

            <div className="flex flex-col">
              <PreviewTable
                className="mt-0"
                rows={previewSampleRows}
                sheetName={uploads[selectedSheets[0]]?.sheetName}
                columnOrder={uploads[selectedSheets[0]]?.headers ?? []}
                emptyStateMessage="Your upload data will appear here once we detect rows in the selected sheet."
              />
              {previewSummaryMessage && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {previewSummaryMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {headerMap && combinedRows.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Import Summary</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>Total Rows:</strong> {combinedRows.length.toLocaleString()}</p>
              <p><strong>Sheets:</strong> {selectedSheets.map(idx => uploads[idx]?.sheetName).join(', ')}</p>
              <p><strong>GL Months Detected:</strong> {extractGlMonthsFromRows(combinedRows).join(', ') || 'None detected'}</p>
            </div>
          </div>
          <PreviewTable
            rows={combinedRows.slice(0, 20)}
            sheetName="Combined Data"
            columnOrder={uploads[selectedSheets[0]]?.headers ?? []}
          />
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      {combinedRows.length > 0 && headerMap && (
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </button>

          <button
            type="submit"
            disabled={
              !selectedFile ||
              !clientId ||
              companyIds.length === 0 ||
              isImporting ||
              uploads.length === 0 ||
              selectedSheets.length === 0 ||
              !headerMap ||
              combinedRows.length === 0
            }
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isImporting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import File
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}

export { normalizeGlMonth, extractGlMonthsFromRows };
