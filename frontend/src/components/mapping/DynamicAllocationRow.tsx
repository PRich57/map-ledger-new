import { useMemo } from 'react';
import { AlertTriangle, Calculator, Layers, XCircle } from 'lucide-react';
import type { GLAccountMappingRow } from '../../types';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import {
  allocateDynamic,
  getGroupMembersWithValues,
  getGroupTotal,
  getSourceValue,
} from '../../utils/dynamicAllocation';

interface DynamicAllocationRowProps {
  account: GLAccountMappingRow;
  colSpan: number;
  panelId: string;
  onOpenBuilder: () => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const basisFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const pluralize = (value: number, noun: string) =>
  `${value} ${noun}${value === 1 ? '' : 's'}`;

const DynamicAllocationRow = ({
  account,
  colSpan,
  panelId,
  onOpenBuilder,
}: DynamicAllocationRowProps) => {
  const {
    allocations,
    groups,
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
    groups: state.groups,
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

  const targetSummaries = useMemo(() => {
    if (!allocation) {
      return [] as {
        id: string;
        groupId: string | null;
        name: string;
        metricName: string;
        basisTotal: number;
        memberValues: ReturnType<typeof getGroupMembersWithValues>;
        isExclusion: boolean;
        presetName?: string;
      }[];
    }

    return allocation.targetDatapoints.map(target => {
      const isExclusion = Boolean(target.isExclusion);
      const group = target.groupId
        ? groups.find(item => item.id === target.groupId)
        : undefined;
      const memberValues = group
        ? getGroupMembersWithValues(group, basisAccounts, selectedPeriod)
        : [];
      const basisTotal = group
        ? getGroupTotal(group, basisAccounts, selectedPeriod)
        : target.ratioMetric.value;
      return {
        id: target.datapointId,
        groupId: target.groupId ?? null,
        name: target.name,
        metricName: target.ratioMetric.name,
        basisTotal,
        memberValues,
        isExclusion,
        presetName: group?.name,
      };
    });
  }, [allocation, basisAccounts, groups, selectedPeriod]);

  const basisTotal = useMemo(
    () => targetSummaries.reduce((sum, summary) => sum + summary.basisTotal, 0),
    [targetSummaries],
  );

  const totalMemberCount = useMemo(
    () => targetSummaries.reduce((sum, summary) => sum + summary.memberValues.length, 0),
    [targetSummaries],
  );

  const summaryWithRatios = useMemo(
    () =>
      targetSummaries.map(summary => ({
        ...summary,
        ratio: basisTotal > 0 ? summary.basisTotal / basisTotal : 0,
      })),
    [basisTotal, targetSummaries],
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

    if (!allocation || targetSummaries.length === 0 || basisTotal <= 0) {
      return null;
    }

    try {
      const computation = allocateDynamic(
        sourceValue,
        targetSummaries.map(summary => summary.basisTotal),
      );

      const allocations = targetSummaries.map((summary, index) => {
        const ratio = basisTotal > 0 ? summary.basisTotal / basisTotal : 0;
        return {
          targetId: summary.id,
          targetName: summary.name,
          value: computation.allocations[index] ?? 0,
          percentage: ratio * 100,
          isExclusion: summary.isExclusion,
        };
      });

      const adjustment =
        computation.adjustmentIndex !== null
          ? {
              amount: computation.adjustmentAmount,
              targetName:
                targetSummaries[computation.adjustmentIndex]?.name ?? null,
            }
          : null;

      return { allocations, adjustment } as const;
    } catch (error) {
      console.warn('Failed to derive preview for dynamic allocation row', error);
      return null;
    }
  }, [
    allocation,
    basisTotal,
    periodResult,
    sourceValue,
    targetSummaries,
  ]);

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
    <tr>
      <td
        id={panelId}
        colSpan={colSpan}
        className="bg-slate-50 px-4 py-4 dark:bg-slate-800/40"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
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
                  {presets.map(preset => (
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
                {currencyFormatter.format(sourceValue)}
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
                {basisFormatter.format(basisTotal)}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {pluralize(targetSummaries.length, 'target')} · {pluralize(totalMemberCount, 'preset account')}
              </div>
            </div>
          </div>

          {!allocation ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              No presets are configured yet. Launch the builder to choose presets and targets for this account.
            </p>
          ) : targetSummaries.length === 0 ? (
            <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              Add presets in the builder to establish allocation ratios for this account.
            </p>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Preset accounts</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Review how each preset account contributes to the overall ratio.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  {basisFormatter.format(basisTotal)} total basis value
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {summaryWithRatios.map(summary => {
                  const isExclusion = summary.isExclusion;
                  const articleClasses = `flex flex-col gap-3 rounded-lg p-4 text-sm shadow-sm transition ${
                    isExclusion
                      ? 'border border-rose-200 bg-rose-50/80 text-rose-900 hover:border-rose-300 hover:shadow-md dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
                      : 'border border-slate-200 bg-slate-50/70 text-slate-700 hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200'
                  }`;
                  const titleClasses = isExclusion
                    ? 'text-base font-semibold text-rose-900 dark:text-rose-100'
                    : 'text-base font-semibold text-slate-900 dark:text-slate-100';
                  const percentageClasses = isExclusion
                    ? 'text-lg font-semibold text-rose-600 dark:text-rose-300'
                    : 'text-lg font-semibold text-blue-700 dark:text-blue-300';
                  const basisValueClasses = isExclusion
                    ? 'mt-1 text-sm font-medium text-rose-700 dark:text-rose-200'
                    : 'mt-1 text-sm font-medium text-slate-900 dark:text-slate-200';
                  const progressClasses = isExclusion
                    ? 'h-2 rounded-full bg-rose-500 transition-all dark:bg-rose-400'
                    : 'h-2 rounded-full bg-blue-500 transition-all dark:bg-blue-400';
                  const memberValueClasses = isExclusion
                    ? 'font-medium text-rose-700 tabular-nums dark:text-rose-200'
                    : 'font-medium text-slate-700 tabular-nums dark:text-slate-200';
                  const summaryKey = summary.groupId ? `${summary.id}-${summary.groupId}` : summary.id;
                  const allocationId = allocation?.id ?? null;

                  return (
                    <article key={summaryKey} className={articleClasses}>
                      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h5 className={titleClasses}>{summary.name}</h5>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {summary.presetName ? `Preset: ${summary.presetName}` : `Metric: ${summary.metricName}`}
                          </p>
                          {isExclusion && (
                            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Excluded portion
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right">
                          <div>
                            <span className="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Share of total
                            </span>
                            <span className={percentageClasses}>
                              {(summary.ratio * 100).toFixed(1)}%
                            </span>
                          </div>
                          {allocationId && (
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                                checked={isExclusion}
                                onChange={() =>
                                  toggleTargetExclusion(allocationId, summary.id, summary.groupId ?? undefined)
                                }
                              />
                              {isExclusion ? 'Excluded from mapping' : 'Exclude from mapping'}
                            </label>
                          )}
                        </div>
                      </header>
                      <dl className="grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <div>
                          <dt className="uppercase tracking-wide">Basis total</dt>
                          <dd className={basisValueClasses}>
                            {basisFormatter.format(summary.basisTotal)}
                          </dd>
                        </div>
                        <div>
                          <dt className="uppercase tracking-wide">Accounts</dt>
                          <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-200">
                            {pluralize(summary.memberValues.length, 'account')}
                          </dd>
                        </div>
                      </dl>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={progressClasses}
                          style={{ width: `${Math.min(summary.ratio * 100, 100)}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      {summary.memberValues.length > 0 && (
                        <ul className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200 bg-white text-xs text-slate-600 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                          {summary.memberValues.map((member, memberIdx) => {
                            const group = summary.groupId ? groups.find(g => g.id === summary.groupId) : null;
                            const groupMember = group?.members.find(gm => gm.accountId === member.accountId);
                            return (
                              <li
                                key={member.accountId}
                                className="flex flex-col gap-1 px-3 py-2"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="flex-1 truncate font-medium" title={member.accountName}>
                                    {member.accountName}
                                  </span>
                                  <span className={memberValueClasses}>
                                    {basisFormatter.format(member.value)}
                                  </span>
                                </div>
                                {groupMember?.targetName && (
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                                    <span>→</span>
                                    <span className="truncate" title={groupMember.targetName}>
                                      Maps to: {groupMember.targetName}
                                    </span>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </article>
                  );
                })}
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
                    Total distributes {currencyFormatter.format(sourceValue)} across {computedPreview.allocations.length} targets.
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
                            {currencyFormatter.format(target.value)}
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
                      Includes a {currencyFormatter.format(computedPreview.adjustment.amount)} rounding adjustment applied to {computedPreview.adjustment.targetName}.
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

