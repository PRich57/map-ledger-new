import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { STANDARD_CHART_OF_ACCOUNTS } from '../../data/standardChartOfAccounts';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import type { DynamicAllocationPresetRow } from '../../types';
import {
  allocateDynamic,
  getBasisValue,
  getGroupMembersWithValues,
  normalizePercentages,
} from '../../utils/dynamicAllocation';

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

interface RatioAllocationBuilderProps {
  initialSourceAccountId?: string | null;
}

const RatioAllocationBuilder = ({ initialSourceAccountId }: RatioAllocationBuilderProps) => {
  const {
    allocations,
    presets,
    basisAccounts,
    sourceAccounts,
    selectedPeriod,
    availablePeriods,
    validationErrors,
    createPreset,
    updatePreset,
    addPresetRow,
    updatePresetRow,
    removePresetRow,
    getPresetAvailableDynamicAccounts,
    getPresetAvailableTargetAccounts,
    toggleAllocationPresetTargets,
    toggleTargetExclusion,
    setSelectedPeriod,
  } = useRatioAllocationStore();

  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetRows, setNewPresetRows] = useState<DynamicAllocationPresetRow[]>([]);

  const newPresetBasisHeaderId = useId();
  const newPresetTargetHeaderId = useId();
  const newPresetAmountHeaderId = useId();
  const newPresetActionsHeaderId = useId();

  const targetLabelById = useMemo(() => {
    const map = new Map<string, string>();
    STANDARD_CHART_OF_ACCOUNTS.forEach(option => {
      map.set(option.id, option.label);
    });
    return map;
  }, []);

  const computeNewPresetDynamicOptions = useCallback(
    (excludeIndex?: number) => {
      const usedIds = new Set(
        newPresetRows
          .flatMap((row, index) =>
            index === excludeIndex ? [] : [row.dynamicAccountId, row.targetAccountId],
          )
          .filter((value): value is string => Boolean(value)),
      );
      return basisAccounts
        .filter(account => !usedIds.has(account.id))
        .map(account => ({ value: account.id, label: account.name }));
    },
    [basisAccounts, newPresetRows],
  );

  const computeNewPresetTargetOptions = useCallback(
    (excludeIndex?: number) => {
      const usedIds = new Set(
        newPresetRows
          .flatMap((row, index) =>
            index === excludeIndex ? [] : [row.dynamicAccountId, row.targetAccountId],
          )
          .filter((value): value is string => Boolean(value)),
      );
      return STANDARD_CHART_OF_ACCOUNTS.filter(option => !usedIds.has(option.id))
        .map(option => ({ value: option.id, label: option.label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    [newPresetRows],
  );

  const allocationIdForInitialSource = useMemo(() => {
    if (!initialSourceAccountId) {
      return null;
    }
    const match = allocations.find(
      allocation => allocation.sourceAccount.id === initialSourceAccountId,
    );
    return match?.id ?? null;
  }, [allocations, initialSourceAccountId]);

  useEffect(() => {
    if (initialSourceAccountId) {
      if (allocationIdForInitialSource) {
        if (selectedAllocationId !== allocationIdForInitialSource) {
          setSelectedAllocationId(allocationIdForInitialSource);
        }
      } else if (selectedAllocationId) {
        setSelectedAllocationId(null);
      }
      return;
    }

    if (!selectedAllocationId && allocations.length > 0) {
      setSelectedAllocationId(allocations[0].id);
    }
    if (allocations.length === 0 && selectedAllocationId) {
      setSelectedAllocationId(null);
    }
  }, [
    allocationIdForInitialSource,
    allocations,
    initialSourceAccountId,
    selectedAllocationId,
  ]);

  useEffect(() => {
    if (!isCreatingPreset) {
      setNewPresetRows([]);
      setNewPresetName('');
      return;
    }
    if (isCreatingPreset && newPresetRows.length === 0) {
      const dynamicOptions = computeNewPresetDynamicOptions();
      const targetOptions = computeNewPresetTargetOptions();
      if (dynamicOptions.length > 0 && targetOptions.length > 0) {
        setNewPresetRows([
          {
            dynamicAccountId: '',
            targetAccountId: '',
          },
        ]);
      }
    }
  }, [
    computeNewPresetDynamicOptions,
    computeNewPresetTargetOptions,
    isCreatingPreset,
    newPresetRows.length,
  ]);

  const selectedAllocation = useMemo(() => {
    if (selectedAllocationId) {
      return allocations.find(allocation => allocation.id === selectedAllocationId) ?? null;
    }
    if (initialSourceAccountId) {
      const match = allocations.find(
        allocation => allocation.sourceAccount.id === initialSourceAccountId,
      );
      return match ?? null;
    }
    return allocations[0] ?? null;
  }, [allocations, initialSourceAccountId, selectedAllocationId]);

  const selectedPresetIds = useMemo(() => {
    if (!selectedAllocation) {
      return new Set<string>();
    }
    return new Set(
      selectedAllocation.targetDatapoints
        .filter(target => target.groupId)
        .map(target => target.groupId as string),
    );
  }, [selectedAllocation]);

  const excludedTargetIds = useMemo(() => {
    if (!selectedAllocation) {
      return new Set<string>();
    }
    return new Set(
      selectedAllocation.targetDatapoints
        .filter(target => target.isExclusion)
        .map(target => target.datapointId),
    );
  }, [selectedAllocation]);

  const excludedPresetIds = useMemo(() => {
    if (!selectedAllocation) {
      return new Set<string>();
    }
    return new Set(
      selectedAllocation.targetDatapoints
        .filter(target => target.isExclusion && target.groupId)
        .map(target => target.groupId as string),
    );
  }, [selectedAllocation]);

  const selectedSourceAccount = useMemo(() => {
    if (!selectedAllocation) {
      return null;
    }
    return sourceAccounts.find(account => account.id === selectedAllocation.sourceAccount.id) ?? null;
  }, [selectedAllocation, sourceAccounts]);

  const resolveBasisValue = useCallback(
    (accountId: string): number => {
      const basisAccount = basisAccounts.find(account => account.id === accountId);
      return basisAccount ? getBasisValue(basisAccount, selectedPeriod) : 0;
    },
    [basisAccounts, selectedPeriod],
  );

  const addNewPresetRow = useCallback(() => {
    const dynamicOptions = computeNewPresetDynamicOptions();
    const targetOptions = computeNewPresetTargetOptions();
    if (dynamicOptions.length === 0 || targetOptions.length === 0) {
      return;
    }
    setNewPresetRows(previous => [
      ...previous,
      {
        dynamicAccountId: '',
        targetAccountId: '',
      },
    ]);
  }, [computeNewPresetDynamicOptions, computeNewPresetTargetOptions]);

  const handleCreatePreset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = newPresetName.trim();
    const sanitizedRows = newPresetRows
      .map(row => ({
        dynamicAccountId: (row.dynamicAccountId ?? '').trim(),
        targetAccountId: (row.targetAccountId ?? '').trim(),
      }))
      .filter(row => row.dynamicAccountId && row.targetAccountId);
    if (!trimmedName || sanitizedRows.length === 0 || sanitizedRows.length !== newPresetRows.length) {
      return;
    }
    createPreset({ name: trimmedName, rows: sanitizedRows });
    setIsCreatingPreset(false);
    setNewPresetName('');
    setNewPresetRows([]);
  };


  const targetDetails = useMemo(() => {
    if (!selectedAllocation) {
      return [] as {
        targetId: string;
        name: string;
        basisValue: number;
        isExcluded: boolean;
        presetId: string | null;
      }[];
    }
    return selectedAllocation.targetDatapoints.map(target => {
      const isExcluded = excludedTargetIds.has(target.datapointId);
      if (target.groupId) {
        const preset = presets.find(item => item.id === target.groupId);
        let basisValue =
          typeof target.ratioMetric.value === 'number' && Number.isFinite(target.ratioMetric.value)
            ? target.ratioMetric.value
            : 0;
        if (preset) {
          const matchingRow = preset.rows.find(row => row.targetAccountId === target.datapointId);
          if (matchingRow) {
            const basisAccount = basisAccounts.find(account => account.id === matchingRow.dynamicAccountId);
            if (basisAccount) {
              basisValue = getBasisValue(basisAccount, selectedPeriod);
            }
          }
        }
        return {
          targetId: target.datapointId,
          name: target.name,
          basisValue,
          isExcluded,
          presetId: target.groupId,
        };
      }
      const basisAccount = basisAccounts.find(account => account.id === target.ratioMetric.id);
      const basisValue = basisAccount
        ? getBasisValue(basisAccount, selectedPeriod)
        : typeof target.ratioMetric.value === 'number'
            ? target.ratioMetric.value
            : 0;
      return {
        targetId: target.datapointId,
        name: target.name,
        basisValue,
        isExcluded,
        presetId: null,
      };
    });
  }, [basisAccounts, excludedTargetIds, presets, selectedAllocation, selectedPeriod]);

  const basisTotal = useMemo(
    () => targetDetails.reduce((sum, detail) => sum + detail.basisValue, 0),
    [targetDetails],
  );

  const previewPercentages = useMemo(() => {
    if (targetDetails.length === 0 || basisTotal <= 0) {
      return targetDetails.map(() => 0);
    }
    return normalizePercentages(
      targetDetails.map(detail => detail.basisValue / basisTotal),
    );
  }, [basisTotal, targetDetails]);

  const allocationIssues = useMemo(() => {
    if (!selectedAllocation) {
      return [];
    }
    return validationErrors.filter(
      issue =>
        issue.allocationId === selectedAllocation.id &&
        (!selectedPeriod || issue.periodId === selectedPeriod),
    );
  }, [selectedAllocation, selectedPeriod, validationErrors]);

  const sourceBalance = useMemo(() => {
    if (!selectedSourceAccount) {
      return 0;
    }
    if (selectedPeriod && selectedSourceAccount.valuesByPeriod && selectedPeriod in selectedSourceAccount.valuesByPeriod) {
      const periodValue = selectedSourceAccount.valuesByPeriod[selectedPeriod];
      if (typeof periodValue === 'number') {
        return periodValue;
      }
    }
    return selectedSourceAccount.value ?? 0;
  }, [selectedSourceAccount, selectedPeriod]);

  const previewComputation = useMemo(() => {
    if (targetDetails.length === 0 || basisTotal <= 0) {
      return { allocations: targetDetails.map(() => 0), adjustmentIndex: null, adjustmentAmount: 0 };
    }
    try {
      return allocateDynamic(
        sourceBalance,
        targetDetails.map(detail => detail.basisValue),
      );
    } catch {
      return { allocations: targetDetails.map(() => 0), adjustmentIndex: null, adjustmentAmount: 0 };
    }
  }, [basisTotal, sourceBalance, targetDetails]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-medium">Presets</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Pair each basis datapoint with a target account to reuse across dynamic allocations.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                type="button"
                onClick={() => setIsCreatingPreset(previous => !previous)}
                disabled={basisAccounts.length === 0}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                {isCreatingPreset ? 'Cancel' : 'Create preset'}
              </button>
            </div>
          </div>

          {basisAccounts.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              Complete your direct and percentage mappings to add basis datapoints before creating presets.
            </p>
          )}

          {isCreatingPreset && (
            <form onSubmit={handleCreatePreset} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Preset name
                  <input
                    value={newPresetName}
                    onChange={event => setNewPresetName(event.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    placeholder="e.g. Regional operations pool"
                  />
                </label>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead className="bg-slate-100 dark:bg-slate-800/40">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      <th id={newPresetBasisHeaderId} scope="col" className="px-3 py-2">
                        Basis datapoint
                      </th>
                      <th id={newPresetTargetHeaderId} scope="col" className="px-3 py-2">
                        Target account
                      </th>
                      <th id={newPresetAmountHeaderId} scope="col" className="px-3 py-2">
                        Basis amount
                      </th>
                      <th id={newPresetActionsHeaderId} scope="col" className="px-3 py-2 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {newPresetRows.map((row, index) => {
                      const dynamicOptions = computeNewPresetDynamicOptions(index);
                      const targetOptions = computeNewPresetTargetOptions(index);
                      const basisSelectId = `new-preset-row-${index}-basis`;
                      const targetSelectId = `new-preset-row-${index}-target`;

                      return (
                        <tr key={`new-preset-row-${index}`} className="rounded-md shadow-sm">
                          <td className="rounded-l-md border-y border-l border-slate-200 bg-white px-3 py-3 align-top text-sm dark:border-slate-700 dark:bg-slate-950">
                            <label htmlFor={basisSelectId} className="sr-only">
                              Basis datapoint
                            </label>
                            <select
                              id={basisSelectId}
                              aria-labelledby={newPresetBasisHeaderId}
                              value={row.dynamicAccountId}
                              onChange={event => {
                                const value = event.target.value;
                                setNewPresetRows(previous =>
                                  previous.map((current, currentIndex) =>
                                    currentIndex === index
                                      ? { ...current, dynamicAccountId: value }
                                      : current,
                                  ),
                                );
                              }}
                              className="w-full min-w-[12rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                              disabled={dynamicOptions.length === 0}
                            >
                              <option value="">
                                {dynamicOptions.length === 0
                                  ? 'No basis datapoints available'
                                  : 'Select basis datapoint'}
                              </option>
                              {dynamicOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-y border-l border-slate-200 bg-white px-3 py-3 align-top text-sm dark:border-slate-700 dark:bg-slate-950">
                            <label htmlFor={targetSelectId} className="sr-only">
                              Target account
                            </label>
                            <select
                              id={targetSelectId}
                              aria-labelledby={newPresetTargetHeaderId}
                              value={row.targetAccountId}
                              onChange={event => {
                                const value = event.target.value;
                                setNewPresetRows(previous =>
                                  previous.map((current, currentIndex) =>
                                    currentIndex === index
                                      ? { ...current, targetAccountId: value }
                                      : current,
                                  ),
                                );
                              }}
                              className="w-full min-w-[12rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                              disabled={targetOptions.length === 0}
                            >
                              <option value="">
                                {targetOptions.length === 0
                                  ? 'No target accounts available'
                                  : 'Select target account'}
                              </option>
                              {targetOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-y border-l border-slate-200 bg-white px-3 py-3 align-top text-sm dark:border-slate-700 dark:bg-slate-950">
                            <div aria-labelledby={newPresetAmountHeaderId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {row.dynamicAccountId
                                ? formatCurrency(resolveBasisValue(row.dynamicAccountId))
                                : formatCurrency(0)}
                            </div>
                          </td>
                          <td className="rounded-r-md border-y border-l border-r border-slate-200 bg-white px-3 py-3 align-top text-right text-sm dark:border-slate-700 dark:bg-slate-950">
                            <button
                              type="button"
                              aria-label="Remove new preset row"
                              onClick={() =>
                                setNewPresetRows(previous =>
                                  previous.filter((_, currentIndex) => currentIndex !== index),
                                )
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={addNewPresetRow}
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  disabled={
                    computeNewPresetDynamicOptions().length === 0 ||
                    computeNewPresetTargetOptions().length === 0
                  }
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add row
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={
                    !newPresetName.trim() ||
                    newPresetRows.length === 0 ||
                    newPresetRows.some(row => !row.dynamicAccountId || !row.targetAccountId)
                  }
                >
                  Save preset
                </button>
              </div>
            </form>
          )}

          <div className="space-y-4">
            {presets.map(preset => {
              const isSelected = selectedPresetIds.has(preset.id);
              const isExcludedForAllocation = excludedPresetIds.has(preset.id);
              const members = getGroupMembersWithValues(preset, basisAccounts, selectedPeriod);
              const basisTotalValue = members.reduce((sum, member) => sum + member.value, 0);

              return (
                <Card key={preset.id} className="border border-slate-200 shadow-sm dark:border-slate-700">
                  <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-3">
                        <input
                          value={preset.name}
                          onChange={event => updatePreset(preset.id, { name: event.target.value })}
                          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-medium shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="Preset name"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const dynamicOptions = getPresetAvailableDynamicAccounts(preset.id);
                            const targetOptions = getPresetAvailableTargetAccounts(preset.id);
                            if (dynamicOptions.length === 0 || targetOptions.length === 0) {
                              return;
                            }
                            addPresetRow(preset.id, {
                              dynamicAccountId: dynamicOptions[0].id,
                              targetAccountId: targetOptions[0].id,
                            });
                          }}
                          className="inline-flex items-center rounded-md border border-slate-300 bg-white p-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
                          disabled={
                            getPresetAvailableDynamicAccounts(preset.id).length === 0 ||
                            getPresetAvailableTargetAccounts(preset.id).length === 0
                          }
                          title="Add row"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {isExcludedForAllocation && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Excluded from mapping
                        </span>
                      )}
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {members.length} basis datapoint{members.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 text-sm md:items-end">
                      <div className="font-medium text-blue-700 dark:text-blue-400">
                        Basis total: {formatCurrency(basisTotalValue)}
                      </div>
                      <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                          checked={isSelected}
                          disabled={!selectedAllocation}
                          onChange={() => {
                            if (!selectedAllocation) {
                              return;
                            }
                            toggleAllocationPresetTargets(selectedAllocation.id, preset.id);
                          }}
                          aria-label={`Include ${preset.name} in the allocation`}
                        />
                        <span>{isSelected ? 'Included in allocation' : 'Include in allocation'}</span>
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                          <tr>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Basis datapoint
                            </th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Target account
                            </th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Basis value
                            </th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-950">
                          {preset.rows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                                Add rows to map basis datapoints to targets.
                              </td>
                            </tr>
                          ) : (
                            preset.rows.map((row, index) => {
                              const basisValue = formatCurrency(resolveBasisValue(row.dynamicAccountId));
                              const dynamicOptions = getPresetAvailableDynamicAccounts(preset.id, index);
                              const targetOptions = getPresetAvailableTargetAccounts(preset.id, index);

                              return (
                                <tr key={`${row.dynamicAccountId}-${row.targetAccountId}-${index}`}>
                                  <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">
                                    <select
                                      value={row.dynamicAccountId}
                                      onChange={event =>
                                        updatePresetRow(preset.id, index, {
                                          dynamicAccountId: event.target.value,
                                        })
                                      }
                                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    >
                                      {dynamicOptions.length === 0 ? (
                                        <option value="">No basis accounts available</option>
                                      ) : (
                                        dynamicOptions.map(option => (
                                          <option key={option.id} value={option.id}>
                                            {option.name}
                                          </option>
                                        ))
                                      )}
                                    </select>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">
                                    <select
                                      value={row.targetAccountId}
                                      onChange={event =>
                                        updatePresetRow(preset.id, index, {
                                          targetAccountId: event.target.value,
                                        })
                                      }
                                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    >
                                      {targetOptions.length === 0 ? (
                                        <option value="">No targets available</option>
                                      ) : (
                                        targetOptions.map(option => (
                                          <option key={option.id} value={option.id}>
                                            {option.label}
                                          </option>
                                        ))
                                      )}
                                    </select>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{basisValue}</td>
                                  <td className="px-4 py-3 text-sm">
                                    <button
                                      type="button"
                                      aria-label="Remove preset row"
                                      onClick={() => removePresetRow(preset.id, index)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-medium">Allocation preview</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Select an allocation and preset targets to preview distribution amounts.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Allocation source account
              <select
                value={selectedAllocation?.id ?? ''}
                onChange={event => setSelectedAllocationId(event.target.value || null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                {allocations.length === 0 ? (
                  <option value="">No allocations configured</option>
                ) : (
                  allocations.map(allocation => (
                    <option key={allocation.id} value={allocation.id}>
                      {allocation.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Reporting period
              <select
                value={selectedPeriod ?? ''}
                onChange={event => {
                  const { value } = event.target;
                  if (value) {
                    setSelectedPeriod(value);
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                {availablePeriods.length === 0 ? (
                  <option value="">No periods available</option>
                ) : (
                  availablePeriods.map(period => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          {allocationIssues.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-semibold">Allocation issues</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {allocationIssues.map(issue => (
                      <li key={issue.id}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Target account
                  </th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Exclude
                  </th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Basis total
                  </th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Ratio
                  </th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Allocated amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-950">
                {targetDetails.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Add target datapoints to preview the dynamic allocation.
                    </td>
                  </tr>
                ) : (
                  targetDetails.map((detail, index) => {
                    const percentage = previewPercentages[index] ?? 0;
                    const ratio = percentage / 100;
                    const allocatedValue = previewComputation.allocations[index] ?? 0;
                    const targetDatapoint = selectedAllocation?.targetDatapoints[index];
                    const isExcluded = detail.isExcluded;
                    const datapointId = targetDatapoint?.datapointId ?? detail.targetId;
                    const presetId = targetDatapoint?.groupId ?? detail.presetId ?? null;
                    const TargetIcon = isExcluded ? XCircle : CheckCircle2;
                    const iconClass = isExcluded ? 'text-rose-500 dark:text-rose-300' : 'text-emerald-500';
                    const rowKey = presetId ? `${detail.targetId}-${presetId}` : detail.targetId;
                    return (
                      <tr key={rowKey}>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <TargetIcon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
                              <span>{detail.name}</span>
                            </div>
                            {isExcluded && (
                              <span className="text-xs text-rose-600 dark:text-rose-300">Excluded from mapping</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-500"
                              checked={isExcluded}
                              disabled={!selectedAllocation || !datapointId}
                              onChange={() => {
                                if (!selectedAllocation || !datapointId) {
                                  return;
                                }
                                toggleTargetExclusion(selectedAllocation.id, datapointId);
                              }}
                            />
                            Exclude
                          </label>
                        </td>
                        <td className={`${
                          isExcluded ? 'px-4 py-3 text-sm text-rose-600 dark:text-rose-300' : 'px-4 py-3 text-sm text-slate-600 dark:text-slate-300'
                        }`}
                        >
                          {formatCurrency(detail.basisValue)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{percentage.toFixed(2)}%</td>
                        <td className={`${
                          isExcluded ? 'px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300' : 'px-4 py-3 text-sm font-semibold text-blue-700 dark:text-blue-400'
                        }`}
                        >
                          {formatCurrency(allocatedValue)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {basisTotal <= 0 && targetDetails.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-300">
              Provide nonzero basis datapoints to generate allocation amounts.
            </p>
          )}

          {previewComputation.adjustmentIndex !== null && Math.abs(previewComputation.adjustmentAmount) > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rounded totals include a {formatCurrency(previewComputation.adjustmentAmount)} adjustment applied to the
              largest allocation to balance back to the source amount.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RatioAllocationBuilder;