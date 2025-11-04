import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Import } from '../types';

export const IMPORT_STORAGE_KEY = 'map-ledger-imports';

const baseImportsByUser: Record<string, Import[]> = {
  '1': [
    {
      id: '1',
      clientId: 'TRNS',
      fileName: 'january_2024_tb.csv',
      fileSize: 148,
      fileType: 'text/csv',
      fileData:
        'QWNjb3VudCxEZXNjcmlwdGlvbixOZXQgQ2hhbmdlCjEwMDAsQ2FzaCw1MDAwCjIwMDAsUmV2ZW51ZSwtNTAwMAo=',
      previewRows: [
        {
          accountId: '1000',
          description: 'Cash',
          entity: 'North Division',
          netChange: 5000,
          glMonth: '2024-01',
        },
        {
          accountId: '2000',
          description: 'Revenue',
          entity: 'North Division',
          netChange: -5000,
          glMonth: '2024-01',
        },
      ],
      period: '2024-01-01T00:00:00.000Z',
      timestamp: '2024-01-15T10:30:00.000Z',
      status: 'completed',
      rowCount: 150,
      importedBy: 'john.doe@example.com',
      userId: '1',
    },
  ],
  '2': [
    {
      id: '2',
      clientId: 'HLTH',
      fileName: 'february_2024_tb.csv',
      fileSize: 156,
      fileType: 'text/csv',
      fileData:
        'QWNjb3VudCxEZXNjcmlwdGlvbixOZXQgQ2hhbmdlCjExMDAsQWNjb3VudHMgUmVjZWl2YWJsZSwxNTAwCjMxMDAsU2VydmljZSBSZXZlbnVlLC0xNTAwCg==',
      previewRows: [
        {
          accountId: '1100',
          description: 'Accounts Receivable',
          entity: 'Healthcare West',
          netChange: 1500,
          glMonth: '2024-02',
        },
        {
          accountId: '3100',
          description: 'Service Revenue',
          entity: 'Healthcare West',
          netChange: -1500,
          glMonth: '2024-02',
        },
      ],
      period: '2024-02-01T00:00:00.000Z',
      timestamp: '2024-02-15T14:20:00.000Z',
      status: 'completed',
      rowCount: 180,
      importedBy: 'jane.smith@example.com',
      userId: '2',
    },
  ],
};

export const createInitialImportMap = (): Record<string, Import[]> =>
  Object.entries(baseImportsByUser).reduce(
    (acc, [userId, imports]) => {
      acc[userId] = imports.map((entry) => ({
        ...entry,
        previewRows: entry.previewRows.map((row) => ({ ...row })),
      }));
      return acc;
    },
    {} as Record<string, Import[]>
  );

type ImportInput = Omit<Import, 'userId'>;

interface ImportState {
  importsByUser: Record<string, Import[]>;
  addImport: (userId: string, importData: ImportInput) => void;
  deleteImport: (userId: string, importId: string) => void;
  reset: () => void;
}

const storage = createJSONStorage(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  const memoryStorage: Record<string, string> = {};
  return {
    getItem: (name: string) => memoryStorage[name] ?? null,
    setItem: (name: string, value: string) => {
      memoryStorage[name] = value;
    },
    removeItem: (name: string) => {
      delete memoryStorage[name];
    },
  };
});

export const useImportStore = create<ImportState>()(
  persist(
    (set) => ({
      importsByUser: createInitialImportMap(),
      addImport: (userId, importData) =>
        set((state) => {
          const entry: Import = { ...importData, userId };
          const userImports = state.importsByUser[userId] ?? [];
          return {
            importsByUser: {
              ...state.importsByUser,
              [userId]: [entry, ...userImports],
            },
          };
        }),
      deleteImport: (userId, importId) =>
        set((state) => {
          const userImports = state.importsByUser[userId] ?? [];
          return {
            importsByUser: {
              ...state.importsByUser,
              [userId]: userImports.filter((entry) => entry.id !== importId),
            },
          };
        }),
      reset: () => set({ importsByUser: createInitialImportMap() }),
    }),
    {
      name: IMPORT_STORAGE_KEY,
      storage,
    }
  )
);
