import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMappingStore, selectReconciliationGroups } from '../../store/mappingStore';
import { formatCurrencyAmount } from '../../utils/currency';

const ToggleIcon = ({ isOpen }: { isOpen: boolean }) =>
  isOpen ? (
    <ChevronDown aria-hidden className="h-4 w-4 text-gray-500 transition" />
  ) : (
    <ChevronRight aria-hidden className="h-4 w-4 text-gray-500 transition" />
  );

const ReconcilePane = () => {
  const reconciliationGroups = useMappingStore(selectReconciliationGroups);
  const [openSubcategories, setOpenSubcategories] = useState<Record<string, boolean>>({});
  const [openAccounts, setOpenAccounts] = useState<Record<string, boolean>>({});

  const initialOpenSubcategories = useMemo(() => {
    if (reconciliationGroups.length === 0) {
      return {};
    }
    const [topGroup] = reconciliationGroups;
    return topGroup ? { [topGroup.subcategory]: true } : {};
  }, [reconciliationGroups]);

  const toggleSubcategory = (subcategory: string) => {
    setOpenSubcategories(current => ({
      ...initialOpenSubcategories,
      ...current,
      [subcategory]: !(current[subcategory] ?? initialOpenSubcategories[subcategory]),
    }));
  };

  const toggleAccount = (accountId: string) => {
    setOpenAccounts(current => ({
      ...current,
      [accountId]: !current[accountId],
    }));
  };

  if (reconciliationGroups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300">
        No mapped activity is available yet. Start mapping accounts to view reconciliation details.
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-label="Reconciliation overview">
      {reconciliationGroups.map(group => {
        const isSubcategoryOpen = openSubcategories[group.subcategory] ?? initialOpenSubcategories[group.subcategory] ?? false;

        return (
          <div
            key={group.subcategory}
            className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm dark:border-slate-700 dark:bg-slate-800/60"
          >
            <button
              type="button"
              onClick={() => toggleSubcategory(group.subcategory)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-slate-700 dark:focus-visible:ring-offset-slate-900"
              aria-expanded={isSubcategoryOpen}
            >
              <div>
                <p className="text-base font-semibold text-amber-900 dark:text-amber-100">{group.subcategory}</p>
                <p className="text-xs text-amber-800/80 dark:text-amber-200/80">Mapped activity by standard subcategory</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyAmount(group.total)}
                </p>
                <ToggleIcon isOpen={isSubcategoryOpen} />
              </div>
            </button>

            {isSubcategoryOpen && (
              <div className="divide-y divide-amber-100 border-t border-amber-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                {group.accounts.map(account => {
                  const isAccountOpen = openAccounts[account.id] ?? false;

                  return (
                    <div key={account.id} className="transition">
                      <button
                        type="button"
                        onClick={() => toggleAccount(account.id)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                        aria-expanded={isAccountOpen}
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{account.label}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Mapped SCoA account</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {formatCurrencyAmount(account.total)}
                          </p>
                          <ToggleIcon isOpen={isAccountOpen} />
                        </div>
                      </button>

                      {isAccountOpen && (
                        <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                          <ul className="divide-y divide-amber-100 text-sm dark:divide-slate-700">
                            {account.sources.map(source => (
                              <li
                                key={`${account.id}-${source.glAccountId}-${source.entityName}`}
                                className="flex items-start justify-between gap-3 py-2"
                              >
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                                    {source.glAccountId} — {source.glAccountName}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {source.entityName}
                                    {source.entityName ? ` • ${source.entityName}` : ''}
                                  </p>
                                </div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {formatCurrencyAmount(source.amount)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReconcilePane;
