import { FormEvent, useEffect, useState } from 'react';
import type {
  DistributionOperationShare,
  DistributionType,
} from '../../types';
import type { DistributionOperationCatalogItem } from '../../store/distributionStore';
import { getOperationLabel } from '../../utils/operationLabel';

interface DistributionBatchModalProps {
  open: boolean;
  selectedCount: number;
  operations: DistributionOperationCatalogItem[];
  onClose: () => void;
  onApply: (updates: {
    type?: DistributionType;
    operation?: DistributionOperationShare | null;
  }) => void;
}

const typeOptions: { value: DistributionType | ''; label: string }[] = [
  { value: '', label: 'Leave unchanged' },
  { value: 'direct', label: 'Direct' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'dynamic', label: 'Dynamic' },
];

const operationPlaceholderOptions = [
  { value: '', label: 'Keep current operation' },
  { value: '__clear__', label: 'Clear operation' },
];

const optionLabel = (operation: DistributionOperationCatalogItem) => getOperationLabel(operation);

export default function DistributionBatchModal({
  open,
  selectedCount,
  operations,
  onClose,
  onApply,
}: DistributionBatchModalProps) {
  const [typeSelection, setTypeSelection] = useState<DistributionType | ''>('');
  const [operationSelection, setOperationSelection] = useState<string>('');

  useEffect(() => {
    if (open) {
      setTypeSelection('');
      setOperationSelection('');
    }
  }, [open]);

  const isApplyDisabled =
    !typeSelection && operationSelection === '';

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const updates: {
      type?: DistributionType;
      operation?: DistributionOperationShare | null;
    } = {};
    if (typeSelection) {
      updates.type = typeSelection;
    }
    if (operationSelection && operationSelection !== '__clear__') {
      const selectedOperation = operations.find(
        option => option.id === operationSelection,
      );
      if (selectedOperation) {
        updates.operation = {
          id: selectedOperation.id,
          name: selectedOperation.name,
        };
      }
    } else if (operationSelection === '__clear__') {
      updates.operation = null;
    }

    onApply(updates);
  };

  const renderOperationSelect = () => {
    const disabled = !typeSelection || typeSelection !== 'direct';
    return (
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        Target operation
        <select
          value={operationSelection}
          onChange={event => setOperationSelection(event.target.value)}
          disabled={disabled}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-700"
        >
          {operationPlaceholderOptions.map(option => (
            <option key={option.value || 'keep'} value={option.value}>
              {option.label}
            </option>
          ))}
          {operations.map(operation => (
            <option key={operation.id} value={operation.id}>
              {optionLabel(operation)}
            </option>
          ))}
        </select>
        {disabled && (
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            Choose the Direct type to assign a target operation.
          </span>
        )}
        {!disabled && operations.length === 0 && (
          <span className="text-xs font-normal text-amber-600 dark:text-amber-300">
            No operations are available for this client.
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="distribution-batch-modal-title"
        className="w-full max-w-xl rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2
                id="distribution-batch-modal-title"
                className="text-lg font-semibold text-slate-900 dark:text-slate-100"
              >
                Batch distribution updates
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Apply updates to {selectedCount} selected row
                {selectedCount === 1 ? '' : 's'} at once.
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Distribution type
              <select
                value={typeSelection}
                onChange={event => {
                  setTypeSelection(event.target.value as DistributionType | '');
                  if (event.target.value !== 'direct') {
                    setOperationSelection('');
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {typeOptions.map(option => (
                  <option key={option.value || 'unchanged'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {renderOperationSelect()}
          </div>

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
              disabled={isApplyDisabled}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-offset-slate-900"
            >
              Apply updates
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
