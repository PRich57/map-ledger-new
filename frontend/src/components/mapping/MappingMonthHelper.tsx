import { Info, Calendar } from 'lucide-react';
import { useMappingStore, selectActivePeriod, selectAvailablePeriods } from '../../store/mappingStore';
import { formatPeriodDate } from '../../utils/period';

const MappingMonthHelper = () => {
  const activePeriod = useMappingStore(selectActivePeriod);
  const availablePeriods = useMappingStore(selectAvailablePeriods);
  const activePeriodLabel = activePeriod ? formatPeriodDate(activePeriod) || activePeriod : null;

  if (availablePeriods.length <= 1) {
    return null; // No need to show helper if only one period
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
            Multi-Month Mapping
          </h4>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            {activePeriod ? (
              <>
                <p>
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Currently viewing: <strong>{activePeriodLabel}</strong>
                </p>
                <p>
                  Changes you make will apply to <strong>this month only</strong>. To apply mappings across all months:
                </p>
                <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                  <li>Select "All Periods" from the dropdown above</li>
                  <li>Choose the account rows you want to map</li>
                  <li>Apply your mapping (it will apply to all months of those accounts)</li>
                </ol>
              </>
            ) : (
              <>
                <p>
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Viewing: <strong>All Periods</strong> ({availablePeriods.length} months)
                </p>
                <p>
                  You're seeing all months together. Changes you make will apply to <strong>all months</strong> of each account. To create month-specific mappings:
                </p>
                <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                  <li>Select a specific month from the dropdown above</li>
                  <li>Apply mappings for that month only</li>
                  <li>Switch to another month to apply different mappings</li>
                </ol>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MappingMonthHelper;
