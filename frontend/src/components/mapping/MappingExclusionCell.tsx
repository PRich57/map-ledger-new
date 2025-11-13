import type { GLAccountMappingRow } from '../../types';
import { getAccountExcludedAmount } from '../../store/mappingStore';

interface MappingExclusionCellProps {
  account: GLAccountMappingRow;
  excludedAmountOverride?: number | null;
  excludedRatioOverride?: number | null;
}

const percentageFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatPercentage = (value: number): string => percentageFormatter.format(value);

const MappingExclusionCell = ({
  account,
  excludedAmountOverride,
  excludedRatioOverride,
}: MappingExclusionCellProps) => {
  const isFullyExcluded = account.mappingType === 'exclude' || account.status === 'Excluded';

  if (isFullyExcluded) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">100%</span>
      </div>
    );
  }

  const totalAmount = Math.abs(account.netChange);
  const excludedAmount = Math.abs(
    excludedAmountOverride ?? getAccountExcludedAmount(account),
  );

  if (excludedAmount <= 0 || totalAmount <= 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-slate-500 dark:text-slate-400">—</span>
      </div>
    );
  }

  const ratio = Math.min(
    1,
    excludedRatioOverride ?? (totalAmount > 0 ? excludedAmount / totalAmount : 0),
  );
  if (ratio <= 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-slate-500 dark:text-slate-400">—</span>
      </div>
    );
  }
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
