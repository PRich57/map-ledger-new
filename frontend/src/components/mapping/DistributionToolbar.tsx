import { ChangeEvent, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  selectDistributionPresetSummaries,
  useRatioAllocationStore,
} from '../../store/ratioAllocationStore';
import { useDistributionStore } from '../../store/distributionStore';
import { useDistributionSelectionStore } from '../../store/distributionSelectionStore';
import DistributionPresetModal from './DistributionPresetModal';
import type {
  DistributionStatus,
} from '../../types';

const STATUS_DEFINITIONS: { value: DistributionStatus; label: string }[] = [
  { value: 'Undistributed', label: 'Undistributed' },
  { value: 'Distributed', label: 'Distributed' },
];

export default function DistributionToolbar() {
  const searchTerm = useDistributionStore(state => state.searchTerm);
  const statusFilters = useDistributionStore(state => state.statusFilters);
  const setSearchTerm = useDistributionStore(state => state.setSearchTerm);
  const toggleStatusFilter = useDistributionStore(state => state.toggleStatusFilter);
  const clearStatusFilters = useDistributionStore(state => state.clearStatusFilters);
  const applyPresetToRows = useDistributionStore(state => state.applyPresetToRows);
  const saveError = useDistributionStore(state => state.saveError);
  const presetOptions = useRatioAllocationStore(selectDistributionPresetSummaries);
  const { selectedIds, clearSelection } = useDistributionSelectionStore();
  const [isPresetModalOpen, setPresetModalOpen] = useState(false);
  const hasSelection = selectedIds.size > 0;
  const selectedCount = selectedIds.size;

  const searchLabelId = 'distribution-search';

  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleApplyPreset = (presetId: string | null) => {
    if (!hasSelection) {
      return;
    }
    applyPresetToRows(selectedIdList, presetId);
    clearSelection();
    setPresetModalOpen(false);
  };

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex max-w-sm flex-col">
            <label htmlFor={searchLabelId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Search distribution rows
            </label>
            <div className="mt-1 flex items-center rounded-md border border-slate-300 bg-white text-slate-900 focus-within:ring-2 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <span className="pl-2 text-slate-500">
                <Search className="h-4 w-4" aria-hidden="true" />
              </span>
              <input
                id={searchLabelId}
                type="search"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search by account or description"
                className="w-full rounded-md border-0 bg-transparent px-2 py-2 text-sm placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div role="group" aria-label="Filter distribution by status" className="flex flex-wrap items-center gap-2">
              {STATUS_DEFINITIONS.map(status => {
                const isActive = statusFilters.includes(status.value);
                return (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => toggleStatusFilter(status.value)}
                    aria-pressed={isActive}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                      isActive
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {status.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={clearStatusFilters}
              className="self-start text-sm font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-blue-300 dark:hover:text-blue-200 dark:focus:ring-offset-slate-900"
            >
              Clear filters
            </button>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <span className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
            {hasSelection
              ? `${selectedCount} row${selectedCount === 1 ? '' : 's'} selected`
              : 'No rows selected'}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPresetModalOpen(true)}
              disabled={!hasSelection}
              className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                hasSelection
                  ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              Apply preset
            </button>

          </div>
          {saveError && (
            <div className="space-y-1" role="status" aria-live="polite">
              <p className="text-xs text-rose-600 dark:text-rose-300">{saveError}</p>
            </div>
          )}
        </div>
      </div>
      <DistributionPresetModal
        open={isPresetModalOpen && hasSelection}
        selectedCount={selectedCount}
        presetOptions={presetOptions}
        onClose={() => setPresetModalOpen(false)}
        onApply={handleApplyPreset}
      />
    </>
  );
}
