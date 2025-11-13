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

export interface PresetBasisRow {
  dynamicAccountId: string;
  targetAccountId: string;
  basisValue: number;
  presetId: string;
  presetName: string;
}

export interface AllocateDynamicWithPresetsResult {
  allocations: Array<{
    targetAccountId: string;
    value: number;
    basisValue: number;
    ratio: number;
    percentage: number;
    presetId?: string;
  }>;
  adjustmentIndex: number | null;
  adjustmentAmount: number;
  presetAllocations: Array<{
    presetId: string;
    presetName: string;
    totalBasis: number;
    allocatedAmount: number;
    rows: Array<{
      targetAccountId: string;
      basisValue: number;
      allocation: number;
      ratio: number;
      percentage: number;
    }>;
  }>;
}

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

const roundToPercent = (value: number): number => Math.round(value * 100) / 100;

const clampFinite = (value: number): number => (Number.isFinite(value) ? value : 0);

export const normalizePercentages = (ratios: number[]): number[] => {
  if (ratios.length === 0) {
    return [];
  }

  const sanitized = ratios.map(value => Math.max(0, clampFinite(value)));
  const total = sanitized.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return sanitized.map(() => 0);
  }

  const normalizedRatios = sanitized.map(value => value / total);
  const rawPercentages = normalizedRatios.map(value => value * 100);
  const roundedPercentages = rawPercentages.map(value => roundToPercent(value));
  const roundedTotal = roundedPercentages.reduce((sum, value) => sum + value, 0);
  const difference = roundToPercent(100 - roundedTotal);

  if (difference === 0) {
    return roundedPercentages;
  }

  const adjustmentIndex = getLargestAllocationIndex(rawPercentages);
  if (adjustmentIndex >= 0) {
    roundedPercentages[adjustmentIndex] = roundToPercent(
      roundedPercentages[adjustmentIndex] + difference,
    );
  }

  return roundedPercentages;
};

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

export const allocateDynamicWithPresets = (
  sourceAmount: number,
  presetRows: PresetBasisRow[],
  nonPresetBasisValues: Array<{ basisValue: number; targetId: string }>,
): AllocateDynamicWithPresetsResult => {
  // Group rows by preset
  const rowsByPreset = new Map<string, PresetBasisRow[]>();
  presetRows.forEach(row => {
    const existing = rowsByPreset.get(row.presetId) ?? [];
    existing.push(row);
    rowsByPreset.set(row.presetId, existing);
  });

  // Calculate total basis per preset
  const presetTotals = new Map<string, { name: string; totalBasis: number }>();
  rowsByPreset.forEach((rows, presetId) => {
    const totalBasis = rows.reduce((sum, row) => sum + row.basisValue, 0);
    presetTotals.set(presetId, { name: rows[0].presetName, totalBasis });
  });

  // Include non-preset values in the overall basis calculation
  const nonPresetTotal = nonPresetBasisValues.reduce((sum, item) => sum + item.basisValue, 0);
  const presetBasisTotal = Array.from(presetTotals.values()).reduce(
    (sum, preset) => sum + preset.totalBasis,
    0,
  );
  const totalBasis = presetBasisTotal + nonPresetTotal;

  if (totalBasis <= 0) {
    throw new Error('Basis total is zero; provide nonzero datapoints.');
  }

  // Allocate source amount to each preset and non-preset targets
  const presetAllocations: AllocateDynamicWithPresetsResult['presetAllocations'] = [];
  const allAllocations: AllocateDynamicWithPresetsResult['allocations'] = [];

  // Process each preset
  rowsByPreset.forEach((rows, presetId) => {
    const presetInfo = presetTotals.get(presetId);
    if (!presetInfo || presetInfo.totalBasis <= 0) {
      return;
    }

    // Calculate allocation for this preset
    const presetRatio = presetInfo.totalBasis / totalBasis;
    const presetAmount = sourceAmount * presetRatio;

    // Distribute preset amount to its rows
    const presetRowAllocations = rows.map(row => {
      const rowRatio = row.basisValue / presetInfo.totalBasis;
      const rawAllocation = presetAmount * rowRatio;
      return {
        targetAccountId: row.targetAccountId,
        basisValue: row.basisValue,
        allocation: roundToCents(rawAllocation),
        ratio: rowRatio,
        percentage: rowRatio * 100,
      };
    });

    // Handle rounding adjustment within preset
    const presetRoundedTotal = presetRowAllocations.reduce(
      (sum, item) => sum + item.allocation,
      0,
    );
    const presetDifference = roundToCents(roundToCents(presetAmount) - presetRoundedTotal);
    if (presetDifference !== 0) {
      const largestIndex = getLargestAllocationIndex(
        presetRowAllocations.map(item => item.allocation),
      );
      if (largestIndex >= 0) {
        presetRowAllocations[largestIndex].allocation = roundToCents(
          presetRowAllocations[largestIndex].allocation + presetDifference,
        );
      }
    }

    const presetAllocatedTotal = presetRowAllocations.reduce(
      (sum, item) => sum + item.allocation,
      0,
    );
    const presetPercentages = normalizePercentages(
      presetRowAllocations.map(item =>
        presetAllocatedTotal > 0 ? item.allocation / presetAllocatedTotal : 0,
      ),
    );
    presetRowAllocations.forEach((item, index) => {
      const normalizedPercentage = presetPercentages[index] ?? 0;
      // eslint-disable-next-line no-param-reassign
      presetRowAllocations[index] = {
        ...item,
        ratio: normalizedPercentage / 100,
        percentage: normalizedPercentage,
      };
    });

    presetAllocations.push({
      presetId,
      presetName: presetInfo.name,
      totalBasis: presetInfo.totalBasis,
      allocatedAmount: presetRowAllocations.reduce((sum, item) => sum + item.allocation, 0),
      rows: presetRowAllocations,
    });

    // Add to overall allocations
    presetRowAllocations.forEach(rowAlloc => {
      allAllocations.push({
        targetAccountId: rowAlloc.targetAccountId,
        value: rowAlloc.allocation,
        basisValue: rowAlloc.basisValue,
        ratio: rowAlloc.ratio,
        percentage: rowAlloc.percentage,
        presetId,
      });
    });
  });

  // Process non-preset targets
  nonPresetBasisValues.forEach(item => {
    const ratio = item.basisValue / totalBasis;
    const allocation = roundToCents(sourceAmount * ratio);
    allAllocations.push({
      targetAccountId: item.targetId,
      value: allocation,
      basisValue: item.basisValue,
      ratio,
      percentage: ratio * 100,
    });
  });

  // Global rounding adjustment
  const totalAllocated = allAllocations.reduce((sum, item) => sum + item.value, 0);
  const globalDifference = roundToCents(sourceAmount - totalAllocated);
  let adjustmentIndex: number | null = null;

  if (globalDifference !== 0) {
    adjustmentIndex = getLargestAllocationIndex(allAllocations.map(item => item.value));
    if (adjustmentIndex >= 0) {
      allAllocations[adjustmentIndex].value = roundToCents(
        allAllocations[adjustmentIndex].value + globalDifference,
      );
    }
  }

  const adjustedTotalAllocated = allAllocations.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const normalizedPercentages = normalizePercentages(
    allAllocations.map(item =>
      adjustedTotalAllocated > 0 ? item.value / adjustedTotalAllocated : 0,
    ),
  );
  normalizedPercentages.forEach((percentage, index) => {
    allAllocations[index].ratio = percentage / 100;
    allAllocations[index].percentage = percentage;
  });

  return {
    allocations: allAllocations,
    adjustmentIndex,
    adjustmentAmount: globalDifference,
    presetAllocations,
  };
};