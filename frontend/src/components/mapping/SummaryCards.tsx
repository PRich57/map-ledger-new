import { useMemo } from 'react';
import {
  getAccountExcludedAmount,
  selectAccounts,
  selectSummaryMetrics,
  useMappingStore,
} from '../../store/mappingStore';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { computeDynamicExclusionSummaries, sumDynamicExclusionAmounts } from '../../utils/dynamicExclusions';
import { formatCurrencyAmount } from '../../utils/currency';

const SummaryCards = () => {
  const accounts = useMappingStore(selectAccounts);
  const { totalAccounts, mappedAccounts, grossTotal, excludedTotal } = useMappingStore(selectSummaryMetrics);
  const { allocations, results, selectedPeriod, basisAccounts, groups } = useRatioAllocationStore(state => ({
    allocations: state.allocations,
    results: state.results,
    selectedPeriod: state.selectedPeriod,
    basisAccounts: state.basisAccounts,
    groups: state.groups,
  }));

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

  const { pendingAllocations, executedRules, totalTargets } = useMemo(() => {
    const needsAllocation = accounts.filter(account => {
      if (account.mappingType === 'direct' || account.mappingType === 'exclude') {
        return false;
      }
      const hasDefinedSplit = account.splitDefinitions.length > 0;
      const hasCalculatedAllocation = allocations.some(
        allocation => allocation.sourceAccount.id === account.id
      );
      return !hasDefinedSplit && !hasCalculatedAllocation;
    }).length;
    const relevantResults = selectedPeriod
      ? results.filter(result => result.periodId === selectedPeriod)
      : [];
    const totalTargetsForPeriod = relevantResults.reduce(
      (sum, result) => sum + result.allocations.length,
      0
    );

    return {
      pendingAllocations: needsAllocation,
      executedRules: relevantResults.length,
      totalTargets: totalTargetsForPeriod,
    };
  }, [accounts, allocations, results, selectedPeriod]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Total GL accounts</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{totalAccounts}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{mappedAccounts} mapped</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Distribution rules</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{allocations.length}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{pendingAllocations} pending setup</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Total balance</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{formatCurrencyAmount(grossTotal)}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Net after exclusions {formatCurrencyAmount(adjustedTotals.net)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Excluded {formatCurrencyAmount(adjustedTotals.excluded)}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Current period allocations</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
          {selectedPeriod ? totalTargets.toLocaleString() : '—'}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {selectedPeriod
            ? `${executedRules} dynamic ${executedRules === 1 ? 'rule' : 'rules'} processed`
            : 'Select a reporting period'}
        </p>
      </div>
    </div>
  );
};

export default SummaryCards;
