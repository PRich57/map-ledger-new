import { ChangeEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronRight, Search, X } from 'lucide-react';
import { PRESET_OPTIONS } from './presets';
import RatioAllocationManager from './RatioAllocationManager';
import { useDistributionStore } from '../../store/distributionStore';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { selectStandardScoaSummaries, useMappingStore } from '../../store/mappingStore';
import type {
  DistributionOperationShare,
  DistributionRow,
  DistributionType,
  MappingStatus,
} from '../../types';

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

type SortKey = 'accountId' | 'description' | 'activity' | 'type' | 'operations' | 'preset' | 'status';
type SortDirection = 'asc' | 'desc';

const COLUMN_DEFINITIONS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'accountId', label: 'Account ID' },
  { key: 'description', label: 'Standard chart description' },
  { key: 'activity', label: 'Mapped value', align: 'right' },
  { key: 'type', label: 'Distribution type' },
  { key: 'operations', label: 'Operations summary' },
  { key: 'preset', label: 'Preset' },
  { key: 'status', label: 'Status', align: 'right' },
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

const getSortValue = (row: DistributionRow, key: SortKey): string | number => {
  switch (key) {
    case 'accountId':
      return row.accountId;
    case 'description':
      return row.description;
    case 'activity':
      return row.activity;
    case 'type':
      return row.type;
    case 'operations':
      return formatOperations(row);
    case 'preset':
      return row.presetId ?? '';
    case 'status':
      return row.status;
    default:
      return '';
  }
};

const DistributionTable = ({ focusMappingId }: DistributionTableProps) => {
  const standardTargets = useMappingStore(selectStandardScoaSummaries);
  const summarySignature = useMemo(
    () => standardTargets.map(target => `${target.id}:${target.mappedAmount}`).join('|'),
    [standardTargets],
  );
  const previousSignature = useRef<string | null>(null);
  const {
    rows,
    operationsCatalog,
    searchTerm,
    statusFilters,
    syncRowsFromStandardTargets,
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
    syncRowsFromStandardTargets: state.syncRowsFromStandardTargets,
    setSearchTerm: state.setSearchTerm,
    toggleStatusFilter: state.toggleStatusFilter,
    clearStatusFilters: state.clearStatusFilters,
    updateRowType: state.updateRowType,
    updateRowOperations: state.updateRowOperations,
    updateRowPreset: state.updateRowPreset,
    updateRowNotes: state.updateRowNotes,
    updateRowStatus: state.updateRowStatus,
  }));

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<DistributionOperationShare[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [activeDynamicAccountId, setActiveDynamicAccountId] = useState<string | null>(null);

  const { getActivePresetForSource } = useRatioAllocationStore(state => ({
    getActivePresetForSource: state.getActivePresetForSource,
  }));

  useEffect(() => {
    if (previousSignature.current === summarySignature) {
      return;
    }
    previousSignature.current = summarySignature;
    syncRowsFromStandardTargets(standardTargets);
  }, [standardTargets, summarySignature, syncRowsFromStandardTargets]);

  useEffect(() => {
    if (!focusMappingId) {
      return;
    }
    const targetRow = rows.find(row => row.mappingRowId === focusMappingId);
    if (!targetRow) {
      return;
    }
    setExpandedRows(new Set([targetRow.id]));
    setEditingRowId(targetRow.id);
    setOperationsDraft(targetRow.operations.map(operation => ({ ...operation })));
  }, [focusMappingId, rows]);

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

  const sortedRows = useMemo(() => {
    if (!sortConfig) {
      return filteredRows;
    }
    const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const valueA = getSortValue(a, sortConfig.key);
      const valueB = getSortValue(b, sortConfig.key);
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return (valueA - valueB) * multiplier;
      }
      return valueA.toString().localeCompare(valueB.toString()) * multiplier;
    });
  }, [filteredRows, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig(previous => {
      if (previous?.key === key) {
        const nextDirection: SortDirection = previous.direction === 'asc' ? 'desc' : 'asc';
        return { key, direction: nextDirection };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleToggleRow = (row: DistributionRow) => {
    const isExpanded = expandedRows.has(row.id);
    if (isExpanded) {
      setExpandedRows(new Set());
      if (editingRowId === row.id) {
        setEditingRowId(null);
        setOperationsDraft([]);
      }
      return;
    }
    setExpandedRows(new Set([row.id]));
    setEditingRowId(row.id);
    setOperationsDraft(row.operations.map(operation => ({ ...operation })));
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
  };

  const handleCancelOperations = (row: DistributionRow) => {
    setOperationsDraft(row.operations.map(operation => ({ ...operation })));
  };

  const getAriaSort = (columnKey: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortConfig?.key !== columnKey) {
      return 'none';
    }
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
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
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="w-10 px-3 py-3">
                <span className="sr-only">Toggle details</span>
              </th>
              {COLUMN_DEFINITIONS.map(column => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={getAriaSort(column.key)}
                  className={`px-3 py-3 ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="flex items-center gap-1 font-semibold text-slate-700 transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-200 dark:hover:text-blue-300 dark:focus:ring-offset-slate-900"
                  >
                    {column.label}
                    <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
            {sortedRows.map(row => {
              const isExpanded = expandedRows.has(row.id);
              const isEditing = editingRowId === row.id;
              const operationsSummary = formatOperations(row);
              const statusBadgeClass = STATUS_BADGE_CLASSES[row.status];
              return (
                <Fragment key={row.id}>
                  <tr className="align-top">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleRow(row)}
                        aria-expanded={isExpanded}
                        aria-controls={`distribution-details-${row.id}`}
                        className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
                      >
                        <ChevronRight className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                        <span className="sr-only">Toggle operations for {row.accountId}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{row.accountId}</td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{row.description}</td>
                    <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrency(row.activity)}</td>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3">
                      <div className="space-y-2">
                        <div className="text-slate-700 dark:text-slate-200">{operationsSummary}</div>
                        {row.type === 'dynamic' && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {(() => {
                              const activePreset = getActivePresetForSource(row.accountId);
                              return activePreset ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                                  Preset: {activePreset.name}
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400">No preset selected</span>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <label htmlFor={`distribution-preset-${row.id}`} className="sr-only">
                        Select preset
                      </label>
                      <select
                        id={`distribution-preset-${row.id}`}
                        value={row.presetId ?? ''}
                        onChange={event => updateRowPreset(row.id, event.target.value ? event.target.value : null)}
                        className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">No preset</option>
                        {PRESET_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && isEditing && (
                    <tr id={`distribution-details-${row.id}`}>
                      <td colSpan={8} className="bg-slate-50 px-4 py-6 dark:bg-slate-800/60">
                        <div className="space-y-6">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Distribution details for {row.description}
                              </h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Adjust operations, notes, and status for this standard account.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleRow(row)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              Close
                            </button>
                          </div>
                          <div className="grid gap-6 lg:grid-cols-2">
                            <div className="space-y-4">
                              {row.type === 'direct' && (
                                <div className="space-y-1">
                                  <label htmlFor={`direct-operation-${row.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    Select operation
                                  </label>
                                  <select
                                    id={`direct-operation-${row.id}`}
                                    value={operationsDraft[0]?.id ?? ''}
                                    onChange={event => handleDirectSelection(event.target.value)}
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                  >
                                    <option value="">No operation selected</option>
                                    {operationsCatalog.map(option => (
                                      <option key={option.id} value={option.id}>
                                        {option.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {row.type !== 'direct' && (
                                <div className="space-y-3">
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Operations</p>
                                  <div className="space-y-2">
                                    {operationsCatalog.map(option => {
                                      const isSelected = operationsDraft.some(operation => operation.id === option.id);
                                      return (
                                        <label
                                          key={option.id}
                                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-sm transition ${
                                            isSelected
                                              ? 'border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-500/10'
                                              : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={event => handleToggleOperation(option.id, event.target.checked)}
                                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                                          />
                                          <div className="flex-1">
                                            <div className="font-medium text-slate-700 dark:text-slate-100">{option.name}</div>
                                            {row.type === 'percentage' && isSelected && (
                                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                <label htmlFor={`allocation-${row.id}-${option.id}`}>Allocation %</label>
                                                <input
                                                  id={`allocation-${row.id}-${option.id}`}
                                                  type="number"
                                                  min={0}
                                                  max={100}
                                                  value={operationsDraft.find(operation => operation.id === option.id)?.allocation ?? 0}
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
                                      Dynamic allocations distribute amounts according to preset configurations. Use the builder to configure ratio weights.
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
                                  onClick={() => handleCancelOperations(row)}
                                  className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                                >
                                  Reset changes
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
                            <div className="space-y-4">
                              <div>
                                <label htmlFor={`distribution-notes-${row.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  Distribution notes
                                </label>
                                <textarea
                                  id={`distribution-notes-${row.id}`}
                                  value={row.notes ?? ''}
                                  onChange={event => updateRowNotes(row.id, event.target.value)}
                                  rows={4}
                                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                />
                              </div>
                              <div>
                                <label htmlFor={`distribution-status-${row.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  Distribution status
                                </label>
                                <select
                                  id={`distribution-status-${row.id}`}
                                  value={row.status}
                                  onChange={event => updateRowStatus(row.id, event.target.value as MappingStatus)}
                                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                >
                                  {STATUS_DEFINITIONS.map(option => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
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
        {sortedRows.length === 0 && (
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
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Preset builder</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Configure preset-based distributions for account {activeDynamicAccountId}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDynamicAccountId(null)}
                className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900"
                aria-label="Close preset builder"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-6">
              <RatioAllocationManager initialSourceAccountId={activeDynamicAccountId} onDone={() => setActiveDynamicAccountId(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DistributionTable;
