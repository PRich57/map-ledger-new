import {
  IMPORT_STORAGE_KEY,
  createInitialImportMap,
  useImportStore,
} from '../store/importStore';

describe('useImportStore', () => {
  beforeEach(() => {
    const store = useImportStore.getState();
    store.reset();

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(IMPORT_STORAGE_KEY);
    }
  });

  it('stores uploads on the current user account', () => {
    const store = useImportStore.getState();
    const initialUserUploads = store.importsByUser['1']?.length ?? 0;
    const otherUserUploads = store.importsByUser['2']?.length ?? 0;

    store.addImport('1', {
      id: 'new-import-id',
      clientId: 'ACME',
      fileName: 'acme_march.csv',
      fileSize: 2048,
      fileType: 'text/csv',
      fileData: 'QWNtZSxEYXRhCjE=',
      previewRows: [],
      period: '2024-03-01T00:00:00.000Z',
      timestamp: '2024-03-05T12:00:00.000Z',
      status: 'completed',
      rowCount: 42,
      importedBy: 'john.doe@example.com',
    });

    const updated = useImportStore.getState();

    expect(updated.importsByUser['1']).toHaveLength(initialUserUploads + 1);
    expect(updated.importsByUser['1'][0]).toMatchObject({
      id: 'new-import-id',
      userId: '1',
      fileName: 'acme_march.csv',
      importedBy: 'john.doe@example.com',
    });
    expect(updated.importsByUser['2']).toHaveLength(otherUserUploads);
  });

  it('resets the store to the initial import history', () => {
    const store = useImportStore.getState();
    store.addImport('1', {
      id: 'temp-import',
      clientId: 'ACME',
      fileName: 'temp.csv',
      fileSize: 1024,
      fileType: 'text/csv',
      fileData: 'VGVtcCxEYXRhCjE=',
      previewRows: [],
      period: '2024-04-01T00:00:00.000Z',
      timestamp: '2024-04-02T09:30:00.000Z',
      status: 'completed',
      rowCount: 10,
      importedBy: 'john.doe@example.com',
    });

    store.reset();

    expect(useImportStore.getState().importsByUser).toEqual(
      createInitialImportMap()
    );
  });
});

  it('removes an import from history', () => {
    const store = useImportStore.getState();
    store.addImport('1', {
      id: 'remove-me',
      clientId: 'ACME',
      fileName: 'remove.csv',
      fileSize: 512,
      fileType: 'text/csv',
      fileData: 'UmVtb3ZlLERhdGEK',
      previewRows: [],
      period: '2024-05-01T00:00:00.000Z',
      timestamp: '2024-05-02T10:00:00.000Z',
      status: 'completed',
      rowCount: 5,
      importedBy: 'john.doe@example.com',
    });

    store.deleteImport('1', 'remove-me');

    expect(useImportStore.getState().importsByUser['1']).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'remove-me' })])
    );
  });
