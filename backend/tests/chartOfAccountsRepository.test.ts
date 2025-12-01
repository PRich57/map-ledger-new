import { listChartOfAccounts } from '../src/repositories/chartOfAccountsRepository';
import { runQuery } from '../src/utils/sqlClient';

type RunQueryMock = jest.MockedFunction<typeof runQuery>;

jest.mock('../src/utils/sqlClient', () => ({
  runQuery: jest.fn(),
}));

describe('chartOfAccountsRepository', () => {
  let mockedRunQuery: RunQueryMock;

  beforeEach(() => {
    mockedRunQuery = runQuery as RunQueryMock;
    mockedRunQuery.mockReset();
  });

  it('normalizes chart of account rows from SQL', async () => {
    mockedRunQuery.mockResolvedValue({
      recordset: [
        {
          accountNumber: '1000 ',
          coreAccount: '1000',
          operationalGroup: 'Operations',
          laborGroup: 'Drivers',
          accountType: 'Asset',
          category: 'Cash',
          subCategory: 'Checking',
          description: 'Cash - Operating',
        },
        {
          accountNumber: '2000',
          coreAccount: null,
          operationalGroup: null,
          laborGroup: null,
          accountType: null,
          category: null,
          subCategory: null,
          description: null,
        },
      ],
    } as any);

    const result = await listChartOfAccounts();

    expect(result).toEqual([
      {
        accountNumber: '1000',
        coreAccount: '1000',
        operationalGroup: 'Operations',
        laborGroup: 'Drivers',
        accountType: 'Asset',
        category: 'Cash',
        subCategory: 'Checking',
        description: 'Cash - Operating',
      },
      {
        accountNumber: '2000',
        coreAccount: null,
        operationalGroup: null,
        laborGroup: null,
        accountType: null,
        category: null,
        subCategory: null,
        description: null,
      },
    ]);
  });

  it('returns an empty list when SQL returns no rows', async () => {
    mockedRunQuery.mockResolvedValue({ recordset: [] } as any);

    await expect(listChartOfAccounts()).resolves.toEqual([]);
  });
});
