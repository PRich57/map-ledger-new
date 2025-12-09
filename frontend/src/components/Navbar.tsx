import { LogOut, Map, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { signOut, msalInstance } from '../utils/msal';
import { useThemeStore } from '../store/themeStore';

type Claims = Record<string, unknown>;

const getClaimString = (claims: Claims, key: string): string | undefined => {
  const value = claims[key];
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' ? first : undefined;
  }

  return typeof value === 'string' ? value : undefined;
};

interface NavbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Navbar({ isSidebarOpen, onToggleSidebar }: NavbarProps) {
  const { account } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const claims = (account?.idTokenClaims as Claims | undefined) ?? {};
  const givenName = getClaimString(claims, 'given_name');
  const familyName = getClaimString(claims, 'family_name');
  const displayName =
    getClaimString(claims, 'name') ??
    account?.name ??
    (givenName || familyName ? `${givenName ?? ''} ${familyName ?? ''}`.trim() : '') ??
    '';

  const email =
    getClaimString(claims, 'emails') ??
    getClaimString(claims, 'preferred_username') ??
    account?.username ??
    '';

  const hasAccount =
    (msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0]) != null;

  const handleSignOut = async () => {
    await signOut();
  };

  const isDark = theme === 'dark';
  const themeIcon = isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />;
  const themeLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  const sidebarIcon = isSidebarOpen ? (
    <PanelLeftClose className="h-5 w-5" />
  ) : (
    <PanelLeftOpen className="h-5 w-5" />
  );
  const sidebarLabel = isSidebarOpen ? 'Collapse navigation menu' : 'Expand navigation menu';

  return (
    <nav className="border-b border-gray-200 bg-white/80 backdrop-blur transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={sidebarLabel}
              className="rounded-full p-2 text-gray-500 transition-colors hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:text-blue-400"
            >
              {sidebarIcon}
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600 text-white shadow-md">
              <Map className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">MapLedger</h1>
              <p className="-mt-1 text-xs text-gray-500 dark:text-slate-400">GL Mapping Solution</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              className="rounded-full p-2 text-gray-500 transition-colors hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:text-blue-400"
            >
              {themeIcon}
            </button>
            <button
              className="rounded-full p-2 text-gray-500 transition-colors hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:text-blue-400"
              title="Settings"
              type="button"
            >
              <Settings className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-4">
              <div className="text-sm">
                <p className="font-semibold text-gray-900 dark:text-slate-100">{displayName || 'Guest'}</p>
                {email && <p className="text-xs text-gray-500 dark:text-slate-400">{email}</p>}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={!hasAccount}
                title="Sign out"
                className="rounded-full p-2 text-gray-500 transition-colors hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:text-blue-400"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
