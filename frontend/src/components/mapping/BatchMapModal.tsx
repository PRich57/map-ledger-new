import { FormEvent, useEffect, useState } from 'react';
import type { MappingPolarity, MappingStatus, MappingType, TargetScoaOption } from '../../types';
import { selectPresetSummaries, useRatioAllocationStore } from '../../store/ratioAllocationStore';

interface BatchMapModalProps {
  open: boolean;
  targetOptions: TargetScoaOption[];
  selectedCount: number;
  onClose: () => void;
  onApply: (updates: {
    target?: string | null;
    mappingType?: MappingType;
    presetId?: string | null;
    polarity?: MappingPolarity;
    status?: MappingStatus;
  }) => void;
}

const mappingTypeOptions: { value: MappingType | ''; label: string }[] = [
  { value: '', label: 'Leave unchanged' },
  { value: 'direct', label: 'Direct' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'exclude', label: 'Exclude' },
];

const statusOptions: { value: MappingStatus | ''; label: string }[] = [
  { value: '', label: 'Leave unchanged' },
  { value: 'New', label: 'New' },
  { value: 'Unmapped', label: 'Unmapped' },
  { value: 'Mapped', label: 'Mapped' },
  { value: 'Excluded', label: 'Excluded' },
];

const polarityOptions: (MappingPolarity | '')[] = ['', 'Debit', 'Credit', 'Absolute'];

export default function BatchMapModal({
  open,
  targetOptions,
  selectedCount,
  onClose,
  onApply,
}: BatchMapModalProps) {
  const [target, setTarget] = useState<string>('');
  const [mappingType, setMappingType] = useState<MappingType | ''>('');
  const [presetId, setPresetId] = useState<string>('');
  const [polarity, setPolarity] = useState<MappingPolarity | ''>('');
  const [status, setStatus] = useState<MappingStatus | ''>('');
  const presetOptions = useRatioAllocationStore(selectPresetSummaries);

  useEffect(() => {
    if (open) {
      setTarget('');
      setMappingType('');
      setPresetId('');
      setPolarity('');
      setStatus('');
    }
  }, [open]);

  useEffect(() => {
    if (mappingType === 'exclude') {
      setStatus('Excluded');
    } else if (status === 'Excluded') {
      setStatus('');
    }
  }, [mappingType, status]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const updates: {
      target?: string | null;
      mappingType?: MappingType;
      presetId?: string | null;
      polarity?: MappingPolarity;
      status?: MappingStatus;
    } = {};
    if (target) {
      updates.target = target;
    }
    if (mappingType) {
      updates.mappingType = mappingType;
    }
    if (presetId) {
      updates.presetId = presetId;
    }
    if (polarity) {
      updates.polarity = polarity;
    }
    if (status) {
      updates.status = status;
    }
    onApply(updates);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-map-title"
        className="w-full max-w-xl rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 id="batch-map-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Batch map selected rows
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Apply mapping updates to {selectedCount} selected row{selectedCount === 1 ? '' : 's'}.
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
              Target SCoA
              <select
                value={target}
                onChange={event => setTarget(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Leave unchanged</option>
                {targetOptions.map(option => (
                  <option key={option.id} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Mapping type
              <select
                value={mappingType}
                onChange={event => setMappingType(event.target.value as MappingType | '')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {mappingTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Preset (optional)
              <select
                value={presetId}
                onChange={event => setPresetId(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                disabled={mappingType === 'exclude'}
              >
                <option value="">Do not change</option>
                {presetOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Polarity
              <select
                value={polarity}
                onChange={event => setPolarity(event.target.value as MappingPolarity | '')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {polarityOptions.map(option => (
                  <option key={option || 'unchanged'} value={option}>
                    {option || 'Leave unchanged'}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Status
              <select
                value={status}
                onChange={event => setStatus(event.target.value as MappingStatus | '')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
              Apply updates
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}