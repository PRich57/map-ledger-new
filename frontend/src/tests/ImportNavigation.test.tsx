import { render, screen, waitFor } from './testUtils';
import userEvent from './userEvent';
import { MemoryRouter } from 'react-router-dom';
import Import from '../pages/Import';
import type { Import as ImportRecord } from '../types';
import { useAuthStore } from '../store/authStore';
import { useImportStore } from '../store/importStore';
import { useClientStore } from '../store/clientStore';

const mockNavigate = jest.fn();

const mockHistoryImport: ImportRecord = {
  id: 'import-history-1',
  fileUploadGuid: 'import-history-1',
  clientId: 'client-history',
  fileName: 'history.xlsx',
  fileSize: 1024,
  fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  period: '2024-03-01',
  timestamp: '2024-03-01T00:00:00.000Z',
  status: 'completed',
  rowCount: 42,
  importedBy: 'history.user@example.com',
  userId: 'user-1',
};

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../components/import/ImportForm', () => ({
  onImport,
  isImporting,
}: {
  onImport: (
    rows: Array<{
      accountId: string;
      description: string;
      entity: string;
      netChange: number;
      glMonth?: string;
    }>,
    clientId: string,
    entitySelections: Array<{
      id: string;
      name: string;
      displayName?: string | null;
      aliases: string[];
    }>,
    headerMap: Record<string, string | null>,
    glMonths: string[],
    fileName: string,
    file: File,
    sheetSelections: Array<{
      sheetName: string;
      glMonth?: string | null;
      rowCount?: number | null;
      isSelected?: boolean;
      firstDataRowIndex?: number | null;
    }>,
    selectedSheetUploads: Array<{
      sheetName: string;
      rows: Array<Record<string, unknown>>;
      headers: string[];
      metadata: { glMonth?: string | null; sheetNameDate?: string | null };
      firstDataRowIndex?: number | null;
    }>
  ) => void | Promise<void>;
  isImporting: boolean;
}) => {
  const handleClick = () => {
    const rows = [
      {
        accountId: '1000',
        description: 'Cash',
        entity: 'Main Division',
        netChange: 1250,
        glMonth: '2024-01-01',
      },
    ];
    const headerMap: Record<string, string | null> = {
      'GL ID': 'accountId',
      'Account Description': 'description',
      'Net Change': 'netChange',
      Entity: 'entity',
    };
    const mockFile = {
      name: 'trial_balance.csv',
      size: 256,
      type: 'text/csv',
    } as File;

    onImport(
      rows,
      'client-123',
      [
        {
          id: 'company-1',
          name: 'Main Division',
          displayName: 'Main Division',
          aliases: [],
        },
      ],
      headerMap,
      ['2024-01-01'],
      'trial_balance.csv',
      mockFile,
      [
        {
          sheetName: 'Sheet1',
          glMonth: '2024-01-01',
          rowCount: rows.length,
          isSelected: true,
          firstDataRowIndex: 1,
        },
      ],
      [
        {
          sheetName: 'Sheet1',
          rows: rows.map((row) => ({ ...row })),
          headers: ['GL ID', 'Account Description', 'Net Change', 'Entity'],
          metadata: { glMonth: '2024-01-01', sheetNameDate: null },
          firstDataRowIndex: 1,
        },
      ],
    );
  };

  return (
    <button type="button" onClick={handleClick} disabled={isImporting}>
      Trigger Import
    </button>
  );
});

jest.mock('../components/import/ImportHistory', () => ({
  __esModule: true,
  default: ({
    imports,
  }: {
    imports: ImportRecord[];
  }) => (
    <div>
      <div data-testid="import-history-count">{imports.length}</div>
    </div>
  ),
}));

describe('Import page navigation', () => {
  const originalCrypto = globalThis.crypto;
  const originalFetch = global.fetch;

  beforeAll(() => {
    const randomUUID = jest.fn(() => 'import-123');
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...(originalCrypto ?? {}), randomUUID },
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    });
  });

  beforeEach(() => {
    mockNavigate.mockClear();

    global.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : (input as Request)?.url ?? '';

      if (url.includes('/user-clients')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            clients: [
              {
                clientId: 'client-123',
                clientName: 'Client 123',
                clientScac: 'C123',
                operations: [],
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
              {
                clientId: 'client-history',
                clientName: 'History Client',
                clientScac: 'HIST',
                operations: [],
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
            ],
            userEmail: 'user@example.com',
          }),
        });
      }

      if (url.includes('/client-files')) {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              item: {
                id: 'import-123',
                clientId: 'client-123',
                userId: 'user-1',
                fileUploadGuid: 'import-123',
                fileName: 'trial_balance.csv',
                fileSize: 256,
                fileType: 'text/csv',
                period: '2024-01-01',
                timestamp: '2024-01-01T00:00:00.000Z',
                status: 'completed',
                rowCount: 1,
                importedBy: 'user@example.com',
              },
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [mockHistoryImport],
            total: 1,
            page: 1,
            pageSize: 10,
          }),
        });
      }

      if (url.includes('/file-records')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [],
            entities: [],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    }) as jest.Mock;

    useAuthStore.setState({
      account: null,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'admin',
        firstName: 'Test',
        lastName: 'User',
      },
      isAuthenticated: true,
      isAdmin: true,
      isEmployee: false,
      isGuest: false,
      error: null,
    });

    useImportStore.getState().reset();
    useClientStore.getState().reset();
  });

  afterEach(() => {
    useImportStore.getState().reset();
    useAuthStore.setState({
      account: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isEmployee: false,
      isGuest: true,
      error: null,
    });

    useClientStore.getState().reset();

    global.fetch = originalFetch;
  });

  it('redirects to mapping step after a successful import', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Import />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /trigger import/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/gl/mapping/client?stage=mapping');
    });
  });
});
