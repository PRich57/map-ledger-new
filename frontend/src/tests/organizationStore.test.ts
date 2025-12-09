import { deriveCompaniesFromAccessList } from '../store/organizationStore';
import type { UserClientAccess } from '../types';

describe('deriveCompaniesFromAccessList', () => {
  const baseAccess: UserClientAccess = {
    clientId: 'client-1',
    clientName: 'Client One',
    clientScac: null,
    companies: [
      {
        companyId: 'company-1',
        companyName: 'Company A',
        operations: [
          { id: 'op-1', code: 'OP-1', name: 'Operation 1' },
        ],
      },
    ],
    metadata: {
      sourceAccounts: [
        { id: 'acct-1', name: 'Account 1', description: null },
      ],
      reportingPeriods: ['2024-Q1'],
      mappingTypes: ['Standard'],
      targetSCoAs: ['SCoA-1'],
      polarities: ['Debit'],
      presets: ['Preset A'],
      exclusions: ['Exclude A'],
    },
  };

  it('groups clients by company and merges metadata', () => {
    const accessList: UserClientAccess[] = [
      baseAccess,
      {
        ...baseAccess,
        metadata: {
          sourceAccounts: [
          { id: 'acct-2', name: 'Account 2', description: 'Fuel' },
          ],
          reportingPeriods: ['2024-Q2'],
          mappingTypes: ['Advanced'],
          targetSCoAs: ['SCoA-2'],
          polarities: ['Credit'],
          presets: ['Preset B'],
          exclusions: ['Exclude B'],
        },
        companies: [
          {
            companyId: 'company-1',
            companyName: 'Company A',
            operations: [
              { id: 'op-2', code: 'OP-2', name: 'Operation 2' },
            ],
          },
        ],
      },
      {
        clientId: 'client-2',
        clientName: 'Client Two',
        clientScac: null,
        companies: [],
        metadata: {
          sourceAccounts: [],
          reportingPeriods: [],
          mappingTypes: [],
          targetSCoAs: [],
          polarities: [],
          presets: [],
          exclusions: [],
        },
      },
    ];

    const companies = deriveCompaniesFromAccessList(accessList);

    expect(companies).toHaveLength(2);

    const companyA = companies.find((company) => company.id === 'company-1');
    expect(companyA).toBeDefined();
    expect(companyA?.clients).toHaveLength(1);
    const [client] = companyA?.clients ?? [];
    expect(client.operations).toHaveLength(2);
    expect(client.operations[0].code).toBe('OP-1');
    expect(client.metadata.reportingPeriods).toEqual(['2024-Q1', '2024-Q2']);
    expect(client.metadata.mappingTypes).toEqual(['Advanced', 'Standard']);
    expect(client.metadata.sourceAccounts).toHaveLength(2);

    const fallbackCompany = companies.find((company) =>
      company.id.startsWith('client-2')
    );
    expect(fallbackCompany).toBeDefined();
    expect(fallbackCompany?.clients[0].name).toBe('Client Two');
  });

  it('deduplicates clients across multiple companies', () => {
    const accessList: UserClientAccess[] = [
      baseAccess,
      {
        ...baseAccess,
        companies: [
          {
            companyId: 'company-2',
            companyName: 'Company B',
            operations: [
              { id: 'op-3', code: 'OP-3', name: 'Operation 3' },
            ],
          },
        ],
      },
    ];

    const companies = deriveCompaniesFromAccessList(accessList);
    expect(companies).toHaveLength(2);

    const companyB = companies.find((company) => company.id === 'company-2');
    expect(companyB?.clients[0].operations[0].name).toBe('Operation 3');
  });
});
