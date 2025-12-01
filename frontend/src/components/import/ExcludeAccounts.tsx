import { useEffect, useState } from 'react';
import type { TrialBalanceRow } from '../../types';

interface ExcludeAccountsProps {
  rows: TrialBalanceRow[];
  onConfirm: (included: TrialBalanceRow[], excluded: TrialBalanceRow[]) => void;
}

export default function ExcludeAccounts({ rows, onConfirm }: ExcludeAccountsProps) {
  // Track excluded rows by their index to avoid issues with duplicate or
  // missing account IDs. Using an index based key ensures each row can be
  // toggled independently without React key warnings.
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setExcludedIds(new Set());
  }, [rows]);

  const toggleExclude = (id: number) => {
    setExcludedIds(prev => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  };

  const included = rows.filter((_, idx) => !excludedIds.has(idx));
  const excluded = rows.filter((_, idx) => excludedIds.has(idx));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Review and Exclude Accounts
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Check any accounts you want excluded in mapping.
        </p>
      </div>

      <table className="min-w-full text-sm border border-gray-200 dark:border-slate-700">
        <thead>
          <tr className="bg-gray-50 text-left dark:bg-slate-800">
            <th className="p-2 text-gray-700 dark:text-gray-300">Exclude</th>
            <th className="p-2 text-gray-700 dark:text-gray-300">Entity</th>
            <th className="p-2 text-gray-700 dark:text-gray-300">Account ID</th>
            <th className="p-2 text-gray-700 dark:text-gray-300">Description</th>
            <th className="p-2 text-right text-gray-700 dark:text-gray-300">Net Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.accountId}-${idx}`}
              className="border-t border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <td className="p-2 text-gray-800 dark:text-gray-100">
                <input
                  type="checkbox"
                  checked={excludedIds.has(idx)}
                  onChange={() => toggleExclude(idx)}
                />
              </td>
              <td className="p-2 text-gray-800 dark:text-gray-100">{row.entity}</td>
              <td className="p-2 text-gray-800 dark:text-gray-100">{row.accountId}</td>
              <td className="p-2 text-gray-800 dark:text-gray-100">{row.description}</td>
              <td className="p-2 text-right text-gray-800 dark:text-gray-100">
                {row.netChange.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Included: {included.length} • Excluded: {excluded.length}
        </div>
        <button
          onClick={() => onConfirm(included, excluded)}
          className="self-start rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Confirm Exclusions
        </button>
      </div>
    </div>
  );
}
