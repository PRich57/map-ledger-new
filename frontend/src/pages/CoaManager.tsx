import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { useCoaManagerStore } from '../store/coaManagerStore';

const costTypeOptions = [
  { label: 'None', value: '' },
  { label: 'Overhead', value: 'Overhead' },
  { label: 'Variable', value: 'Variable' },
] as const;

type CostType = (typeof costTypeOptions)[number]['value'];

export default function CoaManager() {
  const industries = useCoaManagerStore(state => state.industries);
  const industriesLoading = useCoaManagerStore(state => state.industriesLoading);
  const industriesError = useCoaManagerStore(state => state.industriesError);
  const selectedIndustry = useCoaManagerStore(state => state.selectedIndustry);
  const rows = useCoaManagerStore(state => state.rows);
  const rowsLoading = useCoaManagerStore(state => state.rowsLoading);
  const rowsError = useCoaManagerStore(state => state.rowsError);
  const columns = useCoaManagerStore(state => state.columns);
  const selectedRowIds = useCoaManagerStore(state => state.selectedRowIds);
  const rowStatus = useCoaManagerStore(state => state.rowUpdateStatus);
  const createIndustryError = useCoaManagerStore(state => state.createIndustryError);
  const createIndustryLoading = useCoaManagerStore(state => state.createIndustryLoading);
  const loadIndustries = useCoaManagerStore(state => state.loadIndustries);
  const selectIndustry = useCoaManagerStore(state => state.selectIndustry);
  const createIndustry = useCoaManagerStore(state => state.createIndustry);
  const clearCreateIndustryError = useCoaManagerStore(
    state => state.clearCreateIndustryError,
  );
  const toggleRowSelection = useCoaManagerStore(state => state.toggleRowSelection);
  const toggleSelectAll = useCoaManagerStore(state => state.toggleSelectAll);
  const updateRowCostType = useCoaManagerStore(state => state.updateRowCostType);
  const updateBatchCostType = useCoaManagerStore(state => state.updateBatchCostType);
  const [newIndustryName, setNewIndustryName] = useState('');
  const [batchCostType, setBatchCostType] = useState<CostType>('');
  const columnLabels = useMemo(() => {
    return new Map(columns.map(column => [column.key, column.label]));
  }, [columns]);

  const resolveLabel = (key: string, fallback: string) =>
    columnLabels.get(key) ?? fallback;

  useEffect(() => {
    loadIndustries();
  }, [loadIndustries]);

  const handleAddIndustry = async () => {
    const trimmed = newIndustryName.trim();
    if (!trimmed) {
      return;
    }
    clearCreateIndustryError();
    const created = await createIndustry(trimmed);
    if (created) {
      setNewIndustryName('');
    }
  };

  const handleRowCostTypeChange = (rowId: string, costType: CostType) => {
    const hasBatchSelection =
      selectedRowIds.has(rowId) && selectedRowIds.size > 1;
    if (hasBatchSelection) {
      updateBatchCostType(Array.from(selectedRowIds), costType);
      return;
    }
    updateRowCostType(rowId, costType);
  };

  const handleBatchApply = () => {
    if (selectedRowIds.size === 0) {
      return;
    }
    updateBatchCostType(Array.from(selectedRowIds), batchCostType);
  };

  const selectedCount = selectedRowIds.size;
  const isAllSelected = rows.length > 0 && selectedCount === rows.length;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Chart of Accounts
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">COA Manager</h1>
        <p className="text-sm text-gray-600">
          Manage chart of accounts by industry and update cost type classifications.
        </p>
      </header>

      <section aria-labelledby="industry-heading" className="space-y-4">
        <div className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label htmlFor="industry" className="text-sm font-medium text-gray-700">
              Select industry
            </label>
            <select
              id="industry"
              value={selectedIndustry}
              onChange={event => {
                selectIndustry(event.target.value);
              }}
              disabled={industriesLoading}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            >
              <option value="">Choose an industry</option>
              {industries.map(industry => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <label htmlFor="new-industry" className="text-sm font-medium text-gray-700">
              Add industry
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="new-industry"
                type="text"
                value={newIndustryName}
                onChange={event => {
                  setNewIndustryName(event.target.value);
                  clearCreateIndustryError();
                }}
                placeholder="New industry name"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddIndustry}
                disabled={createIndustryLoading}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                {createIndustryLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Industry
                  </>
                )}
              </button>
            </div>
            {createIndustryError ? (
              <p className="text-sm text-red-600">{createIndustryError}</p>
            ) : null}
          </div>
        </div>
        {industriesError ? (
          <p className="text-sm text-red-600">{industriesError}</p>
        ) : null}
      </section>

      {selectedIndustry ? (
        <section aria-label="Chart of accounts table" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedIndustry} Chart of Accounts
              </h2>
              <p className="text-sm text-gray-600">
                {selectedCount} row{selectedCount === 1 ? '' : 's'} selected
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="batch-cost-type" className="text-sm font-medium text-gray-700">
                Batch update {resolveLabel('costType', 'COST_TYPE')}
              </label>
              <select
                id="batch-cost-type"
                value={batchCostType}
                onChange={event => setBatchCostType(event.target.value as CostType)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:w-48"
              >
                {costTypeOptions.map(option => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBatchApply}
                disabled={selectedRowIds.size === 0}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                Apply to selected
              </button>
            </div>
          </div>

          {rowsLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              Loading COA rows…
            </div>
          ) : rowsError ? (
            <div className="rounded-lg border border-dashed border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {rowsError}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all rows"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Select
                        </span>
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {resolveLabel('accountNumber', 'Account')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {resolveLabel('accountName', 'Name')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {resolveLabel('category', 'Category')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {resolveLabel('department', 'Department')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {resolveLabel('costType', 'COST_TYPE')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => {
                    const status = rowStatus[row.id] ?? { state: 'idle' };
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                            aria-label={`Select account ${row.accountNumber}`}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {row.accountNumber}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{row.accountName}</td>
                        <td className="px-4 py-3 text-gray-700">{row.category}</td>
                        <td className="px-4 py-3 text-gray-700">{row.department}</td>
                        <td className="px-4 py-3">
                          <label className="sr-only" htmlFor={`cost-type-${row.id}`}>
                            {resolveLabel('costType', 'COST_TYPE')} for account{' '}
                            {row.accountNumber}
                          </label>
                          <select
                            id={`cost-type-${row.id}`}
                            value={row.costType}
                            onChange={event =>
                              handleRowCostTypeChange(row.id, event.target.value as CostType)
                            }
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                          >
                            {costTypeOptions.map(option => (
                              <option key={option.label} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" role="status" aria-live="polite">
                            {status.state === 'pending' && (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                <span className="text-xs text-gray-500">Updating…</span>
                              </>
                            )}
                            {status.state === 'success' && (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="text-xs text-emerald-600">Updated</span>
                              </>
                            )}
                            {status.state === 'error' && (
                              <>
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="text-xs text-amber-700">
                                  {status.message ?? 'Update failed.'}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
          Select or add an industry to load chart of accounts details.
        </div>
      )}
    </div>
  );
}
