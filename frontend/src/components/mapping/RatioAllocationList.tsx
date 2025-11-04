import { useRatioAllocationStore } from '../../store/ratioAllocationStore';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { AlertTriangle, Calculator } from 'lucide-react';

const formatCurrency = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RatioAllocationList = () => {
  const { allocations, selectedPeriod, results, validationErrors } = useRatioAllocationStore();

  return (
    <div className="space-y-4">
      {allocations.map((allocation) => (
        <Card key={allocation.id}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">{allocation.name}</h3>
              <span className="text-sm text-gray-500">
                {allocation.sourceAccount.number}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-gray-500">
                {allocation.sourceAccount.description}
              </div>
              
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {allocation.targetDatapoints.map(target => (
                  <div key={target.datapointId} className="flex items-center rounded-lg bg-gray-50 p-4">
                    <Calculator className="mr-3 h-5 w-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{target.name}</div>
                      <div className="text-sm text-gray-500">
                        {target.isExclusion ? 'Excluded from mapping' : `via ${target.ratioMetric.name}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedPeriod ? (
                (() => {
                  const result = results.find(
                    entry => entry.periodId === selectedPeriod && entry.allocationId === allocation.id,
                  );
                  if (!result) {
                    return (
                      <p className="mt-4 text-sm text-gray-500">
                        Run checks to generate allocations for {selectedPeriod}.
                      </p>
                    );
                  }
                  return (
                    <div className="mt-4 space-y-2 rounded-lg bg-blue-50 p-4">
                      <h4 className="text-sm font-medium text-blue-900">Calculated allocation</h4>
                      {result.allocations.map(target => (
                        <div key={target.targetId} className="flex items-center justify-between text-sm">
                          <span className="text-blue-700">
                            {target.targetName}
                            {target.isExclusion ? ' • Excluded' : ''}
                          </span>
                          <span className="font-medium text-blue-900">
                            {formatCurrency(target.value)} · {target.percentage.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                      {result.adjustment && Math.abs(result.adjustment.amount) > 0 && (
                        <p className="text-xs text-blue-700">
                          Includes a {formatCurrency(result.adjustment.amount)} adjustment applied to reconcile rounding.
                        </p>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="mt-4 text-sm text-gray-500">Select a reporting period to view allocation results.</p>
              )}

              {selectedPeriod &&
                validationErrors
                  .filter(
                    issue =>
                      issue.periodId === selectedPeriod && issue.allocationId === allocation.id,
                  )
                  .map(issue => (
                    <div
                      key={issue.id}
                      className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      <span>{issue.message}</span>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default RatioAllocationList;