jest.mock('../src/utils/sqlClient', () => ({
    runQuery: jest.fn(),
  }));
  
  import { runQuery } from '../src/utils/sqlClient';
  import createFallbackUserClientAccess from '../src/repositories/userClientRepositoryFallback';
  import { fetchUserClientAccess } from '../src/repositories/userClientRepository';
  
  type RunQueryMock = jest.MockedFunction<typeof runQuery>;
  
  const ORIGINAL_ENV = process.env;
  
  const configureEnv = (overrides: Record<string, string>) => {
    process.env = {
      ...ORIGINAL_ENV,
      ...overrides,
    } as NodeJS.ProcessEnv;
  };
  
  describe('fetchUserClientAccess', () => {
    let mockedRunQuery: RunQueryMock;
  
    beforeEach(() => {
      mockedRunQuery = runQuery as RunQueryMock;
      mockedRunQuery.mockReset();
      configureEnv({
        SQL_CONN_STR: 'Server=fake;Database=fake;User Id=fake;Password=fake;',
        NODE_ENV: 'test',
        ALLOW_DEV_SQL_FALLBACK: 'true',
      });
    });
  
    afterAll(() => {
      process.env = ORIGINAL_ENV;
    });
  
    it('returns aggregated access data from SQL results', async () => {
      mockedRunQuery.mockResolvedValue({
        recordset: [
          {
            CLIENT_ID: 'C1',
            CLIENT_NAME: 'Client A',
            COMPANY_ID: 'CO1',
            COMPANY_NAME: 'Company One',
            OPERATION_ID: 'OP1',
            OPERATION_NAME: 'Operation One',
            SOURCE_ACCOUNT_ID: 'SA1',
            SOURCE_ACCOUNT_NAME: 'Source 1',
            SOURCE_ACCOUNT_DESCRIPTION: 'Primary source account',
            REPORTING_PERIOD: '2024-01',
            MAPPING_TYPE: 'Type A',
            TARGET_SCOA: 'SCoA 1',
            POLARITY: 'Debit',
            PRESET: 'Preset A',
            EXCLUSION: 'None',
            USER_NAME: 'Jane Doe',
            EMAIL: 'user@ksmcpa.com',
          },
          {
            CLIENT_ID: 'C1',
            CLIENT_NAME: 'Client A',
            COMPANY_ID: 'CO1',
            COMPANY_NAME: 'Company One',
            OPERATION_ID: 'OP2',
            OPERATION_NAME: 'Operation Two',
            REPORTING_PERIOD: '2024-02',
            EMAIL: 'user@ksmta.com',
          },
          {
            CLIENT_ID: null,
            CLIENT_NAME: 'Client A',
            COMPANY_ID: 'CO2',
            COMPANY_NAME: 'Company Two',
            OPERATION_ID: 'OP3',
            OPERATION_NAME: 'Operation Three',
            MAPPING_TYPE: 'Type B',
            TARGET_SCOA: 'SCoA 2',
            POLARITY: 'Credit',
            PRESET: 'Preset B',
            EXCLUSION: 'Exclusion B',
            EMAIL: 'user@ksmcpa.com',
          },
        ],
      } as any);
  
      const result = await fetchUserClientAccess('User@KSMCPA.com');
  
      expect(mockedRunQuery).toHaveBeenCalledWith(
        expect.stringContaining('dbo.V_USER_CLIENT_COMPANY_OPERATIONS'),
        expect.objectContaining({
          email0: 'user@ksmcpa.com',
          email1: 'user@ksmta.com',
        })
      );
      expect(result.userEmail).toBe('user@ksmcpa.com');
      expect(result.userName).toBe('Jane Doe');
      expect(result.clients).toHaveLength(1);
  
      const [client] = result.clients;
      expect(client.clientId).toBe('C1');
      expect(client.clientName).toBe('Client A');
      expect(client.companies).toHaveLength(2);
  
      const primaryCompany = client.companies.find(
        (company) => company.companyId === 'CO1'
      );
      expect(primaryCompany?.operations.map((op) => op.name)).toEqual([
        'Operation One',
        'Operation Two',
      ]);
  
      expect(client.metadata.reportingPeriods).toEqual(['2024-01', '2024-02']);
      expect(client.metadata.mappingTypes).toEqual(['Type A', 'Type B']);
      expect(client.metadata.targetSCoAs).toEqual(['SCoA 1', 'SCoA 2']);
      expect(client.metadata.polarities).toEqual(['Credit', 'Debit']);
      expect(client.metadata.presets).toEqual(['Preset A', 'Preset B']);
      expect(client.metadata.exclusions).toEqual(['Exclusion B', 'None']);
      expect(client.metadata.sourceAccounts).toEqual([
        {
          id: 'SA1',
          name: 'Source 1',
          description: 'Primary source account',
        },
      ]);
    });
  
    it('returns an empty client list when no SQL rows are returned', async () => {
      mockedRunQuery.mockResolvedValue({ recordset: [] } as any);
  
      const result = await fetchUserClientAccess('user@example.com');
  
      expect(result.userEmail).toBe('user@example.com');
      expect(result.userName).toBeNull();
      expect(result.clients).toEqual([]);
    });
  
    it('falls back to demo data when the SQL query fails and fallback is allowed', async () => {
      mockedRunQuery.mockRejectedValue(new Error('SQL unavailable'));
  
      const normalizedEmail = 'user@example.com';
      const fallback = createFallbackUserClientAccess(normalizedEmail);
  
      const result = await fetchUserClientAccess('user@example.com');
  
      expect(result).toEqual(fallback);
    });
  });