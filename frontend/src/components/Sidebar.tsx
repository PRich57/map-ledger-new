import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  Users,
  Building2,
  FileSpreadsheet,
  Upload,
  BarChart3,
  Settings,
  Network,
} from 'lucide-react';

const linkBaseClass =
  'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

const getLinkClasses = (isActive: boolean) =>
  `${linkBaseClass} ${
    isActive
      ? 'bg-primary-600 text-white shadow-md'
      : 'text-gray-600 hover:bg-primary-50 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

export default function Sidebar() {
  const { user } = useAuthStore();
  const isSuperUser = user?.role === 'super';
  const location = useLocation();
  const isMappingRoute = location.pathname.startsWith('/gl/mapping');

  return (
    <aside className="w-64 border-r border-gray-200 bg-gradient-sidebar shadow-soft transition-colors duration-300 dark:border-slate-800">
      <div className="flex h-full flex-col px-3 py-4">
        <div className="space-y-1.5">
          {isSuperUser && (
            <NavLink to="/users" className={({ isActive }) => getLinkClasses(isActive)}>
              <Users className="mr-3 h-5 w-5" />
              Users
            </NavLink>
          )}

          <NavLink to="/clients" className={({ isActive }) => getLinkClasses(isActive)}>
            <Building2 className="mr-3 h-5 w-5" />
            Client Profiles
          </NavLink>

          {isSuperUser && (
            <NavLink to="/templates" className={({ isActive }) => getLinkClasses(isActive)}>
              <FileSpreadsheet className="mr-3 h-5 w-5" />
              COA Templates
            </NavLink>
          )}

          <NavLink to="/import" className={({ isActive }) => getLinkClasses(isActive)}>
            <Upload className="mr-3 h-5 w-5" />
            Data Import
          </NavLink>

          <NavLink
            to="/gl/mapping/demo"
            className={({ isActive }) => getLinkClasses(isActive || isMappingRoute)}
          >
            <BarChart3 className="mr-3 h-5 w-5" />
            GL Mapping
          </NavLink>

          <NavLink to="/integrations" className={({ isActive }) => getLinkClasses(isActive)}>
            <Network className="mr-3 h-5 w-5" />
            Integrations
          </NavLink>
        </div>

        <div className="mt-auto">
          <NavLink to="/settings" className={({ isActive }) => getLinkClasses(isActive)}>
            <Settings className="mr-3 h-5 w-5" />
            Settings
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
