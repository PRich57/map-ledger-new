import { ChangeEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronRight, Search, X } from 'lucide-react';
import { PRESET_OPTIONS } from './presets';
import RatioAllocationManager from './RatioAllocationManager';
import {
  useDistributionStore,
  type DistributionOperationCatalogItem,
} from '../../store/distributionStore';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { selectStandardScoaSummaries, useMappingStore } from '../../store/mappingStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { useDistributionSelectionStore } from '../../store/distributionSelectionStore';
import type {
  DistributionOperationShare,
  DistributionRow,
  DistributionStatus,
  DistributionType,
} from '../../types';

interface DistributionTableProps {
  focusMappingId?: string | null;
}

const STATUS_DEFINITIONS: { value: DistributionStatus; label: string }[] = [
  { value: 'Unmapped', label: 'Unmapped' },
  { value: 'Mapped', label: 'Mapped' },
];

const STATUS_BADGE_CLASSES: Record<DistributionStatus, string> = {
  Unmapped: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  Mapped: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
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
  { key: 'description', label: 'Standard COA Description' },
  { key: 'activity', label: 'Mapped Value', align: 'right' },
  { key: 'type', label: 'Distribution Type' },
  { key: 'operations', label: 'Target Operation' },
  { key: 'preset', label: 'Preset' },
  { key: 'status', label: 'Status', align: 'right' },
];

const COLUMN_PADDING_CLASSES: Partial<Record<SortKey, string>> = {
  activity: 'px-4',
  type: 'px-4',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number): string => currencyFormatter.format(value);

const statusLabel = (value: DistributionStatus) =>
  STATUS_DEFINITIONS.find(status => status.value === value)?.label ?? value;

const formatOperationLabel = (operation: DistributionOperationShare) => {
  if (operation.name && operation.name !== operation.id) {
    return `${operation.id} – ${operation.name}`;
  }
  return operation.id;
};

const formatOperations = (row: DistributionRow) => {
  if (!row.operations.length) {
    return 'No operations assigned';
  }

  if (row.type === 'percentage') {
    return row.operations
      .map(operation => `${formatOperationLabel(operation)} (${operation.allocation ?? 0}%)`)
      .join(', ');
  }

  return row.operations.map(operation => formatOperationLabel(operation)).join(', ');
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
  const activeClientId = useMappingStore(state => state.activeClientId);
  const companies = useOrganizationStore(state => state.companies);
  const summarySignature = useMemo(
    () => standardTargets.map(target => `${target.id}:${target.mappedAmount}`).join('|'),
    [standardTargets],
  );
  const previousSignature = useRef<string | null>(null);
  const clientOperations = useMemo<DistributionOperationCatalogItem[]>(() => {
    const map = new Map<string, DistributionOperationCatalogItem>();
    companies.forEach(company => {
      company.clients.forEach(client => {
        if (activeClientId && client.id !== activeClientId) {
          return;
        }
        client.operations.forEach(operation => {
          const code = operation.id?.trim();
          if (!code) {
            return;
          }
          const name = operation.name?.trim() || code;
          map.set(code, { id: code, name });
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  }, [companies, activeClientId]);
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
    setOperationsCatalog,
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
    setOperationsCatalog: state.setOperationsCatalog,
  }));

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<DistributionOperationShare[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [activeDynamicAccountId, setActiveDynamicAccountId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const { selectedIds, toggleSelection, setSelection, clearSelection } = useDistributionSelectionStore();

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
    setOperationsCatalog(clientOperations);
  }, [clientOperations, setOperationsCatalog]);

  useEffect(() => {
    if (!focusMappingId) {
      return;
    }
    const targetRow = rows.find(row => row.mappingRowId === focusMappingId);
    if (!targetRow || targetRow.type === 'direct') {
      return;
    }
    setExpandedRows(new Set([targetRow.id]));
    setEditingRowId(targetRow.id);
    setOperationsDraft(targetRow.operations.map(operation => ({ ...operation })));
  }, [focusMappingId, rows]);

  useEffect(() => {
    setExpandedRows(prev => {
      const filtered = new Set(Array.from(prev).filter(id => {
        const row = rows.find(item => item.id === id);
        return row && row.type !== 'direct';
      }));
      return filtered.size === prev.size ? prev : filtered;
    });
    setEditingRowId(prev => {
      if (!prev) {
        return prev;
      }
      const row = rows.find(item => item.id === prev);
      return row && row.type !== 'direct' ? prev : null;
    });
  }, [rows]);

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

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    const allIds = sortedRows.map(row => row.id);
    const isAllSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    selectAllRef.current.checked = isAllSelected;
    selectAllRef.current.indeterminate =
      selectedIds.size > 0 && !isAllSelected && allIds.some(id => selectedIds.has(id));
  }, [sortedRows, selectedIds]);

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

  const handleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelection(sortedRows.map(row => row.id));
    } else {
      clearSelection();
    }
  };

  const handleRowSelection = (id: string) => {
    toggleSelection(id);
  };

  const handleToggleRow = (row: DistributionRow) => {
    if (row.type === 'direct') {
      return;
    }
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

  const handleDirectOperationChange = (row: DistributionRow, operationId: string) => {
    if (!operationId) {
      updateRowOperations(row.id, []);
      return;
    }
    const catalogItem = operationsCatalog.find(item => item.id === operationId);
    if (!catalogItem) {
      updateRowOperations(row.id, []);
      return;
    }
    updateRowOperations(row.id, [{ id: catalogItem.id, name: catalogItem.name }]);
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
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700" role="table">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th scope="col" className="w-10 px-3 py-3">
                <span className="sr-only">Toggle distribution operations</span>
              </th>
              <th scope="col" className="w-12 px-3 py-3">
                <span className="sr-only">Select all rows</span>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all distribution rows"
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              {COLUMN_DEFINITIONS.map(column => {
                const paddingClass = COLUMN_PADDING_CLASSES[column.key] ?? 'px-3';
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={getAriaSort(column.key)}
                    className={`${paddingClass} py-3 ${column.align === 'right' ? 'text-right' : ''}`}
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
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
            {sortedRows.map(row => {
              const isExpanded = expandedRows.has(row.id);
              const isEditing = editingRowId === row.id;
              const operationsSummary = formatOperations(row);
              const statusBadgeClass = STATUS_BADGE_CLASSES[row.status];
              const isSelected = selectedIds.has(row.id);
              return (
                <Fragment key={row.id}>
                  <tr className={`align-top ${isSelected ? 'bg-blue-50 dark:bg-slate-800/50' : ''}`}>
                    <td className="px-3 py-4">
                      {row.type !== 'direct' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleRow(row)}
                          aria-expanded={isExpanded}
                          aria-controls={`distribution-details-${row.id}`}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} operations for ${row.accountId}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-slate-500 transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:text-blue-300 dark:focus:ring-offset-slate-900"
                        >
                          <ChevronRight className={`h-6 w-6 transition-transform ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden="true" />
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select distribution row for account ${row.accountId}`}
                        checked={isSelected}
                        onChange={() => handleRowSelection(row.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 font-medium text-slate-900 dark:text-slate-100">{row.accountId}</td>
                    <td className="px-3 py-4 text-slate-700 dark:text-slate-200">{row.description}</td>
                    <td className="px-4 py-4 text-right font-medium tabular-nums text-slate-600 dark:text-slate-300">{formatCurrency(row.activity)}</td>
                    <td className="px-4 py-4">
                      <label htmlFor={`distribution-type-${row.id}`} className="sr-only">
                        Select distribution type
                      </label>
                      <select
                        id={`distribution-type-${row.id}`}
                        value={row.type}
                        onChange={event => updateRowType(row.id, event.target.value as DistributionType)}
                        className="w-36 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4">
                      {row.type === 'direct' ? (
                        operationsCatalog.length > 0 ? (
                          <select
                            aria-label="Select target operation"
                            value={row.operations[0]?.id ?? ''}
                            onChange={event => handleDirectOperationChange(row, event.target.value)}
                            className="w-48 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <option value="">Select operation</option>
                            {operationsCatalog.map(option => (
                              <option key={option.id} value={option.id}>
                                {option.name && option.name !== option.id ? `${option.id} – ${option.name}` : option.id}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">No operations available for this client.</p>
                        )
                      ) : (
                        <div className="space-y-2">
                          <div className="text-slate-700 dark:text-slate-200">{operationsSummary}</div>
                          {row.operations.length === 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">Assign operations to complete this distribution.</p>
                          )}
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
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <label htmlFor={`distribution-preset-${row.id}`} className="sr-only">
                        Select preset
                      </label>
                      <select
                        id={`distribution-preset-${row.id}`}
                        value={row.presetId ?? ''}
                        onChange={event => updateRowPreset(row.id, event.target.value ? event.target.value : null)}
                        className="w-40 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">No preset</option>
                        {PRESET_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && isEditing && (
                    <tr id={`distribution-details-${row.id}`}>
                      <td colSpan={COLUMN_DEFINITIONS.length + 2} className="bg-slate-50 px-4 py-6 dark:bg-slate-800/60">
                        <div className="space-y-6">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Distribution details for {row.description}
                              </h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Adjust operations and notes for this standard account.
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
                              {row.type !== 'direct' && (
                                <div className="space-y-3">
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Operations</p>
                                  {operationsCatalog.length === 0 ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                      No operations are available for this client. Import client operations to continue.
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {operationsCatalog.map(option => {
                                        const isSelected = operationsDraft.some(operation => operation.id === option.id);
                                        const optionLabel = option.name && option.name !== option.id ? `${option.id} – ${option.name}` : option.id;
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
                                              <div className="font-medium text-slate-700 dark:text-slate-100">{optionLabel}</div>
                                              {row.type === 'percentage' && isSelected && (
                                                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                  <label htmlFor={`allocation-${row.id}-${option.id}`}>Allocation %</label>
                                                  <input
                                                    id={`allocation-${row.id}-${option.id}`}
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step={0.1}
                                                    value={operationsDraft.find(operation => operation.id === option.id)?.allocation ?? 0}
                                                    onChange={event =>
                                                      handleAllocationChange(option.id, Number.parseFloat(event.target.value))
                                                    }
                                                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                                  />
                                                </div>
                                              )}
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
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
