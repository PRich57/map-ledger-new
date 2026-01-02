import { useEffect, useMemo, useRef } from 'react';
import {
  getAccountExcludedAmount,
  selectAccounts,
  selectActiveEntityId,
  selectDistributionTargets,
  selectSummaryMetrics,
  useMappingStore,
} from '../../store/mappingStore';
import { useDistributionStore } from '../../store/distributionStore';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { computeDynamicExclusionSummaries, sumDynamicExclusionAmounts } from '../../utils/dynamicExclusions';
import { formatCurrencyAmount } from '../../utils/currency';

const SummaryCards = () => {
  const accounts = useMappingStore(selectAccounts);
  const { totalAccounts, mappedAccounts, grossTotal, excludedTotal } = useMappingStore(selectSummaryMetrics);
  const distributionTargets = useMappingStore(selectDistributionTargets);
  const activeEntityId = useMappingStore(selectActiveEntityId);
  const { allocations, results, selectedPeriod, basisAccounts, groups } = useRatioAllocationStore(state => ({
    allocations: state.allocations,
    results: state.results,
    selectedPeriod: state.selectedPeriod,
    basisAccounts: state.basisAccounts,
    groups: state.groups,
  }));
  const {
    rows: distributionRows,
    syncRowsFromStandardTargets,
    loadHistoryForEntity,
    historyEntityId,
  } = useDistributionStore(state => ({
    rows: state.rows,
    syncRowsFromStandardTargets: state.syncRowsFromStandardTargets,
    loadHistoryForEntity: state.loadHistoryForEntity,
    historyEntityId: state.historyEntityId,
  }));

  const scoaSummarySignature = useMemo(
    () => distributionTargets.map(summary => `${summary.id}:${summary.mappedAmount}`).join('|'),
    [distributionTargets],
  );
  const previousScoaSignature = useRef<string | null>(null);

  useEffect(() => {
    if (scoaSummarySignature === previousScoaSignature.current) {
      return;
    }
    previousScoaSignature.current = scoaSummarySignature;
    syncRowsFromStandardTargets(distributionTargets);
  }, [distributionTargets, scoaSummarySignature, syncRowsFromStandardTargets]);

  useEffect(() => {
    if (!activeEntityId) {
      void loadHistoryForEntity(null);
      return;
    }
    if (historyEntityId === activeEntityId) {
      return;
    }
    void loadHistoryForEntity(activeEntityId);
  }, [activeEntityId, historyEntityId, loadHistoryForEntity]);

  const dynamicExclusionSummaries = useMemo(
    () =>
      computeDynamicExclusionSummaries({
        accounts,
        allocations,
        basisAccounts,
        groups,
        selectedPeriod,
        results,
      }),
    [accounts, allocations, basisAccounts, groups, results, selectedPeriod],
  );

  const adjustedTotals = useMemo(() => {
    const dynamicOverrideTotal = sumDynamicExclusionAmounts(dynamicExclusionSummaries);
    const baselineDynamicExcluded = accounts
      .filter(account => account.mappingType === 'dynamic')
      .reduce((sum, account) => sum + getAccountExcludedAmount(account), 0);
    const normalizedExcludedTotal = excludedTotal - baselineDynamicExcluded + dynamicOverrideTotal;
    const normalizedNetTotal = grossTotal - normalizedExcludedTotal;
    return {
      excluded: normalizedExcludedTotal,
      net: normalizedNetTotal,
    };
  }, [accounts, dynamicExclusionSummaries, excludedTotal, grossTotal]);

  const mappedCoverage = Math.round((mappedAccounts / Math.max(totalAccounts, 1)) * 100);

  const { distributedAccounts, distributionCoverage } = useMemo(() => {
    const rowsWithActivity = distributionRows.filter(row => Math.abs(row.activity) > 0);
    const distributedCount = rowsWithActivity.filter(row => row.status === 'Distributed').length;
    const coverage = Math.round((distributedCount / Math.max(rowsWithActivity.length, 1)) * 100);

    return {
      distributedAccounts: distributedCount,
      distributionCoverage: coverage,
    };
  }, [distributionRows]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Total GL accounts</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{totalAccounts}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{mappedAccounts} mapped</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Mapped accounts</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
          {mappedAccounts.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {`${mappedCoverage}% coverage`}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Total balance</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
          {formatCurrencyAmount(grossTotal)}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Net after exclusions {formatCurrencyAmount(adjustedTotals.net)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Excluded {formatCurrencyAmount(adjustedTotals.excluded)}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Distributed SCOA accounts</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
          {distributedAccounts.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {`${distributionCoverage}% coverage`}
        </p>
      </div>
    </div>
  );
};

export default SummaryCards;
