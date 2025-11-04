import type { GLAccountMappingRow } from '../../types';
import { getAccountExcludedAmount } from '../../store/mappingStore';

interface MappingExclusionCellProps {
  account: GLAccountMappingRow;
}

const percentageFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const formatPercentage = (value: number): string => percentageFormatter.format(value);

const MappingExclusionCell = ({ account }: MappingExclusionCellProps) => {
  const isFullyExcluded = account.mappingType === 'exclude' || account.status === 'Excluded';

  if (isFullyExcluded) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">100%</span>
      </div>
    );
  }

  const excludedAmount = Math.abs(getAccountExcludedAmount(account));
  const totalAmount = Math.abs(account.netChange);

  if (excludedAmount <= 0 || totalAmount <= 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-slate-500 dark:text-slate-400">—</span>
      </div>
    );
  }

  const ratio = Math.min(1, excludedAmount / totalAmount);
  const formattedPercentage = formatPercentage(ratio);

  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {formattedPercentage}
      </span>
    </div>
  );
};

export default MappingExclusionCell;
