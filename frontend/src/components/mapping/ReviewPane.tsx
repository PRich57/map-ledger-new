import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Download, History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { selectAccounts, selectSplitValidationIssues, useMappingStore } from '../../store/mappingStore';
import {
  type DistributionOperationCatalogItem,
  useDistributionStore,
} from '../../store/distributionStore';
import type { DistributionOperationShare, DistributionRow } from '../../types';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { useClientStore } from '../../store/clientStore';
import { formatCurrencyAmount } from '../../utils/currency';
import { getDistributedActivityForShare } from '../../utils/distributionActivity';
import {
  buildOperationScoaActivitySheets,
  exportOperationScoaWorkbook,
} from '../../utils/exportScoaActivity';
import { formatPeriodDate } from '../../utils/period';

interface PublishLogEntry {
  id: string;
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
}

const createLogId = () => `log-${Math.random().toString(36).slice(2, 10)}`;

const normalizeOperationKey = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.toUpperCase() : '';
};

const formatDistributionTypeLabel = (value: DistributionRow['type']) => {
  if (!value) {
    return '';
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const formatAllocationShare = (row: DistributionRow, share: DistributionOperationShare) => {
  if (typeof share.allocation === 'number') {
    return `${share.allocation}%`;
  }
  if (row.type === 'direct') {
    return '100%';
  }
  if (row.type === 'dynamic') {
    return 'Variable';
  }
  return 'N/A';
};

type OperationReviewItem = {
  row: DistributionRow;
  share: DistributionOperationShare;
};

interface OperationReviewEntry {
  operation: DistributionOperationCatalogItem;
  items: OperationReviewItem[];
}

const ReviewPane = () => {
  const accounts = useMappingStore(selectAccounts);
  const splitIssues = useMappingStore(selectSplitValidationIssues);
  const finalizeMappings = useMappingStore(state => state.finalizeMappings);
  const { selectedPeriod, validationErrors, isProcessing, calculateAllocations } =
    useRatioAllocationStore(state => ({
      selectedPeriod: state.selectedPeriod,
      validationErrors: state.validationErrors,
      isProcessing: state.isProcessing,
      calculateAllocations: state.calculateAllocations,
    }));
  const selectedPeriodLabel =
    selectedPeriod ? formatPeriodDate(selectedPeriod) || selectedPeriod : null;

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
        accountName: account ? `${account.accountId} - ${account.accountName}` : issue.accountId,
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

  const activeClientId = useClientStore(state => state.activeClientId);
  const companies = useOrganizationStore(state => state.companies);
  const distributionRows = useDistributionStore(state => state.rows);

  const distributedRows = useMemo(
    () => distributionRows.filter(row => row.status === 'Distributed'),
    [distributionRows],
  );

  const clientOperations = useMemo<DistributionOperationCatalogItem[]>(() => {
    const map = new Map<string, DistributionOperationCatalogItem>();
    companies.forEach(company => {
      company.clients.forEach(client => {
        if (activeClientId && client.id !== activeClientId) {
          return;
        }
        client.operations.forEach(operation => {
          const key = normalizeOperationKey(operation.code ?? operation.id);
          if (!key) {
            return;
          }
          if (map.has(key)) {
            return;
          }
          const code = (operation.code || operation.id || '').trim();
          const name = operation.name?.trim() || code || key;
          map.set(key, {
            id: code || key,
            code: code || key,
            name,
          });
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [companies, activeClientId]);

  const operationReviewEntries = useMemo<OperationReviewEntry[]>(() => {
    const entries = new Map<string, OperationReviewEntry>();
    clientOperations.forEach(operation => {
      const key = normalizeOperationKey(operation.code ?? operation.id);
      if (!key) {
        return;
      }
      entries.set(key, { operation, items: [] });
    });

    distributedRows.forEach(row => {
      row.operations.forEach(share => {
        const key = normalizeOperationKey(share.code ?? share.id ?? share.name);
        if (!key) {
          return;
        }
        let entry = entries.get(key);
        if (!entry) {
          const code = share.code?.trim() || share.id?.trim() || share.name?.trim() || key;
          const name = share.name?.trim() || code || key;
          entry = {
            operation: { id: share.id || code, code, name },
            items: [],
          };
          entries.set(key, entry);
        }
        entry.items.push({ row, share });
      });
    });

    const sortedEntries = Array.from(entries.values()).sort((a, b) =>
      a.operation.code.localeCompare(b.operation.code),
    );
    sortedEntries.forEach(entry => {
      entry.items.sort((a, b) => a.row.accountId.localeCompare(b.row.accountId));
    });
    return sortedEntries;
  }, [clientOperations, distributedRows]);

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

  const [isExporting, setIsExporting] = useState(false);

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
        ? 'Checks completed - resolve the warnings below before publishing.'
        : 'Validation checks passed. You can publish your mappings.',
    );
    appendLog({
      status: hasWarnings ? 'warning' : 'success',
      message: hasWarnings
        ? 'Validation run flagged outstanding allocation warnings.'
        : 'Validation run completed without warnings.',
    });
  };

  const handleExportScoaActivity = async () => {
    setIsExporting(true);
    try {
      const sheets = buildOperationScoaActivitySheets(accounts, distributionRows);
      if (!sheets.length) {
        setStatusMessage('No SCoA activity is available for export.');
        return;
      }
      await exportOperationScoaWorkbook(sheets);
      appendLog({ status: 'info', message: 'SCoA activity export downloaded.' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to export SCoA activity.';
      setStatusMessage(message);
      appendLog({ status: 'error', message: 'Failed to export SCoA activity.' });
    } finally {
      setIsExporting(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {statusMessage && (
          <div
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-100"
            role="status"
          >
            {statusMessage}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {selectedPeriodLabel
                ? `Previewing allocations for ${selectedPeriodLabel}.`
                : 'Choose a reporting period to run allocation checks.'}
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
              onClick={handleExportScoaActivity}
              disabled={isExporting}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Download SCoA export
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
      </div>

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

      {operationReviewEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
          No operations are configured for the selected client yet. Choose a client with defined operations to review distributed activity.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Only distributions that reached the <span className="font-semibold text-slate-900 dark:text-white">Distributed</span> status appear below. Each table represents an operation assigned to the active client.
          </div>
          <div className="space-y-6">
            {operationReviewEntries.map(entry => {
              const totalActivity = entry.items.reduce(
                (sum, { row, share }) => sum + getDistributedActivityForShare(row, share),
                0,
              );
              return (
                <Card key={entry.operation.code}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Operation {entry.operation.code}
                        <span className="ml-3 text-xs font-normal text-slate-500 dark:text-slate-400">
                          {formatCurrencyAmount(totalActivity)} total mapped activity
                        </span>
                      </h3>
                      {entry.operation.name && entry.operation.name !== entry.operation.code && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{entry.operation.name}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                      <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Account</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Activity</th>
                          <th className="px-3 py-2 text-left">Distribution</th>
                          <th className="px-3 py-2 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {entry.items.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-300"
                            >
                              No distributed activity has been mapped to this operation yet.
                            </td>
                          </tr>
                        ) : (
                          entry.items.map(({ row, share }) => {
                            const allocatedAmount = getDistributedActivityForShare(row, share);
                            return (
                              <tr
                                key={`${row.id}-${share.id ?? share.code ?? share.name ?? entry.operation.code}`}
                                className="bg-white text-slate-900 odd:bg-slate-50 even:bg-white dark:bg-slate-900 dark:text-slate-100 dark:odd:bg-slate-900/70 dark:even:bg-slate-900/55"
                              >
                                <td className="max-w-[8rem] truncate px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                                  {row.accountId}
                                </td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.description}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-200">
                                  {formatCurrencyAmount(allocatedAmount)}
                                </td>
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                  {formatDistributionTypeLabel(row.type)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">
                                  {formatAllocationShare(row, share)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewPane;
