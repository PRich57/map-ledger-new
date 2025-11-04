interface BatchExcludeProps {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export default function BatchExclude({ open, selectedCount, onClose, onConfirm }: BatchExcludeProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-exclude-title"
        className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="batch-exclude-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Exclude selected rows
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Mark {selectedCount} row{selectedCount === 1 ? '' : 's'} as excluded. This will remove any existing allocations.
            </p>
          </div>
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Excluded rows will be omitted from summary totals and reporting exports. You can revert this action from the status
            menu later if needed.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:bg-rose-500 dark:hover:bg-rose-400 dark:focus:ring-offset-slate-900"
            >
              Exclude rows
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
