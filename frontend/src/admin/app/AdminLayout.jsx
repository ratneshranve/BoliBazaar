import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LogOut, Menu, User } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '@core/AuthContext';
import { useBrand } from '@core/BrandContext';

export default function AdminLayout() {
  const { admin, logout } = useAuth();
  const { branding } = useBrand();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onCollapseChange={setCollapsed} />

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${collapsed ? 'lg:ml-20' : 'lg:ml-80'}`}>
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden transition" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-base font-bold tracking-tight text-slate-900">{branding?.appName || 'Admin Panel'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-900 to-slate-700 text-white shadow-xs">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden leading-tight sm:block text-left">
                <div className="font-semibold text-slate-900">{admin?.name}</div>
                <div className="text-xs font-medium text-slate-500">{admin?.role?.name || 'Administrator'}</div>
              </div>
            </div>
            <button onClick={logout} title="Log out" className="rounded-xl p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/70">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 pb-16">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
