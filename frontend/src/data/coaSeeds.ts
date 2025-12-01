import type { Datapoint } from '../types';

const TEMPLATE_ID = 'template-standard';

const createDatapoint = (config: {
  id: string;
  accountName: string;
  accountDescription?: string;
  type?: Datapoint['type'];
  accountType?: Datapoint['accountType'];
  balanceType?: Datapoint['balanceType'];
  coreGLAccount: string;
  detailLevel?: number;
  functionalGroupId?: string;
  operationalGroupId?: string;
  formula?: string;
  sortOrder: number;
}): Datapoint => ({
  id: config.id,
  templateId: TEMPLATE_ID,
  accountName: config.accountName,
  accountDescription: config.accountDescription ?? config.accountName,
  type: config.type ?? 'Financial',
  accountType: config.accountType ?? 'Revenue',
  balanceType: config.balanceType ?? 'Credit',
  coreGLAccount: config.coreGLAccount,
  detailLevel: config.detailLevel ?? 1,
  functionalGroupId: config.functionalGroupId ?? 'operations',
  operationalGroupId: config.operationalGroupId ?? 'operations',
  formula: config.formula,
  sortOrder: config.sortOrder,
});

export const COA_SEED_DATAPOINTS: Record<string, Datapoint[]> = {
  revenue: [
    createDatapoint({
      id: 'rev-linehaul',
      accountName: 'Linehaul Revenue',
      accountDescription: 'Linehaul freight services',
      coreGLAccount: '4100',
      sortOrder: 1,
    }),
    createDatapoint({
      id: 'rev-accessorial',
      accountName: 'Accessorial Revenue',
      accountDescription: 'Accessorial charges',
      coreGLAccount: '4200',
      sortOrder: 2,
    }),
  ],
  expenses: [
    createDatapoint({
      id: 'exp-payroll',
      accountName: 'Payroll Taxes',
      accountDescription: 'Employer payroll tax expense',
      accountType: 'Expenses',
      balanceType: 'Debit',
      coreGLAccount: '5100',
      sortOrder: 10,
    }),
    createDatapoint({
      id: 'exp-fuel',
      accountName: 'Fuel Expense',
      accountDescription: 'Fuel purchases',
      accountType: 'Expenses',
      balanceType: 'Debit',
      coreGLAccount: '6100',
      sortOrder: 11,
    }),
  ],
};

export const createSeedDatapoints = (): Record<string, Datapoint[]> =>
  Object.entries(COA_SEED_DATAPOINTS).reduce<Record<string, Datapoint[]>>(
    (acc, [key, datapoints]) => {
      acc[key] = datapoints.map(datapoint => ({ ...datapoint }));
      return acc;
    },
    {},
  );