import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Activity,
  ShieldAlert,
  ListChecks,
  Clock,
  Store,
  Gavel,
  Hourglass,
  AlertTriangle,
  IndianRupee,
  Sparkles,
  BadgeCheck,
  BarChart3,
} from 'lucide-react';
import { call, http, errorMessage } from '@core/api';
import { Card, ErrorBox, MetricCard, PageHeader, Spinner, cn } from '@components/ui';

const KPIS = [
  {
    key: 'revenue30dMinor',
    title: 'Gross Revenue',
    helper: '30-day transaction volume',
    icon: IndianRupee,
    iconColor: 'text-emerald-600',
    accent: 'bg-emerald-200/40',
    path: '/finance',
    money: true,
  },
  {
    key: 'totalUsers',
    title: 'Total Users',
    helper: 'Registered marketplace accounts',
    icon: Users,
    iconColor: 'text-blue-600',
    accent: 'bg-blue-200/40',
    path: '/users',
  },
  {
    key: 'activeUsers30d',
    title: 'Active Users',
    helper: 'Active in the last 30 days',
    icon: Activity,
    iconColor: 'text-emerald-600',
    accent: 'bg-emerald-200/40',
    path: '/users',
  },
  {
    key: 'newUsers24h',
    title: 'New Signups',
    helper: 'Joined in the past 24 hours',
    icon: UserPlus,
    iconColor: 'text-indigo-600',
    accent: 'bg-indigo-200/40',
    path: '/users',
  },
  {
    key: 'liveListings',
    title: 'Live Ads',
    helper: 'Published ads catalog',
    icon: Store,
    iconColor: 'text-sky-600',
    accent: 'bg-sky-200/40',
    path: '/listings',
  },
  {
    key: 'pendingListings',
    title: 'Ads For Review',
    helper: 'Pending moderation approval',
    icon: Clock,
    iconColor: 'text-amber-600',
    accent: 'bg-amber-200/40',
    path: '/listings',
  },
  {
    key: 'totalListings',
    title: 'Total Ads Catalog',
    helper: 'Total listings in marketplace',
    icon: ListChecks,
    iconColor: 'text-slate-600',
    accent: 'bg-slate-200/40',
    path: '/listings',
  },
  {
    key: 'liveAuctions',
    title: 'Live Auctions',
    helper: 'Active real-time bidding',
    icon: Gavel,
    iconColor: 'text-purple-600',
    accent: 'bg-purple-200/40',
    path: '/auctions',
  },
  {
    key: 'pendingAuctions',
    title: 'Auctions In Review',
    helper: 'Awaiting moderation review',
    icon: Hourglass,
    iconColor: 'text-orange-600',
    accent: 'bg-orange-200/40',
    path: '/auctions',
  },
  {
    key: 'activePromotions',
    title: 'Paid Promotions',
    helper: 'Currently promoted ads',
    icon: Sparkles,
    iconColor: 'text-pink-600',
    accent: 'bg-pink-200/40',
    path: '/finance',
  },
  {
    key: 'activePlans',
    title: 'Active Subscriptions',
    helper: 'Seller premium subscription plans',
    icon: BadgeCheck,
    iconColor: 'text-teal-600',
    accent: 'bg-teal-200/40',
    path: '/finance',
  },
  {
    key: 'openDisputes',
    title: 'Open Deal Disputes',
    helper: 'Requires resolution action',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    accent: 'bg-amber-200/40',
    path: '/auctions',
  },
  {
    key: 'suspended',
    title: 'Suspended Accounts',
    helper: 'Restricted or banned accounts',
    icon: ShieldAlert,
    iconColor: 'text-rose-600',
    accent: 'bg-rose-200/40',
    path: '/users',
  },
];

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xl ring-1 ring-black/5">
        <p className="text-[11px] font-semibold text-slate-500 mb-1">{item.date || label}</p>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          <span className="text-xs font-medium text-slate-600">New Registrations:</span>
          <span className="text-sm font-bold text-slate-900">{payload[0].value}</span>
        </div>
      </div>
    );
  }
  return null;
}

function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [chartType, setChartType] = useState('area');

  const load = () => {
    setError('');
    call(http.get('/dashboard/summary'))
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const chartData = useMemo(() => {
    if (!data?.charts?.signups) return [];
    return data.charts.signups.map((s) => {
      let label = s.date;
      try {
        const parts = s.date.split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      } catch {
        // keep s.date
      }
      return { ...s, label, signups: s.count || 0 };
    });
  }, [data]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const totalSignups = data.charts?.signups ? data.charts.signups.reduce((sum, s) => sum + (s.count || 0), 0) : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Marketplace overview, performance metrics & activity"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
        {KPIS.map(({ key, title, helper, icon: Icon, iconColor, accent, path, money }) => {
          let formattedValue = '0';
          if (money) {
            formattedValue = data.revenueCurrency
              ? new Intl.NumberFormat('en-IN', {
                  style: 'currency',
                  currency: data.revenueCurrency,
                  maximumFractionDigits: 0,
                }).format(
                  (data.kpis[key] || 0) /
                    10 **
                      new Intl.NumberFormat('en', { style: 'currency', currency: data.revenueCurrency }).resolvedOptions()
                        .maximumFractionDigits
                )
              : '—';
          } else {
            formattedValue = (data.kpis[key] ?? 0).toLocaleString();
          }

          return (
            <MetricCard
              key={key}
              title={title}
              value={formattedValue}
              helper={helper}
              icon={<Icon className={`h-5 w-5 ${iconColor}`} />}
              accent={accent}
              onClick={() => path && navigate(path)}
            />
          );
        })}
      </div>

      <Card className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 shadow-2xs">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Signups Trend</h2>
              <p className="text-xs text-slate-500 font-normal">Daily account registrations over the last 30 days</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChartType('area')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-all',
                  chartType === 'area' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Line Trend
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-all',
                  chartType === 'bar' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Bar View
              </button>
            </div>

            {/* Quick Stat Pill */}
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Total: <span className="text-blue-600 font-bold">{totalSignups.toLocaleString()}</span> signups
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No signups recorded in this period</p>
        ) : (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                    allowDecimals={false}
                    dx={-4}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="signups"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#signupGradient)"
                    activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                    name="Signups"
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                    allowDecimals={false}
                    dx={-4}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="signups"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
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

