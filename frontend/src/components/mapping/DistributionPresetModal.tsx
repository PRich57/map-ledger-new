import { FormEvent, useEffect, useState } from 'react';
import type { RatioPresetSummary } from '../../store/ratioAllocationStore';

interface DistributionPresetModalProps {
  open: boolean;
  selectedCount: number;
  presetOptions: RatioPresetSummary[];
  onClose: () => void;
  onApply: (presetId: string | null) => void;
}

export default function DistributionPresetModal({
  open,
  selectedCount,
  presetOptions,
  onClose,
  onApply,
}: DistributionPresetModalProps) {
  const [presetSelection, setPresetSelection] = useState<string>('');

  useEffect(() => {
    if (open) {
      setPresetSelection('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const isApplyDisabled = presetSelection === '';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (presetSelection === '__clear__') {
      onApply(null);
      return;
    }
    onApply(presetSelection);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="distribution-preset-modal-title"
        className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <h2
              id="distribution-preset-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Apply preset in bulk
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Apply or clear a preset on {selectedCount} selected row
              {selectedCount === 1 ? '' : 's'}.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Preset action
            <select
              value={presetSelection}
              onChange={event => setPresetSelection(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Choose an action</option>
              <option value="__clear__">Clear preset</option>
              {presetOptions.length === 0 ? (
                <option value="__no-presets" disabled>
                  No presets available
                </option>
              ) : (
                presetOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))
              )}
            </select>
            {presetOptions.length === 0 && (
              <span className="text-xs font-normal text-amber-600 dark:text-amber-300">
                Import presets to enable this action.
              </span>
            )}
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={
                isApplyDisabled ||
                (presetOptions.length === 0 && presetSelection !== '__clear__') ||
                presetSelection === '__no-presets'
              }
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-offset-slate-900"
            >
              Apply preset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
