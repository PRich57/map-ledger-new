import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  initialized: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

const storageKey = 'map-ledger-theme';

const getStoredTheme = (): ThemeMode | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (error) {
    console.warn('Unable to read stored theme preference:', error);
  }

  return null;
};

const getSystemTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  initialized: false,
  setTheme: (theme) => {
    set({ theme, initialized: true });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, theme);
      } catch (error) {
        console.warn('Unable to persist theme preference:', error);
      }
    }
  },
  toggleTheme: () => {
    const nextTheme = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(nextTheme);
  },
  hydrate: () => {
    if (get().initialized) {
      return;
    }

    const preferredTheme = getStoredTheme() ?? getSystemTheme();
    set({ theme: preferredTheme, initialized: true });
  },
}));

export const themeStorageKey = storageKey;
