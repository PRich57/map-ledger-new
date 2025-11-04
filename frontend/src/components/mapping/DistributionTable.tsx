import { ChangeEvent, Fragment, useEffect, useMemo, useState } from 'react';
import { Search, Settings2, X } from 'lucide-react';
import { PRESET_OPTIONS } from './presets';
import RatioAllocationManager from './RatioAllocationManager';
import { useDistributionStore } from '../../store/distributionStore';
import type { DistributionOperationShare, DistributionRow, DistributionType, MappingStatus } from '../../types';

interface DistributionTableProps {
  focusMappingId?: string | null;
}

const STATUS_DEFINITIONS: { value: MappingStatus; label: string }[] = [
  { value: 'New', label: 'New' },
  { value: 'Unmapped', label: 'Unmapped' },
  { value: 'Mapped', label: 'Mapped' },
  { value: 'Excluded', label: 'Excluded' },
];

const STATUS_BADGE_CLASSES: Record<MappingStatus, string> = {
  New: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200',
  Unmapped: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  Mapped: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  Excluded: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200',
};

const TYPE_OPTIONS: { value: DistributionType; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'dynamic', label: 'Dynamic' },
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number): string => currencyFormatter.format(value);

const statusLabel = (value: MappingStatus) =>
  STATUS_DEFINITIONS.find(status => status.value === value)?.label ?? value;

const formatOperations = (row: DistributionRow) => {
  if (!row.operations.length) {
    return 'No operations assigned';
  }

  if (row.type === 'percentage') {
    return row.operations
      .map(operation => `${operation.name} (${operation.allocation ?? 0}%)`)
      .join(', ');
  }

  return row.operations.map(operation => operation.name).join(', ');
};

const DistributionTable = ({ focusMappingId }: DistributionTableProps) => {
  const {
    rows,
    operationsCatalog,
    searchTerm,
    statusFilters,
    setSearchTerm,
    toggleStatusFilter,
    clearStatusFilters,
    updateRowType,
    updateRowOperations,
    updateRowPreset,
    updateRowNotes,
    updateRowStatus,
  } = useDistributionStore(state => ({
    rows: state.rows,
    operationsCatalog: state.operationsCatalog,
    searchTerm: state.searchTerm,
    statusFilters: state.statusFilters,
    setSearchTerm: state.setSearchTerm,
    toggleStatusFilter: state.toggleStatusFilter,
    clearStatusFilters: state.clearStatusFilters,
    updateRowType: state.updateRowType,
    updateRowOperations: state.updateRowOperations,
    updateRowPreset: state.updateRowPreset,
    updateRowNotes: state.updateRowNotes,
    updateRowStatus: state.updateRowStatus,
  }));

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<DistributionOperationShare[]>([]);
  const [activeDynamicAccountId, setActiveDynamicAccountId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return rows.filter(row => {
      const matchesSearch =
        !normalizedQuery ||
        [row.accountId, row.description, formatCurrency(row.activity)]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = statusFilters.length === 0 || statusFilters.includes(row.status);
      return matchesSearch && matchesStatus;
    });
  }, [rows, searchTerm, statusFilters]);

  useEffect(() => {
    if (!focusMappingId) {
      return;
    }
    const targetRow = rows.find(row => row.mappingRowId === focusMappingId);
    if (!targetRow) {
      return;
    }
    setEditingRowId(targetRow.id);
    setOperationsDraft(targetRow.operations.map(operation => ({ ...operation })));
  }, [focusMappingId, rows]);

  useEffect(() => {
    if (!editingRowId) {
      setOperationsDraft([]);
    }
  }, [editingRowId]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleOpenOperations = (row: DistributionRow) => {
    setEditingRowId(row.id);
    setOperationsDraft(row.operations.map(operation => ({ ...operation })));
  };

  const handleCancelOperations = () => {
    setEditingRowId(null);
  };

  const handleToggleOperation = (operationId: string, enabled: boolean) => {
    const catalogItem = operationsCatalog.find(item => item.id === operationId);
    if (!catalogItem) {
      return;
    }

    setOperationsDraft(previous => {
      if (enabled) {
        if (previous.some(operation => operation.id === operationId)) {
          return previous;
        }
        return [...previous, { id: catalogItem.id, name: catalogItem.name }];
      }
      return previous.filter(operation => operation.id !== operationId);
    });
  };

  const handleAllocationChange = (operationId: string, value: number) => {
    setOperationsDraft(previous =>
      previous.map(operation =>
        operation.id === operationId ? { ...operation, allocation: Number.isFinite(value) ? value : 0 } : operation,
      ),
    );
  };

  const handleDirectSelection = (operationId: string) => {
    const catalogItem = operationsCatalog.find(item => item.id === operationId);
    if (!catalogItem) {
      setOperationsDraft([]);
      return;
    }
    setOperationsDraft([{ id: catalogItem.id, name: catalogItem.name }]);
  };

  const handleSaveOperations = (row: DistributionRow) => {
    updateRowOperations(row.id, operationsDraft);
    setEditingRowId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-sm flex-col">
          <label htmlFor="distribution-search" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Search distribution rows
          </label>
          <div className="mt-1 flex items-center rounded-md border border-slate-300 bg-white text-slate-900 focus-within:ring-2 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <span className="pl-2 text-slate-500">
              <Search className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              id="distribution-search"
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

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Account ID</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Operation(s)</th>
              <th className="px-4 py-3">Preset</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {filteredRows.map(row => {
              const isEditing = editingRowId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.accountId}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.description}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatCurrency(row.activity)}
                    </td>
                    <td className="px-4 py-3">
                      <label htmlFor={`distribution-type-${row.id}`} className="sr-only">
                        Select distribution type
                      </label>
                      <select
                        id={`distribution-type-${row.id}`}
                        value={row.type}
                        onChange={event => updateRowType(row.id, event.target.value as DistributionType)}
                        className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="text-slate-700 dark:text-slate-200">{formatOperations(row)}</div>
                        <button
                          type="button"
                          onClick={() => handleOpenOperations(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                        >
                          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Edit operations
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <label htmlFor={`distribution-preset-${row.id}`} className="sr-only">
                        Select preset
                      </label>
                      <select
                        id={`distribution-preset-${row.id}`}
                        value={row.presetId ?? ''}
                        onChange={event =>
                          updateRowPreset(row.id, event.target.value ? event.target.value : null)
                        }
                        className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">No preset</option>
                        {PRESET_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <label htmlFor={`distribution-notes-${row.id}`} className="sr-only">
                        Distribution notes
                      </label>
                      <textarea
                        id={`distribution-notes-${row.id}`}
                        value={row.notes ?? ''}
                        onChange={event => updateRowNotes(row.id, event.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label htmlFor={`distribution-status-${row.id}`} className="sr-only">
                        Distribution status
                      </label>
                      <select
                        id={`distribution-status-${row.id}`}
                        value={row.status}
                        onChange={event => updateRowStatus(row.id, event.target.value as MappingStatus)}
                        className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {STATUS_DEFINITIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[row.status]}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr>
                      <td colSpan={9} className="bg-slate-50 px-4 py-4 dark:bg-slate-800/60">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Edit operations for {row.accountId}
                            </h4>
                            <button
                              type="button"
                              onClick={handleCancelOperations}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              Close
                            </button>
                          </div>
                          {row.type === 'direct' && (
                            <div className="space-y-1">
                              <label htmlFor={`direct-operation-${row.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                Select operation
                              </label>
                              <select
                                id={`direct-operation-${row.id}`}
                                value={operationsDraft[0]?.id ?? ''}
                                onChange={event => handleDirectSelection(event.target.value)}
                                className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                              >
                                <option value="">Select an operation</option>
                                {operationsCatalog.map(option => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {(row.type === 'percentage' || row.type === 'dynamic') && (
                            <div className="space-y-3">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                Choose operations
                              </span>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {operationsCatalog.map(option => {
                                  const isSelected = operationsDraft.some(operation => operation.id === option.id);
                                  return (
                                    <label
                                      key={option.id}
                                      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition ${
                                        isSelected
                                          ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/20'
                                          : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={event => handleToggleOperation(option.id, event.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                                      />
                                      <div>
                                        <div className="font-medium text-slate-700 dark:text-slate-100">{option.name}</div>
                                        {row.type === 'percentage' && isSelected && (
                                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <label htmlFor={`allocation-${row.id}-${option.id}`}>Allocation %</label>
                                            <input
                                              id={`allocation-${row.id}-${option.id}`}
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={
                                                operationsDraft.find(operation => operation.id === option.id)?.allocation ?? 0
                                              }
                                              onChange={event =>
                                                handleAllocationChange(option.id, Number(event.target.value))
                                              }
                                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                              {row.type === 'dynamic' && (
                                <p className="text-xs text-slate-600 dark:text-slate-300">
                                  Dynamic allocations distribute amounts according to operational metrics. Use the builder to configure ratio weights.
                                </p>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveOperations(row)}
                              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-offset-slate-900"
                            >
                              Save operations
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelOperations}
                              className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                            >
                              Cancel
                            </button>
                            {row.type === 'dynamic' && (
                              <button
                                type="button"
                                onClick={() => setActiveDynamicAccountId(row.accountId)}
                                className="inline-flex items-center rounded-md border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10 dark:focus-visible:ring-offset-slate-900"
                              >
                                Open dynamic allocation builder
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300">
            No distribution rows match your filters.
          </div>
        )}
      </div>

      {activeDynamicAccountId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dynamic allocation builder</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Configure ratio-based distributions for account {activeDynamicAccountId}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDynamicAccountId(null)}
                className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900"
                aria-label="Close dynamic allocation builder"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-6">
              <RatioAllocationManager
                initialSourceAccountId={activeDynamicAccountId}
                onDone={() => setActiveDynamicAccountId(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DistributionTable;
