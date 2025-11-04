import type {
  DynamicAllocationPreset,
  DynamicBasisAccount,
  DynamicSourceAccount,
} from '../types';

export interface GroupMemberValue {
  accountId: string;
  accountName: string;
  value: number;
}

export interface AllocateDynamicResult {
  allocations: number[];
  adjustmentIndex: number | null;
  adjustmentAmount: number;
}

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

export const getBasisValue = (
  account: DynamicBasisAccount,
  periodId?: string | null,
): number => {
  if (periodId && account.valuesByPeriod && periodId in account.valuesByPeriod) {
    const value = account.valuesByPeriod[periodId];
    if (typeof value === 'number') {
      return value;
    }
  }
  return account.value ?? 0;
};

export const getSourceValue = (
  account: DynamicSourceAccount,
  periodId?: string | null,
): number => {
  if (periodId && account.valuesByPeriod && periodId in account.valuesByPeriod) {
    const value = account.valuesByPeriod[periodId];
    if (typeof value === 'number') {
      return value;
    }
  }
  return account.value ?? 0;
};

export const getGroupMembersWithValues = (
  preset: DynamicAllocationPreset,
  basisAccounts: DynamicBasisAccount[],
  periodId?: string | null,
): GroupMemberValue[] =>
  preset.rows.map(row => {
    const account = basisAccounts.find(item => item.id === row.dynamicAccountId);
    const value = account ? getBasisValue(account, periodId) : 0;
    return {
      accountId: row.dynamicAccountId,
      accountName: account?.name ?? row.dynamicAccountId,
      value,
    };
  });

export const getGroupTotal = (
  preset: DynamicAllocationPreset,
  basisAccounts: DynamicBasisAccount[],
  periodId?: string | null,
): number =>
  getGroupMembersWithValues(preset, basisAccounts, periodId).reduce(
    (sum, member) => sum + member.value,
    0,
  );

const getLargestAllocationIndex = (values: number[]): number => {
  if (values.length === 0) {
    return -1;
  }
  let index = 0;
  let largest = Math.abs(values[0]);
  for (let i = 1; i < values.length; i += 1) {
    const candidate = Math.abs(values[i]);
    if (candidate > largest) {
      index = i;
      largest = candidate;
    }
  }
  return index;
};

export const allocateDynamic = (
  sourceAmount: number,
  basisValues: number[],
): AllocateDynamicResult => {
  if (basisValues.length === 0) {
    return { allocations: [], adjustmentIndex: null, adjustmentAmount: 0 };
  }

  const totalBasis = basisValues.reduce((sum, value) => sum + value, 0);
  if (totalBasis <= 0) {
    throw new Error('Basis total is zero; provide nonzero datapoints.');
  }

  const rawAllocations = basisValues.map(value => (value / totalBasis) * sourceAmount);
  const roundedAllocations = rawAllocations.map(value => roundToCents(value));
  const roundedTotal = roundedAllocations.reduce((sum, value) => sum + value, 0);
  const difference = roundToCents(sourceAmount - roundedTotal);

  if (difference === 0) {
    return { allocations: roundedAllocations, adjustmentIndex: null, adjustmentAmount: 0 };
  }

  const adjustmentIndex = getLargestAllocationIndex(rawAllocations);
  if (adjustmentIndex >= 0) {
    roundedAllocations[adjustmentIndex] = roundToCents(
      roundedAllocations[adjustmentIndex] + difference,
    );
  }

  return {
    allocations: roundedAllocations,
    adjustmentIndex: adjustmentIndex >= 0 ? adjustmentIndex : null,
    adjustmentAmount: difference,
  };
};
