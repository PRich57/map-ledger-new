import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountInfo } from '@azure/msal-browser';
import Login from '../pages/Login';
import App from '../App';
import { useAuthStore } from '../store/authStore';
import type { GroupTokenClaims } from '../types';

const mockLoginRedirect = jest.fn();
const mockHandleRedirectPromise = jest.fn();
const mockGetAllAccounts = jest.fn();
const mockSetActiveAccount = jest.fn();

jest.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {
      loginRedirect: mockLoginRedirect,
    },
  }),
}));

jest.mock('../utils/msal', () => ({
  msalInstance: {
    handleRedirectPromise: mockHandleRedirectPromise,
    getAllAccounts: mockGetAllAccounts,
    setActiveAccount: mockSetActiveAccount,
  },
  loginRequest: { scopes: [] },
}));

jest.mock('../utils/env', () => ({
  env: {
    AAD_ADMIN_GROUP_ID: 'admin-group',
    AAD_EMPLOYEE_DOMAINS: ['example.com'],
    AAD_CLIENT_ID: 'client',
    AAD_TENANT_ID: 'tenant',
    AAD_REDIRECT_URI: 'http://localhost',
  },
}));

afterEach(() => {
  useAuthStore.setState({
    account: null,
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isEmployee: false,
    isGuest: true,
    error: null,
  });
  jest.clearAllMocks();
});

test('calls loginRedirect on sign in click', async () => {
  render(<Login />);
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(mockLoginRedirect).toHaveBeenCalled();
});

test('displays error when loginRedirect fails', async () => {
  mockLoginRedirect.mockRejectedValue(new Error('Login failed'));
  render(<Login />);
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Login failed')
  );
});

test('sets admin and employee flags from token', async () => {
  const account: AccountInfo = {
    homeAccountId: '',
    environment: '',
    tenantId: '',
    username: 'jane@example.com',
    localAccountId: '',
    idTokenClaims: { groups: ['admin-group'] } as GroupTokenClaims,
  };
  mockHandleRedirectPromise.mockResolvedValue({
    account,
    idTokenClaims: { groups: ['admin-group'] } as GroupTokenClaims,
  });
  mockGetAllAccounts.mockReturnValue([account]);

  render(<App />);

  await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
  expect(useAuthStore.getState().isAdmin).toBe(true);
  expect(useAuthStore.getState().isEmployee).toBe(true);
  expect(useAuthStore.getState().isGuest).toBe(false);
});

test('marks guest when domain not matched', async () => {
  const account: AccountInfo = {
    homeAccountId: '',
    environment: '',
    tenantId: '',
    username: 'bob@external.com',
    localAccountId: '',
    idTokenClaims: { groups: [] } as GroupTokenClaims,
  };
  mockHandleRedirectPromise.mockResolvedValue({
    account,
    idTokenClaims: { groups: [] } as GroupTokenClaims,
  });
  mockGetAllAccounts.mockReturnValue([account]);

  render(<App />);

  await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
  expect(useAuthStore.getState().isAdmin).toBe(false);
  expect(useAuthStore.getState().isEmployee).toBe(false);
  expect(useAuthStore.getState().isGuest).toBe(true);
});

test('redirects away from login when already authenticated', async () => {
  window.history.pushState({}, 'Test', '/login');
  useAuthStore.setState({
    account: {} as AccountInfo,
    user: null,
    isAuthenticated: true,
    isAdmin: false,
    isEmployee: false,
    isGuest: false,
    error: null,
  });
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/'));
});

test('shows error when handleRedirectPromise fails', async () => {
  mockHandleRedirectPromise.mockRejectedValue(new Error('redirect error'));
  mockGetAllAccounts.mockReturnValue([]);

  render(<App />);

  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('redirect error')
  );
});

