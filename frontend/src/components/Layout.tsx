import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 transition-colors duration-300 dark:bg-slate-900">
        <Navbar />
        <main id="app-scroll-container" className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-8xl space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}