import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, DataTable, ErrorBox, Field, Input, PageHeader, Pagination, Select, Spinner, Textarea } from '@components/ui';

/* Chart roles (validated: series-1 passes lightness, chroma and ≥3:1 contrast on the light surface). */
const VIZ = { series: '#2a78d6', grid: '#e7e6e2', text: '#52514e', surface: '#ffffff' };

/** Revenue in the marketplace currency (from the API), whole units. */
const moneyFormatter = (currency) => {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  return (minor) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 10 ** digits);
};
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * One metric over time: a column chart with a hairline baseline, thin bars with a 4px rounded top,
 * and a per-bar hover/focus tooltip (the bar's whole column is the hit target).
 */
function DailyBars({ title, series, valueKey, format = (v) => v.toLocaleString('en-IN') }) {
  const [hover, setHover] = useState(null);
  const W = 560;
  const H = 150;
  const pad = { top: 18, bottom: 22, left: 4, right: 4 };
  const values = series.map((s) => s[valueKey]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const slot = (W - pad.left - pad.right) / series.length;
  const barW = Math.max(2, Math.min(24, slot - 2)); // ≤24px, 2px surface gap between bars
  const plotH = H - pad.top - pad.bottom;
  const peak = values.indexOf(Math.max(...values));
  const tip = hover != null ? series[hover] : null;

  return (
    <Card className="relative">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        <span className="text-lg font-bold text-neutral-900">{format(total)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}: ${format(total)} in total`} onMouseLeave={() => setHover(null)}>
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke={VIZ.grid} strokeWidth="1" />
        {series.map((s, i) => {
          const v = s[valueKey];
          const h = v ? Math.max(2, (v / max) * plotH) : 0;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = H - pad.bottom - h;
          const r = Math.min(4, barW / 2, h);
          // rounded data-end, square at the baseline
          const d = h ? `M${x},${H - pad.bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${H - pad.bottom} Z` : '';
          return (
            <g key={s.date}>
              {d && <path d={d} fill={VIZ.series} opacity={hover == null || hover === i ? 1 : 0.55} />}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${fmtDay(s.date)}: ${format(v)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
        {/* selective direct label: the busiest day only */}
        {values[peak] > 0 && (
          <text x={pad.left + peak * slot + slot / 2} y={H - pad.bottom - (values[peak] / max) * plotH - 5} textAnchor="middle" fontSize="11" fill={VIZ.text}>
            {format(values[peak])}
          </text>
        )}
        <text x={pad.left} y={H - 6} fontSize="11" fill={VIZ.text}>{fmtDay(series[0].date)}</text>
        <text x={W - pad.right} y={H - 6} fontSize="11" fill={VIZ.text} textAnchor="end">{fmtDay(series[series.length - 1].date)}</text>
      </svg>
      {tip && (
        <div className="pointer-events-none absolute right-3 top-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow">
          <div className="text-sm font-bold text-neutral-900">{format(tip[valueKey])}</div>
          <div className="text-neutral-500">{fmtDay(tip.date)}</div>
        </div>
      )}
    </Card>
  );
}

/** Top categories as a horizontal bar list; every bar carries its value as a label. */
function TopCategories({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.listings));
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-neutral-800">Top categories by new ads</h3>
      {rows.length === 0 && <p className="text-sm text-neutral-500">No ads in this period</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 text-sm" title={`${r.name}: ${r.listings}`}>
            <span className="w-36 truncate text-neutral-700">{r.name}</span>
            <div className="h-3 flex-1">
              <div className="h-3 rounded-r" style={{ width: `${(r.listings / max) * 100}%`, background: VIZ.series, minWidth: 2 }} />
            </div>
            <span className="w-12 text-right font-semibold text-neutral-900">{r.listings}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const RANGES = [7, 30, 90, 365];

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [table, setTable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    call(http.get('/analytics', { params: { days } }))
      .then((r) => {
        setData(r.data);
        setError('');
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [days]);

  const t = data?.totals;
  const fmtMoney = data ? moneyFormatter(data.currency) : () => '';
  return (
    <>
      <PageHeader title="Analytics" subtitle="How the marketplace is doing. Each chart shows one measure per day." />
      {/* one filter row, above everything it scopes */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${days === d ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            Last {d} days
          </button>
        ))}
        <button onClick={() => setTable((x) => !x)} className="ml-auto text-sm font-semibold text-blue-700 underline">{table ? 'Show charts' : 'Show as table'}</button>
      </div>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Spinner />}
      {data && (
        // refetch keeps the frame: dim, never blank
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['New users', t.signups.toLocaleString('en-IN')],
              ['New ads', t.listings.toLocaleString('en-IN')],
              ['Bids', t.bids.toLocaleString('en-IN')],
              ['New chats', t.chats.toLocaleString('en-IN')],
              ['Marked sold', t.sold.toLocaleString('en-IN')],
              ['Revenue', fmtMoney(t.revenueMinor)],
            ].map(([label, value]) => (
              <Card key={label}>
                <div className="text-xs uppercase text-neutral-500">{label}</div>
                <div className="text-2xl font-bold text-neutral-900">{value}</div>
              </Card>
            ))}
          </div>
          {table ? (
            <DataTable
              rows={data.series.map((s) => ({ ...s, id: s.date }))}
              columns={[
                { key: 'date', header: 'Day', render: (s) => fmtDay(s.date) },
                { key: 'signups', header: 'New users' },
                { key: 'listings', header: 'New ads' },
                { key: 'bids', header: 'Bids' },
                { key: 'chats', header: 'New chats' },
                { key: 'revenue', header: 'Revenue', render: (s) => fmtMoney(s.revenueMinor) },
              ]}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <DailyBars title="New users" series={data.series} valueKey="signups" />
              <DailyBars title="New ads" series={data.series} valueKey="listings" />
              <DailyBars title="Bids" series={data.series} valueKey="bids" />
              <DailyBars title="New chats" series={data.series} valueKey="chats" />
              <DailyBars title="Revenue" series={data.series} valueKey="revenueMinor" format={fmtMoney} />
              <TopCategories rows={data.topCategories} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ───── broadcasts ───── */

const SEGMENT = { all: 'Everyone', sellers: 'People with live ads', state: 'People in a state', inactive: 'Inactive for 30+ days' };

function BroadcastsPage() {
  const { can } = useAuth();
  const [form, setForm] = useState({ title: '', body: '', route: '', segment: 'all', state: '' });
  const [audience, setAudience] = useState(null);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const load = useCallback(() => {
    call(http.get('/broadcasts', { params: { page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [page]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (form.segment === 'state' && !form.state.trim()) return setAudience(null);
    const id = setTimeout(() => {
      call(http.post('/broadcasts/audience', { segment: form.segment, state: form.state.trim() || undefined })).then((r) => setAudience(r.data.count)).catch(() => setAudience(null));
    }, 300);
    return () => clearTimeout(id);
  }, [form.segment, form.state]);

  const send = async () => {
    if (!window.confirm(`Send "${form.title}" to ${audience ?? 'all matching'} people now?`)) return;
    setSending(true);
    try {
      await call(http.post('/broadcasts', { title: form.title.trim(), body: form.body.trim(), route: form.route.trim() || undefined, segment: form.segment, state: form.segment === 'state' ? form.state.trim() : undefined }));
      toast.success('Sending — it continues in the background');
      setForm({ title: '', body: '', route: '', segment: 'all', state: '' });
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader title="Broadcasts" subtitle="Send a message to many users at once. It appears in their notifications and as a phone push (if they allow system updates)." />
      {can('notifications.send') && (
        <Card className="mb-6 w-full space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who gets it">
              <Select value={form.segment} onChange={(e) => set({ segment: e.target.value })}>
                {Object.entries(SEGMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            {form.segment === 'state' && <Field label="State"><Input value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="e.g. Chhattisgarh" /></Field>}
          </div>
          <Field label="Title"><Input value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Message"><Textarea rows={3} value={form.body} maxLength={300} onChange={(e) => set({ body: e.target.value })} /></Field>
          <Field label="Opens (optional app path)" hint="e.g. /auctions, /plans, /search?q=bike"><Input value={form.route} onChange={(e) => set({ route: e.target.value })} /></Field>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-600">{audience == null ? '—' : `${audience.toLocaleString('en-IN')} people`}</span>
            <Button variant="brand" loading={sending} disabled={form.title.trim().length < 3 || form.body.trim().length < 3 || !audience} onClick={send}>Send now</Button>
          </div>
        </Card>
      )}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="Nothing sent yet"
            columns={[
              { key: 'title', header: 'Message', render: (b) => <div><div className="font-medium">{b.title}</div><div className="text-xs text-neutral-500">{b.body}</div></div> },
              { key: 'segment', header: 'To', render: (b) => `${SEGMENT[b.segment]}${b.state ? ` · ${b.state}` : ''}` },
              { key: 'sent', header: 'Delivered', render: (b) => `${b.sentCount.toLocaleString('en-IN')} / ${b.audience.toLocaleString('en-IN')}` },
              { key: 'status', header: 'Status', render: (b) => <Badge tone={b.status === 'sent' ? 'green' : b.status === 'failed' ? 'red' : 'amber'}>{b.status}</Badge> },
              { key: 'createdAt', header: 'Sent', render: (b) => new Date(b.createdAt).toLocaleString() },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export default {
  key: 'growth',
  section: 'Overview',
  nav: [
    { label: 'Analytics', path: '/analytics', icon: BarChart3, permission: 'analytics.view' },
    { label: 'Broadcasts', path: '/broadcasts', icon: Megaphone, permission: 'notifications.view' },
  ],
  routes: [
    { path: '/analytics', element: <AnalyticsPage />, permission: 'analytics.view' },
    { path: '/broadcasts', element: <BroadcastsPage />, permission: 'notifications.view' },
  ],
};
