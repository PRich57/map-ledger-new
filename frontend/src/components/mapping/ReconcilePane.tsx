import { useMappingStore, selectReconciliationGroups } from '../../store/mappingStore';
import { MappedCategoryAccordion } from './MappedActivityAccordion';

const ReconcilePane = () => {
  const reconciliationGroups = useMappingStore(selectReconciliationGroups);

  if (reconciliationGroups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300">
        No mapped activity is available yet. Start mapping accounts to view reconciliation details.
      </div>
    );
  }

  return <MappedCategoryAccordion groups={reconciliationGroups} ariaLabel="Reconciliation overview" />;
};

export default ReconcilePane;
