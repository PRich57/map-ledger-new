import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import type {
  DistributionOperationShare,
  DistributionRow,
  MappingPresetLibraryEntry,
} from '../../types';
import type { DistributionOperationCatalogItem } from '../../store/distributionStore';
import { useDistributionStore } from '../../store/distributionStore';
import { getOperationLabel } from '../../utils/operationLabel';

export type DistributionOperationDraft = DistributionOperationShare & {
  draftId: string;
};

interface DistributionSplitRowProps {
  row: DistributionRow;
  operationsCatalog: DistributionOperationCatalogItem[];
  operationsDraft: DistributionOperationDraft[];
  setOperationsDraft: React.Dispatch<
    React.SetStateAction<DistributionOperationDraft[]>
  >;
  presetOptions: MappingPresetLibraryEntry[];
  selectedPresetId: string | null;
  onApplyPreset: (presetId: string | null) => void;
  panelId?: string;
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

const buildPercentageState = (drafts: DistributionOperationDraft[]) => {
  const entries: Record<string, string> = {};
  drafts.forEach(operation => {
    entries[operation.draftId] = formatPercentageLabel(operation.allocation ?? 0);
  });
  return entries;
};

const createDraftId = () => `op-draft-${Math.random().toString(36).slice(2, 9)}`;

export default function DistributionSplitRow({
  row,
  operationsCatalog,
  operationsDraft,
  setOperationsDraft,
  presetOptions,
  selectedPresetId,
  onApplyPreset,
  panelId,
}: DistributionSplitRowProps) {
  const headingId = panelId ? `${panelId}-heading` : undefined;
  const [percentageInputs, setPercentageInputs] = useState<
    Record<string, string>
  >(() => buildPercentageState(operationsDraft));
  const queueAutoSave = useDistributionStore(state => state.queueAutoSave);
  const triggerImmediateAutoSave = useCallback(() => {
    queueAutoSave([row.id], { immediate: true });
  }, [queueAutoSave, row.id]);

  useEffect(() => {
    setPercentageInputs(prev => {
      const next = { ...prev };
      const currentState = buildPercentageState(operationsDraft);
      let changed = false;

      Object.entries(currentState).forEach(([key, value]) => {
        if (next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      });

      Object.keys(next).forEach(key => {
        if (!currentState[key]) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [operationsDraft]);

  const totals = useMemo(() => {
    const percentageTotalRaw = operationsDraft.reduce(
      (sum, operation) => sum + (operation.allocation ?? 0),
      0,
    );
    const normalizedTotal = roundToTwoDecimals(percentageTotalRaw);
    const amountTotal = operationsDraft.reduce((sum, operation) => {
      const share = (operation.allocation ?? 0) / 100;
      return sum + row.activity * share;
    }, 0);

    return {
      percentageTotalLabel: `${normalizedTotal.toFixed(2)}%`,
      remainingLabel: `${Math.max(0, roundToTwoDecimals(100 - normalizedTotal)).toFixed(2)}%`,
      amountTotal,
      isComplete: Math.abs(percentageTotalRaw - 100) <= 0.01,
    };
  }, [operationsDraft, row.activity]);

  const usedOperationIds = useMemo(() => {
    return new Set(
      operationsDraft
        .map(operation => operation.id)
        .filter((value): value is string => Boolean(value)),
    );
  }, [operationsDraft]);

  const availableOptions = useMemo(
    () => operationsCatalog.filter(option => !usedOperationIds.has(option.id)),
    [operationsCatalog, usedOperationIds],
  );

  const updateOperationByDraft = (
    draftId: string,
    updates: Partial<DistributionOperationDraft>,
  ) => {
    setOperationsDraft(prev =>
      prev.map(operation =>
        operation.draftId === draftId ? { ...operation, ...updates } : operation,
      ),
    );
  };

  const handleAddOperation = () => {
    if (availableOptions.length === 0) {
      return;
    }
    const [selectedOption] = availableOptions;
    setOperationsDraft(prev => [
      ...prev,
      {
        draftId: createDraftId(),
        id: selectedOption.id,
        name: selectedOption.name,
        allocation: prev.length === 0 ? 100 : 0,
      },
    ]);
  };

  const handleRemoveOperation = (draftId: string) => {
    setOperationsDraft(prev => prev.filter(operation => operation.draftId !== draftId));
    setPercentageInputs(prev => {
      if (!prev[draftId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
  };

  const handleTargetChange = (draftId: string, value: string) => {
    if (!value) {
      handleRemoveOperation(draftId);
      return;
    }
    const selected = operationsCatalog.find(option => option.id === value);
    updateOperationByDraft(draftId, {
      id: selected?.id ?? value,
      name: selected?.name ?? value,
    });
  };

  const updatePercentageAllocations = (draftId: string, normalizedValue: number) => {
    const totalOperationCount = operationsDraft.length;

    // Auto-calculate the partner split only when there are exactly 2 operations
    const shouldRedistribute = totalOperationCount === 2;

    const partnerOperation = shouldRedistribute
      ? operationsDraft.find(operation => operation.draftId !== draftId)
      : null;

    // Update the edited operation
    updateOperationByDraft(draftId, { allocation: normalizedValue });

    // Auto-calculate partner split when exactly 2 operations
    if (partnerOperation) {
      const remaining = roundToTwoDecimals(Math.max(0, 100 - normalizedValue));
      updateOperationByDraft(partnerOperation.draftId, { allocation: remaining });

      // Update both input displays
      setPercentageInputs(prev => ({
        ...prev,
        [draftId]: formatPercentageLabel(normalizedValue),
        [partnerOperation.draftId]: formatPercentageLabel(remaining),
      }));
      return;
    }

    // No auto-calculation if not exactly 2 operations
    setPercentageInputs(prev => ({
      ...prev,
      [draftId]: formatPercentageLabel(normalizedValue),
    }));
  };

  const handlePercentageChange = (draftId: string, value: string) => {
    setPercentageInputs(prev => ({
      ...prev,
      [draftId]: value,
    }));
  };

  const handlePercentageBlur = (draftId: string, rawValue: string) => {
    const parsedValue = parsePercentageInput(rawValue);
    if (parsedValue === null) {
      const currentValue =
        operationsDraft.find(operation => operation.draftId === draftId)?.allocation ?? 0;
      setPercentageInputs(prev => ({
        ...prev,
        [draftId]: formatPercentageLabel(currentValue),
      }));
      return;
    }

    const normalizedValue = roundToTwoDecimals(clampPercentage(parsedValue));
    updatePercentageAllocations(draftId, normalizedValue);
    triggerImmediateAutoSave();
  };

  const handleNotesChange = (draftId: string, value: string) => {
    updateOperationByDraft(draftId, { notes: value || undefined });
  };

  const optionsForOperation = (operation: DistributionOperationDraft) => {
    const filtered = operationsCatalog.filter(
      option => option.id === operation.id || !usedOperationIds.has(option.id),
    );
    if (!filtered.some(option => option.id === operation.id) && operation.id) {
      filtered.unshift({ id: operation.id, name: operation.name ?? operation.id });
    }
    return filtered;
  };

  return (
    <div
      id={panelId}
      role="region"
      aria-labelledby={headingId}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            id={headingId}
            className="text-sm font-semibold text-slate-700 dark:text-slate-200"
          >
            Allocation splits
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Ensure 100% allocation across targets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            <label htmlFor={`distribution-preset-${row.id}`} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Preset
            </label>
            <select
              id={`distribution-preset-${row.id}`}
              value={selectedPresetId ?? ''}
              onChange={event => onApplyPreset(event.target.value || null)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Custom allocation</option>
              {presetOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddOperation}
            disabled={availableOptions.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900"
          >
            <Plus className="h-4 w-4" />
            Add split
          </button>
        </div>
      </div>

      {operationsCatalog.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-300">No client operations are available for this distribution.</p>
      )}
      {operationsCatalog.length > 0 && availableOptions.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          All available operations have been assigned. Remove an operation to choose a different target.
        </p>
      )}

      {operationsDraft.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full table-compact divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-white dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Target</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Percentage</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Amount</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Notes</th>
                <th className="px-3 py-2" aria-label="Remove split" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {operationsDraft.map(operation => (
                <tr key={operation.draftId}>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`distribution-operation-${operation.draftId}`}
                      >Select target
                    </label>
                    <select
                      id={`distribution-operation-${operation.draftId}`}
                      value={operation.id}
                      onChange={event => handleTargetChange(operation.draftId, event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select target</option>
                      {optionsForOperation(operation).map(option => (
                      <option key={option.id} value={option.id}>
                          {getOperationLabel(option)}
                      </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`distribution-percentage-${operation.draftId}`}
                      >Enter allocation percentage
                    </label>
                    <input
                      id={`distribution-percentage-${operation.draftId}`}
                      type="text"
                      inputMode="decimal"
                      value={
                        percentageInputs[operation.draftId] ??
                        formatPercentageLabel(operation.allocation ?? 0)
                      }
                      onChange={event =>
                        handlePercentageChange(operation.draftId, event.target.value)
                      }
                      onBlur={event =>
                        handlePercentageBlur(operation.draftId, event.target.value)
                      }
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">%</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {amountFormatter.format(
                      Math.round(row.activity * ((operation.allocation ?? 0) / 100)),
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`distribution-notes-${operation.draftId}`}
                      >Enter operation notes
                    </label>
                    <input
                      id={`distribution-notes-${operation.draftId}`}
                      type="text"
                      value={operation.notes ?? ''}
                      onChange={event =>
                        handleNotesChange(operation.draftId, event.target.value)
                      }
                      onBlur={triggerImmediateAutoSave}
                      placeholder="Optional notes"
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveOperation(operation.draftId)}
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
          No splits yet. Add client targets to distribute this mapped value.
        </p>
      )}

      {!totals.isComplete && operationsDraft.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-300">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Allocation percentages must equal 100%.
        </p>
      )}
    </div>
  );
}
