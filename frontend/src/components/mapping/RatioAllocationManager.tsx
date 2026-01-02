import { useEffect } from 'react';
import RatioAllocationBuilder, {
  type RatioAllocationTargetCatalogOption,
} from './RatioAllocationBuilder';
import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import type { DynamicAllocationPresetContext } from '../../types';

interface RatioAllocationManagerProps {
  initialSourceAccountId?: string | null;
  applyToSourceAccountIds?: string[];
  onPresetApplied?: (presetId: string, sourceAccountIds: string[]) => void;
  onDone?: () => void;
  targetCatalog?: RatioAllocationTargetCatalogOption[];
  resolveCanonicalTargetId?: (targetId?: string | null) => string | null;
  targetLabel?: string;
  targetPlaceholder?: string;
  targetEmptyLabel?: string;
  presetContext?: DynamicAllocationPresetContext;
}

const RatioAllocationManager = ({
  initialSourceAccountId,
  applyToSourceAccountIds,
  onPresetApplied,
  onDone,
  targetCatalog,
  resolveCanonicalTargetId,
  targetLabel,
  targetPlaceholder,
  targetEmptyLabel,
  presetContext,
}: RatioAllocationManagerProps) => {
  const { getOrCreateAllocation } = useRatioAllocationStore();

  useEffect(() => {
    if (initialSourceAccountId) {
      getOrCreateAllocation(initialSourceAccountId);
    }
  }, [initialSourceAccountId, getOrCreateAllocation]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Dynamic allocations</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Manage ratio-based rules that distribute standard chart of accounts balances across client operations.
        </p>
      </div>

      <RatioAllocationBuilder
        initialSourceAccountId={initialSourceAccountId}
        applyToSourceAccountIds={applyToSourceAccountIds}
        onPresetApplied={onPresetApplied}
        targetCatalog={targetCatalog}
        resolveCanonicalTargetId={resolveCanonicalTargetId}
        targetLabel={targetLabel}
        targetPlaceholder={targetPlaceholder}
        targetEmptyLabel={targetEmptyLabel}
        presetContext={presetContext}
      />

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
