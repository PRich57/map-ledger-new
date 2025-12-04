import { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { Import } from '../../types';
import { formatPeriodLabel, parsePeriodString } from '../../utils/period';

interface ImportHistoryProps {
  imports: Import[];
  isLoading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onDelete?: (importId: string) => Promise<void>;
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

const formatDateTime = (value?: string): string => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
};

const parsePeriodForSort = (value: string) => {
  const [firstPart] = value.split(/\s+-\s+/);
  return parsePeriodString(firstPart ?? value);
};

export default function ImportHistory({
  imports,
  isLoading = false,
  page,
  pageSize,
  total,
  onPageChange,
  onDelete,
}: ImportHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [previewImport, setPreviewImport] = useState<Import | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const columnCount = sortableFields.length + 2;

  const filteredImports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const visible = query
      ? imports.filter((entry) => {
          const haystack = [
            entry.fileName,
            entry.clientName ?? entry.clientId,
            entry.importedBy ?? entry.insertedDttm ?? '',
            entry.period,
            formatPeriodLabel(entry.period),
            formatDateTime(entry.timestamp),
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
            return (entry.clientName ?? entry.clientId).toLowerCase();
          case 'status':
            return entry.status;
          case 'importedBy':
            return (entry.importedBy ?? '').toLowerCase();
          case 'period': {
            const parsedPeriod = parsePeriodForSort(entry.period);
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

  const closePreview = () => setPreviewImport(null);

  const handleDelete = async (importId: string) => {
    if (!onDelete) {
      return;
    }

    setDeleteError(null);
    const confirmed = window.confirm(
      'Are you sure you want to delete this import? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(importId);
    try {
      await onDelete(importId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete import. Please try again.';
      setDeleteError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startRecord = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = total === 0 ? 0 : startRecord + imports.length - 1;

  const renderPagination = () => (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-gray-600">
        Showing {startRecord.toLocaleString()}–{endRecord.toLocaleString()} of{' '}
        {total.toLocaleString()} uploads
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-700">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );

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
        {deleteError && (
          <p className="text-sm text-red-600" role="alert">
            {deleteError}
          </p>
        )}
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
            {isLoading ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-6 py-10 text-center text-sm text-gray-500"
                >
                  Loading import history…
                </td>
              </tr>
            ) : filteredImports.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
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
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {importItem.clientName ?? importItem.clientId}
                    </div>
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
                    <div className="text-sm text-gray-900">{importItem.importedBy || '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDateTime(importItem.timestamp)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewImport(importItem)}
                        className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                      >
                        View
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(importItem.id)}
                          disabled={deletingId === importItem.id}
                          className="text-sm font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-60"
                        >
                          {deletingId === importItem.id ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && renderPagination()}

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
                <p className="text-sm text-gray-500">Imported {formatDateTime(previewImport.timestamp)}</p>
              </div>
              <div className="flex gap-2">
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
                  <p className="text-sm text-gray-900">
                    {previewImport.clientName ?? previewImport.clientId}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-500">Imported By</p>
                  <p className="text-sm text-gray-900">{previewImport.importedBy || '—'}</p>
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

              {previewImport.sheets && previewImport.sheets.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700">Sheets</h4>
                  <ul className="mt-2 space-y-2 text-sm text-gray-700">
                    {previewImport.sheets.map((sheet) => (
                      <li key={`${sheet.sheetName}-${sheet.glMonth ?? 'n/a'}`} className="flex justify-between">
                        <span>
                          {sheet.sheetName}
                          {sheet.glMonth ? ` (${sheet.glMonth})` : ''}
                        </span>
                        <span className="text-gray-500">{sheet.rowCount.toLocaleString()} rows</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewImport.entities && previewImport.entities.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700">Entities</h4>
                  <ul className="mt-2 space-y-2 text-sm text-gray-700">
                    {previewImport.entities.map((entity) => (
                      <li
                        key={entity.entityId ?? entity.entityName}
                        className="flex justify-between"
                      >
                        <span>{entity.displayName ?? entity.entityName}</span>
                        <span className="text-gray-500">
                          {entity.rowCount.toLocaleString()} rows
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
