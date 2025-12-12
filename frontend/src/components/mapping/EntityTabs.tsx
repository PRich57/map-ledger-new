import React from 'react';
import type { EntitySummary } from '../../types';

interface EntityTabsProps {
  entities: EntitySummary[];
  activeEntityId: string | null;
  onSelect: (entityId: string) => void;
}

const EntityTabs = ({ entities, activeEntityId, onSelect }: EntityTabsProps) => {
  const tabs = React.useMemo<EntitySummary[]>(() => {
    const uniqueEntities = new Map(entities.map(entity => [entity.id, entity]));
    return Array.from(uniqueEntities.values());
  }, [entities]);

  return (
    <div className="bg-white px-3 py-2 shadow-sm dark:bg-slate-900 sm:rounded-lg sm:px-4 sm:py-3">
      <nav
        className="flex flex-wrap gap-2"
        aria-label="Entity selection"
        role="tablist"
        data-testid="entity-tabset"
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeEntityId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.id)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                isActive
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/50 dark:text-blue-50'
                  : 'border-gray-200 text-gray-700 hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-100'
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default EntityTabs;