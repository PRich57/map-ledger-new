import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { EntityReconciliationGroup, ReconciliationSubcategoryGroup } from '../../types';
import { formatCurrencyAmount } from '../../utils/currency';
import { formatPeriodDate } from '../../utils/period';

type Accent = 'neutral';

const accentStyles: Record<
  Accent,
  {
    card: string;
    header: string;
    body: string;
    account: string;
  }
> = {
  neutral: {
    card:
      'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-950/80 dark:hover:shadow-lg',
    header:
      'flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900',
    body:
      'border-t border-slate-200 bg-slate-50/70 dark:border-slate-800/70 dark:bg-slate-900/70',
    account:
      'flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900',
  },
};

const ToggleIcon = ({ isOpen }: { isOpen: boolean }) =>
  isOpen ? (
    <ChevronDown aria-hidden className="h-4 w-4 text-gray-500 transition" />
  ) : (
    <ChevronRight aria-hidden className="h-4 w-4 text-gray-500 transition" />
  );

const formatGlMonthLabel = (value?: string | null): string => {
  const formatted = formatPeriodDate(value);
  if (formatted) {
    return formatted;
  }
  if (value) {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return 'Unspecified GL month';
};

interface MappedCategoryAccordionProps {
  groups: ReconciliationSubcategoryGroup[];
  accent?: Accent;
  initialOpenCategoryId?: string | null;
  ariaLabel?: string;
}

export const MappedCategoryAccordion = ({
  groups,
  accent = 'neutral',
  initialOpenCategoryId,
  ariaLabel,
}: MappedCategoryAccordionProps) => {
  const styles = accentStyles[accent];
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [openAccounts, setOpenAccounts] = useState<Record<string, boolean>>({});

  const initialOpenCategories = useMemo(() => {
    if (groups.length === 0) {
      return {};
    }
    if (initialOpenCategoryId) {
      return { [initialOpenCategoryId]: true };
    }
    const [firstGroup] = groups;
    return firstGroup ? { [firstGroup.subcategory]: true } : {};
  }, [groups, initialOpenCategoryId]);

  const toggleCategory = (subcategory: string) => {
    setOpenCategories(current => ({
      ...initialOpenCategories,
      ...current,
      [subcategory]: !(current[subcategory] ?? initialOpenCategories[subcategory]),
    }));
  };

  const toggleAccount = (accountId: string) => {
    setOpenAccounts(current => ({
      ...current,
      [accountId]: !current[accountId],
    }));
  };

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3" aria-label={ariaLabel ?? 'Mapped activity rollup'}>
      {groups.map(group => {
        const isCategoryOpen =
          openCategories[group.subcategory] ?? initialOpenCategories[group.subcategory] ?? false;

        return (
          <div key={group.subcategory} className={styles.card}>
            <button
              type="button"
              onClick={() => toggleCategory(group.subcategory)}
              className={styles.header}
              aria-expanded={isCategoryOpen}
            >
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">
                  {group.subcategory}
                </p>
                <p className="text-xs text-gray-500/80 dark:text-gray-400">
                  Mapped activity by standard category
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyAmount(group.total)}
                </p>
                <ToggleIcon isOpen={isCategoryOpen} />
              </div>
            </button>

            {isCategoryOpen && (
              <div className={`${styles.body} pl-4`}>
                {group.accounts.map((account, accountIndex) => {
                  const isAccountOpen = openAccounts[account.id] ?? false;
                  const isLastAccount = accountIndex === group.accounts.length - 1;
                  const accountWrapperClasses = [
                    'transition',
                    'pl-3',
                    'pb-3',
                    !isLastAccount ? 'border-b border-slate-800/60 dark:border-slate-700/70' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div key={account.id} className={accountWrapperClasses}>
                      <div className="pl-6">
                        <button
                          type="button"
                          onClick={() => toggleAccount(account.id)}
                          className={styles.account}
                          aria-expanded={isAccountOpen}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {account.label}
                            </p>
                            <p className="text-xs text-slate-400">Mapped SCoA account</p>
                          </div>
                          <div className="flex items-center gap-3 text-slate-900 dark:text-white">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {formatCurrencyAmount(account.total)}
                            </p>
                            <ToggleIcon isOpen={isAccountOpen} />
                          </div>
                        </button>
                      </div>

                      {isAccountOpen && (
                        <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-700/80">
                      <div className="pl-12">
                            <div className="rounded-l bg-white/80 px-8 py-3  dark:bg-slate-700/80">
                              <div className="space-y-3">
                                <ul className="text-sm text-slate-900 dark:text-slate-200">
                                  {account.sources.map(source => (
                                    <li
                                      key={`${account.id}-${source.glAccountId}-${source.companyName}`}
                                      className="flex items-start justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/70 py-2 first:pt-0 last:border-b-0 last:pb-0"
                                    >
                                      <div>
                                        <p className="font-semibold text-slate-900 dark:text-white">
                                          {source.glAccountId} - {source.glAccountName}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                          <span>
                                            {source.companyName}
                                            {source.entityName && source.entityName !== source.companyName
                                              ? ` | ${source.entityName}`
                                              : ''}
                                          </span>
                                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                                            <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                              GL month
                                            </span>
                                            <span className="text-[11px] text-slate-800 dark:text-slate-50">
                                              {formatGlMonthLabel(source.glMonth)}
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {formatCurrencyAmount(source.amount)}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
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

interface EntityActivityAccordionProps {
  entities: EntityReconciliationGroup[];
}

const EntityActivityAccordion = ({ entities }: EntityActivityAccordionProps) => {
  const [openEntities, setOpenEntities] = useState<Record<string, boolean>>(() => {
    const [first] = entities;
    return first ? { [first.entityId]: true } : {};
  });

  if (entities.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3" aria-label="Mapped activity by entity">
      {entities.map(entity => {
        const isOpen = openEntities[entity.entityId] ?? false;
        const initialCategory = entity.categories[0]?.subcategory ?? null;
        return (
          <div
            key={entity.entityId}
            className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
          >
            <button
              type="button"
              onClick={() =>
                setOpenEntities(current => ({
                  ...current,
                  [entity.entityId]: !current[entity.entityId],
                }))
              }
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
              aria-expanded={isOpen}
            >
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {entity.entityName}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {entity.categories.length} categories |{' '}
                  {entity.categories.reduce((sum, category) => sum + category.accounts.length, 0)} mapped SCoA accounts
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyAmount(entity.total)}
                </p>
                <ToggleIcon isOpen={isOpen} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="pl-6 border-l border-slate-200/60 dark:border-slate-700/60">
                  <MappedCategoryAccordion
                    groups={entity.categories}
                    initialOpenCategoryId={initialCategory}
                    ariaLabel={`Mapped activity for ${entity.entityName}`}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EntityActivityAccordion;
