import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Calculator, Layers, XCircle } from 'lucide-react';
import type { DistributionOperationShare, DistributionRow } from '../../types';
import type { DistributionOperationCatalogItem } from '../../store/distributionStore';
import {
  useRatioAllocationStore,
  DEFAULT_PRESET_CONTEXT,
} from '../../store/ratioAllocationStore';
import {
  allocateDynamic,
  getBasisValue,
  getSourceValue,
} from '../../utils/dynamicAllocation';
import { formatCurrencyAmount } from '../../utils/currency';
import { formatPeriodDate } from '../../utils/period';
import { useDistributionStore } from '../../store/distributionStore';
import { getOperationLabel } from '../../utils/operationLabel';

interface DistributionDynamicAllocationRowProps {
  row: DistributionRow;
  colSpan: number;
  panelId: string;
  onOpenBuilder: () => void;
  operationsCatalog: DistributionOperationCatalogItem[];
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

const DistributionDynamicAllocationRow = ({
  row,
  colSpan,
  panelId,
  onOpenBuilder,
  operationsCatalog,
}: DistributionDynamicAllocationRowProps) => {
  const { updateRowPreset, updateRowOperations } = useDistributionStore(state => ({
    updateRowPreset: state.updateRowPreset,
    updateRowOperations: state.updateRowOperations,
  }));
  const {
    allocations,
    basisAccounts,
    sourceAccounts,
    selectedPeriod,
    results,
    validationErrors,
    presets,
    getActivePresetForSource,
    setActivePresetForSource,
    syncSourceAccountBalance,
  } = useRatioAllocationStore(state => ({
    allocations: state.allocations,
    basisAccounts: state.basisAccounts,
    sourceAccounts: state.sourceAccounts,
    selectedPeriod: state.selectedPeriod,
    results: state.results,
    validationErrors: state.validationErrors,
    presets: state.presets,
    getActivePresetForSource: state.getActivePresetForSource,
    setActivePresetForSource: state.setActivePresetForSource,
    syncSourceAccountBalance: state.syncSourceAccountBalance,
  }));

  const distributionContextPresets = useMemo(
    () =>
      presets.filter(
        preset => (preset.context ?? DEFAULT_PRESET_CONTEXT) === 'distribution',
      ),
    [presets],
  );
  const formattedSelectedPeriod =
    selectedPeriod ? formatPeriodDate(selectedPeriod) || selectedPeriod : null;

  const normalizeOperationId = useCallback((value?: string | null): string => {
    if (!value) {
      return '';
    }
    return value.trim().toUpperCase();
  }, []);

  const operationLabelLookup = useMemo(() => {
    const lookup = new Map<string, DistributionOperationCatalogItem>();
    operationsCatalog.forEach(operation => {
      const key =
        normalizeOperationId(operation.code) ||
        normalizeOperationId(operation.id);
      if (!key) {
        return;
      }
      lookup.set(key, operation);
    });
    return lookup;
  }, [normalizeOperationId, operationsCatalog]);

  const resolveOperationLabel = useCallback(
    (operationId?: string | null, fallback?: string | null) => {
      const normalized = normalizeOperationId(operationId ?? fallback ?? null);
      if (!normalized) {
        return fallback ?? '';
      }
      const match = operationLabelLookup.get(normalized);
      if (match) {
        const label = getOperationLabel({
          code: match.code,
          id: match.id,
          name: match.name,
        });
        return label || normalized;
      }
      return normalized;
    },
    [normalizeOperationId, operationLabelLookup],
  );

  const allocation = useMemo(
    () => allocations.find(item => item.sourceAccount.id === row.accountId),
    [allocations, row.accountId],
  );

  const sourceAccount = useMemo(
    () => sourceAccounts.find(item => item.id === row.accountId),
    [row.accountId, sourceAccounts],
  );

  // Track last synced activity to avoid redundant sync calls
  const lastSyncedActivityRef = useRef<{ accountId: string; activity: number; period: string | null } | null>(null);

  useEffect(() => {
    const normalizedActivity = Number.isFinite(row.activity) ? row.activity : 0;
    const normalizedPeriod = selectedPeriod ?? null;

    // Skip if we already synced this exact value
    const lastSync = lastSyncedActivityRef.current;
    if (
      lastSync &&
      lastSync.accountId === row.accountId &&
      Math.abs(lastSync.activity - normalizedActivity) < 0.001 &&
      lastSync.period === normalizedPeriod
    ) {
      return;
    }

    lastSyncedActivityRef.current = {
      accountId: row.accountId,
      activity: normalizedActivity,
      period: normalizedPeriod,
    };
    syncSourceAccountBalance(row.accountId, normalizedActivity, normalizedPeriod);
  }, [row.accountId, row.activity, selectedPeriod, syncSourceAccountBalance]);

  const sourceValue = useMemo(() => {
    const fallbackValue = row.activity;
    if (!sourceAccount) {
      return fallbackValue;
    }
    const resolved = getSourceValue(sourceAccount, selectedPeriod);
    if (!Number.isFinite(resolved)) {
      return fallbackValue;
    }
    if (Math.abs(resolved) < 1e-6 && Math.abs(fallbackValue) > 0) {
      return fallbackValue;
    }
    if (Math.abs(fallbackValue) > 0 && Math.abs(resolved - fallbackValue) > 0.01) {
      return fallbackValue;
    }
    return resolved;
  }, [row.activity, selectedPeriod, sourceAccount]);

  const targetDetails = useMemo<TargetDetail[]>(() => {
    if (!allocation) {
      return [];
    }

    return allocation.targetDatapoints.map(target => {
      const isExclusion = Boolean(target.isExclusion);
      const preset = target.groupId
        ? distributionContextPresets.find(item => item.id === target.groupId)
        : null;
      const matchingRow = preset?.rows.find(presetRow => presetRow.targetAccountId === target.datapointId) ?? null;
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
        const basisAccount = basisAccounts.find(account => account.id === matchingRow.dynamicAccountId);
        if (basisAccount) {
          basisAccountId = basisAccount.id;
          basisAccountName = basisAccount.name ?? basisAccount.id;
          basisValue = getBasisValue(basisAccount, selectedPeriod);
        }
      }

      return {
        id: target.datapointId,
        groupId: target.groupId ?? null,
        targetName: resolveOperationLabel(target.datapointId, target.name),
        presetName: preset?.name,
        metricName: target.ratioMetric.name,
        basisValue,
        basisAccountName,
        basisAccountId,
        isExclusion,
      } satisfies TargetDetail;
    });
  }, [allocation, basisAccounts, distributionContextPresets, resolveOperationLabel, selectedPeriod]);

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
        result => result.periodId === selectedPeriod && result.allocationId === allocation.id,
      ) ?? null
    );
  }, [allocation, results, selectedPeriod]);

  const allocationIssues = useMemo(() => {
    const relevant = validationErrors.filter(issue => issue.sourceAccountId === row.accountId);
    if (!selectedPeriod) {
      return relevant;
    }
    return relevant.filter(issue => issue.periodId === selectedPeriod);
  }, [row.accountId, selectedPeriod, validationErrors]);

  const computedPreview = useMemo(() => {
    const mapResultToPreview = () => {
      if (!periodResult) {
        return null;
      }
      return {
        allocations: periodResult.allocations.map(target => ({
          targetId: target.targetId,
          targetName: resolveOperationLabel(target.targetId, target.targetName),
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
    };

    const shouldUseSavedResult =
      periodResult && Math.abs(periodResult.sourceValue - sourceValue) < 0.01;
    if (shouldUseSavedResult) {
      return mapResultToPreview();
    }

    if (!allocation || targetDetails.length === 0 || basisTotal <= 0) {
      return mapResultToPreview();
    }

    try {
      const computation = allocateDynamic(sourceValue, targetDetails.map(detail => detail.basisValue));

      const allocations = targetDetails.map((detail, index) => {
        const ratio = basisTotal > 0 ? detail.basisValue / basisTotal : 0;
        return {
          targetId: detail.id,
          targetName: detail.targetName,
          value: computation.allocations[index] ?? 0,
          percentage: ratio * 100,
          isExclusion: detail.isExclusion,
        } satisfies PreviewAllocation;
      });

      const adjustment =
        computation.adjustmentIndex !== null
          ? {
              amount: computation.adjustmentAmount,
              targetName: targetDetails[computation.adjustmentIndex]?.targetName ?? null,
            }
          : null;

      return { allocations, adjustment } as const;
    } catch (error) {
      console.warn('Failed to derive preview for distribution dynamic row', error);
      return null;
    }
  }, [allocation, basisTotal, periodResult, resolveOperationLabel, sourceValue, targetDetails]);

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
    if (sourceAccount?.name) {
      return `${sourceAccount.name} (${sourceAccount.number ?? sourceAccount.id})`;
    }
    if (row.description) {
      return `${row.description} (${row.accountId})`;
    }
    return row.accountId;
  }, [row.accountId, row.description, sourceAccount?.id, sourceAccount?.name, sourceAccount?.number]);

  const activePreset = getActivePresetForSource(row.accountId);

  // Track last synced preset to avoid redundant syncs
  const lastSyncedPresetRef = useRef<string | null>(null);
  // Track if a preset change is in progress to prevent effect from duplicating updates
  const presetChangeInProgressRef = useRef(false);

const buildPresetOperations = useCallback(
  (presetId: string | null) => {
    if (!presetId) {
      return [];
    }
    const preset = distributionContextPresets.find(item => item.id === presetId);
    if (!preset) {
      return [];
    }

    // Calculate total basis value to derive allocation percentages
    const rowsWithBasis = preset.rows.map(presetRow => {
      const basisAccount = basisAccounts.find(acc => acc.id === presetRow.dynamicAccountId);
      const basisValue = basisAccount ? getBasisValue(basisAccount, selectedPeriod) : 0;
      return { presetRow, basisValue };
    });
    const totalBasis = rowsWithBasis.reduce((sum, item) => sum + item.basisValue, 0);

    return rowsWithBasis
      .map(({ presetRow, basisValue }) => {
        const targetId = normalizeOperationId(presetRow.targetAccountId);
        if (!targetId) {
          return null;
        }
        const catalogMatch = operationLabelLookup.get(targetId);
        const code = targetId;
        // Calculate allocation percentage based on basis value ratio
        const allocationPct = totalBasis > 0 ? (basisValue / totalBasis) * 100 : 0;
        return {
          id: code,
          code,
          name: getOperationLabel({
            code,
            id: catalogMatch?.id ?? code,
            name: catalogMatch?.name ?? code,
          }),
          basisDatapoint: presetRow.dynamicAccountId?.trim() || undefined,
          allocation: allocationPct,
        };
      })
      .filter((op): op is DistributionOperationShare => Boolean(op))
      .sort((a, b) => a.code.localeCompare(b.code));
  },
  [distributionContextPresets, normalizeOperationId, operationLabelLookup, basisAccounts, selectedPeriod],
);

const operationsMatch = useCallback(
  (next: DistributionOperationShare[] = []) => {
    if (row.operations.length !== next.length) {
      return false;
    }
    const normalize = (ops: DistributionOperationShare[]) =>
      [...ops]
        .map(op => ({
          id: normalizeOperationId(op.id),
          code: normalizeOperationId(op.code ?? op.id),
          name: (op.name ?? '').trim(),
          basis: (op.basisDatapoint ?? '').trim(),
        }))
        .sort((a, b) => a.code.localeCompare(b.code));

    const current = normalize(row.operations);
    const candidate = normalize(next);

    return current.every((operation, index) => {
      const comparison = candidate[index];
      if (!comparison) {
        return false;
      }
      return (
        operation.id === comparison.id &&
        operation.code === comparison.code &&
        operation.name === comparison.name &&
        operation.basis === comparison.basis
      );
    });
  },
  [normalizeOperationId, row.operations],
);

  // Sync preset from ratioAllocationStore to distributionStore when it changes externally.
  // This handles the case where a preset is created via the RatioAllocationBuilder and
  // automatically applied to this row. We need to sync both the presetId AND the operations
  // so that the backend receives the correct basisDatapoint values for each operation.
  useEffect(() => {
    // Skip if a preset change is already in progress (handlePresetChange is running)
    if (presetChangeInProgressRef.current) {
      return;
    }

    const resolvedPresetId = activePreset?.id ?? null;
    const currentPresetId = row.presetId ?? null;

    // Skip syncing when no active preset is attached in the ratio store; this avoids
    // repeatedly clearing a server-assigned preset while presets are still hydrating.
    if (!resolvedPresetId) {
      lastSyncedPresetRef.current = null;
      return;
    }

    // Skip if we already synced this preset
    if (lastSyncedPresetRef.current === resolvedPresetId) {
      return;
    }

    lastSyncedPresetRef.current = resolvedPresetId;

    // Sync presetId if it changed
    if (currentPresetId !== resolvedPresetId) {
      updateRowPreset(row.id, resolvedPresetId);
    }

    // Also sync operations from the preset - this ensures basisDatapoint values
    // are included when the row is saved to the backend
    const derivedOperations = buildPresetOperations(resolvedPresetId);
    updateRowOperations(row.id, derivedOperations);
  }, [activePreset?.id, row.id, row.presetId, updateRowPreset, buildPresetOperations, updateRowOperations]);

  const handlePresetChange = (presetId: string | null) => {
    // Mark that a preset change is in progress to prevent the useEffect from
    // duplicating updates and causing an infinite loop
    presetChangeInProgressRef.current = true;
    lastSyncedPresetRef.current = presetId;

    try {
      syncSourceAccountBalance(row.accountId, sourceValue, selectedPeriod ?? null);
      setActivePresetForSource(row.accountId, presetId);
      updateRowPreset(row.id, presetId);
      if (!presetId) {
        updateRowOperations(row.id, []);
        return;
      }
      const derivedOperations = buildPresetOperations(presetId);
      updateRowOperations(row.id, derivedOperations);
    } finally {
      // Reset the flag after a microtask to ensure all synchronous updates complete
      queueMicrotask(() => {
        presetChangeInProgressRef.current = false;
      });
    }
  };

  return (
    <tr id={panelId}>
      <td colSpan={colSpan} className="bg-slate-50 px-4 py-4 dark:bg-slate-800/40">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Preset allocation overview
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ratios are derived from preset configurations that drive this standard account.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`distribution-preset-select-${row.id}`}
                  className="text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Active preset:
                </label>
                <select
                  id={`distribution-preset-select-${row.id}`}
                  value={activePreset?.id ?? ''}
                  onChange={event => handlePresetChange(event.target.value || null)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">No preset selected</option>
                  {distributionContextPresets.map(preset => (
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
                Source balance {formattedSelectedPeriod ? `(${formattedSelectedPeriod})` : ''}
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
                {pluralize(targetDetails.length, 'target operation')}
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
                    Review how each basis datapoint contributes to its target operation allocation.
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
                        Target operation
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm dark:divide-slate-700 dark:bg-slate-900">
                    {targetDetails.map(detail => {
                      const ratio = basisTotal > 0 ? detail.basisValue / basisTotal : 0;
                      const previewAllocation = previewAllocationLookup.get(detail.id);
                      const percent = previewAllocation?.percentage ?? ratio * 100;
                      const allocatedValue = previewAllocation?.value ?? sourceValue * ratio;
                      const isExclusion = detail.isExclusion;
                      const basisLabel = stripParentheticalSuffix(detail.basisAccountName || detail.metricName);
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
                    {formattedSelectedPeriod ? ` · ${formattedSelectedPeriod}` : ''}
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
                            <div className={percentageClasses}>{target.percentage.toFixed(2)}% of total</div>
                            {target.isExclusion && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Excluded portion
                              </span>
                            )}
                          </div>
                          <div className={valueClasses}>{formatCurrencyAmount(target.value)}</div>
                        </div>
                        <div className={progressBackground} aria-hidden="true">
                          <div className={progressFill} style={{ width: `${Math.min(target.percentage, 100)}%` }} />
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
                {formattedSelectedPeriod ? ` in ${formattedSelectedPeriod}` : ''} to generate preview amounts.
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

export default DistributionDynamicAllocationRow;
