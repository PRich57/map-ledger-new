import type {
  AllocationResult,
  DynamicAllocationGroup,
  DynamicBasisAccount,
  GLAccountMappingRow,
  RatioAllocation,
  RatioAllocationTargetDatapoint,
} from '../types';
import { allocateDynamic, getBasisValue } from './dynamicAllocation';

const normalizeId = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
};

const resolveMemberBasisValue = (
  memberAccountId: string,
  basisLookup: Map<string, DynamicBasisAccount>,
  periodId: string | null,
): number => {
  const basisAccount = basisLookup.get(memberAccountId);
  if (basisAccount) {
    return getBasisValue(basisAccount, periodId);
  }
  return 0;
};

export const resolveTargetBasisValue = (
  target: RatioAllocationTargetDatapoint,
  basisLookup: Map<string, DynamicBasisAccount>,
  groupLookup: Map<string, DynamicAllocationGroup>,
  periodId: string | null,
): number => {
  const ratioMetricId = normalizeId(target.ratioMetric.id);
  if (ratioMetricId) {
    const directBasis = basisLookup.get(ratioMetricId);
    if (directBasis) {
      return getBasisValue(directBasis, periodId);
    }
  }

  if (target.groupId) {
    const group = groupLookup.get(target.groupId);
    if (group) {
      const matchingMember = group.members.find(member => {
        if (ratioMetricId) {
          return normalizeId(member.accountId) === ratioMetricId;
        }
        return normalizeId(member.targetAccountId) === normalizeId(target.datapointId);
      });
      if (matchingMember) {
        const memberBasis = resolveMemberBasisValue(
          matchingMember.accountId,
          basisLookup,
          periodId,
        );
        if (memberBasis > 0) {
          return memberBasis;
        }
        return matchingMember.basisValue;
      }
    }
  }

  return typeof target.ratioMetric.value === 'number'
    ? target.ratioMetric.value
    : 0;
};

type DynamicSummaryParams = {
  accounts: GLAccountMappingRow[];
  allocations: RatioAllocation[];
  basisAccounts: DynamicBasisAccount[];
  groups: DynamicAllocationGroup[];
  selectedPeriod: string | null;
  results?: AllocationResult[];
};

export type DynamicExclusionSummary = {
  amount: number;
  percentage: number;
};

export const computeDynamicExclusionSummaries = ({
  accounts,
  allocations,
  basisAccounts,
  groups,
  selectedPeriod,
  results = [],
}: DynamicSummaryParams): Map<string, DynamicExclusionSummary> => {
  const summaries = new Map<string, DynamicExclusionSummary>();
  if (accounts.length === 0 || allocations.length === 0) {
    return summaries;
  }

  const basisLookup = new Map(basisAccounts.map(account => [account.id, account]));
  const groupLookup = new Map(groups.map(group => [group.id, group]));
  const allocationLookup = new Map(
    allocations.map(allocation => [allocation.sourceAccount.id, allocation]),
  );
  const resultsByAccount = new Map<string, AllocationResult[]>();
  results.forEach(result => {
    const existing = resultsByAccount.get(result.sourceAccountId) ?? [];
    existing.push(result);
    resultsByAccount.set(result.sourceAccountId, existing);
  });

  accounts.forEach(account => {
    if (account.mappingType !== 'dynamic') {
      return;
    }

    const allocation = allocationLookup.get(account.id);
    if (!allocation) {
      return;
    }

    const hasExcludedTargets = allocation.targetDatapoints.some(
      target => target.isExclusion,
    );
    if (!hasExcludedTargets) {
      return;
    }

    const targetPeriod = selectedPeriod ?? null;
    let resolvedRatio: number | null = null;

    if (targetPeriod) {
      const periodResults = resultsByAccount.get(account.id) ?? [];
      const matchingResult = periodResults.find(
        result => result.periodId === targetPeriod,
      );
      if (matchingResult) {
        let excludedValue = matchingResult.allocations.reduce((sum, target) => {
          if (!target.isExclusion) {
            return sum;
          }
          return sum + Math.abs(target.value);
        }, 0);

        if (matchingResult.adjustment) {
          const adjustmentTarget = matchingResult.allocations.find(
            target => target.targetId === matchingResult.adjustment?.targetId,
          );
          if (adjustmentTarget?.isExclusion) {
            excludedValue += Math.abs(matchingResult.adjustment.amount);
          }
        }

        const sourceValue = Math.abs(matchingResult.sourceValue);
        if (sourceValue > 0 && excludedValue > 0) {
          resolvedRatio = Math.min(1, excludedValue / sourceValue);
        }
      }
    }

    if (resolvedRatio === null) {
      const basisValues = allocation.targetDatapoints.map(target =>
        resolveTargetBasisValue(target, basisLookup, groupLookup, targetPeriod),
      );
      const basisTotal = basisValues.reduce((sum, value) => sum + value, 0);
      if (basisTotal > 0) {
        const absoluteSource = Math.abs(account.netChange);
        if (absoluteSource > 0) {
          try {
            const computation = allocateDynamic(absoluteSource, basisValues);
            let excludedTotal = 0;
            allocation.targetDatapoints.forEach((target, index) => {
              if (!target.isExclusion) {
                return;
              }
              const targetValue = computation.allocations[index] ?? 0;
              excludedTotal += Math.max(0, Math.abs(targetValue));
              if (
                computation.adjustmentIndex === index &&
                Math.abs(computation.adjustmentAmount) > 0
              ) {
                excludedTotal += Math.abs(computation.adjustmentAmount);
              }
            });
            if (excludedTotal > 0) {
              resolvedRatio = Math.min(1, excludedTotal / absoluteSource);
            }
          } catch (error) {
            console.warn('Failed to derive exclusion ratio from preset basis', error);
          }
        }
      }
    }

    if (resolvedRatio === null || resolvedRatio <= 0) {
      return;
    }

    const ratio = resolvedRatio;
    const absoluteSource = Math.abs(account.netChange);
    const excludedAmount = absoluteSource > 0 ? ratio * absoluteSource : 0;
    const signedAmount = account.netChange >= 0 ? excludedAmount : -excludedAmount;

    summaries.set(account.id, { amount: signedAmount, percentage: ratio });
  });

  return summaries;
};

export const sumDynamicExclusionAmounts = (
  summaries: Map<string, DynamicExclusionSummary>,
): number => {
  let total = 0;
  summaries.forEach(entry => {
    total += entry.amount;
  });
  return total;
};