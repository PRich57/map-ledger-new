import { ChangeEvent, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  selectActiveStatuses,
  selectSearchTerm,
  useMappingStore,
} from '../../store/mappingStore';
import { useMappingSelectionStore } from '../../store/mappingSelectionStore';
import { useTemplateStore } from '../../store/templateStore';
import type { GLAccountMappingRow } from '../../types';
import { buildTargetScoaOptions } from '../../utils/targetScoaOptions';
import BatchMapModal from './BatchMapModal';
import PresetModal from './PresetModal';
import BatchExclude from './BatchExclude';

const STATUS_DEFINITIONS: {
  value: GLAccountMappingRow['status'];
  label: string;
  className: string;
}[] = [
  {
    value: 'New',
    label: 'New',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200',
  },
  {
    value: 'Unmapped',
    label: 'Unmapped',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  },
  {
    value: 'Mapped',
    label: 'Mapped',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  },
  {
    value: 'Excluded',
    label: 'Excluded',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200',
  },
];

export default function MappingToolbar() {
  const searchTerm = useMappingStore(selectSearchTerm);
  const activeStatuses = useMappingStore(selectActiveStatuses);
  const setSearchTerm = useMappingStore(state => state.setSearchTerm);
  const toggleStatusFilter = useMappingStore(state => state.toggleStatusFilter);
  const clearStatusFilters = useMappingStore(state => state.clearStatusFilters);
  const bulkAccept = useMappingStore(state => state.bulkAccept);
  const finalizeMappings = useMappingStore(state => state.finalizeMappings);
  const applyBatchMapping = useMappingStore(state => state.applyBatchMapping);
  const applyPresetToAccounts = useMappingStore(state => state.applyPresetToAccounts);
  const { selectedIds, clearSelection } = useMappingSelectionStore();
  const datapoints = useTemplateStore(state => state.datapoints);
  const coaOptions = useMemo(() => buildTargetScoaOptions(datapoints), [datapoints]);
  const [isBatchMapOpen, setBatchMapOpen] = useState(false);
  const [isPresetOpen, setPresetOpen] = useState(false);
  const [isBatchExcludeOpen, setBatchExcludeOpen] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const hasSelection = selectedIds.size > 0;
  const selectedCount = selectedIds.size;

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleBulkAccept = () => {
    if (!selectedIds.size) return;
    bulkAccept(Array.from(selectedIds));
    setFinalizeError(null);
  };

  const handleFinalize = () => {
    if (!selectedIds.size) return;
    const success = finalizeMappings(Array.from(selectedIds));
    if (success) {
      clearSelection();
      setFinalizeError(null);
    } else {
      setFinalizeError('Resolve split allocations before publishing selected rows.');
    }
  };

  const handleClearFilters = () => {
    clearStatusFilters();
  };

  const handleApplyBatchMap = (updates: {
    target?: string | null;
    mappingType?: GLAccountMappingRow['mappingType'];
    presetId?: string | null;
    polarity?: GLAccountMappingRow['polarity'];
    status?: GLAccountMappingRow['status'];
  }) => {
    if (!selectedIds.size) {
      return;
    }
    applyBatchMapping(Array.from(selectedIds), updates);
    setBatchMapOpen(false);
    clearSelection();
    setFinalizeError(null);
  };

  const handleApplyPreset = (presetId: string) => {
    if (!selectedIds.size) {
      return;
    }
    applyPresetToAccounts(Array.from(selectedIds), presetId);
    setPresetOpen(false);
    clearSelection();
    setFinalizeError(null);
  };

  const handleConfirmExclude = () => {
    if (!selectedIds.size) {
      return;
    }
    applyBatchMapping(Array.from(selectedIds), { mappingType: 'exclude', status: 'Excluded' });
    setBatchExcludeOpen(false);
    clearSelection();
    setFinalizeError(null);
  };

  return (
    <div
      role="region"
      aria-label="Mapping controls"
      className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
    >
      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex max-w-sm flex-col">
          <label
            htmlFor="mapping-search"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Search mappings
          </label>
          <div className="mt-1 flex items-center rounded-md border border-slate-300 bg-white text-slate-900 focus-within:ring-2 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <span className="pl-2 text-slate-500">
              <Search className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              id="mapping-search"
              type="search"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search by account, company, or entity"
              className="w-full rounded-md border-0 bg-transparent px-2 py-2 text-sm placeholder-slate-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div
            role="group"
            aria-label="Filter by status"
            className="flex flex-wrap items-center gap-2"
          >
            {STATUS_DEFINITIONS.map(status => {
              const isActive = activeStatuses.includes(status.value);
              return (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => toggleStatusFilter(status.value)}
                  aria-pressed={isActive}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                    isActive ? status.className : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {status.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            className="self-start text-sm font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-blue-300 dark:hover:text-blue-200 dark:focus:ring-offset-slate-900"
          >
            Clear filters
          </button>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 lg:items-end">
        <span className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
          {hasSelection ? `${selectedCount} row${selectedCount === 1 ? '' : 's'} selected` : 'No rows selected'}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBatchMapOpen(true)}
            disabled={!hasSelection}
            className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              hasSelection
                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
            }`}
          >
            Batch map
          </button>
          <button
            type="button"
            onClick={() => setPresetOpen(true)}
            disabled={!hasSelection}
            className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              hasSelection
                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
            }`}
          >
            Apply preset
          </button>
          <button
            type="button"
            onClick={() => setBatchExcludeOpen(true)}
            disabled={!hasSelection}
            className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              hasSelection
                ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus:ring-rose-500 dark:border-rose-400/60 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-900/30'
                : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
            }`}
          >
            Exclude
          </button>
          <button
            type="button"
            onClick={handleBulkAccept}
            disabled={!hasSelection}
            className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              hasSelection
                ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                : 'cursor-not-allowed bg-slate-200 text-slate-500 focus:ring-0 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            Accept suggested
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={!hasSelection}
            className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              hasSelection
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500'
                : 'cursor-not-allowed bg-slate-200 text-slate-500 focus:ring-0 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            Finalize selection
          </button>
        </div>
        {finalizeError && (
          <p className="text-sm text-rose-600 dark:text-rose-300" role="alert">
            {finalizeError}
          </p>
        )}
      </div>
      <BatchMapModal
        open={isBatchMapOpen && hasSelection}
        targetOptions={coaOptions}
        selectedCount={selectedCount}
        onClose={() => setBatchMapOpen(false)}
        onApply={handleApplyBatchMap}
      />
      <PresetModal
        open={isPresetOpen && hasSelection}
        selectedCount={selectedCount}
        onClose={() => setPresetOpen(false)}
        onApply={handleApplyPreset}
      />
      <BatchExclude
        open={isBatchExcludeOpen && hasSelection}
        selectedCount={selectedCount}
        onClose={() => setBatchExcludeOpen(false)}
        onConfirm={handleConfirmExclude}
      />
    </div>
  );
}
