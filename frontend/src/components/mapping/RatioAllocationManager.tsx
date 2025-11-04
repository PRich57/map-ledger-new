import { useEffect, useState } from 'react';
import { Calculator, List } from 'lucide-react';
import RatioAllocationBuilder from './RatioAllocationBuilder';
import RatioAllocationList from './RatioAllocationList';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';

interface RatioAllocationManagerProps {
  initialSourceAccountId?: string | null;
  onDone?: () => void;
}

const RatioAllocationManager = ({ initialSourceAccountId, onDone }: RatioAllocationManagerProps) => {
  const [activeView, setActiveView] = useState<'list' | 'builder'>('builder');
  const { getOrCreateAllocation } = useRatioAllocationStore();

  useEffect(() => {
    if (initialSourceAccountId) {
      getOrCreateAllocation(initialSourceAccountId);
      setActiveView('builder');
    }
  }, [initialSourceAccountId, getOrCreateAllocation]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Dynamic allocations</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Manage ratio-based rules that distribute standard chart of accounts balances across client operations.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveView('list')}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              activeView === 'list'
                ? 'border border-transparent bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <List className="mr-2 h-4 w-4" aria-hidden="true" />
            List view
          </button>
          <button
            type="button"
            onClick={() => setActiveView('builder')}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              activeView === 'builder'
                ? 'border border-transparent bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calculator className="mr-2 h-4 w-4" aria-hidden="true" />
            Builder
          </button>
        </div>
      </div>

      {activeView === 'builder' ? (
        <RatioAllocationBuilder initialSourceAccountId={initialSourceAccountId} />
      ) : (
        <RatioAllocationList />
      )}

      {onDone && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default RatioAllocationManager;
