import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  FileSpreadsheet,
  Network,
  Settings,
  Upload,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const linkBaseClass =
  'group flex items-center text-sm font-medium rounded-xl transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

const getLinkClasses = (isActive: boolean, isOpen: boolean) =>
  `${linkBaseClass} ${
    isActive
      ? 'bg-primary-600 text-white dark:bg-primary-700'
      : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white'
  } ${isOpen ? 'gap-3 px-3 py-2.5 justify-start' : 'gap-0 p-2.5 justify-center'}`;

interface SidebarProps {
  isOpen: boolean;
}

interface NavItem {
  label: string;
  icon: JSX.Element;
  to: string;
  isVisible?: boolean;
  isActiveOverride?: boolean;
}

export default function Sidebar({ isOpen }: SidebarProps) {
  const { user } = useAuthStore();
  const isSuperUser = user?.role === 'super';
  const location = useLocation();
  const isMappingRoute = location.pathname.startsWith('/gl/mapping');

  const navItems: NavItem[] = [
    {
      label: 'Users',
      icon: <Users className="h-5 w-5" />, 
      to: '/users',
      isVisible: isSuperUser,
    },
    {
      label: 'Client Profiles',
      icon: <Building2 className="h-5 w-5" />,
      to: '/clients',
    },
    {
      label: 'COA Templates',
      icon: <FileSpreadsheet className="h-5 w-5" />, 
      to: '/templates',
      isVisible: isSuperUser,
    },
    {
      label: 'Data Import',
      icon: <Upload className="h-5 w-5" />,
      to: '/import',
    },
    {
      label: 'GL Mapping',
      icon: <BarChart3 className="h-5 w-5" />,
      to: '/gl/mapping/demo',
      isActiveOverride: isMappingRoute,
    },
    {
      label: 'Integrations',
      icon: <Network className="h-5 w-5" />,
      to: '/integrations',
    },
  ];

  const settingsItem: NavItem = {
    label: 'Settings',
    icon: <Settings className="h-5 w-5" />,
    to: '/settings',
  };

  const renderNavItem = ({ icon, label, to, isActiveOverride = false }: NavItem) => (
    <NavLink
      key={label}
      to={to}
      aria-label={label}
      className={({ isActive }) => getLinkClasses(isActive || isActiveOverride, isOpen)}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg text-current">
        {icon}
      </span>
      <span
        className={`truncate text-left transition-[opacity,transform] duration-200 ${
          isOpen ? 'opacity-100 translate-x-0' : 'hidden'
        }`}
      >
        {label}
      </span>
    </NavLink>
  );

  return (
    <aside
      className={`relative z-20 flex h-full flex-shrink-0 flex-col border-r border-gray-200 bg-gradient-sidebar shadow-soft transition-[width,transform] duration-300 dark:border-slate-800 ${
        isOpen ? 'w-64 translate-x-0' : 'w-16 -translate-x-full md:translate-x-0'
      }`}
      role="navigation"
      aria-label="Primary navigation"
      aria-expanded={isOpen}
    >
      <div className="flex h-full flex-col px-3 py-4">
        <div className="space-y-1.5">
          {navItems.filter((item) => item.isVisible ?? true).map(renderNavItem)}
        </div>

        <div className="mt-auto">{renderNavItem(settingsItem)}</div>
      </div>
    </aside>
  );
}
