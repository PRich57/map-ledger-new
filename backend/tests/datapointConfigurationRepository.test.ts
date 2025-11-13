jest.mock('../src/utils/sqlClient', () => ({
    runQuery: jest.fn(),
  }));
  
  import { runQuery } from '../src/utils/sqlClient';
  import {
    __resetDatapointConfigurationRepositoryForTests,
    createDatapointConfiguration,
    getDatapointConfigurationById,
    listDatapointConfigurations,
    updateDatapointConfiguration,
  } from '../src/repositories/datapointConfigurationRepository';
  
  const ORIGINAL_ENV = process.env;
  
  type RunQueryMock = jest.MockedFunction<typeof runQuery>;
  
  describe('datapointConfigurationRepository', () => {
    let mockedRunQuery: RunQueryMock;
  
    beforeEach(() => {
      mockedRunQuery = runQuery as RunQueryMock;
      mockedRunQuery.mockReset();
      __resetDatapointConfigurationRepositoryForTests();
      process.env = {
        ...ORIGINAL_ENV,
        SQL_CONN_STR: 'Server=fake;Database=fake;User Id=fake;Password=fake;',
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv;
    });
  
    afterAll(() => {
      process.env = ORIGINAL_ENV;
    });
  
    it('creates a datapoint configuration and returns the persisted record', async () => {
      const createdAt = new Date('2024-01-01T00:00:00.000Z');
      const updatedAt = new Date('2024-01-02T00:00:00.000Z');
  
      mockedRunQuery.mockResolvedValueOnce({} as any); // ensure table
      mockedRunQuery.mockResolvedValueOnce({ rowsAffected: [1] } as any); // insert
      mockedRunQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 'abc-123',
            user_email: 'user@example.com',
            user_name: 'User Example',
            client_id: 'C1',
            client_name: 'Client One',
            configuration_label: 'Primary',
            company_name: 'Company A',
            source_account_id: 'SA1',
            source_account_name: 'Source Account',
            source_account_description: 'Description',
            reporting_period: '2024-Q1',
            mapping_type: 'Type A',
            target_scoa: 'SCOA',
            polarity: 'Debit',
            preset: 'Preset1',
            operations_json: JSON.stringify(['Alpha', 'Beta']),
            exclusions_json: JSON.stringify(['Exclude 1']),
            configuration_json: JSON.stringify({ setting: true }),
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      } as any);
  
      const result = await createDatapointConfiguration({
        userEmail: 'User@Example.com',
        userName: 'User Example',
        clientId: 'C1',
        clientName: 'Client One',
        label: 'Primary',
        companyName: 'Company A',
        sourceAccountId: 'SA1',
        sourceAccountName: 'Source Account',
        sourceAccountDescription: 'Description',
        reportingPeriod: '2024-Q1',
        mappingType: 'Type A',
        targetSCoA: 'SCOA',
        polarity: 'Debit',
        preset: 'Preset1',
        operations: ['Beta', 'Alpha', 'Beta'],
        exclusions: ['Exclude 1'],
        configuration: { setting: true },
      });
  
      expect(mockedRunQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO dbo.MAPLEDGER_USER_DATAPOINTS'),
        expect.objectContaining({
          userEmail: 'user@example.com',
          operationsJson: JSON.stringify(['Alpha', 'Beta']),
          exclusionsJson: JSON.stringify(['Exclude 1']),
          configurationJson: JSON.stringify({ setting: true }),
        })
      );
  
      expect(result).toEqual({
        id: 'abc-123',
        userEmail: 'user@example.com',
        userName: 'User Example',
        clientId: 'C1',
        clientName: 'Client One',
        label: 'Primary',
        companyName: 'Company A',
        sourceAccountId: 'SA1',
        sourceAccountName: 'Source Account',
        sourceAccountDescription: 'Description',
        reportingPeriod: '2024-Q1',
        mappingType: 'Type A',
        targetSCoA: 'SCOA',
        polarity: 'Debit',
        preset: 'Preset1',
        operations: ['Alpha', 'Beta'],
        exclusions: ['Exclude 1'],
        configuration: { setting: true },
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
    });
  
    it('updates a datapoint configuration for the same user', async () => {
      const createdAt = new Date('2024-01-01T00:00:00.000Z');
      const updatedAt = new Date('2024-02-01T00:00:00.000Z');
  
      mockedRunQuery.mockResolvedValueOnce({} as any); // ensure table
      mockedRunQuery.mockResolvedValueOnce({ rowsAffected: [1] } as any); // update
      mockedRunQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 'abc-123',
            user_email: 'user@example.com',
            user_name: 'User Example',
            client_id: 'C1',
            client_name: 'Client One',
            configuration_label: 'Updated',
            company_name: 'Company A',
            source_account_id: 'SA1',
            source_account_name: 'Source Account',
            source_account_description: 'Description',
            reporting_period: '2024-Q2',
            mapping_type: 'Type B',
            target_scoa: 'SCOA',
            polarity: 'Credit',
            preset: 'Preset2',
            operations_json: JSON.stringify(['OpA']),
            exclusions_json: JSON.stringify([]),
            configuration_json: JSON.stringify({ setting: false }),
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      } as any);
  
      const result = await updateDatapointConfiguration({
        id: 'abc-123',
        userEmail: 'user@example.com',
        userName: 'User Example',
        clientId: 'C1',
        clientName: 'Client One',
        label: 'Updated',
        reportingPeriod: '2024-Q2',
        mappingType: 'Type B',
        targetSCoA: 'SCOA',
        polarity: 'Credit',
        preset: 'Preset2',
        operations: ['OpA'],
        exclusions: [],
        configuration: { setting: false },
      });
  
      expect(mockedRunQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE dbo.MAPLEDGER_USER_DATAPOINTS'),
        expect.objectContaining({
          id: 'abc-123',
          userEmail: 'user@example.com',
          operationsJson: JSON.stringify(['OpA']),
        })
      );
  
      expect(result.updatedAt).toBe(updatedAt.toISOString());
      expect(result.operations).toEqual(['OpA']);
      expect(result.configuration).toEqual({ setting: false });
    });
  
    it('lists datapoint configurations by email and optional client', async () => {
      const createdAt = new Date('2024-03-01T00:00:00.000Z');
      const updatedAt = new Date('2024-03-02T00:00:00.000Z');
  
      mockedRunQuery.mockResolvedValueOnce({} as any); // ensure table for first list
      mockedRunQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 'id-1',
            user_email: 'user@example.com',
            user_name: 'User Example',
            client_id: 'C1',
            client_name: 'Client One',
            configuration_label: null,
            company_name: null,
            source_account_id: null,
            source_account_name: null,
            source_account_description: null,
            reporting_period: null,
            mapping_type: null,
            target_scoa: null,
            polarity: null,
            preset: null,
            operations_json: JSON.stringify(['A']),
            exclusions_json: JSON.stringify([]),
            configuration_json: null,
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      } as any);
  
      const resultWithoutClient = await listDatapointConfigurations('USER@example.com');
  
      expect(mockedRunQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM dbo.MAPLEDGER_USER_DATAPOINTS'),
        { email: 'user@example.com' }
      );
      expect(resultWithoutClient).toHaveLength(1);
  
      mockedRunQuery.mockResolvedValueOnce({
        recordset: [],
      } as any);
  
      const resultWithClient = await listDatapointConfigurations(
        'user@example.com',
        'C2'
      );
  
      expect(mockedRunQuery).toHaveBeenLastCalledWith(
        expect.any(String),
        { email: 'user@example.com', clientId: 'C2' }
      );
      expect(resultWithClient).toEqual([]);
    });
  
    it('throws when a datapoint configuration cannot be found', async () => {
      mockedRunQuery.mockResolvedValueOnce({} as any); // ensure table
      mockedRunQuery.mockResolvedValueOnce({ recordset: [] } as any);
  
      await expect(getDatapointConfigurationById('missing-id')).rejects.toThrow(
        'Datapoint configuration not found'
      );
    });
  
    it('throws on update when no rows are affected', async () => {
      mockedRunQuery.mockResolvedValueOnce({} as any); // ensure table
      mockedRunQuery.mockResolvedValueOnce({ rowsAffected: [0] } as any);
  
      await expect(
        updateDatapointConfiguration({
          id: 'missing-id',
          userEmail: 'user@example.com',
          clientId: 'C1',
          clientName: 'Client One',
        })
      ).rejects.toThrow('Datapoint configuration not found');
    });
  });