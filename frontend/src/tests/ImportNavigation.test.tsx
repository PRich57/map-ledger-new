import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Import from '../pages/Import';
import { useAuthStore } from '../store/authStore';
import { useImportStore } from '../store/importStore';
import { fileToBase64 } from '../utils/file';

const mockNavigate = jest.fn();

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
    companyIds: string[],
    headerMap: Record<string, string | null>,
    glMonth: string,
    fileName: string,
    file: File
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
        glMonth: '2024-01',
      },
    ];
    const headerMap: Record<string, string | null> = {
      'GL ID': 'accountId',
      'Account Description': 'description',
      'Net Change': 'netChange',
      Company: 'entity',
    };
    const mockFile = {
      name: 'trial_balance.csv',
      size: 256,
      type: 'text/csv',
    } as File;

    onImport(
      rows,
      'client-123',
      ['company-1'],
      headerMap,
      '2024-01',
      'trial_balance.csv',
      mockFile,
    );
  };

  return (
    <button type="button" onClick={handleClick} disabled={isImporting}>
      Trigger Import
    </button>
  );
});

jest.mock('../components/import/ImportHistory', () => ({ imports }: { imports: unknown[] }) => (
  <div data-testid="import-history-count">{imports.length}</div>
));

jest.mock('../utils/file', () => ({
  fileToBase64: jest.fn(() => Promise.resolve('ZmlsZS1jb250ZW50')),
}));

describe('Import page navigation', () => {
  const originalCrypto = globalThis.crypto;

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
    (fileToBase64 as jest.Mock).mockResolvedValue('ZmlsZS1jb250ZW50');

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
      expect(mockNavigate).toHaveBeenCalledWith('/gl/mapping/import-123?stage=mapping');
    });
  });
});
