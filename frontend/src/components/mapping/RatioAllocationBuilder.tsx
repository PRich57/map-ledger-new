import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import SearchableSelect from '../ui/SearchableSelect';
import { useChartOfAccountsStore } from '../../store/chartOfAccountsStore';
import {
  resolveTargetAccountId,
  useRatioAllocationStore,
  DEFAULT_PRESET_CONTEXT,
} from '../../store/ratioAllocationStore';
import type {
  DynamicAllocationPresetContext,
  DynamicAllocationPresetRow,
} from '../../types';
import { getBasisValue, getGroupMembersWithValues } from '../../utils/dynamicAllocation';

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export type RatioAllocationTargetCatalogOption = {
  id: string;
  label: string;
};

interface RatioAllocationBuilderProps {
  initialSourceAccountId?: string | null;
  targetCatalog?: RatioAllocationTargetCatalogOption[];
  resolveCanonicalTargetId?: (targetId?: string | null) => string | null;
  targetLabel?: string;
  targetPlaceholder?: string;
  targetEmptyLabel?: string;
  presetContext?: DynamicAllocationPresetContext;
}

const RatioAllocationBuilder = ({
  initialSourceAccountId,
  targetCatalog,
  resolveCanonicalTargetId,
  targetLabel = 'Target account',
  targetPlaceholder = 'Select target account',
  targetEmptyLabel = 'No target accounts available',
  presetContext,
}: RatioAllocationBuilderProps) => {
  const {
    allocations,
    presets: allPresets,
    basisAccounts,
    sourceAccounts,
    selectedPeriod,
    validationErrors,
    createPreset,
    updatePreset,
    addPresetRow,
    updatePresetRow,
    removePresetRow,
    getPresetAvailableDynamicAccounts,
    toggleAllocationPresetTargets,
    toggleTargetExclusion,
  } = useRatioAllocationStore();

  const resolvedPresetContext = presetContext ?? DEFAULT_PRESET_CONTEXT;
  const contextPresets = useMemo(
    () =>
      allPresets.filter(
        preset => (preset.context ?? DEFAULT_PRESET_CONTEXT) === resolvedPresetContext,
      ),
    [allPresets, resolvedPresetContext],
  );

  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetRows, setNewPresetRows] = useState<DynamicAllocationPresetRow[]>([]);
  const { options: chartOfAccountOptions } = useChartOfAccountsStore();

  const newPresetBasisHeaderId = useId();
  const newPresetTargetHeaderId = useId();
  const newPresetAmountHeaderId = useId();
  const newPresetActionsHeaderId = useId();

  const canonicalTargetResolver = useCallback(
    (targetId?: string | null) => {
      if (resolveCanonicalTargetId) {
        const resolved = resolveCanonicalTargetId(targetId);
        if (resolved && resolved.trim().length > 0) {
          return resolved.trim();
        }
        return null;
      }
      return resolveTargetAccountId(targetId);
    },
    [resolveCanonicalTargetId],
  );

  const defaultTargetCatalog = useMemo(
    () =>
      chartOfAccountOptions.map(option => ({
        id: option.id,
        label: option.label,
      })),
    [chartOfAccountOptions],
  );

  const preparedTargetCatalog = useMemo(() => {
    const sourceCatalog =
      targetCatalog && targetCatalog.length > 0 ? targetCatalog : defaultTargetCatalog;
    const seen = new Map<string, RatioAllocationTargetCatalogOption>();
    sourceCatalog.forEach(option => {
      const id = option.id?.trim();
      if (!id) {
        return;
      }
      const label = option.label?.trim() || id;
      if (!seen.has(id)) {
        seen.set(id, { id, label });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [defaultTargetCatalog, targetCatalog]);

  const { newPresetDynamicUsage, newPresetCanonicalUsage } = useMemo(() => {
    const dynamicUsage = new Map<string, Set<string>>();
    const canonicalUsage = new Map<string, Set<string>>();

    const addUsage = (map: Map<string, Set<string>>, id: string | null, key: string) => {
      if (!id) {
        return;
      }
      if (!map.has(id)) {
        map.set(id, new Set());
      }
      map.get(id)?.add(key);
    };

    newPresetRows.forEach((row, index) => {
      const basisKey = `basis-${index}`;
      const targetKey = `target-${index}`;
      if (row.dynamicAccountId) {
        addUsage(dynamicUsage, row.dynamicAccountId, basisKey);
        const basisAccount = basisAccounts.find(account => account.id === row.dynamicAccountId);
        const canonicalId = canonicalTargetResolver(basisAccount?.mappedTargetId);
        addUsage(canonicalUsage, canonicalId, basisKey);
      }
      const targetCanonicalId = canonicalTargetResolver(row.targetAccountId);
      addUsage(canonicalUsage, targetCanonicalId, targetKey);
    });

    return { newPresetDynamicUsage: dynamicUsage, newPresetCanonicalUsage: canonicalUsage };
  }, [basisAccounts, canonicalTargetResolver, newPresetRows]);

  const computeNewPresetDynamicOptions = useCallback(
    (rowIndex?: number) => {
      const dropdownKey = typeof rowIndex === 'number' ? `basis-${rowIndex}` : null;
      // Get the source account ID to exclude from basis options (prevents circular reference)
      const sourceAccountId = selectedAllocation?.sourceAccount.id;
      return basisAccounts
        .filter(account => {
          // Exclude the source account to prevent circular logic
          if (sourceAccountId && account.id === sourceAccountId) {
            return false;
          }
          const dynamicUsers = newPresetDynamicUsage.get(account.id);
          if (dynamicUsers && dynamicUsers.size > 0) {
            if (!dropdownKey || dynamicUsers.size > 1 || !dynamicUsers.has(dropdownKey)) {
              return false;
            }
          }
          const canonicalId = resolveTargetAccountId(account.mappedTargetId);
          if (!canonicalId) {
            return true;
          }
          const canonicalUsers = newPresetCanonicalUsage.get(canonicalId);
          if (!canonicalUsers || canonicalUsers.size === 0) {
            return true;
          }
          return (
            dropdownKey !== null &&
            canonicalUsers.size === 1 &&
            canonicalUsers.has(dropdownKey)
          );
        })
        .map(account => ({ id: account.id, value: account.id, label: account.name }));
    },
    [basisAccounts, newPresetDynamicUsage, newPresetCanonicalUsage, selectedAllocation?.sourceAccount.id],
  );

  const computeNewPresetTargetOptions = useCallback(
    (rowIndex?: number) => {
      const dropdownKey = typeof rowIndex === 'number' ? `target-${rowIndex}` : null;
      return preparedTargetCatalog
        .filter(option => {
          const canonicalId = canonicalTargetResolver(option.id);
          const canonicalUsers = canonicalId ? newPresetCanonicalUsage.get(canonicalId) : undefined;
        if (!canonicalUsers || canonicalUsers.size === 0) {
          return true;
        }
        return (
          dropdownKey !== null &&
          canonicalUsers.size === 1 &&
          canonicalUsers.has(dropdownKey)
        );
      })
        .map(option => ({ id: option.id, value: option.id, label: option.label }));
    },
    [canonicalTargetResolver, newPresetCanonicalUsage, preparedTargetCatalog],
  );

  const getPresetTargetOptions = useCallback(
      (presetId: string, rowIndex?: number) => {
        const preset = contextPresets.find(item => item.id === presetId);
        if (!preset) {
          return preparedTargetCatalog.map(option => ({ id: option.id, value: option.id, label: option.label }));
        }

      const canonicalUsage = new Map<string, Set<string>>();

      const addUsage = (map: Map<string, Set<string>>, id: string | null, key: string) => {
        if (!id) {
          return;
        }
        if (!map.has(id)) {
          map.set(id, new Set());
        }
        map.get(id)?.add(key);
      };

      preset.rows.forEach((row, index) => {
        const basisKey = `basis-${index}`;
        const targetKey = `target-${index}`;
        if (row.dynamicAccountId) {
          const basisAccount = basisAccounts.find(account => account.id === row.dynamicAccountId);
          const canonicalId = canonicalTargetResolver(basisAccount?.mappedTargetId);
          addUsage(canonicalUsage, canonicalId, basisKey);
        }
        const targetCanonicalId = canonicalTargetResolver(row.targetAccountId);
        addUsage(canonicalUsage, targetCanonicalId, targetKey);
      });

      const dropdownKey = typeof rowIndex === 'number' ? `target-${rowIndex}` : null;

      return preparedTargetCatalog
        .filter(option => {
          const canonicalId = canonicalTargetResolver(option.id);
          if (!canonicalId) {
            return true;
          }
          const canonicalUsers = canonicalUsage.get(canonicalId);
          if (!canonicalUsers || canonicalUsers.size === 0) {
            return true;
          }
          return (
            dropdownKey !== null &&
            canonicalUsers.size === 1 &&
            canonicalUsers.has(dropdownKey)
          );
        })
        .map(option => ({ id: option.id, value: option.id, label: option.label }));
    },
    [basisAccounts, canonicalTargetResolver, preparedTargetCatalog, contextPresets],
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
      if (newPresetRows.length > 0) {
        setNewPresetRows([]);
      }
      return;
    }
    if (newPresetRows.length === 0) {
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

  const resolveBasisValue = useCallback(
    (accountId: string): number => {
      const basisAccount = basisAccounts.find(account => account.id === accountId);
      return basisAccount ? getBasisValue(basisAccount, selectedPeriod) : 0;
    },
    [basisAccounts, selectedPeriod],
  );

  // Wrapper to filter out source account from existing preset basis options (prevents circular reference)
  const getFilteredPresetDynamicAccounts = useCallback(
    (presetId: string, rowIndex?: number) => {
      const options = getPresetAvailableDynamicAccounts(presetId, rowIndex);
      const sourceAccountId = selectedAllocation?.sourceAccount.id;
      if (!sourceAccountId) {
        return options;
      }
      return options.filter(account => account.id !== sourceAccountId);
    },
    [getPresetAvailableDynamicAccounts, selectedAllocation?.sourceAccount.id],
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
    const sanitizedRows = newPresetRows
      .map(row => ({
        dynamicAccountId: (row.dynamicAccountId ?? '').trim(),
        targetAccountId: (row.targetAccountId ?? '').trim(),
      }))
      .filter(row => row.dynamicAccountId && row.targetAccountId);
    if (sanitizedRows.length === 0 || sanitizedRows.length !== newPresetRows.length) {
      return;
    }
    const presetName =
      selectedAllocation?.sourceAccount.name?.trim() ||
      selectedAllocation?.sourceAccount.description?.trim() ||
      selectedAllocation?.sourceAccount.number?.trim() ||
      selectedAllocation?.sourceAccount.id?.trim() ||
      'Dynamic preset';

    createPreset({
      name: presetName,
      rows: sanitizedRows,
      applyToAllocationId: selectedAllocation?.id,
      context: presetContext,
    });
    setIsCreatingPreset(false);
    setNewPresetRows([]);
  };


  return (
    <div className="space-y-6 pb-12">
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
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead className="bg-slate-100 dark:bg-slate-800/40">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      <th id={newPresetBasisHeaderId} scope="col" className="px-3 py-2">
                        Basis datapoint
                      </th>
                      <th id={newPresetTargetHeaderId} scope="col" className="px-3 py-2">
                        {targetLabel}
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
                              className="w-full min-w-[16rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
                              {targetLabel}
                            </label>
                            <SearchableSelect
                              id={targetSelectId}
                              value={row.targetAccountId}
                              options={targetOptions}
                              placeholder={targetOptions.length === 0 ? targetEmptyLabel : targetPlaceholder}
                              onChange={value => {
                                setNewPresetRows(previous =>
                                  previous.map((current, currentIndex) =>
                                    currentIndex === index
                                      ? { ...current, targetAccountId: value }
                                      : current,
                                  ),
                                );
                              }}
                              disabled={targetOptions.length === 0}
                              className="w-full min-w-[16rem]"
                              noOptionsMessage="No matching accounts"
                            />
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
            {contextPresets.map(preset => {
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
                            const dynamicOptions = getFilteredPresetDynamicAccounts(preset.id);
                            const targetOptions = getPresetTargetOptions(preset.id);
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
                            getFilteredPresetDynamicAccounts(preset.id).length === 0 ||
                            getPresetTargetOptions(preset.id).length === 0
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
                    <div className="overflow-visible rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                          <tr>
                            <th
                              scope="col"
                              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 w-[38%] min-w-[16rem]"
                            >
                              Basis datapoint
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 w-[38%] min-w-[16rem]"
                            >
                              {targetLabel}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 w-[12%]"
                            >
                              Basis value
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 w-[10%]"
                            >
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
                              const dynamicOptions = getFilteredPresetDynamicAccounts(preset.id, index);
                              const targetOptions = getPresetTargetOptions(preset.id, index);

                              return (
                                <tr key={`${row.dynamicAccountId}-${row.targetAccountId}-${index}`}>
                                  <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100 w-[38%] min-w-[16rem] align-top">
                                    <select
                                      value={row.dynamicAccountId}
                                      onChange={event =>
                                        updatePresetRow(preset.id, index, {
                                          dynamicAccountId: event.target.value,
                                        })
                                      }
                                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                      aria-label="Preset basis datapoint"
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
                                  <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100 w-[38%] min-w-[16rem] align-top">
                                    <SearchableSelect
                                      value={row.targetAccountId}
                                      options={targetOptions}
                                      getOptionValue={option => option.id}
                                      placeholder={
                                        targetOptions.length === 0
                                          ? targetEmptyLabel
                                          : targetPlaceholder
                                      }
                                      onChange={value =>
                                        updatePresetRow(preset.id, index, {
                                          targetAccountId: value,
                                        })
                                      }
                                      className="w-full min-w-[16rem]"
                                      noOptionsMessage="No matching accounts"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 w-[12%]">{basisValue}</td>
                                  <td className="px-4 py-3 text-sm w-[10%]">
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

    </div>
  );
};

export default RatioAllocationBuilder;
