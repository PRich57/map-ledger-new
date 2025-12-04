import { ChangeEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Check, ChevronRight, HelpCircle, X } from 'lucide-react';
import RatioAllocationManager from './RatioAllocationManager';
import DistributionDynamicAllocationRow from './DistributionDynamicAllocationRow';
import {
  useDistributionStore,
  type DistributionOperationCatalogItem,
} from '../../store/distributionStore';
import { selectPresetSummaries, useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { selectStandardScoaSummaries, useMappingStore } from '../../store/mappingStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { useDistributionSelectionStore } from '../../store/distributionSelectionStore';
import DistributionToolbar from './DistributionToolbar';
import DistributionSplitRow from './DistributionSplitRow';
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
  { value: 'Undistributed', label: 'Undistributed' },
  { value: 'Distributed', label: 'Distributed' },
];

const STATUS_BADGE_CLASSES: Record<DistributionStatus, string> = {
  Undistributed:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  Distributed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
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
  { key: 'activity', label: 'Activity', align: 'right' },
  { key: 'type', label: 'Distribution Type' },
  { key: 'operations', label: 'Target Operation' },
  { key: 'preset', label: 'Preset' },
  { key: 'status', label: 'Status', align: 'right' },
];

const COLUMN_WIDTH_CLASSES: Partial<Record<SortKey, string>> = {
  accountId: 'w-32',
  description: 'min-w-[18rem]',
  activity: 'min-w-[11rem]',
  type: 'w-44',
  operations: 'min-w-[20rem]',
  preset: 'w-40',
  status: 'w-32',
};

const COLUMN_SPACING_CLASSES: Partial<Record<SortKey, string>> = {
  activity: 'pr-10',
  type: 'pr-10',
  operations: 'pr-6',
};

const STATUS_ICONS: Record<DistributionStatus, typeof Check | typeof HelpCircle> = {
  Distributed: Check,
  Undistributed: HelpCircle,
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
  const code = operation.code || operation.id;
  if (operation.name && operation.name !== code) {
    return `${code} – ${operation.name}`;
  }
  return code;
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

const operationsAreEqual = (
  previous: DistributionOperationShare[],
  next: DistributionOperationShare[],
): boolean => {
  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((operation, index) => {
    const comparison = next[index];
    if (!comparison) {
      return false;
    }

    return (
      operation.id === comparison.id &&
      (operation.code ?? null) === (comparison.code ?? null) &&
      operation.name === comparison.name &&
      (operation.allocation ?? null) === (comparison.allocation ?? null) &&
      (operation.notes ?? '') === (comparison.notes ?? '')
    );
  });
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
          const code = (operation.code || operation.id || '').trim();
          if (!code) {
            return;
          }
          const name = operation.name?.trim() || code;
          map.set(code, { id: code, code, name });
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
    updateRowType,
    updateRowOperations,
    updateRowPreset,
    setOperationsCatalog,
  } = useDistributionStore(state => ({
    rows: state.rows,
    operationsCatalog: state.operationsCatalog,
    searchTerm: state.searchTerm,
    statusFilters: state.statusFilters,
    syncRowsFromStandardTargets: state.syncRowsFromStandardTargets,
    updateRowType: state.updateRowType,
    updateRowOperations: state.updateRowOperations,
    updateRowPreset: state.updateRowPreset,
    setOperationsCatalog: state.setOperationsCatalog,
  }));

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<DistributionOperationShare[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [activeDynamicAccountId, setActiveDynamicAccountId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const previousTypesRef = useRef<Map<string, DistributionType>>(new Map());

  const { selectedIds, toggleSelection, setSelection, clearSelection } = useDistributionSelectionStore();

  const { getActivePresetForSource } = useRatioAllocationStore(state => ({
    getActivePresetForSource: state.getActivePresetForSource,
  }));
  const presetOptions = useRatioAllocationStore(selectPresetSummaries);

  const operationTargetCatalog = useMemo(
    () =>
      clientOperations.map(operation => ({
        id: operation.id,
        label:
          operation.name && operation.name !== operation.code
            ? `${operation.code} – ${operation.name}`
            : operation.code,
      })),
    [clientOperations],
  );

  const resolveOperationCanonicalTargetId = useCallback((targetId?: string | null) => {
    if (!targetId) {
      return null;
    }
    const normalized = targetId.trim();
    if (!normalized) {
      return null;
    }
    return normalized.toUpperCase();
  }, []);

  const sanitizeOperationsDraft = useCallback((draft: DistributionOperationShare[]): DistributionOperationShare[] => {
    const sanitized = draft.reduce<DistributionOperationShare[]>((acc, operation) => {
      const id = operation.id?.trim();
      if (!id) {
        return acc;
      }
      const code = operation.code?.trim() || id;
      const allocation =
        typeof operation.allocation === 'number' && Number.isFinite(operation.allocation)
          ? operation.allocation
          : undefined;
      const notes = operation.notes?.trim();
      acc.push({
        id,
        code,
        name: operation.name?.trim() || code,
        allocation,
        notes: notes || undefined,
      });
      return acc;
    }, []);

    return sanitized;
  }, []);

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
    let autoOpenedId: string | null = null;
    const previousTypes = previousTypesRef.current;
    setExpandedRows(prev => {
      const next = new Set<string>();
      rows.forEach(row => {
        if (prev.has(row.id) && row.type !== 'direct') {
          next.add(row.id);
        }
      });
      rows.forEach(row => {
        const requiresExpanded = row.type === 'percentage' || row.type === 'dynamic';
        const previousType = previousTypes.get(row.id);
        const previouslyRequired = previousType === 'percentage' || previousType === 'dynamic';
        if (requiresExpanded && !previouslyRequired && !next.has(row.id)) {
          next.add(row.id);
          autoOpenedId = row.id;
        }
      });
      return next;
    });
    setEditingRowId(prev => {
      if (autoOpenedId) {
        return autoOpenedId;
      }
      if (!prev) {
        return null;
      }
      const row = rows.find(item => item.id === prev);
      return row && row.type !== 'direct' ? prev : null;
    });
    if (autoOpenedId) {
      const targetRow = rows.find(item => item.id === autoOpenedId);
      if (targetRow) {
        setOperationsDraft(targetRow.operations.map(operation => ({ ...operation })));
      }
    }
    previousTypesRef.current = new Map(rows.map(row => [row.id, row.type]));
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

  useEffect(() => {
    if (!editingRowId) {
      return;
    }

    const targetRow = rows.find(row => row.id === editingRowId);
    if (!targetRow || targetRow.type === 'direct') {
      return;
    }

    const sanitized = sanitizeOperationsDraft(operationsDraft);
    if (operationsAreEqual(targetRow.operations, sanitized)) {
      return;
    }

    updateRowOperations(editingRowId, sanitized);
  }, [editingRowId, operationsDraft, rows, sanitizeOperationsDraft, updateRowOperations]);

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
    updateRowOperations(row.id, [
      { id: catalogItem.id, code: catalogItem.code, name: catalogItem.name },
    ]);
  };

  const getAriaSort = (columnKey: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortConfig?.key !== columnKey) {
      return 'none';
    }
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div className="space-y-6">
      <DistributionToolbar />

      <div className="overflow-x-auto">
        <table
          className="divide-y divide-slate-200 dark:divide-slate-700"
          role="table"
          style={{ minWidth: '100%' }}
        >
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
                const widthClass = COLUMN_WIDTH_CLASSES[column.key] ?? '';
                const spacingClass = COLUMN_SPACING_CLASSES[column.key] ?? '';
                const buttonAlignmentClass = column.align === 'right' ? 'justify-end text-right' : '';
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={getAriaSort(column.key)}
                    className={`px-3 py-3 ${widthClass} ${spacingClass} ${column.align === 'right' ? 'text-right' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className={`flex w-full items-center gap-1 font-semibold text-slate-700 transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-200 dark:hover:text-blue-300 dark:focus:ring-offset-slate-900 ${buttonAlignmentClass}`}
                    >
                      {column.label}
                      <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white text-sm dark:divide-slate-700 dark:bg-slate-900">
            {sortedRows.map(row => {
              const isExpanded = expandedRows.has(row.id);
              const isEditing = editingRowId === row.id;
              const operationsSummary = formatOperations(row);
              const statusBadgeClass = STATUS_BADGE_CLASSES[row.status];
              const isSelected = selectedIds.has(row.id);
              const activePreset = row.type === 'dynamic' ? getActivePresetForSource(row.accountId) : null;
              return (
                <Fragment key={row.id}>
                  <tr className={`align-middle ${isSelected ? 'bg-blue-50 dark:bg-slate-800/50' : ''}`}>
                    <td className="px-3 py-4 text-center align-middle">
                      {row.type !== 'direct' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleRow(row)}
                          aria-expanded={isExpanded}
                          aria-controls={`distribution-panel-${row.id}`}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} operations for ${row.accountId}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-slate-500 transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:text-blue-300 dark:focus:ring-offset-slate-900"
                        >
                          <ChevronRight
                            className={`h-6 w-6 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden="true" />
                      )}
                    </td>
                    <td className="px-3 py-4 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select distribution row for account ${row.accountId}`}
                        checked={isSelected}
                        onChange={() => handleRowSelection(row.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className={`whitespace-nowrap px-3 py-4 font-medium text-slate-900 dark:text-slate-100 ${COLUMN_WIDTH_CLASSES.accountId ?? ''}`}>
                      {row.accountId}
                    </td>
                    <td className={`px-3 py-4 text-slate-700 dark:text-slate-200 ${COLUMN_WIDTH_CLASSES.description ?? ''}`}>
                      {row.description}
                    </td>
                    <td
                      className={`pl-3 py-4 text-right font-medium tabular-nums text-slate-600 dark:text-slate-300 ${COLUMN_WIDTH_CLASSES.activity ?? ''} ${COLUMN_SPACING_CLASSES.activity ?? ''}`}
                    >
                      {formatCurrency(row.activity)}
                    </td>
                    <td className={`px-3 py-4 ${COLUMN_WIDTH_CLASSES.type ?? ''} ${COLUMN_SPACING_CLASSES.type ?? ''}`}>
                      <label htmlFor={`distribution-type-${row.id}`} className="sr-only">
                        Select distribution type
                      </label>
                      <select
                        id={`distribution-type-${row.id}`}
                        value={row.type}
                        onChange={event => updateRowType(row.id, event.target.value as DistributionType)}
                        className="w-full min-w-[8rem] rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`px-3 py-4 ${COLUMN_WIDTH_CLASSES.operations ?? ''} ${COLUMN_SPACING_CLASSES.operations ?? ''}`}>
                      {row.type === 'direct' ? (
                        operationsCatalog.length > 0 ? (
                          <select
                            aria-label="Select target operation"
                            value={row.operations[0]?.id ?? ''}
                            onChange={event => handleDirectOperationChange(row, event.target.value)}
                            className="w-full min-w-[12rem] rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
                          <p className="text-sm text-slate-700 dark:text-slate-200">{operationsSummary}</p>
                          {row.type === 'dynamic' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                              {activePreset ? `Preset: ${activePreset.name}` : 'No preset selected'}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-4 ${COLUMN_WIDTH_CLASSES.preset ?? ''}`}>
                      <label htmlFor={`distribution-preset-${row.id}`} className="sr-only">
                        Select preset
                      </label>
                      <select
                        id={`distribution-preset-${row.id}`}
                        value={row.presetId ?? ''}
                        onChange={event => updateRowPreset(row.id, event.target.value ? event.target.value : null)}
                        className="w-full min-w-[8rem] rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">No preset</option>
                        {presetOptions.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`px-3 py-4 text-right ${COLUMN_WIDTH_CLASSES.status ?? ''}`}>
                      {(() => {
                        const StatusIcon = STATUS_ICONS[row.status];
                        return (
                          <span className={`inline-flex min-w-[7rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {statusLabel(row.status)}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                  {isExpanded && isEditing && row.type === 'percentage' && (
                    <tr id={`distribution-panel-${row.id}`}>
                      <td colSpan={COLUMN_DEFINITIONS.length + 2} className="bg-slate-50 px-4 py-6 dark:bg-slate-800/40">
                        <div className="space-y-6">
                          <DistributionSplitRow
                            row={row}
                            operationsCatalog={operationsCatalog}
                            operationsDraft={operationsDraft}
                            setOperationsDraft={setOperationsDraft}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  {isExpanded && isEditing && row.type === 'dynamic' && (
                    <DistributionDynamicAllocationRow
                      row={row}
                      colSpan={COLUMN_DEFINITIONS.length + 2}
                      panelId={`distribution-panel-${row.id}`}
                      onOpenBuilder={() => setActiveDynamicAccountId(row.accountId)}
                      operationsCatalog={operationsCatalog}
                    />
                  )}
                </Fragment>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={COLUMN_DEFINITIONS.length + 2} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300">
                  No distribution rows match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
              <RatioAllocationManager
                initialSourceAccountId={activeDynamicAccountId}
                onDone={() => setActiveDynamicAccountId(null)}
                targetCatalog={operationTargetCatalog}
                resolveCanonicalTargetId={resolveOperationCanonicalTargetId}
                targetLabel="Target operation"
                targetPlaceholder="Select target operation"
                targetEmptyLabel="No operations available"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DistributionTable;