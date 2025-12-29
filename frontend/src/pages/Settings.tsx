import { useAuthStore } from '../store/authStore';
import { useChartOfAccountsStore } from '../store/chartOfAccountsStore';

const SCA_REFRESH_DOMAINS = ['ksmcpa.com', 'ksmta.com'];

export default function Settings() {
  const { user, account, isAuthenticated } = useAuthStore((state) => ({
    user: state.user,
    account: state.account,
    isAuthenticated: state.isAuthenticated,
  }));
  const { initialize, isLoading, error, lastFetched } = useChartOfAccountsStore(
    (state) => ({
      initialize: state.initialize,
      isLoading: state.isLoading,
      error: state.error,
      lastFetched: state.lastFetched,
    })
  );

  const normalizedEmail = (user?.email ?? account?.username ?? '')
    .trim()
    .toLowerCase();
  const canRefreshScoa =
    isAuthenticated &&
    SCA_REFRESH_DOMAINS.some((domain) => normalizedEmail.includes(domain));
  const lastRefreshedLabel = lastFetched
    ? new Date(lastFetched).toLocaleString()
    : 'Not refreshed yet.';

  const handleRefreshScoa = async () => {
    await initialize(true);
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      </header>
      <section
        aria-label="Settings workspace"
        className="rounded-lg bg-white p-6 shadow"
      >
        <p className="text-gray-700">Settings interface will be implemented here.</p>
      </section>
      {canRefreshScoa && (
        <section
          aria-label="SCoA refresh"
          className="rounded-lg bg-white p-6 shadow"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Refresh SCoA</h2>
              <p className="text-sm text-gray-600">
                Pull the latest chart of accounts to update Target SCoA options.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Last refreshed: {lastRefreshedLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefreshScoa}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Refreshing...' : 'Refresh SCoA'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600">
              Refresh failed: {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
