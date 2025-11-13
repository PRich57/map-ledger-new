import { useState, useMemo } from 'react';
import { Calendar, Check } from 'lucide-react';
import { useMappingStore, selectAvailablePeriods } from '../../store/mappingStore';

interface MonthScopeSelectorProps {
  companyId: string;
  accountId: string;
  currentMonth?: string | null;
  onApply: (months: string[] | 'all') => void;
  onCancel: () => void;
}

const MonthScopeSelector = ({
  companyId,
  accountId,
  currentMonth,
  onApply,
  onCancel,
}: MonthScopeSelectorProps) => {
  const availablePeriods = useMappingStore(selectAvailablePeriods);
  const [scope, setScope] = useState<'all' | 'current' | 'selected'>('all');
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(
    new Set(currentMonth ? [currentMonth] : [])
  );

  const accountPeriods = useMemo(() => {
    const accounts = useMappingStore.getState().accounts;
    return accounts
      .filter(acc => acc.companyId === companyId && acc.accountId === accountId)
      .map(acc => acc.glMonth)
      .filter((month): month is string => Boolean(month));
  }, [companyId, accountId]);

  const handleToggleMonth = (month: string) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  const handleApply = () => {
    if (scope === 'all') {
      onApply('all');
    } else if (scope === 'current') {
      onApply(currentMonth ? [currentMonth] : []);
    } else {
      onApply(Array.from(selectedMonths));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Apply Mapping to Months
            </h3>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Choose which months this mapping should apply to for account {accountId}
          </p>

          <div className="space-y-3 mb-6">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="h-4 w-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-white">All Months</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Apply to all {accountPeriods.length} months in this import
                </div>
              </div>
            </label>

            {currentMonth && (
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="current"
                  checked={scope === 'current'}
                  onChange={() => setScope('current')}
                  className="h-4 w-4 text-blue-600"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Current Month Only
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Apply to {currentMonth} only
                  </div>
                </div>
              </label>
            )}

            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
              <input
                type="radio"
                name="scope"
                value="selected"
                checked={scope === 'selected'}
                onChange={() => setScope('selected')}
                className="h-4 w-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  Specific Months
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Choose which months to apply to
                </div>
              </div>
            </label>

            {scope === 'selected' && (
              <div className="ml-7 mt-2 space-y-2 max-h-48 overflow-y-auto">
                {availablePeriods.map(month => (
                  <label
                    key={month}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMonths.has(month)}
                      onChange={() => handleToggleMonth(month)}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      {month}
                    </span>
                    {accountPeriods.includes(month) && (
                      <Check className="h-3 w-3 text-green-600 ml-auto" />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={scope === 'selected' && selectedMonths.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply Mapping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthScopeSelector;