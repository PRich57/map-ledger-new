import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import type {
  GLAccountMappingRow,
  MappingSplitDefinition,
  TargetScoaOption,
} from '../../types';
import { calculateSplitAmount, calculateSplitPercentage } from '../../store/mappingStore';

interface MappingSplitRowProps {
  account: GLAccountMappingRow;
  targetOptions: TargetScoaOption[];
  colSpan: number;
  panelId?: string;
  onAddSplit: () => void;
  onUpdateSplit: (splitId: string, updates: Partial<MappingSplitDefinition>) => void;
  onRemoveSplit: (splitId: string) => void;
}

const amountFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const clampPercentage = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const formatPercentageLabel = (value: number): string =>
  (Number.isFinite(value) ? value.toFixed(2) : '');

const parsePercentageInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (!/[0-9]/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

export default function MappingSplitRow({
  account,
  targetOptions,
  colSpan,
  panelId,
  onAddSplit,
  onUpdateSplit,
  onRemoveSplit,
}: MappingSplitRowProps) {
  const splitRows = useMemo(() => {
    return account.splitDefinitions.map(split => {
      const percentage = calculateSplitPercentage(account, split);
      const amount = calculateSplitAmount(account, split);
      return {
        ...split,
        percentage,
        amount,
      };
    });
  }, [account]);

  const totals = useMemo(() => {
    const percentageTotalRaw = splitRows.reduce((sum, split) => sum + split.percentage, 0);
    const normalizedTotal = roundToTwoDecimals(percentageTotalRaw);
    const amountTotal = splitRows.reduce((sum, split) => sum + split.amount, 0);
    const completionDelta = Math.abs(percentageTotalRaw - 100);

    return {
      percentageTotalLabel: `${normalizedTotal.toFixed(2)}%`,
      amountTotal,
      remainingLabel: `${Math.max(0, roundToTwoDecimals(100 - normalizedTotal)).toFixed(2)}%`,
      isComplete: completionDelta <= 0.01,
    };
  }, [splitRows]);

  const [percentageInputs, setPercentageInputs] = useState<Record<string, string>>(() => {
    const initialEntries: Record<string, string> = {};
    account.splitDefinitions.forEach(split => {
      const percentage = calculateSplitPercentage(account, split);
      initialEntries[split.id] = formatPercentageLabel(percentage);
    });
    return initialEntries;
  });

  useEffect(() => {
    setPercentageInputs(prev => {
      const next = { ...prev };
      let changed = false;
      const splitIds = new Set(account.splitDefinitions.map(split => split.id));

      account.splitDefinitions.forEach(split => {
        const formattedValue = formatPercentageLabel(
          calculateSplitPercentage(account, split),
        );

        if (next[split.id] !== formattedValue) {
          next[split.id] = formattedValue;
          changed = true;
        }
      });

      Object.keys(next).forEach(key => {
        if (!splitIds.has(key)) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [account]);

  const updatePercentageAllocations = (splitId: string, normalizedValue: number) => {
    const totalSplitCount = account.splitDefinitions.length;
    const activeSplits = account.splitDefinitions.filter(
      split => !split.isExclusion,
    );
    const targetIsActive = activeSplits.some(split => split.id === splitId);
    const shouldRedistribute =
      targetIsActive &&
      activeSplits.length === 2 &&
      totalSplitCount <= 2;
    const partnerSplit = shouldRedistribute
      ? activeSplits.find(split => split.id !== splitId)
      : null;

    onUpdateSplit(splitId, {
      allocationType: 'percentage',
      allocationValue: normalizedValue,
    });

    if (partnerSplit) {
      const remaining = roundToTwoDecimals(Math.max(0, 100 - normalizedValue));
      onUpdateSplit(partnerSplit.id, {
        allocationType: 'percentage',
        allocationValue: remaining,
      });

      setPercentageInputs(prev => ({
        ...prev,
        [splitId]: formatPercentageLabel(normalizedValue),
        [partnerSplit.id]: formatPercentageLabel(remaining),
      }));
      return;
    }

    setPercentageInputs(prev => ({
      ...prev,
      [splitId]: formatPercentageLabel(normalizedValue),
    }));
  };

  const handlePercentageChange = (splitId: string, value: string) => {
    setPercentageInputs(prev => ({
      ...prev,
      [splitId]: value,
    }));
  };

  const handlePercentageBlur = (splitId: string, rawValue: string) => {
    const parsedValue = parsePercentageInput(rawValue);

    if (parsedValue === null) {
      const fallback = splitRows.find(split => split.id === splitId);
      setPercentageInputs(prev => ({
        ...prev,
        [splitId]: fallback ? formatPercentageLabel(fallback.percentage) : '',
      }));
      return;
    }

    const numericValue = clampPercentage(parsedValue);
    const normalizedValue = roundToTwoDecimals(numericValue);
    updatePercentageAllocations(splitId, normalizedValue);
  };

  const handleTargetChange = (splitId: string, value: string) => {
    const selected = targetOptions.find(option => option.id === value);
    onUpdateSplit(splitId, {
      targetId: value,
      targetName: selected?.label ?? value,
    });
  };

  const handleNotesChange = (splitId: string, value: string) => {
    onUpdateSplit(splitId, { notes: value || undefined });
  };

  const handleExclusionToggle = (splitId: string, nextValue: boolean) => {
    const updates: Partial<MappingSplitDefinition> = { isExclusion: nextValue };
    if (nextValue) {
      updates.targetId = '';
      updates.targetName = '';
    }
    onUpdateSplit(splitId, updates);
  };

  return (
    <tr>
      <td
        id={panelId}
        colSpan={colSpan}
        className="bg-slate-50 px-4 py-4 dark:bg-slate-800/40"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Allocation splits
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ensure 100% allocation across targets.
              </p>
            </div>
            <button
              type="button"
              onClick={onAddSplit}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900"
            >
              <Plus className="h-4 w-4" />
              Add split
            </button>
          </div>

          {splitRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-white dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Target</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Exclude</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Percentage</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Amount</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Notes</th>
                    <th className="px-3 py-2" aria-label="Remove split" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {splitRows.map(split => (
                    <tr key={split.id}>
                      <td className="px-3 py-2">
                        {split.isExclusion ? (
                          <div className="w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                            Excluded from mapping
                          </div>
                        ) : (
                          <>
                            <label className="sr-only" htmlFor={`split-target-${split.id}`}>
                              Select target datapoint
                            </label>
                            <select
                              id={`split-target-${split.id}`}
                              value={split.targetId}
                              onChange={event => handleTargetChange(split.id, event.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select target</option>
                              {targetOptions.map(option => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-500"
                            checked={Boolean(split.isExclusion)}
                            onChange={event => handleExclusionToggle(split.id, event.target.checked)}
                          />
                          Exclude
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <label className="sr-only" htmlFor={`split-percentage-${split.id}`}>
                          Enter percentage allocation
                        </label>
                        <input
                          id={`split-percentage-${split.id}`}
                          type="text"
                          inputMode="decimal"
                          value={percentageInputs[split.id] ?? formatPercentageLabel(split.percentage)}
                          onChange={event => handlePercentageChange(split.id, event.target.value)}
                          onBlur={event => handlePercentageBlur(split.id, event.target.value)}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">%</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {amountFormatter.format(Math.round(split.amount))}
                      </td>
                      <td className="px-3 py-2">
                        <label className="sr-only" htmlFor={`split-notes-${split.id}`}>
                          Enter split notes
                        </label>
                        <input
                          id={`split-notes-${split.id}`}
                          type="text"
                          value={split.notes ?? ''}
                          onChange={event => handleNotesChange(split.id, event.target.value)}
                          placeholder="Optional notes"
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onRemoveSplit(split.id)}
                          className="inline-flex items-center rounded-md border border-transparent bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50 dark:focus:ring-offset-slate-900"
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300">Total</td>
                    <td />
                    <td className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                      {totals.percentageTotalLabel}
                    </td>
                    <td className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                      {amountFormatter.format(Math.round(totals.amountTotal))}
                    </td>
                    <td colSpan={2} className="px-3 py-2 text-right text-xs text-slate-500 dark:text-slate-400">
                      Remaining {totals.remainingLabel}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              No split definitions yet. Add splits to distribute this net change.
            </p>
          )}

          {!totals.isComplete && (
            <p className="mt-2 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-300">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              Allocation percentages must equal 100%.
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
