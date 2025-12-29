import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import Layout from './components/Layout';
import { useAuthStore } from './store/authStore';
import { useChartOfAccountsStore } from './store/chartOfAccountsStore';
import { isKsmDomainUser } from './utils/auth';
import { msalInstance } from './utils/msal';
import { env } from './utils/env';
import type { GroupTokenClaims } from './types';
import type { AuthenticationResult } from '@azure/msal-browser';

const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Users = React.lazy(() => import('./pages/Users'));
const Clients = React.lazy(() => import('./pages/Clients'));
const Templates = React.lazy(() => import('./pages/Templates'));
const CoaManager = React.lazy(() => import('./pages/CoaManager'));
const Import = React.lazy(() => import('./pages/Import'));
const Mapping = React.lazy(() => import('./pages/Mapping'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Integrations = React.lazy(() => import('./pages/Integrations'));
const QuickBooks = React.lazy(() => import('./pages/integrations/QuickBooks'));
const SageIntacct = React.lazy(() => import('./pages/integrations/SageIntacct'));

function ProtectedRoutes() {
  const { user } = useAuthStore();
  const canAccessCoaManager = isKsmDomainUser(user);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route
          index
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Dashboard />
            </React.Suspense>
          }
        />
        <Route
          path="users"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Users />
            </React.Suspense>
          }
        />
        <Route
          path="clients"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Clients />
            </React.Suspense>
          }
        />
        <Route
          path="templates"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Templates />
            </React.Suspense>
          }
        />
        <Route
          path="coa-manager"
          element={
            canAccessCoaManager ? (
              <React.Suspense fallback={<div>Loading...</div>}>
                <CoaManager />
              </React.Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="import"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Import />
            </React.Suspense>
          }
        />
        <Route
          path="gl/mapping/:uploadId"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Mapping />
            </React.Suspense>
          }
        />
        <Route
          path="allocations"
          element={<Navigate to="/gl/mapping/demo?stage=allocation" replace />}
        />
        <Route
          path="integrations"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Integrations />
            </React.Suspense>
          }
        />
        <Route
          path="integrations/quickbooks"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <QuickBooks />
            </React.Suspense>
          }
        />
        <Route
          path="integrations/sage"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <SageIntacct />
            </React.Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <React.Suspense fallback={<div>Loading...</div>}>
              <Settings />
            </React.Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

function App() {
  const { isAuthenticated } = useAuthStore();
  const [checkingAuth, setCheckingAuth] = React.useState(true);
  const initializeChartOfAccounts = useChartOfAccountsStore(state => state.initialize);

  React.useEffect(() => {
    const initAuth = async () => {
      let res: AuthenticationResult | null = null;
      try {
        res = await msalInstance.handleRedirectPromise();
        useAuthStore.getState().setError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error('Authentication error:', message);
        useAuthStore.getState().setError(message);
      }

      const accounts = msalInstance.getAllAccounts();
      const account = res?.account ?? accounts[0];
      if (account) {
        msalInstance.setActiveAccount(account);
        const claims =
          (res?.idTokenClaims as GroupTokenClaims) ??
          (account.idTokenClaims as GroupTokenClaims);
        const groups = claims?.groups ?? [];
        const isAdmin = groups.includes(env.AAD_ADMIN_GROUP_ID);
        const domain = account.username.split('@')[1] || '';
        const isEmployee = env.AAD_EMPLOYEE_DOMAINS.includes(domain);
        const isGuest = !isEmployee;
        useAuthStore.getState().setAccount(account, {
          isAdmin,
          isEmployee,
          isGuest,
        });
      }

      setCheckingAuth(false);
    };

    initAuth();
  }, []);

  React.useEffect(() => {
    initializeChartOfAccounts().catch(error => {
      console.error('Failed to load chart of accounts', error);
    });
  }, [initializeChartOfAccounts]);

  if (checkingAuth) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <React.Suspense fallback={<div>Loading...</div>}>
                <Login />
              </React.Suspense>
            )
          }
        />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <ProtectedRoutes />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
