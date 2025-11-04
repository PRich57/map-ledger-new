import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { GLAccountMappingRow, TargetScoaOption } from '../../types';

interface BuildDatapointModalProps {
  open: boolean;
  selectedAccounts: GLAccountMappingRow[];
  targetOptions: TargetScoaOption[];
  onClose: () => void;
  onCreate: (payload: { name: string; targetId: string | null }) => void;
}

export default function BuildDatapointModal({
  open,
  selectedAccounts,
  targetOptions,
  onClose,
  onCreate,
}: BuildDatapointModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setTargetId('');
    }
  }, [open]);

  const sortedAccounts = useMemo(
    () =>
      [...selectedAccounts].sort((a, b) => {
        if (a.accountId === b.accountId) {
          return a.accountName.localeCompare(b.accountName);
        }
        return a.accountId.localeCompare(b.accountId);
      }),
    [selectedAccounts],
  );

  const initialTargetId = useMemo(() => {
    if (!selectedAccounts.length) {
      return '';
    }
    const resolvedTargets = selectedAccounts.map(account =>
      account.manualCOAId ?? account.suggestedCOAId ?? '',
    );
    const [firstTarget] = resolvedTargets;
    if (!firstTarget) {
      return '';
    }
    const allMatch = resolvedTargets.every(target => target === firstTarget);
    if (!allMatch) {
      return '';
    }
    const isKnownOption = targetOptions.some(option => option.value === firstTarget);
    return isKnownOption ? firstTarget : '';
  }, [selectedAccounts, targetOptions]);

  useEffect(() => {
    if (open) {
      setTargetId(initialTargetId);
    }
  }, [open, initialTargetId]);

  const requiresTargetSelection = targetOptions.length > 0;

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a datapoint name.');
      return;
    }
    if (requiresTargetSelection && !targetId) {
      setError('Select a target SCoA account.');
      return;
    }
    onCreate({ name: trimmed, targetId: targetId || null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="build-datapoint-title"
        className="w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2
                id="build-datapoint-title"
                className="text-lg font-semibold text-slate-900 dark:text-slate-100"
              >
                Build datapoint from selection
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {sortedAccounts.length === 1
                  ? 'Create a datapoint from the selected account.'
                  : `Create a datapoint from ${sortedAccounts.length} selected accounts.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:text-slate-100 dark:focus:ring-offset-slate-900"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Datapoint name
              <input
                value={name}
                onChange={event => {
                  setName(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                placeholder="e.g. Fuel operations basis"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Target SCoA account
              <select
                value={targetId}
                onChange={event => {
                  setTargetId(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                disabled={targetOptions.length === 0}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 disabled:dark:bg-slate-800"
              >
                <option value="">{requiresTargetSelection ? 'Select a target account' : 'No target accounts available'}</option>
                {targetOptions.map(option => (
                  <option key={option.id} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {targetOptions.length === 0 && (
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  Add SCoA accounts to the template to enable target selection.
                </span>
              )}
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Selected source accounts
            </h3>
            <ul className="mt-2 space-y-1">
              {sortedAccounts.map(account => (
                <li key={account.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 shadow-sm dark:bg-slate-800">
                  <span className="text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">{account.accountId}</span>
                    <span className="mx-2 text-slate-400">•</span>
                    {account.accountName}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{account.companyName}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
            >
              Close
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              Save datapoint
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

