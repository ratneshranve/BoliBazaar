import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, UserPlus, Activity, ShieldAlert, ListChecks, Clock, Store, Gavel, Hourglass, AlertTriangle, IndianRupee, Sparkles, BadgeCheck } from 'lucide-react';
import { call, http, errorMessage } from '@core/api';
import { Card, ErrorBox, PageHeader, Spinner } from '@components/ui';

const KPIS = [
  { key: 'totalUsers', label: 'Total users', icon: Users },
  { key: 'activeUsers30d', label: 'Active users (30 days)', icon: Activity },
  { key: 'newUsers24h', label: 'New users (24 h)', icon: UserPlus },
  { key: 'suspended', label: 'Suspended / banned', icon: ShieldAlert },
  { key: 'liveListings', label: 'Live ads', icon: Store },
  { key: 'pendingListings', label: 'Ads awaiting review', icon: Clock },
  { key: 'totalListings', label: 'Total ads', icon: ListChecks },
  { key: 'liveAuctions', label: 'Live auctions', icon: Gavel },
  { key: 'pendingAuctions', label: 'Auctions awaiting review', icon: Hourglass },
  { key: 'openDisputes', label: 'Open deal disputes', icon: AlertTriangle },
  { key: 'revenue30dMinor', label: 'Revenue (30 days)', icon: IndianRupee, money: true },
  { key: 'activePromotions', label: 'Paid promotions running', icon: Sparkles },
  { key: 'activePlans', label: 'Active subscriptions', icon: BadgeCheck },
];

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    call(http.get('/dashboard/summary')).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const max = Math.max(1, ...data.charts.signups.map((s) => s.count));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of your marketplace" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map(({ key, label, icon: Icon, money }) => (
          <Card key={key} className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{money ? (data.revenueCurrency ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.revenueCurrency, maximumFractionDigits: 0 }).format(data.kpis[key] / 10 ** new Intl.NumberFormat('en', { style: 'currency', currency: data.revenueCurrency }).resolvedOptions().maximumFractionDigits) : '—') : (data.kpis[key] ?? 0).toLocaleString()}</div>
              <div className="text-sm text-neutral-500">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <h2 className="mb-4 font-semibold">Signups — last 30 days</h2>
        {data.charts.signups.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No signups in this period</p>
        ) : (
          <div className="flex h-40 items-end gap-1">
            {data.charts.signups.map((s) => (
              <div key={s.date} className="group relative flex-1">
                <div className="rounded-t bg-neutral-900" style={{ height: `${(s.count / max) * 100}%`, minHeight: 4 }} />
                <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block">
                  {s.date}: {s.count}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default {
  key: 'dashboard',
  section: 'Overview',
  nav: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard.view' }],
  routes: [{ path: '/', element: <Dashboard />, permission: 'dashboard.view' }],
};
