import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Activity, AlertTriangle, CheckCircle2, Eye, Flame, Radio, Users } from 'lucide-react';
import { toast } from 'sonner';
import { auth, call, errorMessage, http } from '@core/api';
import { env } from '@core/env';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, DataTable, ErrorBox, PageHeader, Spinner } from '@components/ui';

const fmt = (minor, currency, factor) => (minor == null || !currency ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: Math.round(Math.log10(factor || 1)) }).format(minor / (factor || 1)));
const left = (endAt, now) => {
  const ms = new Date(endAt).getTime() - now;
  if (ms <= 0) return 'ending…';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
};

/** Socket connection for admins (same server as the app; the token says it's staff). */
const useAdminSocket = (onBids) => {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onBids);
  cb.current = onBids;
  useEffect(() => {
    const origin = new URL(env.apiBaseUrl, window.location.origin).origin;
    const s = io(origin, { auth: { token: auth.token(), admin: true }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));
    s.on('admin:bids', (e) => cb.current(e));
    return () => s.close();
  }, []);
  return connected;
};

/** Every live auction updating as bids land, with the real bidder behind each bid. */
export function LiveMonitorPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState(null);

  const load = useCallback(() => {
    call(http.get('/auctions/monitor'))
      .then((r) => {
        setData(r.data);
        setError('');
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const connected = useAdminSocket((e) => {
    setFlash(e.auctionId);
    setTimeout(() => setFlash((f) => (f === e.auctionId ? null : f)), 1500);
    setData((d) => {
      if (!d) return d;
      const known = d.auctions.some((a) => a.id === e.auctionId);
      if (!known) {
        load(); // an auction we were not showing yet
        return d;
      }
      const seen = new Set(d.recentBids.map((b) => b.id));
      return {
        ...d,
        auctions: d.auctions.map((a) =>
          a.id === e.auctionId
            ? { ...a, currentMinor: e.currentMinor, bidCount: e.bidCount, bidderCount: e.bidderCount, endAt: e.endAt, extensions: e.extensions, bidsLast10Min: a.bidsLast10Min + e.bids.filter((b) => !seen.has(b.id)).length, leader: e.bids[0]?.bidder || a.leader }
            : a
        ),
        recentBids: [...e.bids.filter((b) => !seen.has(b.id)), ...d.recentBids].slice(0, 50),
      };
    });
  });

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(load, 60_000); // new and ended auctions, velocity window
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [load]);

  const hot = (a) => a.bidsLast10Min >= 5;

  return (
    <>
      <PageHeader
        title="Live Monitor"
        subtitle="Live auctions update the moment someone bids"
        actions={<span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Radio className="h-3.5 w-3.5" /> {connected ? 'Live' : 'Reconnecting…'}</span>}
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div>
            {data.auctions.length === 0 && <Card className="text-center text-slate-500">No live auctions right now</Card>}
            <div className="grid gap-3 sm:grid-cols-2">
              {data.auctions.map((a) => (
                <Card key={a.id} className={`space-y-2 transition-shadow ${flash === a.id ? 'ring-2 ring-emerald-400' : ''}`}>
                  <div className="flex items-start gap-3">
                    {a.cover ? <img src={a.cover} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-slate-100" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{a.title}</div>
                      <div className="font-mono text-xs text-slate-500">{a.listingNo}</div>
                    </div>
                    {a.status === 'suspended' ? <Badge tone="amber">Suspended</Badge> : hot(a) ? <Badge tone="red"><Flame className="mr-1 inline h-3 w-3" />Hot</Badge> : null}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-slate-500">{a.currentMinor != null ? 'Current bid' : 'Starting at'}</div>
                      <div className="text-xl font-bold text-slate-900">{fmt(a.currentMinor ?? a.startingMinor, a.currency, a.factor)}</div>
                    </div>
                    <div className="text-right text-sm font-semibold text-slate-700">{left(a.endAt, now)}{a.extensions > 0 && <div className="text-xs font-normal text-amber-700">+{a.extensions} extensions</div>}</div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{a.bidsLast10Min} bids / 10 min</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{a.bidCount} bids · {a.bidderCount} bidders</span>
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{a.watchers} watching</span>
                  </div>
                  {a.leader && <div className="text-xs text-slate-600">Leading: <span className="font-semibold">{a.leader.name || '—'}</span> {a.leader.phone}</div>}
                  {a.flags > 0 && <div className="flex items-center gap-1 text-xs font-semibold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />{a.flags} suspicious signal{a.flags > 1 ? 's' : ''} — see Suspicious Bidding</div>}
                </Card>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-slate-900">Latest bids</h3>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
              {data.recentBids.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No bids yet</div>}
              {data.recentBids.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{b.bidder.name || '—'} <span className="text-xs text-slate-500">Bidder {b.alias}{b.kind !== 'manual' ? ` · ${b.kind.replace('_', ' ')}` : ''}</span></div>
                    <div className="truncate text-xs text-slate-500">{b.title}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${b.status === 'voided' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{fmt(b.amountMinor, b.currency, b.factor)}</div>
                    <div className="text-xs text-slate-400">{new Date(b.at).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Auctions with bidding patterns worth a look (shared devices with the seller, new accounts, repeat non-payers…). */
export function SuspiciousPage({ onOpen }) {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [showReviewed, setShowReviewed] = useState(false);
  const load = useCallback(() => {
    setError('');
    call(http.get('/auctions/suspicious', { params: { reviewed: showReviewed ? '1' : '0' } }))
      .then((r) => setRows(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [showReviewed]);
  useEffect(() => {
    load();
  }, [load]);

  const review = async (row, sig) => {
    const note = window.prompt('What did you check or do? (saved in the audit log)');
    if (note === null) return;
    try {
      await call(http.post('/auctions/suspicious/review', { auctionId: row.auctionId, key: sig.key, note: note.trim() || undefined }));
      toast.success('Marked as reviewed');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Suspicious Bidding"
        subtitle="Live auctions and auctions that ended in the last 14 days with bidding patterns worth checking. Open an auction to void bids, suspend, extend or cancel."
        actions={<Button variant="outline" onClick={() => setShowReviewed((v) => !v)}>{showReviewed ? 'Hide reviewed' : 'Show reviewed too'}</Button>}
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows?.length === 0 && <Card className="flex items-center justify-center gap-2 text-slate-500"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Nothing suspicious right now</Card>}
      <div className="space-y-3">
        {rows?.map((row) => (
          <Card key={row.auctionId} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => onOpen?.(row.auctionId)} className="font-semibold text-slate-900 hover:underline">{row.title}</button>
              <span className="font-mono text-xs text-slate-500">{row.listingNo}</span>
              <Badge tone={row.status === 'live' ? 'green' : 'neutral'}>{row.status}</Badge>
              <span className="text-sm text-slate-600">Seller: {row.seller.name || '—'} · {row.bidCount} bids · {fmt(row.currentMinor, row.currency, row.factor)}</span>
            </div>
            <DataTable
              rows={row.signals.map((s) => ({ ...s, id: s.key }))}
              columns={[
                { key: 'text', header: 'Signal', render: (s) => <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-600" />{s.text}</span> },
                { key: 'users', header: 'People', render: (s) => s.users.map((u) => `${u.name || '—'} ${u.phone || ''}`).join(' · ') || '—' },
                { key: 'detail', header: 'Detail', render: (s) => s.detail || '—' },
                { key: 'act', header: '', render: (s) => can('auctions.control') && <Button variant="outline" onClick={() => review(row, s)}>Mark reviewed</Button> },
              ]}
            />
          </Card>
        ))}
      </div>
    </>
  );
}
