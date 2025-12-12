import { useEffect, useMemo } from 'react';
import { AlertTriangle, Calculator, Layers, XCircle } from 'lucide-react';
import type { GLAccountMappingRow, MappingPresetLibraryEntry } from '../../types';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import {
  allocateDynamic,
  getBasisValue,
  getSourceValue,
} from '../../utils/dynamicAllocation';
import { formatCurrencyAmount } from '../../utils/currency';

interface DynamicAllocationRowProps {
  account: GLAccountMappingRow;
  colSpan: number;
  panelId: string;
  onOpenBuilder: () => void;
  presetOptions: MappingPresetLibraryEntry[];
}

const pluralize = (value: number, noun: string) =>
  `${value} ${noun}${value === 1 ? '' : 's'}`;

const stripParentheticalSuffix = (value: string): string =>
  value.replace(/\s*\([^)]*\)\s*$/, '').trim();

type TargetDetail = {
  id: string;
  groupId: string | null;
  targetName: string;
  presetName?: string;
  metricName: string;
  basisValue: number;
  basisAccountName: string;
  basisAccountId: string | null;
  isExclusion: boolean;
};

type PreviewAllocation = {
  targetId: string;
  targetName: string;
  value: number;
  percentage: number;
  isExclusion: boolean;
};

const DynamicAllocationRow = ({
  account,
  colSpan,
  panelId,
  onOpenBuilder,
  presetOptions,
}: DynamicAllocationRowProps) => {
  const headingId = `${panelId}-heading`;

  const {
    allocations,
    basisAccounts,
    sourceAccounts,
    selectedPeriod,
    results,
    validationErrors,
    toggleTargetExclusion,
    presets,
    getActivePresetForSource,
    setActivePresetForSource,
  } = useRatioAllocationStore(state => ({
    allocations: state.allocations,
    basisAccounts: state.basisAccounts,
    sourceAccounts: state.sourceAccounts,
    selectedPeriod: state.selectedPeriod,
    results: state.results,
    validationErrors: state.validationErrors,
    toggleTargetExclusion: state.toggleTargetExclusion,
    presets: state.presets,
    getActivePresetForSource: state.getActivePresetForSource,
    setActivePresetForSource: state.setActivePresetForSource,
  }));

  useEffect(() => {
    if (!account.presetId) {
      return;
    }
    const activePreset = getActivePresetForSource(account.id);
    if (activePreset?.id === account.presetId) {
      return;
    }
    setActivePresetForSource(account.id, account.presetId);
  }, [account.id, account.presetId, getActivePresetForSource, setActivePresetForSource]);

  const allocation = useMemo(
    () => allocations.find(item => item.sourceAccount.id === account.id),
    [account.id, allocations],
  );

  const sourceAccount = useMemo(
    () => sourceAccounts.find(item => item.id === account.id),
    [account.id, sourceAccounts],
  );

  const sourceValue = useMemo(() => {
    if (!sourceAccount) {
      return account.netChange;
    }
    return getSourceValue(sourceAccount, selectedPeriod);
  }, [account.netChange, selectedPeriod, sourceAccount]);

  const targetDetails = useMemo<TargetDetail[]>(() => {
    if (!allocation) {
      return [];
    }

    return allocation.targetDatapoints.map(target => {
      const isExclusion = Boolean(target.isExclusion);
      const preset = target.groupId ? presets.find(item => item.id === target.groupId) : null;
      const matchingRow = preset?.rows.find(row => row.targetAccountId === target.datapointId) ?? null;

      const fallbackBasisAccount =
        basisAccounts.find(account => account.id === target.ratioMetric.id) ?? null;

      let basisValue =
        typeof target.ratioMetric.value === 'number' && Number.isFinite(target.ratioMetric.value)
          ? target.ratioMetric.value
          : 0;
      let basisAccountId: string | null = fallbackBasisAccount?.id ?? null;
      let basisAccountName: string =
        fallbackBasisAccount?.name ?? fallbackBasisAccount?.id ?? target.ratioMetric.name;

      if (fallbackBasisAccount) {
        basisValue = getBasisValue(fallbackBasisAccount, selectedPeriod);
      }

      if (matchingRow) {
        const basisAccount = basisAccounts.find(
          account => account.id === matchingRow.dynamicAccountId,
        );
        if (basisAccount) {
          basisAccountId = basisAccount.id;
          basisAccountName = basisAccount.name ?? basisAccount.id;
          basisValue = getBasisValue(basisAccount, selectedPeriod);
        }
      }

      return {
        id: target.datapointId,
        groupId: target.groupId ?? null,
        targetName: target.name,
        presetName: preset?.name,
        metricName: target.ratioMetric.name,
        basisValue,
        basisAccountName,
        basisAccountId,
        isExclusion,
      };
    });
  }, [allocation, basisAccounts, presets, selectedPeriod]);

  const basisTotal = useMemo(
    () => targetDetails.reduce((sum, detail) => sum + detail.basisValue, 0),
    [targetDetails],
  );

  const periodResult = useMemo(() => {
    if (!allocation || !selectedPeriod) {
      return null;
    }
    return (
      results.find(
        result =>
          result.periodId === selectedPeriod && result.allocationId === allocation.id,
      ) ?? null
    );
  }, [allocation, results, selectedPeriod]);

  const allocationIssues = useMemo(() => {
    const relevant = validationErrors.filter(
      issue => issue.sourceAccountId === account.id,
    );
    if (!selectedPeriod) {
      return relevant;
    }
    return relevant.filter(issue => issue.periodId === selectedPeriod);
  }, [account.id, selectedPeriod, validationErrors]);

  const computedPreview = useMemo(() => {
    if (periodResult) {
      return {
        allocations: periodResult.allocations.map(target => ({
          targetId: target.targetId,
          targetName: target.targetName,
          value: target.value,
          percentage: target.percentage,
          isExclusion: Boolean(target.isExclusion),
        })),
        adjustment: periodResult.adjustment
          ? {
              amount: periodResult.adjustment.amount,
              targetName:
                periodResult.allocations.find(
                  target => target.targetId === periodResult.adjustment?.targetId,
                )?.targetName ?? null,
            }
          : null,
      } as const;
    }

    if (!allocation || targetDetails.length === 0 || basisTotal <= 0) {
      return null;
    }

    try {
      const computation = allocateDynamic(
        sourceValue,
        targetDetails.map(detail => detail.basisValue),
      );

      const allocations = targetDetails.map((detail, index) => {
        const ratio = basisTotal > 0 ? detail.basisValue / basisTotal : 0;
        return {
          targetId: detail.id,
          targetName: detail.targetName,
          value: computation.allocations[index] ?? 0,
          percentage: ratio * 100,
          isExclusion: detail.isExclusion,
        };
      });

      const adjustment =
        computation.adjustmentIndex !== null
          ? {
              amount: computation.adjustmentAmount,
              targetName:
                targetDetails[computation.adjustmentIndex]?.targetName ?? null,
            }
          : null;

      return { allocations, adjustment } as const;
    } catch (error) {
      console.warn('Failed to derive preview for dynamic allocation row', error);
      return null;
    }
  }, [allocation, basisTotal, periodResult, sourceValue, targetDetails]);

  const previewAllocationLookup = useMemo(() => {
    const map = new Map<string, PreviewAllocation>();
    if (!computedPreview) {
      return map;
    }
    computedPreview.allocations.forEach(entry => {
      map.set(entry.targetId, entry);
    });
    return map;
  }, [computedPreview]);

  const sourceAccountLabel = useMemo(() => {
    if (account.accountName) {
      return `${account.accountName} (${account.accountId})`;
    }
    if (sourceAccount?.name) {
      return `${sourceAccount.name} (${sourceAccount.number ?? sourceAccount.id})`;
    }
    return account.accountId;
  }, [account.accountId, account.accountName, sourceAccount?.id, sourceAccount?.name, sourceAccount?.number]);

  return (
    <tr className="align-top">
      <td colSpan={colSpan} className="bg-slate-50 px-2 py-3 dark:bg-slate-800/50">
        <div
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="relative ml-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/10"
        >
          <div
            aria-hidden="true"
            className="absolute -left-6 top-3 h-3 w-3 rounded-full bg-white ring-2 ring-indigo-500 dark:bg-slate-900"
          />
          <div
            aria-hidden="true"
            className="absolute -left-5 top-6 bottom-3 w-px bg-slate-200 dark:bg-slate-700"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                id={headingId}
                className="text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Preset allocation overview
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ratios are derived from preset configurations that drive this account.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <label htmlFor={`preset-select-${account.id}`} className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Active preset:
                </label>
                <select
                  id={`preset-select-${account.id}`}
                  value={getActivePresetForSource(account.id)?.id ?? ''}
                  onChange={event => setActivePresetForSource(account.id, event.target.value || null)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">No preset selected</option>
                  {presetOptions.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={onOpenBuilder}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-500 px-3 py-1.5 text-xs font-medium text-emerald-600 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:border-emerald-400 dark:text-emerald-200 dark:hover:bg-emerald-500/10 dark:focus:ring-offset-slate-900"
              >
                <Calculator className="h-4 w-4" aria-hidden="true" />
                Open preset builder
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Source balance {selectedPeriod ? `(${selectedPeriod})` : ''}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrencyAmount(sourceValue)}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Driven by {sourceAccountLabel}.
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Basis total
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrencyAmount(basisTotal)}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {pluralize(targetDetails.length, 'target account')}
              </div>
            </div>
          </div>

          {!allocation ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              No presets are configured yet. Launch the builder to choose presets and targets for this account.
            </p>
          ) : targetDetails.length === 0 ? (
            <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              Add presets in the builder to establish allocation ratios for this account.
            </p>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Preset accounts</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Review how each basis datapoint contributes to its target account allocation.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  {formatCurrencyAmount(basisTotal)} total basis value
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Target account
                      </th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Basis datapoint
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Basis amount
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Allocation percentage
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Preview allocation
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Exclude
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm dark:divide-slate-700 dark:bg-slate-900">
                    {targetDetails.map(detail => {
                      const ratio = basisTotal > 0 ? detail.basisValue / basisTotal : 0;
                      const previewAllocation = previewAllocationLookup.get(detail.id);
                      const percent = previewAllocation?.percentage ?? ratio * 100;
                      const allocatedValue = previewAllocation?.value ?? sourceValue * ratio;
                      const isExclusion = detail.isExclusion;
                      const allocationId = allocation?.id ?? null;
                      const basisLabel = stripParentheticalSuffix(
                        detail.basisAccountName || detail.metricName,
                      );
                      const metricLabel = stripParentheticalSuffix(detail.metricName);
                      const rowClasses = isExclusion
                        ? 'bg-rose-50/70 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100'
                        : '';
                      return (
                        <tr key={detail.id} className={rowClasses}>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {detail.targetName}
                              </span>
                              {!detail.presetName && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {metricLabel}
                                </span>
                              )}
                              {isExclusion && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Excluded portion
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-200">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{basisLabel}</span>
                            </div>
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              isExclusion ? 'text-rose-700 dark:text-rose-200' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {formatCurrencyAmount(detail.basisValue)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                            {percent.toFixed(2)}%
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${
                              isExclusion ? 'text-rose-700 dark:text-rose-200' : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {formatCurrencyAmount(allocatedValue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {allocationId && (
                              <label className="inline-flex items-center justify-end gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                                  checked={isExclusion}
                                  onChange={() => toggleTargetExclusion(allocationId, detail.id)}
                                />
                                {isExclusion ? 'Excluded' : 'Exclude'}
                              </label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {selectedPeriod ? (
            computedPreview ? (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <div className="text-sm font-semibold">
                    Allocation preview for {sourceAccountLabel}
                    {selectedPeriod ? ` · ${selectedPeriod}` : ''}
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-200">
                    Total distributes {formatCurrencyAmount(sourceValue)} across {computedPreview.allocations.length} targets.
                  </div>
                </div>
                <div className="space-y-2">
                  {computedPreview.allocations.map(target => {
                    const containerClasses = target.isExclusion
                      ? 'rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-900 shadow-sm transition dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
                      : 'rounded-lg bg-white/80 px-3 py-2 text-sm text-blue-900 shadow-sm transition dark:bg-slate-900/60 dark:text-blue-100';
                    const percentageClasses = target.isExclusion
                      ? 'text-xs text-rose-700/80 dark:text-rose-200/80'
                      : 'text-xs text-blue-700/80 dark:text-blue-200/80';
                    const valueClasses = target.isExclusion
                      ? 'text-right font-semibold text-rose-700 dark:text-rose-200'
                      : 'text-right font-semibold';
                    const progressBackground = target.isExclusion
                      ? 'mt-2 h-2 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-900/40'
                      : 'mt-2 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40';
                    const progressFill = target.isExclusion
                      ? 'h-2 rounded-full bg-rose-500 dark:bg-rose-400'
                      : 'h-2 rounded-full bg-blue-500 dark:bg-blue-400';

                    return (
                      <div key={target.targetId} className={containerClasses}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{target.targetName}</div>
                            <div className={percentageClasses}>
                              {target.percentage.toFixed(2)}% of total
                            </div>
                            {target.isExclusion && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Excluded portion
                              </span>
                            )}
                          </div>
                          <div className={valueClasses}>
                            {formatCurrencyAmount(target.value)}
                          </div>
                        </div>
                        <div className={progressBackground} aria-hidden="true">
                          <div
                            className={progressFill}
                            style={{ width: `${Math.min(target.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {computedPreview.adjustment && computedPreview.adjustment.targetName &&
                  Math.abs(computedPreview.adjustment.amount) > 0 && (
                    <p className="text-xs text-blue-700 dark:text-blue-200">
                      Includes a {formatCurrencyAmount(computedPreview.adjustment.amount)} rounding adjustment applied to {computedPreview.adjustment.targetName}.
                    </p>
                  )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
                Run preset allocation checks for {sourceAccountLabel}
                {selectedPeriod ? ` in ${selectedPeriod}` : ''} to generate preview amounts.
              </p>
            )
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              Select a reporting period to preview calculated allocations.
            </p>
          )}

          {allocationIssues.map(issue => (
            <div
              key={issue.id}
              className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
};

export default DynamicAllocationRow;
