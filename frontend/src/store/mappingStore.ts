import { create } from 'zustand';
import type {
  DynamicAllocationPreset,
  DynamicAllocationPresetRow,
  DynamicBasisAccount,
  DynamicSourceAccount,
  EntitySummary,
  FileRecord,
  GLAccountMappingRow,
  MappingPresetLibraryEntry,
  MappingSaveInput,
  MappingSaveRequest,
  MappingPolarity,
  MappingSplitDefinition,
  MappingStatus,
  MappingType,
  ReconciliationAccountBreakdown,
  EntityReconciliationGroup,
  ReconciliationSourceMapping,
  ReconciliationSubcategoryGroup,
  StandardScoaSummary,
  TrialBalanceRow,
} from '../types';
import { buildMappingRowsFromImport } from '../utils/buildMappingRowsFromImport';
import { slugify } from '../utils/slugify';
import { normalizeGlMonth } from '../utils/extractDateFromText';
import { getSourceValue } from '../utils/dynamicAllocation';
import { computeDynamicExclusionSummaries } from '../utils/dynamicExclusions';
import { trackMappingSaveAttempt } from '../utils/telemetry';
import { useRatioAllocationStore, type RatioAllocationHydrationPayload } from './ratioAllocationStore';
import { useOrganizationStore } from './organizationStore';
import {
  findChartOfAccountOption,
  getChartOfAccountOptions,
  isKnownChartOfAccount,
} from './chartOfAccountsStore';

const env = ((globalThis as unknown as { importMetaEnv?: Partial<ImportMetaEnv> }).importMetaEnv ??
  (typeof process !== 'undefined' ? process.env : undefined) ?? {}) as
  | Partial<ImportMetaEnv>
  | NodeJS.ProcessEnv;

const API_BASE_URL = env.VITE_API_BASE_URL ?? '/api';
const AUTO_SAVE_DEBOUNCE_MS = 1200;
const AUTO_SAVE_BACKOFF_MS = 2500;
const autoSaveQueue = new Set<string>();
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
let isAutoSaveRunning = false;
const shouldLog =
  env.DEV === true ||
  (typeof env.VITE_ENABLE_DEBUG_LOGGING === 'string' &&
    env.VITE_ENABLE_DEBUG_LOGGING.toLowerCase() === 'true');

const logPrefix = '[MappingStore]';

const logDebug = (...args: unknown[]) => {
  if (!shouldLog) return;
  // eslint-disable-next-line no-console
  console.debug(logPrefix, ...args);
};

const logError = (...args: unknown[]) => {
  if (!shouldLog) return;
  // eslint-disable-next-line no-console
  console.error(logPrefix, ...args);
};

const deletePresetDetailRecord = async (recordId: number): Promise<boolean> => {
  if (!Number.isFinite(recordId) || recordId <= 0) {
    return false;
  }

  try {
    const params = new URLSearchParams({ recordId: recordId.toString() });
    const response = await fetch(
      `${API_BASE_URL}/entityMappingPresetDetails?${params.toString()}`,
      {
        method: 'DELETE',
      },
    );

    if (response.ok || response.status === 404) {
      return true;
    }

    logError('Failed to delete preset detail record', {
      recordId,
      status: response.status,
    });
    return false;
  } catch (error) {
    logError('Failed to delete preset detail record', {
      recordId,
      error,
    });
    return false;
  }
};

type SavedMappingRow = {
  id: string;
  entityId: string;
  entityName?: string | null;
  accountId: string;
  accountName?: string | null;
  activity: number;
  netChange: number;
  status: MappingStatus;
  mappingType: MappingType;
  polarity: MappingPolarity;
  presetId?: string | null;
  exclusionPct?: number | null;
  splitDefinitions?: MappingSplitDefinition[];
  glMonth?: string | null;
};

export type HydrationMode = 'resume' | 'restart' | 'none';

const DRIVER_BENEFITS_DESCRIPTION =
  'DRIVER BENEFITS, PAYROLL TAXES AND BONUS COMPENSATION - COMPANY FLEET';
const NON_DRIVER_BENEFITS_DESCRIPTION =
  'NON DRIVER WAGES & BENEFITS - TOTAL ASSET OPERATIONS';

const findChartOfAccountByDescription = (description: string) => {
  const normalized = description.trim().toLowerCase();
  return getChartOfAccountOptions().find((option) => {
    const label = option.label.toLowerCase();
    const desc = option.description?.toLowerCase() ?? '';
    return label === normalized || desc === normalized || label.includes(normalized);
  });
};

const buildTargetFromDescription = (description: string) => {
  const match = findChartOfAccountByDescription(description);
  if (match) {
    return match;
  }

  const slug = slugify(description) || 'target';
  return {
    id: slug,
    value: description,
    label: description,
    accountNumber: description,
    coreAccount: null,
    operationalGroup: null,
    laborGroup: null,
    accountType: null,
    category: null,
    subCategory: null,
    description,
  };
};

const buildBaseMappings = (): GLAccountMappingRow[] => {
  const driverBenefits = buildTargetFromDescription(DRIVER_BENEFITS_DESCRIPTION);
  const nonDriverBenefits = buildTargetFromDescription(
    NON_DRIVER_BENEFITS_DESCRIPTION
  );

  return [
    {
      id: 'acct-3',
      entityId: 'comp-global',
      entityName: 'Global Logistics',
      accountId: '6100',
      accountName: 'Fuel Expense',
      activity: 65000,
      status: 'New',
      mappingType: 'dynamic',
      netChange: 65000,
      operation: 'Fleet',
      suggestedCOAId: '6100',
      suggestedCOADescription: 'Fuel Expense',
      aiConfidence: 70,
      polarity: 'Debit',
      notes: 'Needs reviewer confirmation of dynamic allocation.',
      splitDefinitions: [],
      entities: [{ id: 'entity-main', entity: 'Global Main', balance: 65000 }],
    },
    {
      id: 'acct-2',
      entityId: 'comp-acme',
      entityName: 'Acme Freight',
      accountId: '5200',
      accountName: 'Payroll Taxes',
      activity: 120000,
      status: 'Unmapped',
      mappingType: 'percentage',
      netChange: 120000,
      operation: 'Shared Services',
      suggestedCOAId: '5200',
      suggestedCOADescription: 'Payroll Taxes',
      aiConfidence: 82,
      polarity: 'Debit',
      presetId: 'preset-2',
      notes: 'Awaiting updated headcount split.',
      splitDefinitions: [
        {
          id: 'split-1',
          targetId: driverBenefits.id,
          targetName: driverBenefits.label,
          allocationType: 'percentage',
          allocationValue: 60,
          notes: 'HQ employees',
        },
        {
          id: 'split-2',
          targetId: nonDriverBenefits.id,
          targetName: nonDriverBenefits.label,
          allocationType: 'percentage',
          allocationValue: 40,
          notes: 'Field staff',
        },
      ],
      entities: [
        { id: 'entity-tms', entity: 'Acme Freight TMS', balance: 80000 },
        { id: 'entity-ops', entity: 'Acme Freight Operations', balance: 40000 },
      ],
    },
    {
      id: 'acct-1',
      entityId: 'comp-acme',
      entityName: 'Acme Freight',
      accountId: '4000',
      accountName: 'Linehaul Revenue',
      activity: 500000,
      status: 'Mapped',
      mappingType: 'direct',
      netChange: 500000,
      operation: 'Linehaul',
      suggestedCOAId: '4100',
      suggestedCOADescription: 'Revenue',
      aiConfidence: 96,
      manualCOAId: '4100',
      polarity: 'Credit',
      presetId: 'preset-1',
      notes: 'Approved during March close.',
      splitDefinitions: [],
      entities: [
        { id: 'entity-tms', entity: 'Acme Freight TMS', balance: 400000 },
        { id: 'entity-mx', entity: 'Acme Freight Mexico', balance: 100000 },
      ],
    },
    {
      id: 'acct-4',
      entityId: 'comp-heritage',
      entityName: 'Heritage Transport',
      accountId: '8999',
      accountName: 'Legacy Clearing',
      activity: 15000,
      status: 'Excluded',
      mappingType: 'exclude',
      netChange: 15000,
      operation: 'Legacy',
      aiConfidence: 48,
      polarity: 'Debit',
      notes: 'Excluded from mapping per client request.',
      splitDefinitions: [],
      entities: [{ id: 'entity-legacy', entity: 'Legacy Ops', balance: 15000 }],
    },
  ];
};

const cloneMappingRow = (row: GLAccountMappingRow): GLAccountMappingRow => ({
  ...row,
  entities: row.entities.map(entity => ({ ...entity })),
  splitDefinitions: row.splitDefinitions.map(split => ({ ...split })),
});

const getSignedAmountForAccount = (
  account: GLAccountMappingRow,
  amount: number,
): number => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return account.netChange >= 0 ? amount : -amount;
};

const getSplitSignedAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => {
  if (account.netChange === 0) {
    return 0;
  }

  if (split.allocationType === 'amount') {
    const absolute = Math.max(0, Math.abs(split.allocationValue));
    const capped = Math.min(absolute, Math.abs(account.netChange));
    return getSignedAmountForAccount(account, capped);
  }

  const percentage = Math.max(0, split.allocationValue);
  const base = Math.abs(account.netChange);
  const rawAmount = (base * percentage) / 100;
  return getSignedAmountForAccount(account, rawAmount);
};

const getSplitPercentage = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => {
  if (split.allocationType === 'percentage') {
    return Math.max(0, split.allocationValue);
  }
  const base = Math.abs(account.netChange);
  if (base === 0) {
    return 0;
  }
  return (Math.abs(split.allocationValue) / base) * 100;
};

const getSplitAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition,
): number => Math.abs(getSplitSignedAmount(account, split));

const deriveEntitySummaries = (accounts: GLAccountMappingRow[]): EntitySummary[] => {
  const entities = new Map<string, EntitySummary>();

  accounts.forEach(account => {
    const normalizedId = account.entityId?.trim();
    const normalizedName = account.entityName?.trim();

    if (!normalizedId && !normalizedName) {
      return;
    }

    const derivedId = normalizedId ?? slugify(normalizedName ?? 'entity');
    const derivedName = normalizedName ?? normalizedId ?? 'Entity';

    if (!entities.has(derivedId)) {
      entities.set(derivedId, { id: derivedId, name: derivedName });
    }
  });

  return Array.from(entities.values());
};

const getAccountsForEntity = (
  accounts: GLAccountMappingRow[],
  entityId: string | null,
): GLAccountMappingRow[] => {
  if (!entityId) {
    return accounts;
  }
  return accounts.filter(account => account.entityId === entityId);
};

const getPeriodsForAccounts = (accounts: GLAccountMappingRow[]): string[] => {
  const periodSet = new Set<string>();
  accounts.forEach(account => {
    if (account.glMonth) {
      periodSet.add(account.glMonth);
    }
  });
  return Array.from(periodSet).sort();
};

const findLatestNormalizedGlMonth = (rows: TrialBalanceRow[]): string | null => {
  let latest: string | null = null;
  rows.forEach(row => {
    const normalized = normalizeGlMonth((row.glMonth ?? '').trim());
    if (!normalized) {
      return;
    }
    if (!latest || normalized > latest) {
      latest = normalized;
    }
  });
  return latest;
};

const normalizePeriod = (period?: string | null): string | null => {
  if (!period) {
    return null;
  }
  const trimmed = period.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeAllocationPeriod = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hyphenMatch = trimmed.match(/^(\d{4}-\d{2})/);
  if (hyphenMatch) {
    return hyphenMatch[1];
  }
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}`;
  }
  return trimmed;
};

const comparePeriodsDescending = (a?: string | null, b?: string | null): number => {
  const normalizedA = normalizePeriod(a);
  const normalizedB = normalizePeriod(b);

  if (normalizedA === normalizedB) {
    return 0;
  }

  if (normalizedA === null) {
    return 1;
  }

  if (normalizedB === null) {
    return -1;
  }

  return normalizedA > normalizedB ? -1 : 1;
};

const selectMostRecentNonZeroAccount = (
  accounts: GLAccountMappingRow[],
): GLAccountMappingRow => {
  const sortedByPeriod = [...accounts].sort((a, b) =>
    comparePeriodsDescending(a.glMonth, b.glMonth),
  );

  return sortedByPeriod.find(account => account.netChange !== 0) ?? sortedByPeriod[0];
};

const buildMostRecentAccounts = (accounts: GLAccountMappingRow[]): GLAccountMappingRow[] => {
  const grouped = new Map<string, GLAccountMappingRow[]>();

  accounts.forEach(account => {
    const key = `${account.entityId}__${account.accountId}`;
    const existing = grouped.get(key) ?? [];
    existing.push(account);
    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .map(selectMostRecentNonZeroAccount)
    .sort((a, b) => {
      const periodComparison = comparePeriodsDescending(a.glMonth, b.glMonth);
      if (periodComparison !== 0) {
        return periodComparison;
      }

      return a.accountName.localeCompare(b.accountName, undefined, {
        sensitivity: 'base',
      });
    });
};

const resolveActivePeriod = (
  accounts: GLAccountMappingRow[],
  entityId: string | null,
  desiredPeriod: string | null,
): string | null => {
  const scopedAccounts = getAccountsForEntity(accounts, entityId);
  const availablePeriods = getPeriodsForAccounts(scopedAccounts);

  if (desiredPeriod && availablePeriods.includes(desiredPeriod)) {
    return desiredPeriod;
  }

  if (availablePeriods.length === 1) {
    return availablePeriods[0] ?? null;
  }

  return null;
};

const findChartOfAccountTarget = (targetId?: string | null) => {
  const normalized = typeof targetId === 'string' ? targetId.trim() : '';
  if (!normalized) {
    return null;
  }

  return findChartOfAccountOption(normalized);
};

interface TargetAccumulatorEntry {
  id: string;
  label: string;
  value: number;
}

const accumulateStandardTargetValues = (
  accounts: GLAccountMappingRow[],
): Map<string, TargetAccumulatorEntry> => {
  const accumulator = new Map<string, TargetAccumulatorEntry>();

  const addValue = (targetId: string, label: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }
    const existing = accumulator.get(targetId);
    if (existing) {
      existing.value += amount;
    } else {
      accumulator.set(targetId, { id: targetId, label, value: amount });
    }
  };

  accounts.forEach(account => {
    if (account.mappingType === 'direct') {
      if (account.status !== 'Mapped') {
        return;
      }
      const normalizedTarget = account.manualCOAId?.trim();
      if (!normalizedTarget) {
        return;
      }
      const option = findChartOfAccountTarget(normalizedTarget);
      const targetId = option?.id ?? normalizedTarget;
      const label = option?.label ?? normalizedTarget;
      const amount = account.netChange;
      addValue(targetId, label, amount);
      return;
    }

    if (account.mappingType === 'percentage') {
      account.splitDefinitions.forEach(split => {
        if (split.isExclusion) {
          return;
        }
        const normalizedTarget = split.targetId?.trim();
        if (!normalizedTarget) {
          return;
        }
        const option = findChartOfAccountTarget(normalizedTarget);
        const targetId = option?.id ?? normalizedTarget;
        const label = option?.label ?? split.targetName ?? normalizedTarget;
        const amount = getSplitSignedAmount(account, split);
        addValue(targetId, label, amount);
      });
      return;
    }

    if (account.mappingType === 'dynamic') {
      const normalizedTarget = account.manualCOAId?.trim() ?? account.suggestedCOAId?.trim();
      if (!normalizedTarget) {
        return;
      }
      const option = findChartOfAccountTarget(normalizedTarget);
      const targetId = option?.id ?? normalizedTarget;
      const label = option?.label ?? normalizedTarget;
      const baseAmount = Math.abs(account.netChange);
      const excluded = Math.abs(account.dynamicExclusionAmount ?? 0);
      const allocatable = Math.max(0, baseAmount - excluded);
      const signedAmount = getSignedAmountForAccount(account, allocatable);
      addValue(targetId, label, signedAmount);
    }
  });

  return accumulator;
};

const getSubcategoryLabel = (label: string): string => {
  const [subcategory] = label.split(' - ');
  const cleaned = subcategory?.trim();
  if (cleaned && cleaned.length > 0) {
    return cleaned;
  }
  return 'Other';
};

export const buildReconciliationGroups = (
  accounts: GLAccountMappingRow[],
): ReconciliationSubcategoryGroup[] => {
  const accountTargets = new Map<string, ReconciliationAccountBreakdown>();

  const addContribution = (
    targetId: string,
    label: string,
    amount: number,
    source: ReconciliationSourceMapping,
  ) => {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }

    const subcategory = getSubcategoryLabel(label);
    const existing = accountTargets.get(targetId);

    if (existing) {
      existing.total += amount;
      existing.sources.push(source);
      return;
    }

    accountTargets.set(targetId, {
      id: targetId,
      label,
      subcategory,
      total: amount,
      sources: [source],
    });
  };

  accounts.forEach(account => {
    const sourceBase = {
      glAccountId: account.accountId,
      glAccountName: account.accountName,
      companyName: account.entityName ?? '',
    } satisfies Omit<ReconciliationSourceMapping, 'amount'>;

    if (account.mappingType === 'direct') {
      if (account.status !== 'Mapped') {
        return;
      }

      const normalizedTarget = account.manualCOAId?.trim();
      if (!normalizedTarget) {
        return;
      }

      const option = findChartOfAccountTarget(normalizedTarget);
      const targetId = option?.id ?? normalizedTarget;
      const label = option?.label ?? normalizedTarget;
      const amount = account.netChange;

      addContribution(targetId, label, amount, { ...sourceBase, amount });
      return;
    }

    if (account.mappingType === 'percentage') {
      account.splitDefinitions.forEach(split => {
        if (split.isExclusion) {
          return;
        }

        const normalizedTarget = split.targetId?.trim();
        if (!normalizedTarget) {
          return;
        }

        const option = findChartOfAccountTarget(normalizedTarget);
        const targetId = option?.id ?? normalizedTarget;
        const label = option?.label ?? split.targetName ?? normalizedTarget;
        const amount = getSplitSignedAmount(account, split);

        if (amount === 0) {
          return;
        }

        addContribution(targetId, label, amount, { ...sourceBase, amount });
      });
    }
  });

  const groupedBySubcategory = new Map<string, ReconciliationSubcategoryGroup>();

  accountTargets.forEach(account => {
    if (account.total === 0) {
      return;
    }

    const sources = [...account.sources].sort(
      (a, b) => b.amount - a.amount || a.glAccountName.localeCompare(b.glAccountName),
    );

    const accountEntry: ReconciliationAccountBreakdown = {
      ...account,
      sources,
    };

    const existingGroup = groupedBySubcategory.get(account.subcategory);
    if (existingGroup) {
      existingGroup.accounts.push(accountEntry);
      existingGroup.total += accountEntry.total;
      return;
    }

    groupedBySubcategory.set(account.subcategory, {
      subcategory: account.subcategory,
      total: accountEntry.total,
      accounts: [accountEntry],
    });
  });

  return Array.from(groupedBySubcategory.values())
    .map(group => ({
      ...group,
      accounts: group.accounts.sort(
        (a, b) => b.total - a.total || a.label.localeCompare(b.label),
      ),
    }))
    .sort((a, b) => b.total - a.total || a.subcategory.localeCompare(b.subcategory));
};

const normalizeEntityGrouping = (account: GLAccountMappingRow): { entityId: string; entityName: string } => {
  const trimmedId = account.entityId?.trim();
  const trimmedName = account.entityName?.trim();

  const entityId =
    trimmedId || slugify(trimmedName ?? 'entity') || (trimmedName ? trimmedName : 'entity');
  const entityName = trimmedName || trimmedId || 'Unassigned entity';

  return { entityId, entityName };
};

export const buildEntityReconciliationGroups = (
  accounts: GLAccountMappingRow[],
): EntityReconciliationGroup[] => {
  const grouped = new Map<string, { entityId: string; entityName: string; accounts: GLAccountMappingRow[] }>();

  accounts.forEach(account => {
    const { entityId, entityName } = normalizeEntityGrouping(account);
    const existing = grouped.get(entityId);
    if (existing) {
      existing.accounts.push(account);
      return;
    }
    grouped.set(entityId, { entityId, entityName, accounts: [account] });
  });

  return Array.from(grouped.values())
    .map(({ entityId, entityName, accounts }) => {
      const categories = buildReconciliationGroups(accounts);
      const total = categories.reduce((sum, category) => sum + category.total, 0);

      return {
        entityId,
        entityName,
        total,
        categories,
      };
    })
    .filter(group => group.total !== 0 && group.categories.length > 0)
    .sort((a, b) => b.total - a.total || a.entityName.localeCompare(b.entityName));
};

const buildBasisAccountsFromMappings = (
  accounts: GLAccountMappingRow[],
): DynamicBasisAccount[] => {
  const accumulator = accumulateStandardTargetValues(accounts);

  return Array.from(accumulator.values())
    .map(({ id, label, value }) => ({
      id,
      name: label,
      description: label,
      value,
      mappedTargetId: id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const buildStandardScoaSummaries = (
  accounts: GLAccountMappingRow[],
): StandardScoaSummary[] => {
  const accumulator = accumulateStandardTargetValues(accounts);
  return getChartOfAccountOptions().map(option => ({
    id: option.id,
    value: option.value,
    label: option.label,
    mappedAmount: accumulator.get(option.id)?.value ?? 0,
  }));
};

const updateDynamicBasisAccounts = (accounts: GLAccountMappingRow[]) => {
  const basisAccounts = buildBasisAccountsFromMappings(accounts);
  useRatioAllocationStore.getState().setBasisAccounts(basisAccounts);
};

type RatioAllocationStoreState = ReturnType<typeof useRatioAllocationStore.getState>;

const getAccountExcludedAmount = (account: GLAccountMappingRow): number => {
  if (account.mappingType === 'exclude' || account.status === 'Excluded') {
    return account.netChange;
  }

  if (account.mappingType === 'percentage') {
    if (account.splitDefinitions.length === 0) {
      return 0;
    }
    const total = account.splitDefinitions
      .filter(split => split.isExclusion)
      .reduce((sum, split) => sum + getSplitSignedAmount(account, split), 0);
    return total;
  }

  if (account.mappingType === 'dynamic') {
    const resolved = Math.max(0, account.dynamicExclusionAmount ?? 0);
    return getSignedAmountForAccount(account, resolved);
  }

  return 0;
};

const getAllocatableNetChange = (account: GLAccountMappingRow): number => {
  if (account.mappingType === 'exclude' || account.status === 'Excluded') {
    return 0;
  }
  const excluded = getAccountExcludedAmount(account);
  const remaining = account.netChange - excluded;
  if (Math.abs(remaining) < 1e-6) {
    return 0;
  }
  return remaining;
};

const calculateExclusionPctFromAccount = (
  account: GLAccountMappingRow,
): number | null => {
  const excludedAmount = Math.abs(getAccountExcludedAmount(account));
  const baseAmount = Math.abs(account.netChange);

  if (baseAmount === 0) {
    return excludedAmount > 0 ? 100 : null;
  }

  const pct = (excludedAmount / baseAmount) * 100;
  if (!Number.isFinite(pct)) {
    return null;
  }

  return Math.max(0, Math.min(100, pct));
};

const buildSaveInputFromAccount = (
  account: GLAccountMappingRow,
  defaultEntity?: EntitySummary | null,
  selectedEntityId?: string | null,
  updatedBy?: string | null,
): MappingSaveInput | null => {
  const resolvedEntityId =
    account.entityId ||
    selectedEntityId ||
    defaultEntity?.id ||
    slugify(account.entityName ?? '') ||
    null;

  if (!resolvedEntityId) {
    return null;
  }

  const resolvedStatus = deriveMappingStatus(account);
  if (resolvedStatus !== 'Mapped' && resolvedStatus !== 'Excluded') {
    return null;
  }

  const normalizedType =
    account.mappingType === 'exclude' || resolvedStatus === 'Excluded'
      ? 'exclude'
      : account.mappingType;

  const payload: MappingSaveInput = {
    entityId: resolvedEntityId,
    entityAccountId: account.accountId,
    accountName: account.accountName,
    polarity: account.polarity,
    mappingType: normalizedType,
    mappingStatus: normalizedType === 'exclude' ? 'Excluded' : resolvedStatus,
    presetId: account.presetId ?? null,
    exclusionPct:
      normalizedType === 'exclude'
        ? 100
        : calculateExclusionPctFromAccount(account),
    netChange: account.netChange,
    glMonth: account.glMonth ?? null,
  };

  payload.updatedBy = updatedBy ?? null;

  if (normalizedType === 'direct' && account.manualCOAId) {
    payload.splitDefinitions = [
      {
        targetId: account.manualCOAId,
        allocationType: 'percentage',
        allocationValue: 100,
        isCalculated: false,
      },
    ];
  }

  if (normalizedType === 'percentage') {
    const splits = account.splitDefinitions
      .filter(split => !split.isExclusion)
      .map(split => ({
        targetId: split.targetId,
        allocationType: split.allocationType,
        allocationValue: split.allocationValue,
        isCalculated: false,
        recordId: split.recordId ?? null,
      }));
    if (splits.length) {
      payload.splitDefinitions = splits;
    }
  }

  if (normalizedType === 'dynamic') {
    const ratioState = useRatioAllocationStore.getState();
    const { allocations, presets, results, selectedPeriod } = ratioState;

    // Find the allocation for this source account
    const allocation = allocations.find(alloc => alloc.sourceAccount.id === account.id);

    if (allocation && allocation.targetDatapoints.length > 0) {
      // Get all preset IDs referenced by the allocation's target datapoints
      const presetIds = new Set<string>();
      allocation.targetDatapoints.forEach(target => {
        if (target.groupId) {
          presetIds.add(target.groupId);
        }
      });

      // Find the results for this allocation to get calculated percentages
      const periodCandidates = new Set<string>();
      const normalizedSelectionPeriod = normalizeAllocationPeriod(selectedPeriod ?? account.glMonth);
      if (normalizedSelectionPeriod) {
        periodCandidates.add(normalizedSelectionPeriod);
      }
      const normalizedAccountPeriod = normalizeAllocationPeriod(account.glMonth);
      if (normalizedAccountPeriod) {
        periodCandidates.add(normalizedAccountPeriod);
      }
      const matchesAllocationPeriod = (period?: string | null): boolean => {
        if (periodCandidates.size === 0) {
          return true;
        }
        const normalized = normalizeAllocationPeriod(period);
        return Boolean(normalized && periodCandidates.has(normalized));
      };
      const allocationResult = results.find(
        result => result.allocationId === allocation.id && matchesAllocationPeriod(result.periodId),
      );

      // Build split definitions from presets
      const dynamicSplits: MappingSaveInput['splitDefinitions'] = [];

      presetIds.forEach(presetId => {
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;

        preset.rows.forEach(row => {
          // Find the calculated percentage from results if available
          const resultAllocation = allocationResult?.allocations.find(
            alloc => alloc.targetId === row.targetAccountId,
          );

          const matchingTarget = allocation.targetDatapoints.find(
            target =>
              target.groupId === presetId &&
              target.datapointId === row.targetAccountId,
          );
          const isExclusionSplit = Boolean(matchingTarget?.isExclusion);

          dynamicSplits.push({
            targetId: row.targetAccountId,
            basisDatapoint: row.dynamicAccountId,
            allocationType: 'dynamic',
            allocationValue: resultAllocation?.percentage ?? null,
            isCalculated: true,
            isExclusion: isExclusionSplit,
          });
        });
      });

      // Handle non-preset targets (individual dynamic targets)
      allocation.targetDatapoints
        .filter(target => !target.groupId)
        .forEach(target => {
          const resultAllocation = allocationResult?.allocations.find(
            alloc => alloc.targetId === target.datapointId,
          );

        dynamicSplits.push({
          targetId: target.datapointId,
          basisDatapoint: target.ratioMetric.id,
          allocationType: 'dynamic',
          allocationValue: resultAllocation?.percentage ?? null,
          isCalculated: true,
          isExclusion: Boolean(target.isExclusion),
        });
        });

      if (dynamicSplits.length) {
        payload.splitDefinitions = dynamicSplits;
        // Use the first preset ID as the presetId if available
        const firstPresetId = presetIds.size > 0 ? Array.from(presetIds)[0] : null;
        if (firstPresetId) {
          payload.presetId = firstPresetId;
        }
      }
    }
  }

  return payload;
};

function deriveMappingStatus(account: GLAccountMappingRow): MappingStatus {
  if (account.mappingType === 'exclude' || account.status === 'Excluded') {
    return 'Excluded';
  }

  if (account.mappingType === 'dynamic') {
    const ratioState = useRatioAllocationStore.getState();
    const allocation = ratioState.allocations.find(
      alloc => alloc.sourceAccount.id === account.id,
    );

    const hasDynamicTargets =
      allocation?.targetDatapoints?.length ||
      account.splitDefinitions.some(split => split.allocationType === 'dynamic');

    return hasDynamicTargets ? 'Mapped' : 'Unmapped';
  }

  if (account.mappingType === 'percentage') {
    if (account.splitDefinitions.length === 0) {
      return 'Unmapped';
    }

    const allSplitsConfigured = account.splitDefinitions.every(split => {
      if (split.isExclusion) {
        return true;
      }
      const targetId = typeof split.targetId === 'string' ? split.targetId.trim() : '';
      return targetId.length > 0 && isKnownChartOfAccount(targetId);
    });

    if (!allSplitsConfigured) {
      return 'Unmapped';
    }

    const totalPercentage = account.splitDefinitions.reduce(
      (sum, split) => sum + getSplitPercentage(account, split),
      0,
    );

    if (Math.abs(totalPercentage - 100) > 0.01) {
      return 'Unmapped';
    }

    return 'Mapped';
  }

  const manualTarget = account.manualCOAId?.trim();

  if (!manualTarget) {
    return 'Unmapped';
  }

  if (isKnownChartOfAccount(manualTarget)) {
    return 'Mapped';
  }

  return 'New';
}

function applyDerivedStatus(account: GLAccountMappingRow): GLAccountMappingRow {
  return {
    ...account,
    status: deriveMappingStatus(account),
  };
}

export const createInitialMappingAccounts = (): GLAccountMappingRow[] =>
  buildBaseMappings().map(row => applyDerivedStatus(cloneMappingRow(row)));

const syncDynamicAllocationState = (
  accounts: GLAccountMappingRow[],
  rows: TrialBalanceRow[] = [],
  requestedPeriod?: string | null,
) => {
  const basisAccounts = buildBasisAccountsFromMappings(accounts);

  const accountSourceAccounts: DynamicSourceAccount[] = accounts.map(account => ({
    id: account.id,
    name: account.accountName,
    number: account.accountId,
    description: account.accountName,
    value: account.netChange,
  }));

  const summarySourceAccounts = buildStandardScoaSummaries(accounts)
    .map(summary => {
      const normalizedId = summary.value?.trim() ?? '';
      if (!normalizedId) {
        return null;
      }
      const label = summary.label?.trim() ?? normalizedId;
      return {
        id: normalizedId,
        name: label,
        number: normalizedId,
        description: label,
        value: summary.mappedAmount,
      } as DynamicSourceAccount;
    })
    .filter((entry): entry is DynamicSourceAccount => Boolean(entry));

  const sourceAccountLookup = new Map<string, DynamicSourceAccount>();
  accountSourceAccounts.forEach(account => {
    sourceAccountLookup.set(account.id, account);
    const canonicalAccountId = account.number?.trim();
    if (canonicalAccountId && !sourceAccountLookup.has(canonicalAccountId)) {
      sourceAccountLookup.set(canonicalAccountId, {
        ...account,
        id: canonicalAccountId,
        number: canonicalAccountId,
      });
    }
  });
  summarySourceAccounts.forEach(account => {
    if (!sourceAccountLookup.has(account.id)) {
      sourceAccountLookup.set(account.id, account);
    }
  });
  const sourceAccounts = Array.from(sourceAccountLookup.values());

  const periodSet = new Set<string>();
  rows.forEach(row => {
    const glMonth = typeof row.glMonth === 'string' ? row.glMonth.trim() : '';
    if (glMonth) {
      periodSet.add(glMonth);
    }
  });

  if (requestedPeriod && requestedPeriod.trim().length > 0) {
    periodSet.add(requestedPeriod.trim());
  }

  const availablePeriods = Array.from(periodSet).sort();
  const normalizedRequested = requestedPeriod?.trim() ?? null;
  const fallbackPeriod = availablePeriods[availablePeriods.length - 1] ?? null;
  const selectedPeriod =
    normalizedRequested && availablePeriods.includes(normalizedRequested)
      ? normalizedRequested
      : fallbackPeriod;

  const hydratePayload: RatioAllocationHydrationPayload = {
    basisAccounts,
    sourceAccounts,
    groups: [],
    allocations: [],
    availablePeriods,
    selectedPeriod,
  };

  useRatioAllocationStore.getState().hydrate(hydratePayload);
  useRatioAllocationStore.setState({ results: [], validationErrors: [], auditLog: [] });
};

const ensureEntityBreakdown = (
  account: GLAccountMappingRow,
  entityId: string | null,
  entityName: string | null,
) => {
  if (!entityId || !entityName) {
    return account.entities ?? [];
  }

  if (!account.entities || account.entities.length === 0) {
    return [
      {
        id: entityId,
        entity: entityName,
        balance: account.netChange,
      },
    ];
  }

  return account.entities.map((entity, index) => {
    if (index === 0) {
      return {
        ...entity,
        id: entityId,
        entity: entityName,
      };
    }
    return { ...entity };
  });
};

const resolveEntityConflicts = (
  accounts: GLAccountMappingRow[],
  selectedEntities: EntitySummary[],
): GLAccountMappingRow[] => {
  const normalized = accounts.map(account => {
    const trimmedName = account.entityName?.trim() ?? '';
    const trimmedId = account.entityId?.trim() ?? '';
    const hasEntityMetadata = trimmedName.length > 0 || trimmedId.length > 0;
    if (!hasEntityMetadata) {
      return {
        ...account,
        entityId: null,
        entityName: null,
        entities: account.entities ?? [],
        requiresEntityAssignment: true,
      };
    }

    const normalizedId = trimmedId.length > 0 ? trimmedId : slugify(trimmedName) || null;
    const normalizedName = trimmedName.length > 0 ? trimmedName : trimmedId;

    return {
      ...account,
      entityId: normalizedId,
      entityName: normalizedName,
      entities: ensureEntityBreakdown(account, normalizedId, normalizedName),
      requiresEntityAssignment: trimmedName.length === 0,
    };
  });

  if (selectedEntities.length !== 1) {
    return normalized;
  }

  const groupedByAccountMonth = new Map<string, GLAccountMappingRow[]>();
  normalized.forEach(account => {
    const periodKey = account.glMonth ?? 'unspecified';
    const groupKey = `${account.accountId}__${periodKey}`;
    const group = groupedByAccountMonth.get(groupKey) ?? [];
    group.push(account);
    groupedByAccountMonth.set(groupKey, group);
  });

  groupedByAccountMonth.forEach(group => {
    if (group.length <= 1) {
      return;
    }

    const nameCounts = new Map<string, number>();
    group.forEach(account => {
      const key =
        account.entityName && account.entityName.length > 0
          ? account.entityName.toLowerCase()
          : '__blank__';
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    });

    group.forEach(account => {
      const key =
        account.entityName && account.entityName.length > 0
          ? account.entityName.toLowerCase()
          : '__blank__';
      if ((nameCounts.get(key) ?? 0) > 1) {
        account.requiresEntityAssignment = true;
      }
    });
  });

  return normalized;
};

const calculateGrossTotal = (accounts: GLAccountMappingRow[]): number =>
  accounts.reduce((sum, account) => sum + account.netChange, 0);

const calculateExcludedTotal = (accounts: GLAccountMappingRow[]): number =>
  accounts.reduce((sum, account) => sum + getAccountExcludedAmount(account), 0);

const appendDirtyIds = (dirty: Set<string>, ids: Iterable<string>): Set<string> => {
  const next = new Set(dirty);
  Array.from(ids).forEach(id => next.add(id));
  return next;
};

export type RowSaveStatus = 'saving' | 'error';

export interface RowSaveMetadata {
  status: RowSaveStatus;
  message?: string | null;
}

type SummarySelector = {
  totalAccounts: number;
  mappedAccounts: number;
  grossTotal: number;
  excludedTotal: number;
  netTotal: number;
};

type UploadMetadata = {
  uploadId: string;
  fileName?: string | null;
  uploadedAt?: string | null;
};

const normalizeEntitySummary = (entity: EntitySummary): EntitySummary => {
  const id = (entity.id ?? '').toString().trim();
  const name = entity.name?.trim() ?? id;
  return { ...entity, id, name };
};

type FileRecordsResponse = {
  items?: FileRecord[];
  fileUploadGuid?: string;
  entities?: EntitySummary[];
  upload?: {
    fileName?: string | null;
    uploadedAt?: string | null;
  };
  fileName?: string;
  uploadedAt?: string;
};

interface MappingState {
  accounts: GLAccountMappingRow[];
  dirtyMappingIds: Set<string>;
  searchTerm: string;
  activeStatuses: MappingStatus[];
  activeUploadId: string | null;
  activeUploadMetadata: UploadMetadata | null;
  activeClientId: string | null;
  activeEntityId: string | null;
  activeEntityIds: string[];
  activeEntities: EntitySummary[];
  activePeriod: string | null;
  isLoadingFromApi: boolean;
  apiError: string | null;
  isSavingMappings: boolean;
  saveError: string | null;
  lastSavedCount: number;
  rowSaveStatuses: Record<string, RowSaveMetadata>;
  removedPresetDetailRecordIds: Set<number>;
  presetLibrary: MappingPresetLibraryEntry[];
  setActiveClientId: (clientId: string | null) => void;
  setSearchTerm: (term: string) => void;
  setActiveEntityId: (entityId: string | null) => void;
  setActivePeriod: (period: string | null) => void;
  toggleStatusFilter: (status: MappingStatus) => void;
  clearStatusFilters: () => void;
  clearWorkspace: () => void;
  refreshPresetLibrary: (entityIds: string[]) => Promise<void>;
  updateTarget: (id: string, coaId: string) => void;
  updatePreset: (id: string, presetId: string | null) => void;
  updateStatus: (id: string, status: MappingStatus) => void;
  updateMappingType: (id: string, mappingType: MappingType) => void;
  updatePolarity: (id: string, polarity: MappingPolarity) => void;
  updateNotes: (id: string, notes: string) => void;
  addSplitDefinition: (id: string) => void;
  updateSplitDefinition: (
    accountId: string,
    splitId: string,
    updates: Partial<MappingSplitDefinition>
  ) => void;
  removeSplitDefinition: (accountId: string, splitId: string) => void;
  applyBatchMapping: (
    ids: string[],
    updates: {
      target?: string | null;
      mappingType?: MappingType;
      presetId?: string | null;
      polarity?: MappingPolarity;
      status?: MappingStatus;
    }
  ) => void;
  applyMappingToMonths: (
    entityId: string,
    accountId: string,
    months: string[] | 'all',
    mapping: {
      target?: string | null;
      mappingType?: MappingType;
      presetId?: string | null;
      polarity?: MappingPolarity;
      status?: MappingStatus;
    }
  ) => void;
  applyPresetToAccounts: (ids: string[], presetId: string | null) => void;
  bulkAccept: (ids: string[]) => void;
  finalizeMappings: (ids: string[]) => boolean;
  updateAccountEntity: (
    accountId: string,
    payload: { entityName: string; entityId?: string | null }
  ) => void;
  hydrateFromHistory: (
    uploadGuid: string,
    mode?: HydrationMode,
    entityIds?: string[],
  ) => Promise<void>;
  saveMappings: (accountIds?: string[]) => Promise<number>;
  queueAutoSave: (ids: string[], options?: { immediate?: boolean }) => void;
  flushAutoSaveQueue: (options?: { immediate?: boolean }) => Promise<void>;
  loadImportedAccounts: (payload: {
    uploadId: string;
    clientId?: string | number | null;
    entityIds?: string[];
    entities?: EntitySummary[];
    period?: string | null;
    rows: TrialBalanceRow[];
    uploadMetadata?: UploadMetadata | null;
  }) => Promise<void>;
  fetchFileRecords: (
    uploadGuid: string,
    options?: {
      clientId?: string | number | null;
      entities?: EntitySummary[];
      entityIds?: string[];
      period?: string | null;
      hydrateMode?: HydrationMode;
    },
  ) => Promise<void>;
}

type RowSaveMetadataEntry = {
  id: string;
  status: RowSaveStatus;
  message?: string | null;
};

const clearRowSaveStatusesForIds = (
  statuses: Record<string, RowSaveMetadata>,
  ids: string[],
): Record<string, RowSaveMetadata> => {
  if (ids.length === 0) {
    return statuses;
  }

  const next = { ...statuses };
  let mutated = false;

  ids.forEach(id => {
    if (id in next) {
      delete next[id];
      mutated = true;
    }
  });

  return mutated ? next : statuses;
};

const applyDirtyStatusUpdates = (
  state: MappingState,
  dirtyIds: string[],
): {
  dirtyMappingIds: Set<string>;
  rowSaveStatuses: Record<string, RowSaveMetadata>;
} => ({
  dirtyMappingIds: dirtyIds.length
    ? appendDirtyIds(state.dirtyMappingIds, dirtyIds)
    : state.dirtyMappingIds,
  rowSaveStatuses:
    dirtyIds.length > 0
      ? clearRowSaveStatusesForIds(state.rowSaveStatuses, dirtyIds)
      : state.rowSaveStatuses,
});

const updateRowSaveStatuses = (
  current: Record<string, RowSaveMetadata>,
  entries: RowSaveMetadataEntry[],
): Record<string, RowSaveMetadata> => {
  if (entries.length === 0) {
    return current;
  }

  const next = { ...current };
  let mutated = false;

  entries.forEach(({ id, status, message }) => {
    const existing = next[id];
    if (
      !existing ||
      existing.status !== status ||
      existing.message !== message
    ) {
      next[id] = { status, message: message ?? null };
      mutated = true;
    }
  });

  return mutated ? next : current;
};

const markRowsSaving = (
  current: Record<string, RowSaveMetadata>,
  ids: string[],
): Record<string, RowSaveMetadata> =>
  updateRowSaveStatuses(
    current,
    ids.map(id => ({ id, status: 'saving' })),
  );

const markRowsErrored = (
  current: Record<string, RowSaveMetadata>,
  ids: string[],
  message: string,
): Record<string, RowSaveMetadata> =>
  updateRowSaveStatuses(
    current,
    ids.map(id => ({ id, status: 'error', message })),
  );

const mappingStatuses: MappingStatus[] = ['New', 'Unmapped', 'Mapped', 'Excluded'];

const normalizeClientId = (
  clientId?: string | number | null,
): string | null => {
  if (clientId === undefined || clientId === null) {
    return null;
  }

  const clientIdString = typeof clientId === 'string' ? clientId : String(clientId);
  const trimmed = clientIdString.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const initialAccounts: GLAccountMappingRow[] = [];
const initialEntities: EntitySummary[] = [];

const dedupeEntities = (entities: EntitySummary[]): EntitySummary[] =>
  Array.from(new Map(entities.map(entity => [entity.id, entity])).values());

const mergeEntitiesWithIds = (
  baseEntities: EntitySummary[],
  derivedEntities: EntitySummary[] = [],
  entityIds: string[] = [],
): EntitySummary[] => {
  const merged = new Map<string, EntitySummary>();

  [...derivedEntities, ...baseEntities].forEach(entity => {
    merged.set(entity.id, entity);
  });

  entityIds.forEach(id => {
    if (!merged.has(id)) {
      merged.set(id, { id, name: id });
    }
  });

  return Array.from(merged.values());
};

export const useMappingStore = create<MappingState>((set, get) => {
  const scheduleAutoSave = (immediate = false) => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    autoSaveTimer = setTimeout(() => {
      void runAutoSave();
    }, immediate ? 0 : autoSaveDelay);
  };

  const runAutoSave = async () => {
    if (isAutoSaveRunning) {
      scheduleAutoSave();
      return;
    }

    const state = get();
    if (autoSaveQueue.size === 0) {
      return;
    }

    const queuedIds = Array.from(autoSaveQueue).filter(id =>
      state.dirtyMappingIds.has(id),
    );

    if (queuedIds.length === 0) {
      autoSaveQueue.forEach(id => {
        if (!state.dirtyMappingIds.has(id)) {
          autoSaveQueue.delete(id);
        }
      });
      return;
    }

    if (!state.activeEntityId) {
      autoSaveDelay = AUTO_SAVE_BACKOFF_MS;
      scheduleAutoSave();
      return;
    }

    isAutoSaveRunning = true;
    autoSaveTimer = null;

    try {
      for (const id of queuedIds) {
        if (!get().dirtyMappingIds.has(id)) {
          autoSaveQueue.delete(id);
          continue;
        }

        await get().saveMappings([id]);

        const { dirtyMappingIds, saveError } = get();

        if (!dirtyMappingIds.has(id)) {
          autoSaveQueue.delete(id);
        }

        if (saveError) {
          autoSaveDelay = AUTO_SAVE_BACKOFF_MS;
          break;
        }

        autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
      }
    } finally {
      isAutoSaveRunning = false;
      if (autoSaveQueue.size > 0) {
        scheduleAutoSave();
      }
    }
  };

  const resetAutoSaveState = () => {
    autoSaveQueue.clear();
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
    isAutoSaveRunning = false;
  };

  const resetRatioAllocationState = () => {
    useRatioAllocationStore.setState({
      allocations: [],
      basisAccounts: [],
      presets: [],
      groups: [],
      sourceAccounts: [],
      availablePeriods: [],
      isProcessing: false,
      selectedPeriod: null,
      results: [],
      validationErrors: [],
      auditLog: [],
      lastDynamicMutation: null,
    });
  };

  const enqueueDirtyIds = (ids: string[]) => {
    if (!ids.length) {
      return;
    }
    queueRowsForAutoSave(ids);
  };

  const queueRowsForAutoSave = (ids: string[], options?: { immediate?: boolean }) => {
    const normalizedIds = ids.filter(Boolean);
    if (!normalizedIds.length) {
      return;
    }
    normalizedIds.forEach(id => autoSaveQueue.add(id));
    scheduleAutoSave(options?.immediate ?? false);
  };

  const flushAutoSaveQueue = async (options?: { immediate?: boolean }) => {
    if (options?.immediate) {
      autoSaveDelay = 0;
    }
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (autoSaveQueue.size === 0) {
      autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
      return;
    }
    await runAutoSave();
    autoSaveDelay = AUTO_SAVE_DEBOUNCE_MS;
  };

  return {
  accounts: initialAccounts,
  dirtyMappingIds: new Set<string>(),
  searchTerm: '',
  activeStatuses: [],
  activeUploadId: null,
  activeUploadMetadata: null,
  activeClientId: null,
  activeEntityId: null,
  activeEntityIds: initialEntities.map(entity => entity.id),
  activeEntities: initialEntities,
  activePeriod: null,
  isLoadingFromApi: false,
  apiError: null,
  isSavingMappings: false,
  saveError: null,
  lastSavedCount: 0,
  rowSaveStatuses: {},
  removedPresetDetailRecordIds: new Set<number>(),
  presetLibrary: [],
  setActiveClientId: clientId =>
    set({ activeClientId: normalizeClientId(clientId) }),
  setSearchTerm: term => set({ searchTerm: term }),
  setActiveEntityId: entityId => {
    set(state => {
      const normalized = entityId?.trim();
      const availableEntities =
        state.activeEntities.length > 0
          ? state.activeEntities
          : deriveEntitySummaries(state.accounts);
      const resolvedEntityId =
        normalized === undefined || normalized === null || normalized === ''
          ? null
          : availableEntities.some(entity => entity.id === normalized)
            ? normalized
            : null;

      const resolvedPeriod = resolveActivePeriod(
        state.accounts,
        resolvedEntityId,
        state.activePeriod,
      );

      return {
        activeEntityId: resolvedEntityId,
        activePeriod: resolvedPeriod,
      };
    });
    const targetEntityId = get().activeEntityId;
    if (targetEntityId) {
      void get().refreshPresetLibrary([targetEntityId]);
    }
  },
  setActivePeriod: period =>
    set(state => {
      if (period === null) {
        return { activePeriod: null };
      }

      const scopedAccounts = getAccountsForEntity(
        state.accounts,
        state.activeEntityId,
      );
      const availablePeriods = getPeriodsForAccounts(scopedAccounts);

      if (availablePeriods.length === 0) {
        return { activePeriod: null };
      }

      if (availablePeriods.includes(period)) {
        return { activePeriod: period };
      }

      return { activePeriod: availablePeriods[0] ?? null };
    }),
  toggleStatusFilter: status =>
    set(state => {
      const exists = state.activeStatuses.includes(status);
      const next = exists
        ? state.activeStatuses.filter(item => item !== status)
        : [...state.activeStatuses, status];
      return { activeStatuses: next };
    }),
  clearStatusFilters: () => set({ activeStatuses: [] }),
  clearWorkspace: () => {
    resetAutoSaveState();
    resetRatioAllocationState();
    set({
      accounts: initialAccounts,
      dirtyMappingIds: new Set<string>(),
      searchTerm: '',
      activeStatuses: [],
      activeUploadId: null,
      activeUploadMetadata: null,
      activeClientId: null,
      activeEntityId: null,
      activeEntityIds: initialEntities.map(entity => entity.id),
      activeEntities: initialEntities,
      activePeriod: null,
      isLoadingFromApi: false,
      apiError: null,
      isSavingMappings: false,
      saveError: null,
      lastSavedCount: 0,
      rowSaveStatuses: {},
      removedPresetDetailRecordIds: new Set<number>(),
      presetLibrary: [],
    });
  },
  refreshPresetLibrary: async entityIds => {
    const normalizedIds = Array.from(
      new Set(
        entityIds
          .map(id => id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (!normalizedIds.length) {
      set({ presetLibrary: [] });
      useRatioAllocationStore.getState().hydrate({ presets: [] });
      return;
    }

    try {
      const batch = await Promise.all(
        normalizedIds.map(id => fetchPresetLibraryForEntity(id)),
      );
      const entries = dedupePresetEntries(batch.flat());
      set({ presetLibrary: entries });
      const dynamicPresets = buildDynamicPresetsFromLibrary(entries);
      const ratioState = useRatioAllocationStore.getState();
      ratioState.hydrate({
        presets: dynamicPresets,
      });
      const dynamicPresetIds = new Set(dynamicPresets.map(preset => preset.id));
      get().accounts.forEach(account => {
        if (account.mappingType !== 'dynamic') {
          return;
        }
        const targetPresetId =
          account.presetId && dynamicPresetIds.has(account.presetId)
            ? account.presetId
            : null;
        ratioState.setActivePresetForSource(account.id, targetPresetId);
      });
    } catch (error) {
      logError('Unable to refresh preset library', error);
    }
  },
  updateTarget: (id, coaId) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      // If viewing all periods, apply to all months of this account
      // If viewing specific period, only apply to this row
      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.entityId === targetAccount.entityId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        const next = applyDerivedStatus({ ...account, manualCOAId: coaId || undefined });
        if (next !== account) {
          dirtyIds.push(account.id);
        }
        return next;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  updatePreset: (id, presetId) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.entityId === targetAccount.entityId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        const next = applyDerivedStatus({ ...account, presetId: presetId || undefined });
        if (next !== account) {
          dirtyIds.push(account.id);
        }
        return next;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  updateStatus: (id, status) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.entityId === targetAccount.entityId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        const isExcluded = status === 'Excluded';
        const nextMappingType = isExcluded
          ? 'exclude'
          : account.mappingType === 'exclude'
            ? 'direct'
            : account.mappingType;

        const updated = applyDerivedStatus({
          ...account,
          status,
          mappingType: nextMappingType,
          manualCOAId: isExcluded ? undefined : account.manualCOAId,
          presetId: isExcluded ? undefined : account.presetId,
          splitDefinitions: isExcluded ? [] : account.splitDefinitions,
          dynamicExclusionAmount: isExcluded ? undefined : account.dynamicExclusionAmount,
        });

        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  updateMappingType: (id, mappingType) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const templateSplits =
        mappingType === 'percentage'
          ? ensureMinimumPercentageSplits(targetAccount.splitDefinitions)
          : [];

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.entityId === targetAccount.entityId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        const nextSplitDefinitions =
          mappingType === 'percentage'
            ? shouldApplyToAll
              ? templateSplits.map(split => ({ ...split }))
              : ensureMinimumPercentageSplits(account.splitDefinitions)
            : [];
        const nextDynamicExclusion = mappingType === 'dynamic' ? account.dynamicExclusionAmount : undefined;

        const updated = applyDerivedStatus({
          ...account,
          mappingType,
          status:
            mappingType === 'exclude'
              ? 'Excluded'
              : account.status === 'Excluded'
                ? 'Unmapped'
                : account.status,
          manualCOAId: mappingType === 'exclude' ? undefined : account.manualCOAId,
          splitDefinitions: nextSplitDefinitions,
          dynamicExclusionAmount: nextDynamicExclusion,
        });
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  updatePolarity: (id, polarity) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.entityId === targetAccount.entityId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        dirtyIds.push(account.id);
        return { ...account, polarity };
      });
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  updateNotes: (id, notes) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;

      const accounts = state.accounts.map(account => {
        const isSameAccount = account.entityId === targetAccount.entityId &&
                              account.accountId === targetAccount.accountId;
        const shouldUpdate = shouldApplyToAll ? isSameAccount : account.id === id;

        if (!shouldUpdate) {
          return account;
        }

        dirtyIds.push(account.id);
        return { ...account, notes: notes || undefined };
      });
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  addSplitDefinition: id =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === id);
      if (!targetAccount || targetAccount.mappingType !== 'percentage') {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const templateSplit = createBlankSplitDefinition();
      const updatedTargetSplits = [...targetAccount.splitDefinitions, templateSplit];
      const key = `${targetAccount.entityId}__${targetAccount.accountId}`;

      const accounts = state.accounts.map(account => {
        const matchesKey = `${account.entityId}__${account.accountId}` === key;
        const shouldUpdate = shouldApplyToAll ? matchesKey : account.id === id;

        if (!shouldUpdate || account.mappingType !== 'percentage') {
          return account;
        }

        const splitsToApply = shouldApplyToAll
          ? updatedTargetSplits.map(split => ({ ...split }))
          : [...account.splitDefinitions, { ...templateSplit }];

        const updated = applyDerivedStatus({
          ...account,
          splitDefinitions: splitsToApply,
        });
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });

      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  updateSplitDefinition: (accountId, splitId, updates) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === accountId);
      if (!targetAccount) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const updatedTargetSplits = targetAccount.splitDefinitions.map(split =>
        split.id === splitId
          ? {
              ...split,
              ...updates,
            }
          : split,
      );
      const key = `${targetAccount.entityId}__${targetAccount.accountId}`;

      const accounts = state.accounts.map(account => {
        const matchesKey = `${account.entityId}__${account.accountId}` === key;
        const shouldUpdate = shouldApplyToAll ? matchesKey : account.id === accountId;

        if (!shouldUpdate) {
          return account;
        }

        if (shouldApplyToAll) {
          const updated = applyDerivedStatus({
            ...account,
            splitDefinitions: updatedTargetSplits.map(split => ({ ...split })),
          });
          if (updated !== account) {
            dirtyIds.push(account.id);
          }
          return updated;
        }

        const updated = applyDerivedStatus({
          ...account,
          splitDefinitions: account.splitDefinitions.map(split =>
            split.id === splitId
              ? {
                  ...split,
                  ...updates,
                }
              : split,
          ),
        });
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });

      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  removeSplitDefinition: (accountId, splitId) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetAccount = state.accounts.find(acc => acc.id === accountId);
      if (!targetAccount) {
        return state;
      }

      const splitToRemove = targetAccount.splitDefinitions.find(split => split.id === splitId);
      const nextRemoved = new Set(state.removedPresetDetailRecordIds);
      if (splitToRemove?.recordId) {
        nextRemoved.add(splitToRemove.recordId);
      }

      const shouldApplyToAll = state.activePeriod === null;
      const updatedTargetSplits = targetAccount.splitDefinitions.filter(split => split.id !== splitId);
      const key = `${targetAccount.entityId}__${targetAccount.accountId}`;

      const accounts = state.accounts.map(account => {
        const matchesKey = `${account.entityId}__${account.accountId}` === key;
        const shouldUpdate = shouldApplyToAll ? matchesKey : account.id === accountId;

        if (!shouldUpdate) {
          return account;
        }

        if (shouldApplyToAll) {
          const updated = applyDerivedStatus({
            ...account,
            splitDefinitions: updatedTargetSplits.map(split => ({ ...split })),
          });
          if (updated !== account) {
            dirtyIds.push(account.id);
          }
          return updated;
        }

        const updated = applyDerivedStatus({
          ...account,
          splitDefinitions: account.splitDefinitions.filter(split => split.id !== splitId),
        });
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });

      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return {
        accounts,
        dirtyMappingIds,
        rowSaveStatuses,
        removedPresetDetailRecordIds: nextRemoved,
      };
    }),
  applyBatchMapping: (ids, updates) =>
    set(state => {
      const dirtyIds: string[] = [];
      const accounts = state.accounts.map(account => {
        if (!ids.includes(account.id)) {
          return account;
        }

        const next: GLAccountMappingRow = { ...account };

        if ('target' in updates) {
          next.manualCOAId = updates.target || undefined;
        }
        if (updates.mappingType) {
          next.mappingType = updates.mappingType;
          if (updates.mappingType === 'exclude') {
            next.splitDefinitions = [];
            next.status = 'Excluded';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.dynamicExclusionAmount = undefined;
          } else if (updates.mappingType === 'percentage') {
            next.splitDefinitions = ensureMinimumPercentageSplits(
              next.splitDefinitions,
            );
          } else if (next.status === 'Excluded') {
            next.status = 'Unmapped';
          }
        }
        if ('presetId' in updates) {
          next.presetId = updates.presetId || undefined;
          if (updates.presetId && !updates.mappingType) {
            if (next.mappingType === 'exclude') {
              next.mappingType = 'percentage';
            }
            if (next.status === 'Excluded') {
              next.status = 'Unmapped';
            }
          }
        }
        if (updates.polarity) {
          next.polarity = updates.polarity;
        }
        if (updates.status) {
          next.status = updates.status;
          if (updates.status === 'Excluded') {
            next.mappingType = 'exclude';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.splitDefinitions = [];
            next.dynamicExclusionAmount = undefined;
          } else if (next.mappingType === 'exclude') {
            next.mappingType = 'direct';
          }
        } else if (updates.mappingType && updates.mappingType !== 'exclude' && next.status === 'Excluded') {
          next.status = 'Unmapped';
        }
        if (next.mappingType !== 'percentage' && next.mappingType !== 'dynamic') {
          next.splitDefinitions = [];
          next.dynamicExclusionAmount = undefined;
        }
        if (next.mappingType !== 'dynamic') {
          next.dynamicExclusionAmount = undefined;
        }
        const updated = applyDerivedStatus(next);
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  applyMappingToMonths: (entityId, accountId, months, mapping) =>
    set(state => {
      const dirtyIds: string[] = [];
      const targetIds = state.accounts
        .filter(account => {
          const matchesAccount = account.entityId === entityId && account.accountId === accountId;
          if (!matchesAccount) return false;

          if (months === 'all') return true;

          return account.glMonth && months.includes(account.glMonth);
        })
        .map(account => account.id);

      const accounts = state.accounts.map(account => {
        if (!targetIds.includes(account.id)) {
          return account;
        }

        const next: GLAccountMappingRow = { ...account };

        if ('target' in mapping) {
          next.manualCOAId = mapping.target || undefined;
        }
        if (mapping.mappingType) {
          next.mappingType = mapping.mappingType;
          if (mapping.mappingType === 'exclude') {
            next.splitDefinitions = [];
            next.status = 'Excluded';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.dynamicExclusionAmount = undefined;
          } else if (mapping.mappingType === 'percentage') {
            next.splitDefinitions = ensureMinimumPercentageSplits(
              next.splitDefinitions,
            );
          } else if (next.status === 'Excluded') {
            next.status = 'Unmapped';
          }
        }
        if ('presetId' in mapping) {
          next.presetId = mapping.presetId || undefined;
          if (mapping.presetId && !mapping.mappingType) {
            if (next.mappingType === 'exclude') {
              next.mappingType = 'percentage';
            }
            if (next.status === 'Excluded') {
              next.status = 'Unmapped';
            }
          }
        }
        if (mapping.polarity) {
          next.polarity = mapping.polarity;
        }
        if (mapping.status) {
          next.status = mapping.status;
          if (mapping.status === 'Excluded') {
            next.mappingType = 'exclude';
            next.manualCOAId = undefined;
            next.presetId = undefined;
            next.splitDefinitions = [];
            next.dynamicExclusionAmount = undefined;
          } else if (next.mappingType === 'exclude') {
            next.mappingType = 'direct';
          }
        } else if (mapping.mappingType && mapping.mappingType !== 'exclude' && next.status === 'Excluded') {
          next.status = 'Unmapped';
        }
        if (next.mappingType !== 'percentage' && next.mappingType !== 'dynamic') {
          next.splitDefinitions = [];
          next.dynamicExclusionAmount = undefined;
        }
        if (next.mappingType !== 'dynamic') {
          next.dynamicExclusionAmount = undefined;
        }
        const updated = applyDerivedStatus(next);
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  applyPresetToAccounts: (ids, presetId) => {
    const ratioUpdates: { accountId: string; presetId: string | null }[] = [];
    set(state => {
      const dirtyIds: string[] = [];
      if (!ids.length) {
        return state;
      }

      const shouldApplyToAll = state.activePeriod === null;
      const keySet = shouldApplyToAll
        ? new Set(
            state.accounts
              .filter(account => ids.includes(account.id))
              .map(account => `${account.entityId}__${account.accountId}`),
          )
        : null;
      const resolvedPresetId = presetId ?? undefined;
      const presetEntry = resolvedPresetId
        ? state.presetLibrary.find(entry => entry.id === resolvedPresetId)
        : null;
      const baseSplits = presetEntry ? buildSplitDefinitionsFromPreset(presetEntry) : [];

      const accounts = state.accounts.map(account => {
        const matchesDirect = ids.includes(account.id);
        const matchesKey = shouldApplyToAll
          ? keySet?.has(`${account.entityId}__${account.accountId}`)
          : false;

        if (!matchesDirect && !matchesKey) {
          return account;
        }

        if (!presetEntry) {
          const updated = applyDerivedStatus({ ...account, presetId: resolvedPresetId });
          if (updated !== account) {
            dirtyIds.push(account.id);
            if (account.mappingType === 'dynamic') {
              ratioUpdates.push({ accountId: account.id, presetId: null });
            }
          }
          return updated;
        }

        const nextStatus: MappingStatus = account.status === 'Excluded' ? 'Unmapped' : account.status;
        const cloneSplits = () =>
          baseSplits.map((split, index) => ({
            ...split,
            id: `${split.id}-${account.id}-${index}`,
          }));

        let updatedAccount = account;

        if (presetEntry.type === 'dynamic') {
          const next = applyDerivedStatus({
            ...account,
            mappingType: 'dynamic',
            status: nextStatus,
            presetId: resolvedPresetId,
            splitDefinitions: cloneSplits(),
          });
          if (next !== account) {
            dirtyIds.push(account.id);
          }
          updatedAccount = next;
          ratioUpdates.push({ accountId: account.id, presetId: resolvedPresetId ?? null });
        } else if (presetEntry.type === 'direct') {
          const manualTarget = cloneSplits().find(split => !split.isExclusion)?.targetId;
          const next = applyDerivedStatus({
            ...account,
            mappingType: 'direct',
            status: nextStatus,
            manualCOAId: manualTarget || undefined,
            presetId: resolvedPresetId,
            splitDefinitions: [],
          });
          if (next !== account) {
            dirtyIds.push(account.id);
          }
          updatedAccount = next;
          if (account.mappingType === 'dynamic') {
            ratioUpdates.push({ accountId: account.id, presetId: null });
          }
        } else if (presetEntry.type === 'percentage') {
          const next = applyDerivedStatus({
            ...account,
            mappingType: 'percentage',
            status: nextStatus,
            splitDefinitions: cloneSplits(),
            presetId: resolvedPresetId,
          });
          if (next !== account) {
            dirtyIds.push(account.id);
          }
          updatedAccount = next;
          if (account.mappingType === 'dynamic') {
            ratioUpdates.push({ accountId: account.id, presetId: null });
          }
        } else if (presetEntry.type === 'exclude') {
          const next = applyDerivedStatus({
            ...account,
            mappingType: 'exclude',
            status: 'Excluded',
            presetId: resolvedPresetId,
            splitDefinitions: [],
            manualCOAId: undefined,
          });
          if (next !== account) {
            dirtyIds.push(account.id);
          }
          updatedAccount = next;
          if (account.mappingType === 'dynamic') {
            ratioUpdates.push({ accountId: account.id, presetId: null });
          }
        } else {
          const next = applyDerivedStatus({
            ...account,
            mappingType: 'percentage',
            status: nextStatus,
            splitDefinitions: cloneSplits(),
            presetId: resolvedPresetId,
          });
          if (next !== account) {
            dirtyIds.push(account.id);
          }
          updatedAccount = next;
          if (account.mappingType === 'dynamic') {
            ratioUpdates.push({ accountId: account.id, presetId: null });
          }
        }

        return updatedAccount;
      });

      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    });

    const ratioState = useRatioAllocationStore.getState();
    ratioUpdates.forEach(update =>
      ratioState.setActivePresetForSource(update.accountId, update.presetId),
    );
  },
  bulkAccept: ids =>
    set(state => {
      const dirtyIds: string[] = [];
      if (!ids.length) {
        return state;
      }
      const accounts = state.accounts.map(account => {
        if (!ids.includes(account.id) || !account.suggestedCOAId) {
          return account;
        }
        if (account.mappingType === 'exclude' || account.status === 'Excluded') {
          return account;
        }
        const updated = applyDerivedStatus({
          ...account,
          manualCOAId: account.suggestedCOAId,
          status: 'Mapped',
          mappingType: account.mappingType === 'direct' ? account.mappingType : 'direct',
        });
        if (updated !== account) {
          dirtyIds.push(account.id);
        }
        return updated;
      });
      updateDynamicBasisAccounts(accounts);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts, dirtyMappingIds, rowSaveStatuses };
    }),
  finalizeMappings: ids => {
    const sourceIds = ids.length ? ids : get().accounts.map(account => account.id);
    const accounts = get().accounts.filter(account => sourceIds.includes(account.id));
    const issues = getSplitValidationIssues(accounts);
    if (issues.length > 0) {
      console.warn('Unable to finalize mappings due to split issues', issues);
      return false;
    }
    const payload = accounts
      .filter(account => account.mappingType !== 'exclude' && account.status !== 'Excluded')
      .map(account => ({
        glAccountRawId: account.id,
        coAAccountId: account.manualCOAId || account.suggestedCOAId,
        status: account.status,
        mappingType: account.mappingType,
        polarity: account.polarity,
      }));
    console.log('Finalize mappings', payload);
    return true;
  },
  updateAccountEntity: (accountId, payload) =>
    set(state => {
      const dirtyIds: string[] = [];
      const trimmedName = payload.entityName.trim();
      const normalizedId =
        trimmedName.length > 0
          ? payload.entityId && payload.entityId.length > 0
            ? payload.entityId
            : slugify(trimmedName) || `unassigned-${accountId}`
          : `unassigned-${accountId}`;

      const accounts = state.accounts.map(account => {
        if (account.id !== accountId) {
          return account;
        }

        const updated = {
          ...account,
          entityId: normalizedId,
          entityName: trimmedName,
          entities: ensureEntityBreakdown(account, normalizedId, trimmedName),
        };
        dirtyIds.push(account.id);
        return updated;
      });

      const resolved = resolveEntityConflicts(accounts, state.activeEntities);
      updateDynamicBasisAccounts(resolved);
      const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(state, dirtyIds);
      enqueueDirtyIds(dirtyIds);
      return { accounts: resolved, dirtyMappingIds, rowSaveStatuses };
    }),
  hydrateFromHistory: async (uploadGuid, mode = 'resume', entityIds = []) => {
    if ((mode === 'none') || (!uploadGuid && entityIds.length === 0)) {
      return;
    }

    const scopes: { fileUploadGuid?: string | null; entityId?: string }[] = [];
    if (uploadGuid) {
      scopes.push({ fileUploadGuid: uploadGuid });
    }

    const uniqueEntityIds = Array.from(
      new Set(
        entityIds
          .map(id => id?.trim())
          .filter((id): id is string => Boolean(id && id.length > 0)),
      ),
    );

    uniqueEntityIds.forEach(entityId => scopes.push({ entityId }));

    if (scopes.length === 0) {
      return;
    }

    try {
      const aggregated: SavedMappingRow[] = [];

      for (const scope of scopes) {
        const params = new URLSearchParams();
        if (scope.fileUploadGuid) {
          params.set('fileUploadGuid', scope.fileUploadGuid);
        }
        if (scope.entityId) {
          params.set('entityId', scope.entityId);
        }
        params.set('includePresetDetails', 'true');

        const response = await fetch(`${API_BASE_URL}/mapping/suggest?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Failed to load saved mappings (${response.status})`);
        }

        const payload = (await response.json()) as { items?: SavedMappingRow[] };
        aggregated.push(...(payload.items ?? []));
      }

      logDebug('Hydrated saved mappings', {
        count: aggregated.length,
        uploadGuid,
        entityIds: uniqueEntityIds,
        mode,
      });

      if (aggregated.length === 0) {
        return;
      }

      set(state => {
      const merged = mergeSavedMappings(state.accounts, aggregated, mode);
      updateDynamicBasisAccounts(merged);
      return {
        accounts: merged,
        dirtyMappingIds: new Set<string>(),
        rowSaveStatuses: {},
        removedPresetDetailRecordIds: new Set<number>(),
      };
    });
  } catch (error) {
      logError('Unable to hydrate saved mappings', error);
    }
  },
  saveMappings: async (accountIds) => {
    const state = get();
    const { accounts, activeEntityId, dirtyMappingIds } = state;
    const pendingPresetDetailDeletes = Array.from(state.removedPresetDetailRecordIds);
    const currentUserEmail = useOrganizationStore.getState().currentEmail ?? null;
    const scope = Array.isArray(accountIds) && accountIds.length > 0 ? accountIds : null;
    const idsToSave = scope
      ? scope.filter(id => dirtyMappingIds.has(id))
      : Array.from(dirtyMappingIds);

    if (!idsToSave.length) {
      set({ saveError: 'No changes ready to save.', lastSavedCount: 0 });
      return 0;
    }

    const scopedAccounts = accounts.filter(account => idsToSave.includes(account.id));

    const availableEntities = selectAvailableEntities(state);
    const activeEntity = activeEntityId
      ? availableEntities.find(entity => entity.id === activeEntityId) ?? null
      : null;
    const defaultEntity = activeEntity ?? (availableEntities.length === 1 ? availableEntities[0] : null);

    const payload = scopedAccounts
      .map(account =>
        buildSaveInputFromAccount(account, defaultEntity, activeEntityId, currentUserEmail),
      )
      .filter((entry): entry is MappingSaveInput => Boolean(entry));

    if (!payload.length) {
      const missingEntities = scopedAccounts.filter(
        account =>
          (account.status === 'Mapped' || account.status === 'Excluded') &&
          !account.entityId &&
          !account.entityName &&
          !defaultEntity,
      );

      set({
        saveError: missingEntities.length
          ? 'Assign an entity to mapped rows before saving.'
          : 'No mapped or excluded rows are ready to save.',
        lastSavedCount: 0,
      });
      return 0;
    }

    set(state => ({
      isSavingMappings: true,
      saveError: null,
      rowSaveStatuses: markRowsSaving(state.rowSaveStatuses, idsToSave),
    }));
    const metricStartTime = Date.now();
    const flushDeletedPresetDetails = async (recordIds: number[]) => {
      for (const recordId of recordIds) {
        const deleted = await deletePresetDetailRecord(recordId);
        if (deleted) {
          set(current => {
            const nextIds = new Set(current.removedPresetDetailRecordIds);
            nextIds.delete(recordId);
            return { removedPresetDetailRecordIds: nextIds };
          });
        }
      }
    };

    try {
      const requestBody: MappingSaveRequest = { items: payload };
      const response = await fetch(`${API_BASE_URL}/entityAccountMappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to save mappings (${response.status})`);
      }

      const body = (await response.json()) as { items?: unknown[] };
      const savedCount = body.items?.length ?? payload.length;
      const elapsedMs = Date.now() - metricStartTime;

      trackMappingSaveAttempt({
        dirtyRows: idsToSave.length,
        payloadRows: payload.length,
        elapsedMs,
        savedRows: savedCount,
        success: true,
        source: 'mappingStore',
      });

      set(current => {
        const nextDirty = new Set(current.dirtyMappingIds);
        idsToSave.forEach(id => nextDirty.delete(id));
        const nextRowStatuses = clearRowSaveStatusesForIds(
          current.rowSaveStatuses,
          idsToSave,
        );
        return {
          isSavingMappings: false,
          lastSavedCount: savedCount,
          saveError: null,
          dirtyMappingIds: nextDirty,
          rowSaveStatuses: nextRowStatuses,
        };
      });
      if (pendingPresetDetailDeletes.length) {
        await flushDeletedPresetDetails(pendingPresetDetailDeletes);
      }
      return savedCount;
    } catch (error) {
      const elapsedMs = Date.now() - metricStartTime;
      logError('Unable to save mappings', error);
      const message =
        error instanceof Error ? error.message : 'Failed to save mappings';
      trackMappingSaveAttempt({
        dirtyRows: idsToSave.length,
        payloadRows: payload.length,
        elapsedMs,
        savedRows: 0,
        success: false,
        errorMessage: message,
        source: 'mappingStore',
      });
      set(current => ({
        isSavingMappings: false,
        lastSavedCount: 0,
        saveError: message,
        rowSaveStatuses: markRowsErrored(
          current.rowSaveStatuses,
          idsToSave,
          message,
        ),
      }));
      return 0;
    }
  },
  queueAutoSave: (ids: string[], options?: { immediate?: boolean }) => {
    queueRowsForAutoSave(ids, options);
  },
  flushAutoSaveQueue: async (options?: { immediate?: boolean }) => {
    await flushAutoSaveQueue(options);
  },
  loadImportedAccounts: async ({
    uploadId,
    clientId,
    entityIds,
    entities,
    period,
    rows,
    uploadMetadata,
  }) => {
    const normalizedClientId = normalizeClientId(clientId);
    const normalizedPeriod = period && period.trim().length > 0 ? period : null;

    const resolvedUploadMetadata: UploadMetadata = {
      uploadId,
      fileName: uploadMetadata?.fileName ?? null,
      uploadedAt: uploadMetadata?.uploadedAt ?? null,
    };

    const entityIdSummaries = (entityIds ?? []).map(id => {
      const knownEntity = entities?.find(entity => entity.id === id);
      return knownEntity ?? { id, name: id };
    });
    const selectedEntities = dedupeEntities([...entityIdSummaries, ...(entities ?? [])]);

    const accountsFromImport = buildMappingRowsFromImport(rows, {
      uploadId,
      clientId: normalizedClientId,
      selectedEntities,
    }).map(applyDerivedStatus);

    const resolvedAccounts = resolveEntityConflicts(accountsFromImport, selectedEntities);

    const derivedEntities = deriveEntitySummaries(resolvedAccounts);
    const mergedEntities = mergeEntitiesWithIds(selectedEntities, derivedEntities, entityIds ?? []);
    const resolvedEntityIds =
      entityIds?.length && entityIds.length > 0
        ? Array.from(new Set(entityIds))
        : mergedEntities.map(entity => entity.id);
    const resolvedActiveEntityId =
      resolvedEntityIds.find(id => mergedEntities.some(entity => entity.id === id)) ??
      mergedEntities[0]?.id ??
      null;

    const scopedAccounts = getAccountsForEntity(
      resolvedAccounts,
      resolvedActiveEntityId,
    );
    const periodSourceAccounts =
      scopedAccounts.length > 0 ? scopedAccounts : resolvedAccounts;
    const availablePeriods = getPeriodsForAccounts(periodSourceAccounts);
    const resolvedPeriod =
      normalizedPeriod && (availablePeriods.length === 0 || availablePeriods.includes(normalizedPeriod))
        ? normalizedPeriod
        : availablePeriods.length === 1
          ? availablePeriods[0] ?? null
          : null;

    set({
      accounts: resolvedAccounts,
      dirtyMappingIds: new Set<string>(),
      rowSaveStatuses: {},
      removedPresetDetailRecordIds: new Set<number>(),
      searchTerm: '',
      activeStatuses: [],
      activeUploadId: uploadId,
      activeUploadMetadata: resolvedUploadMetadata,
      activeClientId: normalizedClientId,
      activeEntityId: resolvedActiveEntityId,
      activeEntityIds: resolvedEntityIds,
      activeEntities: mergedEntities,
      activePeriod: resolvedPeriod,
    });

    syncDynamicAllocationState(resolvedAccounts, rows, normalizedPeriod);
    await get().refreshPresetLibrary(resolvedEntityIds);
  },
  fetchFileRecords: async (uploadGuid, options) => {
    if (!uploadGuid) {
      return;
    }

    set({ isLoadingFromApi: true, apiError: null });

    try {
      const params = new URLSearchParams({ fileUploadGuid: uploadGuid });
      const response = await fetch(`${API_BASE_URL}/file-records?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to load file records (${response.status})`);
      }

      const payload = (await response.json()) as FileRecordsResponse;
      const records = payload.items ?? [];
      const entities = payload.entities ?? options?.entities ?? [];
      const normalizedEntities = entities.map(normalizeEntitySummary);
      const uploadMetadata =
        payload.upload ??
        (payload.fileName || payload.uploadedAt
          ? { fileName: payload.fileName, uploadedAt: payload.uploadedAt }
          : null);
      logDebug('Fetched file records', { count: records.length, uploadGuid });

      const entityNameLookup = new Map(normalizedEntities.map(entity => [entity.id, entity.name]));

      const rows: TrialBalanceRow[] = records.map((record) => {
        const entityId = record.entityId ? String(record.entityId).trim() : null;
        const entityName =
          record.entityName?.trim() ?? (entityId ? entityNameLookup.get(entityId) ?? null : null);
        return {
          entity: entityName ?? entityId ?? '',
          entityId,
          entityName,
          accountId: record.accountId,
          description: record.accountName,
          netChange: record.activityAmount ?? 0,
          glMonth: record.glMonth ?? undefined,
        };
      });

      const latestNormalizedPeriod = findLatestNormalizedGlMonth(rows);
      const fallbackPeriod = rows.find((row) => row.glMonth)?.glMonth ?? null;
      const preferredPeriod =
        options?.period ?? latestNormalizedPeriod ?? fallbackPeriod;

      const normalizedClientId = normalizeClientId(options?.clientId ?? null);
      const normalizedEntityIds = options?.entityIds
        ?.map(id => id?.toString().trim())
        .filter((id): id is string => Boolean(id && id.length > 0));

      get().loadImportedAccounts({
        uploadId: uploadGuid,
        clientId: normalizedClientId,
        entityIds:
          normalizedEntityIds ??
          (normalizedEntities.length > 0 ? normalizedEntities.map(entity => entity.id) : undefined),
        entities: normalizedEntities,
        period: preferredPeriod,
        rows,
        uploadMetadata: uploadMetadata
          ? {
              uploadId: uploadGuid,
              fileName: uploadMetadata.fileName ?? null,
              uploadedAt: uploadMetadata.uploadedAt ?? null,
            }
          : undefined,
      });

      const hydrateMode: HydrationMode = options?.hydrateMode ?? 'resume';
      const hydrateEntityIds =
        normalizedEntityIds ?? normalizedEntities.map(entity => entity.id);
      await get().hydrateFromHistory(uploadGuid, hydrateMode, hydrateEntityIds);

      set({ isLoadingFromApi: false, apiError: null });
    } catch (error) {
      logError('Unable to load file records', error);
      set({
        isLoadingFromApi: false,
        apiError:
          error instanceof Error ? error.message : 'Failed to load file records',
      });
    }
  },
};
});

syncDynamicAllocationState(useMappingStore.getState().accounts);

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

const createBlankSplitDefinition = (): MappingSplitDefinition => ({
  id: createId(),
  targetId: '',
  targetName: '',
  allocationType: 'percentage',
  allocationValue: 0,
  notes: '',
  isExclusion: false,
  recordId: null,
});

const ensureMinimumPercentageSplits = (
  splits: MappingSplitDefinition[],
  minimum = 2,
): MappingSplitDefinition[] => {
  const preserved = splits.map(split => ({ ...split }));
  if (preserved.length >= minimum) {
    return preserved;
  }
  const placeholders = Array.from({ length: minimum - preserved.length }, () =>
    createBlankSplitDefinition(),
  );
  return [...preserved, ...placeholders];
};

type PresetApiDetail = {
  targetDatapoint?: string | null;
  basisDatapoint?: string | null;
  isCalculated?: boolean | null;
  specifiedPct?: number | null;
};

type PresetApiRow = {
  presetGuid: string;
  entityId: string;
  presetType?: string | null;
  presetDescription?: string | null;
  presetDetails?: PresetApiDetail[] | null;
};

const toMappingType = (value?: string | null): MappingType => {
  if (!value) {
    return 'percentage';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dynamic') {
    return 'dynamic';
  }
  if (normalized === 'direct') {
    return 'direct';
  }
  if (normalized === 'exclude') {
    return 'exclude';
  }
  return 'percentage';
};

const mapApiRowToLibraryEntry = (row: PresetApiRow): MappingPresetLibraryEntry => ({
  id: row.presetGuid,
  entityId: row.entityId,
  name: row.presetDescription?.trim() || row.presetGuid,
  type: toMappingType(row.presetType),
  description: row.presetDescription ?? null,
  presetDetails:
    (row.presetDetails ?? [])
      .map(detail => ({
        targetDatapoint: detail.targetDatapoint?.trim() ?? '',
        basisDatapoint: detail.basisDatapoint ?? null,
        isCalculated: detail.isCalculated ?? null,
        specifiedPct: detail.specifiedPct ?? null,
      }))
      .filter(detail => detail.targetDatapoint.length > 0),
});

const buildSplitDefinitionsFromPreset = (
  preset: MappingPresetLibraryEntry,
): MappingSplitDefinition[] =>
  preset.presetDetails.map((detail, index) => {
    const isExclusion = detail.targetDatapoint.toLowerCase() === 'excluded';
    const allocationType = preset.type === 'dynamic' ? 'dynamic' : 'percentage';
    const allocationValue = allocationType === 'dynamic'
      ? detail.specifiedPct ?? 0
      : detail.specifiedPct ?? (isExclusion ? 0 : 100);
    return {
      id: `${preset.id}-${index}`,
      targetId: isExclusion ? '' : detail.targetDatapoint,
      targetName: isExclusion ? 'Exclusion' : detail.targetDatapoint,
      allocationType,
      allocationValue,
      notes: isExclusion ? 'Excluded amount' : detail.basisDatapoint ?? undefined,
      basisDatapoint: detail.basisDatapoint ?? undefined,
      isCalculated: detail.isCalculated ?? (allocationType === 'dynamic'),
      isExclusion,
    };
  });

const buildDynamicPresetsFromLibrary = (
  entries: MappingPresetLibraryEntry[],
): DynamicAllocationPreset[] => {
  const presets: DynamicAllocationPreset[] = [];
  entries.forEach(entry => {
    if (entry.type !== 'dynamic') {
      return;
    }
    const rows: DynamicAllocationPresetRow[] = entry.presetDetails
      .map(detail => {
        if (!detail.basisDatapoint || !detail.targetDatapoint) {
          return null;
        }
        return {
          dynamicAccountId: detail.basisDatapoint,
          targetAccountId: detail.targetDatapoint,
        };
      })
      .filter((row): row is DynamicAllocationPresetRow => Boolean(row));

    if (!rows.length) {
      return;
    }

    presets.push({
      id: entry.id,
      name: entry.name,
      rows,
      notes: entry.description ?? undefined,
    });
  });
  return presets;
};

const fetchPresetLibraryForEntity = async (
  entityId: string,
): Promise<MappingPresetLibraryEntry[]> => {
  const params = new URLSearchParams({ entityId });
  const response = await fetch(`${API_BASE_URL}/entityMappingPresets?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load presets (${response.status})`);
  }
  const payload =
    (await response.json()) as { items?: PresetApiRow[] | null };
  const rows = payload.items ?? [];
  return rows.map(mapApiRowToLibraryEntry);
};

const dedupePresetEntries = (
  entries: MappingPresetLibraryEntry[],
): MappingPresetLibraryEntry[] => {
  const lookup = new Map<string, MappingPresetLibraryEntry>();
  entries.forEach(entry => {
    lookup.set(entry.id, entry);
  });
  return Array.from(lookup.values());
};

const buildMappingKey = (
  entityId?: string | null,
  accountId?: string | null,
  glMonth?: string | null,
) => `${entityId ?? ''}__${accountId ?? ''}__${normalizePeriod(glMonth) ?? ''}`;

const mergeSavedMappings = (
  accounts: GLAccountMappingRow[],
  saved: SavedMappingRow[],
  mode: HydrationMode,
): GLAccountMappingRow[] => {
  if (!saved.length) {
    return accounts;
  }

  const lookup = new Map<string, SavedMappingRow>();
  saved.forEach(row => {
    const primaryKey = buildMappingKey(row.entityId, row.accountId, row.glMonth ?? null);
    lookup.set(primaryKey, row);
    const fallbackKey = buildMappingKey(row.entityId, row.accountId, null);
    if (!lookup.has(fallbackKey)) {
      lookup.set(fallbackKey, row);
    }
  });

  return accounts.map(account => {
    if (!account.entityId) {
      return account;
    }

    const keyWithPeriod = buildMappingKey(account.entityId, account.accountId, account.glMonth ?? null);
    const match = lookup.get(keyWithPeriod) ?? lookup.get(buildMappingKey(account.entityId, account.accountId, null));

    if (!match) {
      return account;
    }

    const shouldResetStatus = mode === 'restart' && match.status !== 'Excluded';
    const resolvedStatus: MappingStatus = shouldResetStatus ? 'Unmapped' : match.status;
    const resolvedType: MappingType =
      resolvedStatus === 'Excluded' || match.mappingType === 'exclude'
        ? 'exclude'
        : match.mappingType;

    const exclusionPct = match.exclusionPct ?? null;
    const next: GLAccountMappingRow = {
      ...account,
      mappingType: resolvedType,
      presetId: match.presetId ?? undefined,
      polarity: match.polarity,
      exclusionPct,
      splitDefinitions:
        resolvedType === 'percentage'
          ? ensureMinimumPercentageSplits(match.splitDefinitions ?? [])
          : resolvedType === 'dynamic'
            ? match.splitDefinitions ?? []
            : [],
      manualCOAId:
        resolvedType === 'direct'
          ? match.splitDefinitions?.[0]?.targetId ?? match.presetId ?? account.manualCOAId
          : undefined,
    };

    if (resolvedType === 'exclude') {
      next.status = 'Excluded';
      next.manualCOAId = undefined;
      next.splitDefinitions = [];
    } else {
      next.status = resolvedStatus;
    }

    // Only add an exclusion split if one doesn't already exist in the split definitions
    // This handles backwards compatibility with old data that doesn't have exclusion splits in preset details
    const hasExclusionSplit = next.splitDefinitions.some(split => split.isExclusion);
    if (typeof exclusionPct === 'number' && exclusionPct > 0 && resolvedType !== 'exclude' && !hasExclusionSplit) {
      const exclusionSplit: MappingSplitDefinition = {
        id: `${account.id}-exclusion`,
        targetId: '',
        targetName: 'Exclusion',
        allocationType: 'percentage',
        allocationValue: exclusionPct,
        notes: 'Excluded amount',
        isExclusion: true,
      };

      const nonExclusionSplits = next.splitDefinitions.filter(split => !split.isExclusion);
      next.splitDefinitions = [...nonExclusionSplits, exclusionSplit];
    }

    return applyDerivedStatus(next);
  });
};

const getSplitValidationIssues = (accounts: GLAccountMappingRow[]) => {
  const issues: { accountId: string; message: string }[] = [];
  accounts.forEach(account => {
    if (account.mappingType !== 'percentage') {
      return;
    }
    if (account.splitDefinitions.length === 0) {
      issues.push({ accountId: account.id, message: 'Missing split definitions' });
      return;
    }
    const totalPercentage = account.splitDefinitions.reduce(
      (sum, split) => sum + getSplitPercentage(account, split),
      0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      issues.push({ accountId: account.id, message: 'Split percentages must equal 100%' });
    }
  });
  return issues;
};

const isAccountResolvedForSummary = (account: GLAccountMappingRow): boolean => {
  const derivedStatus = deriveMappingStatus(account);
  if (derivedStatus === 'Mapped' || derivedStatus === 'Excluded') {
    return true;
  }

  if (account.mappingType === 'direct') {
    const hasManualTarget = typeof account.manualCOAId === 'string' && account.manualCOAId.trim().length > 0;
    const hasSuggestedTarget =
      typeof account.suggestedCOAId === 'string' && account.suggestedCOAId.trim().length > 0;
    return hasManualTarget || hasSuggestedTarget;
  }

  return false;
};

const selectEntityScopedAccounts = (
  state: MappingState,
): GLAccountMappingRow[] => getAccountsForEntity(state.accounts, state.activeEntityId);

export const selectAccounts = (state: MappingState): GLAccountMappingRow[] =>
  selectEntityScopedAccounts(state);

export const selectTotalAccounts = (state: MappingState): number =>
  selectEntityScopedAccounts(state).length;

export const selectMappedAccounts = (state: MappingState): number =>
  selectEntityScopedAccounts(state).filter(isAccountResolvedForSummary).length;

export const selectGrossTotal = (state: MappingState): number =>
  calculateGrossTotal(selectEntityScopedAccounts(state));

export const selectExcludedTotal = (state: MappingState): number =>
  calculateExcludedTotal(selectEntityScopedAccounts(state));

export const selectNetTotal = (state: MappingState): number =>
  calculateGrossTotal(selectEntityScopedAccounts(state)) -
  calculateExcludedTotal(selectEntityScopedAccounts(state));

export const selectStatusCounts = (state: MappingState): Record<MappingStatus, number> =>
  selectEntityScopedAccounts(state).reduce<Record<MappingStatus, number>>(
    (accumulator, account) => {
      accumulator[account.status] += 1;
      return accumulator;
    },
    Object.fromEntries(mappingStatuses.map(status => [status, 0])) as Record<MappingStatus, number>,
  );

export const selectSummaryMetrics = (state: MappingState): SummarySelector => {
  const scopedAccounts = selectEntityScopedAccounts(state);
  const grossTotal = calculateGrossTotal(scopedAccounts);
  const excludedTotal = calculateExcludedTotal(scopedAccounts);
  return {
    totalAccounts: scopedAccounts.length,
    mappedAccounts: scopedAccounts.filter(isAccountResolvedForSummary).length,
    grossTotal,
    excludedTotal,
    netTotal: grossTotal - excludedTotal,
  };
};

export const selectActiveStatuses = (state: MappingState): MappingStatus[] => state.activeStatuses;

export const selectSearchTerm = (state: MappingState): string => state.searchTerm;

export const selectActiveEntityId = (state: MappingState): string | null => state.activeEntityId;

export const selectActivePeriod = (state: MappingState): string | null => state.activePeriod;

export const selectAvailableEntities = (
  state: MappingState,
): EntitySummary[] => {
  if (state.activeEntities.length > 0) {
    return state.activeEntities;
  }
  return deriveEntitySummaries(state.accounts);
};

export const selectAvailablePeriods = (state: MappingState): string[] =>
  getPeriodsForAccounts(selectEntityScopedAccounts(state));

export const selectFilteredAccounts = (state: MappingState): GLAccountMappingRow[] => {
  const scopedAccounts = selectEntityScopedAccounts(state);
  if (!state.activePeriod) {
    return buildMostRecentAccounts(scopedAccounts);
  }
  return scopedAccounts.filter(account => account.glMonth === state.activePeriod);
};

export const selectStandardScoaSummaries = (
  state: MappingState,
): StandardScoaSummary[] => buildStandardScoaSummaries(selectEntityScopedAccounts(state));

export const selectReconciliationGroups = (
  state: MappingState,
): ReconciliationSubcategoryGroup[] => buildReconciliationGroups(
    selectEntityScopedAccounts(state),
  );

export const selectEntityReconciliationGroups = (
  state: MappingState,
): EntityReconciliationGroup[] => buildEntityReconciliationGroups(state.accounts);

export const selectAccountsByPeriod = (state: MappingState): Map<string, GLAccountMappingRow[]> => {
  const byPeriod = new Map<string, GLAccountMappingRow[]>();
  selectEntityScopedAccounts(state).forEach(account => {
    const period = account.glMonth || 'unknown';
    const existing = byPeriod.get(period) || [];
    byPeriod.set(period, [...existing, account]);
  });
  return byPeriod;
};

export const selectAccountHasMultiplePeriods = (
  state: MappingState,
  entityId: string,
  accountId: string
): boolean => {
  const periods = new Set<string>();
  state.accounts.forEach(account => {
    if (account.entityId === entityId && account.accountId === accountId && account.glMonth) {
      periods.add(account.glMonth);
    }
  });
  return periods.size > 1;
};

export const calculateSplitPercentage = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition
): number => getSplitPercentage(account, split);

export const calculateSplitAmount = (
  account: GLAccountMappingRow,
  split: MappingSplitDefinition
): number => getSplitAmount(account, split);

export const selectSplitValidationIssues = (state: MappingState) =>
  getSplitValidationIssues(selectEntityScopedAccounts(state));

export const selectAccountsRequiringSplits = (state: MappingState) =>
  selectEntityScopedAccounts(state).filter(
    account =>
      account.mappingType === 'percentage' && account.splitDefinitions.length === 0
  );

export { getAccountExcludedAmount, getAllocatableNetChange };

useRatioAllocationStore.subscribe(
  (state: RatioAllocationStoreState, previousState?: RatioAllocationStoreState) => {
    const prevState = previousState ?? state;
    const prevMutation = prevState.lastDynamicMutation ?? null;
    const currentMutation = state.lastDynamicMutation ?? null;
    const mutationChanged =
      currentMutation !== null &&
      (!prevMutation || prevMutation.timestamp !== currentMutation.timestamp);

    if (
      state.results === prevState.results &&
      state.selectedPeriod === prevState.selectedPeriod &&
      state.allocations === prevState.allocations &&
      state.basisAccounts === prevState.basisAccounts &&
      state.groups === prevState.groups &&
      state.sourceAccounts === prevState.sourceAccounts &&
      !mutationChanged
    ) {
      return;
    }

    const mutatedAccountId = mutationChanged ? currentMutation?.accountId ?? null : null;
    const { results, selectedPeriod, allocations, basisAccounts, groups, sourceAccounts } = state;

    useMappingStore.setState(currentState => {
      const dynamicAccounts = currentState.accounts.filter(
        account => account.mappingType === 'dynamic',
      );

      if (dynamicAccounts.length === 0) {
        return currentState;
      }

      const targetPeriod = currentState.activePeriod ?? selectedPeriod ?? null;
      const relevantResults =
        targetPeriod !== null
          ? results.filter(result => result.periodId === targetPeriod)
          : results;

      const summaries = computeDynamicExclusionSummaries({
        accounts: dynamicAccounts,
        allocations,
        basisAccounts,
        groups,
        selectedPeriod: targetPeriod,
        results: relevantResults,
      });

      const sourceAccountLookup = new Map(sourceAccounts.map(account => [account.id, account]));

      let changed = false;
      const nextAccounts = currentState.accounts.map(account => {
        if (account.mappingType !== 'dynamic') {
          if (typeof account.dynamicExclusionAmount === 'number') {
            changed = true;
            return { ...account, dynamicExclusionAmount: undefined };
          }
          return account;
        }

        const summary = summaries.get(account.id);
        if (!summary) {
          if ((account.dynamicExclusionAmount ?? 0) === 0) {
            return account;
          }
          changed = true;
          return { ...account, dynamicExclusionAmount: 0 };
        }

        const ratio = summary.percentage;
        const sourceAccount = sourceAccountLookup.get(account.id);
        const sourceValue = sourceAccount
          ? Math.abs(getSourceValue(sourceAccount, targetPeriod))
          : Math.abs(account.netChange);
        const resolvedAmount = sourceValue > 0 ? ratio * sourceValue : 0;

        if (Math.abs((account.dynamicExclusionAmount ?? 0) - resolvedAmount) < 0.0001) {
          return account;
        }

        changed = true;
        return { ...account, dynamicExclusionAmount: resolvedAmount };
      });

      const dirtyIds =
        mutatedAccountId && nextAccounts.some(account => account.id === mutatedAccountId)
          ? [mutatedAccountId]
          : [];

      if (!changed && dirtyIds.length === 0) {
        return currentState;
      }

      const nextState: Partial<MappingState> = {};
      if (changed) {
        nextState.accounts = nextAccounts;
      }

      if (dirtyIds.length > 0) {
        const { dirtyMappingIds, rowSaveStatuses } = applyDirtyStatusUpdates(
          currentState,
          dirtyIds,
        );
        nextState.dirtyMappingIds = dirtyMappingIds;
        nextState.rowSaveStatuses = rowSaveStatuses;
        useMappingStore.getState().queueAutoSave(dirtyIds);
      }

      return nextState;
    });
  },
);
