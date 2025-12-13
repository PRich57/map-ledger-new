import { normalizeGlMonth } from './extractDateFromText';
import { findChartOfAccountOption } from '../store/chartOfAccountsStore';
import type {
  GLAccountMappingRow,
  DistributionRow,
  MappingSplitDefinition,
} from '../types';

export interface DistributionActivityEntry {
  operationCd: string;
  scoaAccountId: string;
  glMonth: string;
  glValue: number;
}

interface ScoaContribution {
  scoaAccountId: string;
  glMonth: string;
  glAccountId: string;
  amount: number;
}

interface OperationShare {
  operationCd: string;
  share: number;
}

const getSignedAmountForAccount = (
  account: GLAccountMappingRow,
  value: number,
): number => {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }
  return account.netChange >= 0 ? value : -value;
};

const getSplitSignedAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => {
  if (account.netChange === 0) {
    return 0;
  }

  if (split.allocationType === 'amount') {
    const absolute = Math.max(0, Math.abs(split.allocationValue ?? 0));
    const capped = Math.min(absolute, Math.abs(account.netChange));
    return getSignedAmountForAccount(account, capped);
  }

  const absoluteNetChange = Math.abs(account.netChange);
  const percentage = Math.max(0, split.allocationValue ?? 0);
  const computed = (absoluteNetChange * percentage) / 100;
  return getSignedAmountForAccount(account, computed);
};

const resolveScoaKey = (value?: string | null): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  const target = findChartOfAccountOption(normalized);
  return (target?.id?.trim() || normalized) as string;
};

const buildScoaContributions = (
  accounts: GLAccountMappingRow[],
): Map<string, ScoaContribution[]> => {
  const contributions = new Map<string, ScoaContribution[]>();

  const addContribution = (
    key: string,
    account: GLAccountMappingRow,
    glMonth: string,
    amount: number,
  ) => {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }
    const existing = contributions.get(key) ?? [];
    existing.push({
      scoaAccountId: key,
      glMonth,
      glAccountId: account.accountId,
      amount,
    });
    contributions.set(key, existing);
  };

  accounts.forEach(account => {
    const month = account.glMonth ? normalizeGlMonth(account.glMonth) : '';
    if (!month) {
      return;
    }
    if (!Number.isFinite(account.netChange) || account.netChange === 0) {
      return;
    }

    if (account.mappingType === 'direct') {
      if (account.status !== 'Mapped') {
        return;
      }
      const scoaKey = resolveScoaKey(account.manualCOAId ?? account.suggestedCOAId);
      if (!scoaKey) {
        return;
      }
      addContribution(scoaKey, account, month, account.netChange);
      return;
    }

    if (account.mappingType === 'percentage') {
      account.splitDefinitions.forEach(split => {
        if (split.isExclusion) {
          return;
        }
        const scoaKey = resolveScoaKey(split.targetId);
        if (!scoaKey) {
          return;
        }
        const amount = getSplitSignedAmount(account, split);
        if (amount === 0) {
          return;
        }
        addContribution(scoaKey, account, month, amount);
      });
    }
  });

  return contributions;
};

const normalizeOperationCd = (value?: string | null): string | null => {
  const normalized = value?.toString().trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : null;
};

const buildSharesForRow = (row: DistributionRow): OperationShare[] => {
  const operations = row.operations
    .map(operation => {
      const code = normalizeOperationCd(operation.code ?? operation.id ?? operation.name ?? null);
      if (!code) {
        return null;
      }
      return {
        operationCd: code,
        allocation: operation.allocation,
      };
    })
    .filter((entry): entry is { operationCd: string; allocation?: number } => Boolean(entry));

  if (operations.length === 0) {
    return [];
  }

  if (row.type === 'direct') {
    const [primary] = operations;
    if (!primary) {
      return [];
    }
    return [{ operationCd: primary.operationCd, share: 1 }];
  }

  const shares = operations.map(operation => {
    const fraction = Number.isFinite(operation.allocation ?? NaN)
      ? (operation.allocation ?? 0) / 100
      : 0;
    return { operationCd: operation.operationCd, share: fraction };
  });

  const hasPositiveShare = shares.some(share => share.share > 0);

  if (hasPositiveShare) {
    return shares.filter(share => share.share > 0);
  }

  const equalShare = 1 / shares.length;
  return shares.map(share => ({ operationCd: share.operationCd, share: equalShare }));
};

export const buildDistributionActivityEntries = (
  rows: DistributionRow[],
  accounts: GLAccountMappingRow[],
): DistributionActivityEntry[] => {
  if (!rows.length || !accounts.length) {
    return [];
  }

  const contributionsByScoa = buildScoaContributions(accounts);
  const aggregated = new Map<string, DistributionActivityEntry>();

  rows.forEach(row => {
    const shares = buildSharesForRow(row);
    if (!shares.length) {
      return;
    }
    const candidateKeys = [row.mappingRowId, row.accountId]
      .map(value => value?.trim())
      .filter(Boolean) as string[];
    if (!candidateKeys.length) {
      return;
    }

    const contributions = candidateKeys
      .map(key => contributionsByScoa.get(key))
      .find(value => value && value.length > 0);

    if (!contributions) {
      return;
    }

    contributions.forEach(contribution => {
      shares.forEach(share => {
        const scaled = contribution.amount * share.share;
        if (scaled === 0 || !Number.isFinite(scaled)) {
          return;
        }
        const mapKey = `${share.operationCd}|||${row.accountId || contribution.scoaAccountId}|||${contribution.glMonth}`;
        const existing = aggregated.get(mapKey);
        if (existing) {
          existing.glValue += scaled;
          return;
        }
        aggregated.set(mapKey, {
          operationCd: share.operationCd,
          scoaAccountId: row.accountId || contribution.scoaAccountId,
          glMonth: contribution.glMonth,
          glValue: scaled,
        });
      });
    });
  });

  return Array.from(aggregated.values());
};
