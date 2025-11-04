import { create } from 'zustand';
import type { AccountInfo } from '@azure/msal-browser';
import type { User, UserRole } from '../types';

interface AuthState {
  account: AccountInfo | null;
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isGuest: boolean;
  error: string | null;
  setAccount: (
    account: AccountInfo | null,
    flags?: { isAdmin: boolean; isEmployee: boolean; isGuest: boolean }
  ) => void;
  setError: (error: string | null) => void;
}

type AuthFlags = {
  isAdmin: boolean;
  isEmployee: boolean;
  isGuest: boolean;
};

const initialFlags: AuthFlags = {
  isAdmin: false,
  isEmployee: false,
  isGuest: true,
};

const determineRole = ({ isAdmin, isEmployee }: AuthFlags): UserRole => {
  if (isAdmin) {
    return 'super';
  }
  if (isEmployee) {
    return 'admin';
  }
  return 'viewer';
};

const createUserFromAccount = (
  account: AccountInfo | null,
  flags: AuthFlags
): User | null => {
  if (!account) {
    return null;
  }

  const nameParts = (account.name ?? '').trim().split(' ').filter(Boolean);
  const [firstName = account.username, ...rest] = nameParts.length
    ? nameParts
    : [account.username];
  const lastName = rest.join(' ');

  return {
    id: account.localAccountId,
    email: account.username,
    role: determineRole(flags),
    firstName,
    lastName,
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  account: null,
  user: null,
  isAuthenticated: false,
  ...initialFlags,
  error: null,
  setAccount: (account, flags) => {
    const mergedFlags = { ...initialFlags, ...(flags ?? initialFlags) };
    set({
      account,
      user: createUserFromAccount(account, mergedFlags),
      isAuthenticated: !!account,
      ...mergedFlags,
    });
  },
  setError: (error) => set({ error }),
}));
