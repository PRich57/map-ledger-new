import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CompanySummary, GLAccountMappingRow } from '../../types';

interface MappingCompanyCellProps {
  account: GLAccountMappingRow;
  options: CompanySummary[];
  requiresManualAssignment: boolean;
  hasCompositeConflict: boolean;
  onCommit: (
    accountId: string,
    companyName: string,
    matchedCompanyId?: string | null,
  ) => void;
}

const getInputClasses = (
  hasError: boolean,
  showWarning: boolean,
): string => {
  const base =
    'w-full rounded-md border bg-white px-2 py-2 text-sm transition-colors focus:outline-none focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-offset-slate-900';
  if (hasError) {
    return `${base} border-red-300 focus:border-red-500 focus:ring-red-500/40`;
  }
  if (showWarning) {
    return `${base} border-amber-300 focus:border-amber-500 focus:ring-amber-500/40`;
  }
  return `${base} border-slate-300 focus:border-blue-500 focus:ring-blue-500/40`;
};

export default function MappingCompanyCell({
  account,
  options,
  requiresManualAssignment,
  hasCompositeConflict,
  onCommit,
}: MappingCompanyCellProps) {
  const [value, setValue] = useState(account.companyName ?? '');

  useEffect(() => {
    setValue(account.companyName ?? '');
  }, [account.companyName, account.id]);

  const datalistId = useMemo(
    () => (options.length > 0 ? `company-options-${account.id}` : undefined),
    [account.id, options.length],
  );

  const handleCommit = useCallback(() => {
    const trimmed = value.trim();
    const matchedOption = options.find(
      (option) => option.name.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0,
    );

    onCommit(account.id, trimmed, matchedOption?.id ?? null);
  }, [account.id, onCommit, options, value]);

  const handleBlur = useCallback(() => {
    handleCommit();
  }, [handleCommit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleCommit();
        (event.currentTarget as HTMLInputElement).blur();
      }
    },
    [handleCommit],
  );

  const trimmedValue = value.trim();
  const showRequiredWarning = trimmedValue.length === 0;
  const showError = hasCompositeConflict && trimmedValue.length > 0;

  const helperMessage = useMemo(() => {
    if (showError) {
      return {
        tone: 'error' as const,
        text: 'Duplicate combination. Enter a unique company name for this account and GL month.',
      };
    }

    if (showRequiredWarning) {
      return {
        tone: 'warning' as const,
        text: requiresManualAssignment
          ? 'Assign a company to distinguish duplicate accounts for this month.'
          : 'Company name is required.',
      };
    }

    if (requiresManualAssignment) {
      return {
        tone: 'warning' as const,
        text: 'Confirm this company assignment for the duplicate account.',
      };
    }

    return null;
  }, [requiresManualAssignment, showError, showRequiredWarning]);

  return (
    <div className="flex flex-col gap-1">
      <input
        list={datalistId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={requiresManualAssignment ? 'Enter company name' : 'Company name'}
        className={getInputClasses(showError, showRequiredWarning || requiresManualAssignment)}
      />
      {datalistId && (
        <datalist id={datalistId}>
          {options.map((option) => (
            <option key={option.id} value={option.name} />
          ))}
        </datalist>
      )}
      {helperMessage && (
        <p
          className={`text-xs ${
            helperMessage.tone === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          {helperMessage.text}
        </p>
      )}
    </div>
  );
}
