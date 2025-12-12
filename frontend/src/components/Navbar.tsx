import { useEffect, useMemo } from 'react';
import { LogOut, Map, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { signOut, msalInstance } from '../utils/msal';
import { useThemeStore } from '../store/themeStore';
import { useOrganizationStore } from '../store/organizationStore';
import { useClientStore } from '../store/clientStore';
import { useMappingStore } from '../store/mappingStore';

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
  const userEmail = useAuthStore(state => state.user?.email ?? null);
  const fetchOrganizations = useOrganizationStore(state => state.fetchForUser);
  const clientAccess = useOrganizationStore(state => state.clientAccess);
  const hydrateClients = useClientStore(state => state.hydrateFromAccessList);
  const clients = useClientStore(state => state.clients);
  const activeClientId = useClientStore(state => state.activeClientId);
  const setActiveClientId = useClientStore(state => state.setActiveClientId);
  const setMappingActiveClientId = useMappingStore(state => state.setActiveClientId);
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

  useEffect(() => {
    if (!userEmail || clientAccess.length > 0) {
      return;
    }

    fetchOrganizations(userEmail);
  }, [clientAccess.length, fetchOrganizations, userEmail]);

  useEffect(() => {
    if (clientAccess.length === 0) {
      return;
    }

    hydrateClients(clientAccess, activeClientId);
  }, [activeClientId, clientAccess, hydrateClients]);

  useEffect(() => {
    setMappingActiveClientId(activeClientId ?? null);
  }, [activeClientId, setMappingActiveClientId]);

  const activeClient = useMemo(
    () => clients.find(client => client.clientId === activeClientId) ?? clients[0] ?? null,
    [activeClientId, clients],
  );

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
  const clientSelectorId = 'navbar-client-selector';

  return (
    <nav className="border-b border-gray-200 bg-white/80 backdrop-blur transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="grid h-16 grid-cols-[auto,1fr,auto] items-center gap-3 sm:gap-6">
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

          <div className="flex items-center justify-center gap-3">
            {clients.length > 0 && (
              <div className="flex items-center gap-3">
                <select
                  id={clientSelectorId}
                  className="min-w-[11rem] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
                  value={activeClient?.clientId ?? ''}
                  onChange={(event) => setActiveClientId(event.target.value)}
                >
                  {clients.map(client => (
                    <option key={client.clientId} value={client.clientId}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {activeClient?.scac && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/60 dark:text-blue-50">
                    {activeClient.scac}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-4">
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