import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/Card';
import {
  selectAccounts,
  selectSplitValidationIssues,
  selectSummaryMetrics,
  useMappingStore,
} from '../../store/mappingStore';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';

interface PublishLogEntry {
  id: string;
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
}

const createLogId = () => `log-${Math.random().toString(36).slice(2, 10)}`;

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatCurrencyWithCents = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const ReviewPane = () => {
  const accounts = useMappingStore(selectAccounts);
  const summary = useMappingStore(selectSummaryMetrics);
  const splitIssues = useMappingStore(selectSplitValidationIssues);
  const finalizeMappings = useMappingStore(state => state.finalizeMappings);
  const { selectedPeriod, results, validationErrors, isProcessing, calculateAllocations } =
    useRatioAllocationStore(state => ({
      selectedPeriod: state.selectedPeriod,
      results: state.results,
      validationErrors: state.validationErrors,
      isProcessing: state.isProcessing,
      calculateAllocations: state.calculateAllocations,
    }));

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [publishLog, setPublishLog] = useState<PublishLogEntry[]>([
    {
      id: createLogId(),
      status: 'info',
      message: 'Draft mappings imported for review.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
  ]);

  const mappingWarnings = useMemo(() => {
    if (splitIssues.length === 0) {
      return [] as { accountName: string; message: string }[];
    }
    const accountLookup = new Map(accounts.map(account => [account.id, account]));
    return splitIssues.map(issue => {
      const account = accountLookup.get(issue.accountId);
      return {
        accountName: account ? `${account.accountId} — ${account.accountName}` : issue.accountId,
        message: issue.message,
      };
    });
  }, [accounts, splitIssues]);

  const dynamicWarnings = useMemo(() => {
    const issues = selectedPeriod
      ? validationErrors.filter(issue => issue.periodId === selectedPeriod)
      : validationErrors;
    return issues.map(issue => ({
      accountName: issue.sourceAccountName,
      message: issue.message,
    }));
  }, [selectedPeriod, validationErrors]);

  const warnings = useMemo(
    () => [...mappingWarnings, ...dynamicWarnings],
    [mappingWarnings, dynamicWarnings],
  );

  const periodResults = useMemo(
    () => (selectedPeriod ? results.filter(result => result.periodId === selectedPeriod) : []),
    [results, selectedPeriod]
  );

  const flattenedPeriodResults = useMemo(
    () =>
      periodResults.flatMap(result =>
        result.allocations.map(target => ({
          key: `${result.allocationId}-${target.targetId}`,
          sourceName: result.allocationName,
          targetName: target.targetName,
          basisValue: target.basisValue,
          allocation: target.value,
          percentage: target.percentage,
        }))
      ),
    [periodResults]
  );

  const adjustmentSummaries = useMemo(
    () =>
      periodResults
        .filter(result => result.adjustment && Math.abs(result.adjustment.amount) > 0)
        .map(result => ({
          allocationName: result.allocationName,
          amount: result.adjustment?.amount ?? 0,
        })),
    [periodResults]
  );

  const appendLog = (entry: Omit<PublishLogEntry, 'id' | 'timestamp'> & { timestamp?: string }) => {
    setPublishLog(previous => [
      {
        id: createLogId(),
        timestamp: entry.timestamp ?? new Date().toISOString(),
        status: entry.status,
        message: entry.message,
      },
      ...previous,
    ]);
  };

  const handleRunChecks = async () => {
    if (selectedPeriod) {
      await calculateAllocations(selectedPeriod);
    }
    const ratioState = useRatioAllocationStore.getState();
    const dynamicIssues = selectedPeriod
      ? ratioState.validationErrors.filter(issue => issue.periodId === selectedPeriod)
      : ratioState.validationErrors;
    const hasWarnings = splitIssues.length > 0 || dynamicIssues.length > 0;
    setStatusMessage(
      hasWarnings
        ? 'Checks completed — resolve the warnings below before publishing.'
        : 'Validation checks passed. You can publish your mappings.',
    );
    appendLog({
      status: hasWarnings ? 'warning' : 'success',
      message: hasWarnings
        ? 'Validation run flagged outstanding allocation warnings.'
        : 'Validation run completed without warnings.',
    });
  };

  const handlePublish = () => {
    if (warnings.length > 0) {
      setStatusMessage('Publishing blocked. Fix allocation warnings first.');
      appendLog({ status: 'error', message: 'Publish blocked because validation warnings are outstanding.' });
      return;
    }
    const success = finalizeMappings([]);
    setStatusMessage(success ? 'Mappings published successfully.' : 'Publishing failed due to validation issues.');
    appendLog({
      status: success ? 'success' : 'error',
      message: success ? 'Mappings published to the reporting environment.' : 'Publishing failed validation checks.',
    });
  };

  const kpis: { label: string; value: string; helper?: string }[] = [
    { label: 'Total GL accounts', value: summary.totalAccounts.toLocaleString() },
    {
      label: 'Mapped accounts',
      value: summary.mappedAccounts.toLocaleString(),
      helper: `${Math.round((summary.mappedAccounts / Math.max(summary.totalAccounts, 1)) * 100)}% coverage`,
    },
    { label: 'Gross balance', value: formatCurrency(summary.grossTotal) },
    {
      label: 'Net after exclusions',
      value: formatCurrency(summary.netTotal),
      helper: `Excluded ${formatCurrency(summary.excludedTotal)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review readiness</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Confirm allocations, resolve outstanding warnings, and publish your mappings to the reporting environment.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map(kpi => (
              <div
                key={kpi.label}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{kpi.label}</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{kpi.value}</div>
                {kpi.helper && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{kpi.helper}</div>
                )}
              </div>
            ))}
          </div>
          {statusMessage && (
            <div
              className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-100"
              role="status"
            >
              {statusMessage}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {selectedPeriod ? `Previewing allocations for ${selectedPeriod}.` : 'Choose a reporting period to run allocation checks.'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRunChecks}
                className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Run checks
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={warnings.length > 0}
                className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                  warnings.length > 0
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500 focus-visible:ring-0 dark:bg-slate-800 dark:text-slate-500'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400'
                }`}
              >
                Publish mappings
              </button>
            </div>
          </div>
        </CardFooter>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Warnings</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Resolve these issues before publishing to ensure accurate allocations.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                {warnings.length} open
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {warnings.length === 0 ? (
              <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                No outstanding warnings.
              </div>
            ) : (
              <ul className="space-y-3" aria-live="polite">
                {warnings.map(warning => (
                  <li
                    key={`${warning.accountName}-${warning.message}`}
                    className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <div>
                      <div className="font-medium">{warning.accountName}</div>
                      <div className="text-xs text-rose-700 dark:text-rose-200">{warning.message}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <History className="h-4 w-4" aria-hidden="true" />
              Publish log
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track every review check and publishing action for this mapping batch.
            </p>
          </CardHeader>
          <CardContent>
            {publishLog.length === 0 ? (
              <p className="text-sm text-gray-500">No publishing activity recorded yet.</p>
            ) : (
              <ul className="space-y-3" aria-live="polite">
                {publishLog.map(entry => (
                  <li key={entry.id} className="rounded-md border border-gray-200 px-3 py-3 text-sm dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{entry.message}</span>
                      <span
                        className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          entry.status === 'success'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                            : entry.status === 'warning'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'
                                : entry.status === 'error'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'
                                    : 'bg-gray-100 text-gray-700 dark:bg-slate-700/60 dark:text-gray-200'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock3 className="h-3 w-3" aria-hidden="true" />
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Allocation preview</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review allocation output for the selected reporting period before final publish.
          </p>
        </CardHeader>
        <CardContent>
          {!selectedPeriod ? (
            <p className="text-sm text-gray-500">Select a reporting period to preview calculated allocations.</p>
          ) : flattenedPeriodResults.length === 0 ? (
            <p className="text-sm text-gray-500">No allocation results generated yet for {selectedPeriod}.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                  <thead className="bg-gray-50 text-left dark:bg-slate-800">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium text-gray-500 dark:text-gray-300">
                        Source allocation
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-gray-500 dark:text-gray-300">
                        Target datapoint
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-gray-500 dark:text-gray-300">
                        Basis value
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-gray-500 dark:text-gray-300">
                        Allocated amount
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-gray-500 dark:text-gray-300">
                        Percentage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                    {flattenedPeriodResults.map(row => (
                      <tr key={row.key}>
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.sourceName}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.targetName}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{formatCurrency(row.basisValue)}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{formatCurrencyWithCents(row.allocation)}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.percentage.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {adjustmentSummaries.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {adjustmentSummaries.map(summary => (
                    <li key={summary.allocationName}>
                      {summary.allocationName} adjusted by {formatCurrencyWithCents(summary.amount)} to balance rounding.
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReviewPane;
