import { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { Import } from '../../types';
import { base64ToBlob } from '../../utils/file';
import { formatPeriodLabel, parsePeriodString } from '../../utils/period';

interface ImportHistoryProps {
  imports: Import[];
  onDeleteImport: (importId: string) => void;
}

type SortField = 'fileName' | 'clientId' | 'period' | 'status' | 'importedBy' | 'timestamp';

type SortDirection = 'asc' | 'desc';

const sortableColumns: Record<SortField, string> = {
  fileName: 'File Details',
  clientId: 'Client',
  period: 'Period',
  status: 'Status',
  importedBy: 'Imported By',
  timestamp: 'Uploaded At',
};

const sortableFields: SortField[] = [
  'fileName',
  'clientId',
  'period',
  'status',
  'importedBy',
  'timestamp',
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** idx;
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[idx]}`;
}

export default function ImportHistory({ imports, onDeleteImport }: ImportHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [previewImport, setPreviewImport] = useState<Import | null>(null);

  const filteredImports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const visible = query
      ? imports.filter((entry) => {
          const haystack = [
            entry.fileName,
            entry.clientId,
            entry.importedBy,
            entry.period,
            formatPeriodLabel(entry.period),
            new Date(entry.timestamp).toLocaleString(),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        })
      : imports;

    const sorted = [...visible].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;

      const getValue = (entry: Import): string | number | Date => {
        switch (sortField) {
          case 'fileName':
            return entry.fileName.toLowerCase();
          case 'clientId':
            return entry.clientId.toLowerCase();
          case 'status':
            return entry.status;
          case 'importedBy':
            return entry.importedBy.toLowerCase();
          case 'period': {
            const parsedPeriod = parsePeriodString(entry.period);
            return parsedPeriod ?? new Date(NaN);
          }
          case 'timestamp':
          default:
            return new Date(entry.timestamp);
        }
      };

      const aValue = getValue(a);
      const bValue = getValue(b);

      if (aValue instanceof Date && bValue instanceof Date) {
        const aTime = aValue.getTime();
        const bTime = bValue.getTime();

        if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
          return 0;
        }

        return (aTime - bTime) * direction;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction;
      }

      return aValue.toString().localeCompare(bValue.toString()) * direction;
    });

    return sorted;
  }, [imports, searchTerm, sortDirection, sortField]);

  const handleSort = (field: SortField) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDirection) =>
          currentDirection === 'asc' ? 'desc' : 'asc'
        );
        return currentField;
      }

      setSortDirection(field === 'timestamp' ? 'desc' : 'asc');
      return field;
    });
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />;
    }

    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
    );
  };

  const handleDownload = (importItem: Import) => {
    const blob = base64ToBlob(importItem.fileData, importItem.fileType);
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = importItem.fileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = (importId: string) => {
    onDeleteImport(importId);
    setPreviewImport((current) => (current?.id === importId ? null : current));
  };

  const closePreview = () => setPreviewImport(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by file, client, or user"
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Search import history"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {sortableFields.map((field) => (
                <th
                  key={field}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(field)}
                    className="flex items-center gap-1 text-gray-600 transition-colors hover:text-blue-600"
                  >
                    <span>{sortableColumns[field]}</span>
                    {renderSortIcon(field)}
                  </button>
                </th>
              ))}
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredImports.length === 0 ? (
              <tr>
                <td
                  colSpan={sortableFields.length + 1}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  {imports.length === 0
                    ? 'No uploads found for your account yet.'
                    : 'No imports match your search. Try adjusting your filters.'}
                </td>
              </tr>
            ) : (
              filteredImports.map((importItem) => (
                <tr key={importItem.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <FileSpreadsheet className="mr-3 h-5 w-5 text-gray-400" aria-hidden="true" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {importItem.fileName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatFileSize(importItem.fileSize)} • {importItem.fileType}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{importItem.clientId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatPeriodLabel(importItem.period)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {importItem.status === 'completed' ? (
                        <>
                          <CheckCircle2 className="mr-2 h-5 w-5 text-green-500" aria-hidden="true" />
                          <span className="text-sm text-gray-900">
                            Completed ({importItem.rowCount ?? 0} rows)
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="mr-2 h-5 w-5 text-red-500" aria-hidden="true" />
                          <span className="text-sm text-gray-900">Failed</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{importItem.importedBy}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(importItem.timestamp).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewImport(importItem)}
                        className="text-gray-500 transition-colors hover:text-blue-600"
                        aria-label={`Preview ${importItem.fileName}`}
                      >
                        <Eye className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(importItem)}
                        className="text-gray-500 transition-colors hover:text-blue-600"
                        aria-label={`Download ${importItem.fileName}`}
                      >
                        <Download className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(importItem.id)}
                        className="text-gray-400 transition-colors hover:text-red-600"
                        aria-label={`Remove ${importItem.fileName} from history`}
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {previewImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-preview-title"
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 id="import-preview-title" className="text-lg font-semibold text-gray-900">
                  {previewImport.fileName}
                </h3>
                <p className="text-sm text-gray-500">
                  Imported {new Date(previewImport.timestamp).toLocaleString()} •{' '}
                  {formatFileSize(previewImport.fileSize)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(previewImport)}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-500">Client</p>
                  <p className="text-sm text-gray-900">{previewImport.clientId}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-500">Imported By</p>
                  <p className="text-sm text-gray-900">{previewImport.importedBy}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-500">Period</p>
                  <p className="text-sm text-gray-900">{formatPeriodLabel(previewImport.period)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
                  <p className="text-sm text-gray-900 capitalize">{previewImport.status}</p>
                </div>
              </div>

              <h4 className="mt-6 text-sm font-semibold text-gray-700">Preview Rows</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Company</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Account ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Description</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Net Change</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">GL Month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {previewImport.previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-500">
                          No preview data captured for this import.
                        </td>
                      </tr>
                    ) : (
                      previewImport.previewRows.map((row, index) => (
                        <tr key={`${row.accountId}-${index}`} className="bg-white">
                          <td className="px-3 py-2 text-gray-700">{row.entity}</td>
                          <td className="px-3 py-2 text-gray-700">{row.accountId}</td>
                          <td className="px-3 py-2 text-gray-700">{row.description}</td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {row.netChange.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{row.glMonth ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
