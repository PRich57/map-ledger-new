import { FormEvent, useEffect, useState } from 'react';
import { PRESET_OPTIONS } from './presets';

interface PresetModalProps {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (presetId: string) => void;
}

export default function PresetModal({ open, selectedCount, onClose, onApply }: PresetModalProps) {
  const [presetId, setPresetId] = useState<string>(PRESET_OPTIONS[0]?.value ?? '');

  useEffect(() => {
    if (open) {
      setPresetId(PRESET_OPTIONS[0]?.value ?? '');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(presetId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-modal-title"
        className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <h2 id="preset-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Apply preset
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Apply a saved preset to {selectedCount} row{selectedCount === 1 ? '' : 's'}.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Preset
            <select
              value={presetId}
              onChange={event => setPresetId(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              {PRESET_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-offset-slate-900"
            >
              Apply preset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
