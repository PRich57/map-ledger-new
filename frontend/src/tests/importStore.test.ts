import { jest } from '@jest/globals';
import { useImportStore } from '../store/importStore';

describe('useImportStore', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useImportStore.getState().reset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    useImportStore.getState().reset();
    global.fetch = originalFetch;
  });

  it('fetches imports for the provided user', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'import-1',
            clientId: 'ACME',
            fileName: 'trial_balance.csv',
            fileSize: 2048,
            fileType: 'text/csv',
            period: '2024-04',
            timestamp: '2024-04-02T09:30:00.000Z',
            status: 'completed',
            rowCount: 10,
            importedBy: 'john.doe@example.com',
            userId: 'user-1',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
    });

    await useImportStore.getState().fetchImports({ userId: 'user-1' });

    const state = useImportStore.getState();
    expect(state.imports).toHaveLength(1);
    expect(state.total).toBe(1);
    expect(state.error).toBeNull();
  });

  it('records a new import and prepends it when on the first page', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        item: {
          id: 'import-2',
          clientId: 'ACME',
          userId: 'user-1',
          fileName: 'new_upload.csv',
          fileSize: 1024,
          fileType: 'text/csv',
          period: '2024-05',
          timestamp: '2024-05-03T10:00:00.000Z',
          status: 'completed',
          rowCount: 5,
          importedBy: 'john.doe@example.com',
        },
      }),
    });

    const result = await useImportStore.getState().recordImport({
      id: 'import-2',
      clientId: 'ACME',
      userId: 'user-1',
      fileName: 'new_upload.csv',
      fileSize: 1024,
      fileType: 'text/csv',
      period: '2024-05',
      status: 'completed',
      rowCount: 5,
      importedBy: 'john.doe@example.com',
    });

    expect(result?.id).toBe('import-2');
    expect(useImportStore.getState().imports[0]?.id).toBe('import-2');
    expect(useImportStore.getState().total).toBe(1);
  });

  it('replaces history when fetching imports for a different client', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'import-1',
              clientId: 'client-a',
              fileName: 'client-a-file.csv',
              fileSize: 512,
              fileType: 'text/csv',
              period: '2024-01',
              timestamp: '2024-01-10T12:00:00.000Z',
              status: 'completed',
              rowCount: 3,
              importedBy: 'user@example.com',
              userId: 'user-1',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'import-2',
              clientId: 'client-b',
              fileName: 'client-b-file.csv',
              fileSize: 1024,
              fileType: 'text/csv',
              period: '2024-02',
              timestamp: '2024-02-11T12:00:00.000Z',
              status: 'completed',
              rowCount: 5,
              importedBy: 'user@example.com',
              userId: 'user-1',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      });

    await useImportStore.getState().fetchImports({ userId: 'user-1', clientId: 'client-a' });

    expect(useImportStore.getState().imports[0]?.clientId).toBe('client-a');

    await useImportStore.getState().fetchImports({ userId: 'user-1', clientId: 'client-b' });

    const state = useImportStore.getState();
    expect(state.imports).toHaveLength(1);
    expect(state.imports[0]?.clientId).toBe('client-b');
    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toContain('clientId=client-a');
    expect((global.fetch as jest.Mock).mock.calls[1]?.[0]).toContain('clientId=client-b');
  });
});
