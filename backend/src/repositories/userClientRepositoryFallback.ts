import type {
  UserClientAccessResult,
  UserClientMetadata,
} from './userClientRepository';

const buildMetadata = (
  overrides: Partial<UserClientMetadata>
): UserClientMetadata => ({
  sourceAccounts: [
    {
      id: 'acct-1000',
      name: 'Cash and Cash Equivalents',
      description: 'Cash balances and near-cash instruments',
    },
    {
      id: 'acct-2000',
      name: 'Accounts Receivable',
      description: 'Outstanding customer invoices',
    },
  ],
  reportingPeriods: ['2024-01', '2024-02', '2024-03'],
  mappingTypes: ['Standard', 'Advanced'],
  targetSCoAs: ['Default SCoA', 'Healthcare SCoA'],
  polarities: ['Debit', 'Credit'],
  presets: ['Healthcare Baseline', 'Professional Services'],
  exclusions: ['Non-operating revenue'],
  ...overrides,
});

const createFallbackUserClientAccess = (
  email: string
): UserClientAccessResult => ({
  userEmail: email,
  userName: 'MapLedger Demo User',
  clients: [
    {
      clientId: 'demo-client-1',
      clientName: 'Demo Healthcare Group',
      clientScac: 'DHC1',
      companies: [
        {
          companyId: 'demo-company-1',
          companyName: 'Demo General Hospital',
          operations: [
            { id: 'demo-op-1', code: 'demo-op-1', name: 'Inpatient Services' },
            { id: 'demo-op-2', code: 'demo-op-2', name: 'Outpatient Services' },
          ],
        },
        {
          companyId: 'demo-company-2',
          companyName: 'Demo Specialty Clinic',
          operations: [
            { id: 'demo-op-3', code: 'demo-op-3', name: 'Surgical Services' },
          ],
        },
      ],
      metadata: buildMetadata({
        reportingPeriods: ['2023-12', '2024-01', '2024-02'],
      }),
    },
    {
      clientId: 'demo-client-2',
      clientName: 'Demo Professional Services',
      clientScac: 'DPS1',
      companies: [
        {
          companyId: 'demo-company-3',
          companyName: 'Demo Advisory Practice',
          operations: [
            { id: 'demo-op-4', code: 'demo-op-4', name: 'Audit' },
            { id: 'demo-op-5', code: 'demo-op-5', name: 'Tax' },
            { id: 'demo-op-6', code: 'demo-op-6', name: 'Consulting' },
          ],
        },
      ],
      metadata: buildMetadata({
        targetSCoAs: ['Professional Services SCoA'],
        presets: ['Professional Services'],
        exclusions: ['Personal expenses'],
      }),
    },
  ],
});

export default createFallbackUserClientAccess;
