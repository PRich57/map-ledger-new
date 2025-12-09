import {
  ChangeEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  HelpCircle,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import MappingToolbar from './MappingToolbar';
import { selectPresetSummaries, useRatioAllocationStore } from '../../store/ratioAllocationStore';
import {
  getAccountExcludedAmount,
  selectFilteredAccounts,
  selectActiveStatuses,
  selectSearchTerm,
  selectSplitValidationIssues,
  selectAvailablePeriods,
  useMappingStore,
} from '../../store/mappingStore';
import { useTemplateStore } from '../../store/templateStore';
import { useMappingSelectionStore } from '../../store/mappingSelectionStore';
import type {
  GLAccountMappingRow,
  MappingPolarity,
  MappingStatus,
  MappingType,
  TargetScoaOption,
} from '../../types';
import MappingSplitRow from './MappingSplitRow';
import MappingExclusionCell from './MappingExclusionCell';
import DynamicAllocationRow from './DynamicAllocationRow';
import { buildTargetScoaOptions } from '../../utils/targetScoaOptions';
import RatioAllocationManager from './RatioAllocationManager';
import { getGroupTotal } from '../../utils/dynamicAllocation';
import { formatCurrencyAmount } from '../../utils/currency';
import { computeDynamicExclusionSummaries } from '../../utils/dynamicExclusions';
import SearchableSelect from '../ui/SearchableSelect';

type SortKey =
  | 'accountId'
  | 'accountName'
  | 'netChange'
  | 'exclusion'
  | 'status'
  | 'mappingType'
  | 'targetScoa'
  | 'polarity'
  | 'presetId'
  | 'aiConfidence';

type SortDirection = 'asc' | 'desc';

const STATUS_LABELS: Record<GLAccountMappingRow['status'], string> = {
  New: 'New',
  Unmapped: 'Unmapped',
  Mapped: 'Mapped',
  Excluded: 'Excluded',
};

const STATUS_STYLES: Record<GLAccountMappingRow['status'], string> = {
  New: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200',
  Unmapped:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  Mapped:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  Excluded: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200',
};

const STATUS_ICONS: Record<GLAccountMappingRow['status'], LucideIcon> = {
  New: Sparkles,
  Unmapped: HelpCircle,
  Mapped: Check,
  Excluded: XCircle,
};

export const STATUS_ORDER: Record<GLAccountMappingRow['status'], number> = {
  New: 0,
  Unmapped: 1,
  Mapped: 2,
  Excluded: 3,
};

const MAPPING_TYPE_LABELS: Record<GLAccountMappingRow['mappingType'], string> =
  {
    direct: 'Direct',
    percentage: 'Percentage',
    dynamic: 'Dynamic',
    exclude: 'Excluded',
  };

const MAPPING_TYPE_OPTIONS: { value: MappingType; label: string }[] = (
  Object.entries(MAPPING_TYPE_LABELS) as [MappingType, string][]
).map(([value, label]) => ({ value, label }));

const formatNetChange = (value: number) => formatCurrencyAmount(value);

const COLUMN_DEFINITIONS: { key: SortKey; label: string }[] = [
  { key: 'accountId', label: 'Account ID' },
  { key: 'accountName', label: 'Description' },
  { key: 'netChange', label: 'Activity' },
  { key: 'exclusion', label: 'Excluded' },
  { key: 'mappingType', label: 'Mapping Type' },
  { key: 'targetScoa', label: 'Target SCoA' },
  { key: 'polarity', label: 'Polarity' },
  { key: 'presetId', label: 'Preset' },
  { key: 'aiConfidence', label: 'Confidence' },
  { key: 'status', label: 'Status' },
];

const COLUMN_WIDTH_CLASSES: Partial<Record<SortKey, string>> = {
  targetScoa:
    'min-w-[18rem] md:min-w-[22rem] lg:min-w-[26rem] xl:min-w-[30rem] max-w-[36rem]',
  exclusion: 'w-56',
  aiConfidence: 'w-28',
};

const COLUMN_ALIGNMENT_CLASSES: Partial<Record<SortKey, string>> = {
  exclusion: 'text-center',
};

const HEADER_BUTTON_ALIGNMENT: Partial<Record<SortKey, string>> = {
  exclusion: 'justify-center',
};

const POLARITY_OPTIONS: MappingPolarity[] = ['Debit', 'Credit', 'Absolute'];

export default function MappingTable() {
  const {
    allocations,
    validationErrors,
    selectedPeriod,
    basisAccounts,
    groups,
    results,
  } = useRatioAllocationStore(
    (state) => ({
      allocations: state.allocations,
      validationErrors: state.validationErrors,
      selectedPeriod: state.selectedPeriod,
      basisAccounts: state.basisAccounts,
      groups: state.groups,
      results: state.results,
    })
  );
  const presetOptions = useRatioAllocationStore(selectPresetSummaries);
  const datapoints = useTemplateStore((state) => state.datapoints);
  const coaOptions = useMemo<TargetScoaOption[]>(
    () => buildTargetScoaOptions(datapoints),
    [datapoints]
  );
  const accounts = useMappingStore(selectFilteredAccounts);
  const availablePeriods = useMappingStore(selectAvailablePeriods);
  const activePeriod = useMappingStore((state) => state.activePeriod);
  const searchTerm = useMappingStore(selectSearchTerm);
  const activeStatuses = useMappingStore(selectActiveStatuses);
  const updateTarget = useMappingStore((state) => state.updateTarget);
  const updateMappingType = useMappingStore((state) => state.updateMappingType);
  const updatePolarity = useMappingStore((state) => state.updatePolarity);
  const applyPresetToAccounts = useMappingStore(
    (state) => state.applyPresetToAccounts
  );
  const addSplitDefinition = useMappingStore(
    (state) => state.addSplitDefinition
  );
  const updateSplitDefinition = useMappingStore(
    (state) => state.updateSplitDefinition
  );
  const removeSplitDefinition = useMappingStore(
    (state) => state.removeSplitDefinition
  );
  const { selectedIds, toggleSelection, setSelection, clearSelection } =
    useMappingSelectionStore();
  const splitValidationIssues = useMappingStore(selectSplitValidationIssues);
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set()
  );
  const previousMappingTypesRef = useRef<Map<string, MappingType>>(new Map());
  const [activeDynamicAccountId, setActiveDynamicAccountId] = useState<string | null>(
    null
  );

  const latestPeriod = useMemo(() => {
    if (availablePeriods.length === 0) {
      return null;
    }
    return availablePeriods[availablePeriods.length - 1] ?? null;
  }, [availablePeriods]);

  const splitIssueIds = useMemo(
    () => new Set(splitValidationIssues.map((issue) => issue.accountId)),
    [splitValidationIssues]
  );

  const dynamicIssueIds = useMemo(() => {
    const relevantIssues = selectedPeriod
      ? validationErrors.filter((issue) => issue.periodId === selectedPeriod)
      : validationErrors;
    return new Set(relevantIssues.map((issue) => issue.sourceAccountId));
  }, [selectedPeriod, validationErrors]);

  useEffect(() => {
    const validIds = new Set(accounts.map((account) => account.id));
    const filteredSelection = Array.from(selectedIds).filter((id) =>
      validIds.has(id)
    );
    if (filteredSelection.length !== selectedIds.size) {
      setSelection(filteredSelection);
    }
  }, [accounts, selectedIds, setSelection]);

  useEffect(() => {
    const previousMappingTypes = previousMappingTypesRef.current;
    const currentIds = new Set(accounts.map((account) => account.id));

    setExpandedRows((previous) => {
      let changed = false;
      const next = new Set(previous);

      previous.forEach((id) => {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      });

      accounts.forEach((account) => {
        const requiresSplit =
          account.mappingType === 'percentage' ||
          account.mappingType === 'dynamic';
        const previousType = previousMappingTypes.get(account.id);
        const previouslyRequired =
          previousType === 'percentage' || previousType === 'dynamic';

        if (requiresSplit && !previouslyRequired && !next.has(account.id)) {
          next.add(account.id);
          changed = true;
        }

        if (!requiresSplit && previouslyRequired && next.has(account.id)) {
          next.delete(account.id);
          changed = true;
        }
      });

      if (!changed) {
        return previous;
      }

      return next;
    });

    previousMappingTypesRef.current = new Map(
      accounts.map((account) => [account.id, account.mappingType])
    );
  }, [accounts]);

  const dynamicStatusByAccount = useMemo(() => {
    if (allocations.length === 0) {
      return new Map<string, MappingStatus>();
    }

    const groupMap = new Map(groups.map((group) => [group.id, group]));

    return allocations.reduce((accumulator, allocation) => {
      const basisTotal = allocation.targetDatapoints.reduce((sum, target) => {
        if (target.groupId) {
          const group = groupMap.get(target.groupId);
          if (!group) {
            return sum;
          }
          return sum + getGroupTotal(group, basisAccounts, selectedPeriod);
        }

        return sum + target.ratioMetric.value;
      }, 0);

      accumulator.set(
        allocation.sourceAccount.id,
        basisTotal > 0 ? 'Mapped' : 'Unmapped'
      );
      return accumulator;
    }, new Map<string, MappingStatus>());
  }, [allocations, basisAccounts, groups, selectedPeriod]);

  const getDisplayStatus = useMemo(() => {
    return (account: GLAccountMappingRow): MappingStatus => {
      if (account.mappingType === 'dynamic') {
        return dynamicStatusByAccount.get(account.id) ?? 'Unmapped';
      }
      return account.status;
    };
  }, [dynamicStatusByAccount]);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          account.accountId,
          account.accountName,
          account.entityName,
          account.activity,
          account.netChange.toString(),
          formatNetChange(account.netChange),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      const displayStatus = getDisplayStatus(account);
      const matchesStatus =
        activeStatuses.length === 0 || activeStatuses.includes(displayStatus);
      return matchesSearch && matchesStatus;
    });
  }, [accounts, searchTerm, activeStatuses, getDisplayStatus]);

  const sortedAccounts = useMemo(() => {
    if (!sortConfig) {
      return filteredAccounts;
    }
    const { key, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;
    const safeCompare = (a: GLAccountMappingRow, b: GLAccountMappingRow) => {
      const valueA = getSortValue(a, key, getDisplayStatus);
      const valueB = getSortValue(b, key, getDisplayStatus);
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return (valueA - valueB) * multiplier;
      }
      const textA = typeof valueA === 'number' ? valueA.toString() : valueA;
      const textB = typeof valueB === 'number' ? valueB.toString() : valueB;
      return (
        textA.localeCompare(textB, undefined, { sensitivity: 'base' }) *
        multiplier
      );
    };
    return [...filteredAccounts].sort(safeCompare);
  }, [filteredAccounts, sortConfig, getDisplayStatus]);

  const derivedSelectedPeriod = activePeriod ?? selectedPeriod ?? null;

  const dynamicExclusionSummaries = useMemo(
    () =>
      computeDynamicExclusionSummaries({
        accounts,
        allocations,
        basisAccounts,
        groups,
        selectedPeriod: derivedSelectedPeriod,
        results,
      }),
    [accounts, allocations, basisAccounts, derivedSelectedPeriod, groups, results]
  );

  useEffect(() => {
    if (!selectAllRef.current) return;
    const allIds = sortedAccounts.map((account) => account.id);
    const isAllSelected =
      allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
    selectAllRef.current.checked = isAllSelected;
    selectAllRef.current.indeterminate =
      selectedIds.size > 0 &&
      !isAllSelected &&
      allIds.some((id) => selectedIds.has(id));
  }, [sortedAccounts, selectedIds]);

  const handleSort = (key: SortKey) => {
    setSortConfig((previous) => {
      if (previous && previous.key === key) {
        const nextDirection: SortDirection =
          previous.direction === 'asc' ? 'desc' : 'asc';
        return { key, direction: nextDirection };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
    const shouldSelectAll = event.target.checked;
    if (shouldSelectAll) {
      setSelection(sortedAccounts.map((account) => account.id));
    } else {
      clearSelection();
    }
  };

  const handleRowSelection = (id: string) => {
    toggleSelection(id);
  };

  const toggleSplitRow = (id: string) => {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getAriaSort = (
    columnKey: SortKey
  ): 'ascending' | 'descending' | 'none' => {
    if (sortConfig?.key !== columnKey) {
      return 'none';
    }
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  let hasRenderedPriorPeriodDivider = false;

  return (
    <div className="space-y-4">
      <MappingToolbar />
      <div className="overflow-x-auto">
        <table
          className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700"
          role="table"
        >
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th scope="col" className="w-12 px-3 py-3">
                <span className="sr-only">Select all rows</span>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all rows"
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th scope="col" className="w-10 px-3 py-3">
                <span className="sr-only">Toggle split details</span>
              </th>
              {COLUMN_DEFINITIONS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={getAriaSort(column.key)}
                  className={`whitespace-nowrap px-3 py-3 ${COLUMN_WIDTH_CLASSES[column.key] ?? ''} ${COLUMN_ALIGNMENT_CLASSES[column.key] ?? ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className={`flex items-center gap-1 font-semibold text-slate-700 transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-200 dark:hover:text-blue-300 dark:focus:ring-offset-slate-900 ${HEADER_BUTTON_ALIGNMENT[column.key] ?? ''}`}
                  >
                    {column.label}
                    <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
            {sortedAccounts.map((account, index) => {
              const isPriorPeriod = latestPeriod !== null && account.glMonth !== latestPeriod;
              const shouldRenderDivider = isPriorPeriod && !hasRenderedPriorPeriodDivider;

              if (shouldRenderDivider) {
                hasRenderedPriorPeriodDivider = true;
              }

              const isSelected = selectedIds.has(account.id);
              const targetScoa =
                account.manualCOAId ?? account.suggestedCOAId ?? '';
              const targetScoaLabel = targetScoa
                ? coaOptions.find((option) => option.value === targetScoa)?.label ??
                  targetScoa
                : '';
              const requiresSplit =
                account.mappingType === 'percentage' ||
                account.mappingType === 'dynamic';
              const hasSplitIssue = splitIssueIds.has(account.id);
              const hasDynamicIssue = dynamicIssueIds.has(account.id);
              const hasAllocation =
                account.mappingType === 'dynamic'
                  ? allocations.some(
                      (allocation) => allocation.sourceAccount.id === account.id
                    )
                  : account.splitDefinitions.length > 0 && !hasSplitIssue;
              const displayStatus = getDisplayStatus(account);
              const statusLabel = STATUS_LABELS[displayStatus];
              const StatusIcon = STATUS_ICONS[displayStatus];
              const isExpanded = expandedRows.has(account.id);
              const dynamicExclusion =
                account.mappingType === 'dynamic'
                  ? dynamicExclusionSummaries.get(account.id)
                  : undefined;
              const computedExcludedAmount = getAccountExcludedAmount(account);
              const excludedAmount =
                account.mappingType === 'dynamic' && dynamicExclusion
                  ? dynamicExclusion.amount
                  : computedExcludedAmount;
              const excludedRatio =
                account.mappingType === 'dynamic'
                  ? dynamicExclusion?.percentage
                  : undefined;
              const adjustedActivity = account.netChange - excludedAmount;
              const showOriginalActivity = Math.abs(excludedAmount) > 0.005;
              const hasDynamicExclusionOverride =
                account.mappingType === 'dynamic' && Boolean(dynamicExclusion);

              const rowKey = `${account.id}-${account.entityId}-${account.glMonth ?? 'no-period'}-${index}`;

              return (
                <Fragment key={rowKey}>
                  {shouldRenderDivider && (
                    <tr className="bg-slate-100 dark:bg-slate-800/60">
                      <td
                        className="px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                        colSpan={12}
                      >
                        Earlier GL months
                        {latestPeriod ? ` (before ${latestPeriod})` : ''}
                      </td>
                    </tr>
                  )}
                  <tr
                    className={
                      isSelected ? 'bg-blue-50 dark:bg-slate-800/50' : undefined
                    }
                  >
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select account ${account.accountId}`}
                        checked={isSelected}
                        onChange={() => handleRowSelection(account.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-4">
                      {requiresSplit ? (
                        <button
                          type="button"
                          onClick={() => toggleSplitRow(account.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-slate-500 transition hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:text-blue-300 dark:focus:ring-offset-slate-900"
                          aria-expanded={isExpanded}
                          aria-controls={`split-panel-${account.id}`}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} split details for ${account.accountName}`}
                        >
                          <ChevronRight
                            className={`h-6 w-6 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                      ) : (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center"
                          aria-hidden="true"
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-slate-700 dark:text-slate-200">
                      {account.accountId}
                    </td>
                    <td className="px-3 py-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {account.accountName}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {formatNetChange(adjustedActivity)}
                      </div>
                      {showOriginalActivity && (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Original: {formatNetChange(account.netChange)}
                        </div>
                      )}
                    </td>
                    <td
                      className={`px-3 py-4 align-middle ${COLUMN_WIDTH_CLASSES.exclusion ?? ''}`}
                    >
                      <MappingExclusionCell
                        account={account}
                        excludedAmountOverride={
                          hasDynamicExclusionOverride ? excludedAmount : undefined
                        }
                        excludedRatioOverride={
                          hasDynamicExclusionOverride ? excludedRatio : undefined
                        }
                      />
                    </td>
                    <td className="px-3 py-4">
                      <label
                        className="sr-only"
                        htmlFor={`mapping-type-${account.id}`}
                      >
                        Select mapping type for {account.accountName}
                      </label>
                      <select
                        id={`mapping-type-${account.id}`}
                        value={account.mappingType}
                        onChange={(event) =>
                          updateMappingType(
                            account.id,
                            event.target.value as MappingType
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {MAPPING_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className={`px-3 py-4 ${COLUMN_WIDTH_CLASSES.targetScoa ?? ''}`}
                    >
                      {requiresSplit ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">
                            Target SCoA selections are managed within allocation
                            details for percentage and dynamic mappings.
                          </span>
                        </span>
                      ) : (
                        <>
                          <label
                            className="sr-only"
                            htmlFor={`scoa-${account.id}`}
                          >
                            Select target SCoA for {account.accountName}
                          </label>
                          <SearchableSelect
                            id={`scoa-${account.id}`}
                            value={targetScoa}
                            options={coaOptions}
                            placeholder="Search target"
                            onChange={nextValue => updateTarget(account.id, nextValue)}
                            noOptionsMessage="No matching accounts"
                            className="w-full"
                          />
                        </>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <label
                        className="sr-only"
                        htmlFor={`polarity-${account.id}`}
                      >
                        Select polarity for {account.accountName}
                      </label>
                      <select
                        id={`polarity-${account.id}`}
                        value={account.polarity}
                        onChange={(event) =>
                          updatePolarity(
                            account.id,
                            event.target.value as MappingPolarity
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {POLARITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4">
                      <label
                        className="sr-only"
                        htmlFor={`preset-${account.id}`}
                      >
                        Select preset for {account.accountName}
                      </label>
                      <select
                        id={`preset-${account.id}`}
                        value={account.presetId ?? ''}
                        onChange={(event) => {
                          const nextValue = event.target.value || null;
                          applyPresetToAccounts([account.id], nextValue);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">No preset</option>
                        {presetOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className={`px-3 py-4 text-slate-700 dark:text-slate-200 ${COLUMN_WIDTH_CLASSES.aiConfidence ?? ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {account.aiConfidence !== undefined
                            ? `${account.aiConfidence}%`
                            : '—'}
                        </span>
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
                            style={{
                              width: `${Math.min(account.aiConfidence ?? 0, 100)}%`,
                            }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-col gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[displayStatus]}`}
                          role="status"
                          aria-label={`Status ${statusLabel}`}
                        >
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          {statusLabel}
                        </span>
                        {account.mappingType === 'dynamic' ? (
                          <>
                            {hasDynamicIssue && (
                              <span className="text-xs text-rose-600 dark:text-rose-300">
                                Resolve dynamic allocation warnings
                              </span>
                            )}
                            {!hasAllocation && !hasDynamicIssue && (
                              <span className="text-xs text-amber-600 dark:text-amber-300">
                                Dynamic ratios need configuration
                              </span>
                            )}
                          </>
                        ) : (
                          requiresSplit &&
                          !hasAllocation && (
                            <span
                              className={`text-xs ${hasSplitIssue ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'}`}
                            >
                              {hasSplitIssue
                                ? 'Allocation percentages must equal 100%'
                                : 'Allocation details required'}
                            </span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                  {requiresSplit && isExpanded && (
                    account.mappingType === 'dynamic' ? (
                      <DynamicAllocationRow
                        account={account}
                        colSpan={COLUMN_DEFINITIONS.length + 2}
                        panelId={`split-panel-${account.id}`}
                        onOpenBuilder={() => setActiveDynamicAccountId(account.id)}
                      />
                    ) : (
                      <MappingSplitRow
                        account={account}
                        targetOptions={coaOptions}
                        colSpan={COLUMN_DEFINITIONS.length + 2}
                        panelId={`split-panel-${account.id}`}
                        onAddSplit={() => addSplitDefinition(account.id)}
                        onUpdateSplit={(splitId, updates) =>
                          updateSplitDefinition(account.id, splitId, updates)
                        }
                        onRemoveSplit={(splitId) =>
                          removeSplitDefinition(account.id, splitId)
                        }
                      />
                    )
                  )}
                </Fragment>
              );
            })}
            {sortedAccounts.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMN_DEFINITIONS.length + 2}
                  className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  No mapping rows match your filters.
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
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Dynamic allocation builder
                </h3>
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
}

type StatusResolver = (account: GLAccountMappingRow) => MappingStatus;

function getSortValue(
  account: GLAccountMappingRow,
  key: SortKey,
  resolveStatus?: StatusResolver
): string | number {
  switch (key) {
    case 'accountId':
      return account.accountId;
    case 'accountName':
      return account.accountName;
    case 'netChange':
      return account.netChange;
    case 'exclusion':
      return Math.abs(getAccountExcludedAmount(account));
    case 'status':
      return STATUS_ORDER[
        resolveStatus ? resolveStatus(account) : account.status
      ];
    case 'mappingType':
      return account.mappingType;
    case 'targetScoa':
      return account.manualCOAId ?? account.suggestedCOAId ?? '';
    case 'polarity':
      return account.polarity;
    case 'presetId':
      return account.presetId ?? '';
    case 'aiConfidence':
      return account.aiConfidence ?? 0;
    default:
      return '';
  }
}