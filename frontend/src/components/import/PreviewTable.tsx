import { useMemo } from 'react';

type PreviewRow = Record<string, unknown>;

interface PreviewTableProps {
  rows: PreviewRow[];
  sheetName?: string;
  columnOrder?: string[];
  className?: string;
  emptyStateMessage?: string;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : value.toString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

export default function PreviewTable({
  rows,
  sheetName,
  columnOrder = [],
  className,
  emptyStateMessage,
}: PreviewTableProps) {
  const columnKeys = useMemo(() => {
    if (columnOrder.length > 0) {
      const filteredOrder = columnOrder.filter((key) =>
        rows.some((row) => Object.prototype.hasOwnProperty.call(row, key))
      );

      if (filteredOrder.length > 0) {
        return filteredOrder;
      }

      return columnOrder;
    }

    const ordered: string[] = [];
    const seen = new Set<string>();

    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
      });
    });

    return ordered;
  }, [rows, columnOrder]);

  const hasRows = rows.length > 0;

  const header = (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        Upload Preview
        {hasRows
          ? ` (${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'})`
          : ''}
      </h3>
      {sheetName && (
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Sheet Selection: {sheetName}
        </span>
      )}
    </div>
  );

  const containerClassName = className ?? 'mt-6';

  if (!hasRows) {
    return (
      <div className={containerClassName}>
        {header}
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-gray-400">
          {emptyStateMessage ?? 'No rows to display for this sheet after applying your filters.'}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      {header}
      <div className="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="min-w-full table-compact text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-slate-900">
          <thead className="bg-gray-50 text-left dark:bg-slate-800">
            <tr>
              {columnKeys.map((key, columnIndex) => (
                <th
                  key={`header-${columnIndex}-${key}`}
                  className="sticky top-0 border-b border-gray-200 bg-gray-50 p-2 font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                  scope="col"
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const rowBackground =
                rowIndex % 2 === 0
                  ? 'bg-white dark:bg-slate-900'
                  : 'bg-gray-50 dark:bg-slate-900/80';

              return (
                <tr
                  key={`row-${rowIndex}`}
                  className={`${rowBackground} border-b border-gray-200 last:border-b-0 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800/70`}
                >
                  {columnKeys.map((key, columnIndex) => (
                    <td
                      key={`cell-${rowIndex}-${columnIndex}-${key}`}
                      className="p-2 align-top text-gray-800 dark:text-gray-100"
                    >
                      {formatCellValue(row[key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
