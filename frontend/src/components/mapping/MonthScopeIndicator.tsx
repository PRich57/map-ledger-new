import { useMemo } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { useMappingStore } from '../../store/mappingStore';
import type { GLAccountMappingRow } from '../../types';

interface MonthScopeIndicatorProps {
  account: GLAccountMappingRow;
}

const MonthScopeIndicator = ({ account }: MonthScopeIndicatorProps) => {
  const allAccounts = useMappingStore(state => state.accounts);

  const monthInfo = useMemo(() => {
    // Find all accounts with same companyId and accountId
    const relatedAccounts = allAccounts.filter(
      acc => acc.companyId === account.companyId && acc.accountId === account.accountId
    );

    if (relatedAccounts.length <= 1) {
      return { hasMultipleMonths: false, differentMappings: false, monthCount: 1 };
    }

    // Check if they have different mappings
    const mappings = new Set(
      relatedAccounts.map(acc => acc.manualCOAId || acc.suggestedCOAId || 'unmapped')
    );
    const mappingTypes = new Set(relatedAccounts.map(acc => acc.mappingType));

    const differentMappings = mappings.size > 1 || mappingTypes.size > 1;

    return {
      hasMultipleMonths: true,
      differentMappings,
      monthCount: relatedAccounts.length,
    };
  }, [allAccounts, account.companyId, account.accountId]);

  if (!monthInfo.hasMultipleMonths) {
    return null;
  }

  if (monthInfo.differentMappings) {
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
        title="This account has different mappings across months"
      >
        <AlertCircle className="h-3 w-3" />
        <span>Month-Specific</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200"
      title={`This account appears in ${monthInfo.monthCount} months with the same mapping`}
    >
      <Calendar className="h-3 w-3" />
      <span>{monthInfo.monthCount} months</span>
    </div>
  );
};

export default MonthScopeIndicator;