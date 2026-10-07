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
    <div className="flex h-screen overflow-hidden bg-neutral-200">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onCollapseChange={setCollapsed} />

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${collapsed ? 'lg:ml-20' : 'lg:ml-80'}`}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-neutral-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-neutral-700">{branding?.appName || ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="font-semibold text-neutral-900">{admin?.name}</div>
                <div className="text-xs text-neutral-500">{admin?.role?.name}</div>
              </div>
            </div>
            <button onClick={logout} title="Log out" className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden bg-neutral-100">
          <div className="p-5 pb-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
