import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@components/ui';
import { useAuth } from '@core/AuthContext';
import { useBrand } from '@core/BrandContext';
import { modules, sections } from '@modules/registry';

const STATE_KEY = 'admin_sidebar_state';
const loadState = () => {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  } catch {
    return {};
  }
};

export default function Sidebar({ isOpen, onClose, onCollapseChange }) {
  const { pathname } = useLocation();
  const { can } = useAuth();
  const { branding } = useBrand();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() => Boolean(loadState().collapsed));
  const [open, setOpen] = useState(() => loadState().open || {});

  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ collapsed, open }));
    onCollapseChange?.(collapsed);
  }, [collapsed, open, onCollapseChange]);

  // Build visible menu: sections → items (permission filtered)
  const menu = useMemo(() => {
    const items = modules.flatMap((m) => m.nav.filter((n) => can(n.permission)).map((n) => ({ ...n, section: m.section })));
    return sections
      .map((label) => ({ label, items: items.filter((i) => i.section === label) }))
      .filter((s) => s.items.length);
  }, [can]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menu;
    return menu
      .map((s) => ({
        ...s,
        items: s.items
          .map((i) => {
            const subs = i.children?.filter((c) => c.label.toLowerCase().includes(q));
            if (i.label.toLowerCase().includes(q)) return i;
            if (subs?.length) return { ...i, children: subs };
            return null;
          })
          .filter(Boolean),
      }))
      .filter((s) => s.items.length);
  }, [menu, query]);

  const isActive = (path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
  const close = () => window.innerWidth < 1024 && onClose?.();

  const renderItem = (item) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    if (item.children?.length) {
      const key = item.label;
      const expanded = query ? true : Boolean(open[key]) || item.children.some((c) => isActive(c.path));
      return (
        <div key={key} className="menu-item-animate">
          <button
            onClick={() => setOpen((o) => ({ ...Object.fromEntries(Object.keys(o).map((k) => [k, false])), [key]: !expanded }))}
            title={collapsed ? item.label : undefined}
            className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-white/5', collapsed && 'justify-center px-2')}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0 text-neutral-300" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </span>
            {!collapsed && <ChevronDown className="h-4 w-4 shrink-0 text-neutral-300 transition-transform" style={{ transform: expanded ? 'none' : 'rotate(-90deg)' }} />}
          </button>
          {expanded && !collapsed && (
            <div className="ml-5 mt-1 space-y-1 pl-3">
              {item.children.map((c) => (
                <Link
                  key={c.path}
                  to={c.path}
                  onClick={close}
                  className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm', isActive(c.path) ? 'bg-white/10 font-semibold text-white' : 'text-neutral-300 hover:bg-white/5 hover:text-white')}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isActive(c.path) ? 'scale-125 bg-white' : 'bg-neutral-400')} />
                  <span className="truncate">{c.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={close}
        title={collapsed ? item.label : undefined}
        className={cn(
          'menu-item-animate flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
          active ? 'border border-white/15 bg-white/10 font-semibold text-white' : 'text-neutral-300 hover:bg-white/5 hover:text-white',
          collapsed && 'justify-center px-2'
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', active ? 'scale-110 text-white' : 'text-neutral-300')} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <div
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-neutral-800/60 transition-all duration-300 ease-in-out lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed ? 'w-20' : 'w-80'
      )}
      style={{ backgroundColor: 'var(--sidebar-theme)' }}
    >
      <div className="shrink-0 border-b border-neutral-800/60 px-3 py-3" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
        <div className="mb-3 flex items-center justify-between">
          {!collapsed ? (
            <div className="flex h-12 items-center gap-2">
              {branding?.logo?.url && <img src={branding.logo.url} alt="" className="h-10 w-24 object-contain" />}
              {!branding?.logo?.url && <span className="truncate px-2 text-xs font-semibold text-white">{branding?.appName || ''}</span>}
            </div>
          ) : (
            <div className="flex w-full justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                {branding?.icon?.url || branding?.logo?.url ? (
                  <img src={branding.icon?.url || branding.logo.url} alt="" className="h-8 w-8 object-contain" />
                ) : (
                  <span className="text-[10px] font-bold uppercase text-white">{(branding?.appName || '').charAt(0)}</span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 hover:text-white">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="text-neutral-300 hover:text-white lg:hidden" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-300">Admin Panel</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Menu..."
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 pl-9 pr-9 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/30"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <nav className="admin-sidebar-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-3 py-3">
        {filtered.length === 0 && query ? (
          <div className="px-3 py-12">
            <p className="text-sm font-medium text-neutral-300">No menu items found</p>
            <p className="mt-2 text-sm text-neutral-500">Try a different search term</p>
          </div>
        ) : (
          filtered.map((section, idx) => (
            <div key={section.label} className={cn(idx > 0 && 'mt-4 border-t border-neutral-800/60 pt-4')}>
              {!collapsed && (
                <div className="mb-2 px-3 py-2">
                  <span className="text-sm font-bold uppercase tracking-wider text-neutral-400">{section.label}</span>
                </div>
              )}
              <div className="space-y-1">{section.items.map(renderItem)}</div>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
