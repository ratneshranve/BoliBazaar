import { useCallback, useEffect, useState } from 'react';
import { Gavel, Handshake, Plus, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from '@components/ui';
import ManagedAuctionForm from './ManagedAuctionForm';

const TONE = { pending_review: 'amber', rejected: 'red', scheduled: 'blue', live: 'green', suspended: 'amber', ended: 'neutral', cancelled: 'red' };
const LABEL = { pending_review: 'Pending review', rejected: 'Rejected', scheduled: 'Upcoming', live: 'Live', suspended: 'Suspended', ended: 'Ended', cancelled: 'Cancelled' };
const OUTCOME = { won: 'Won', no_bids: 'No bids', reserve_not_met: 'Reserve not met', bought_now: 'Bought now' };
const TABS = [
  { key: 'pending_review', label: 'Pending review' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Upcoming' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'ended', label: 'Ended' },
  { key: '', label: 'All' },
];

const fmt = (minor, currency) => {
  if (minor == null || !currency) return '—';
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: digits }).format(minor / 10 ** digits);
};
const when = (d) => (d ? new Date(d).toLocaleString() : '—');

const Tabs = ({ tabs, value, onChange, badge }) => (
  <div className="mb-4 flex flex-wrap items-center gap-2">
    {tabs.map((t) => (
      <button key={t.key} onClick={() => onChange(t.key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${value === t.key ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
        {t.label}
        {badge?.[t.key] > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{badge[t.key]}</span>}
      </button>
    ))}
  </div>
);

/** Full auction record: review, controls, bids with real bidders, deals. */
function AuctionPanel({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [a, setA] = useState(null);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => call(http.get(`/auctions/${id}`)).then((r) => setA(r.data)).catch((e) => toast.error(errorMessage(e))), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, fn, done) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      setReason('');
      await load();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const needReason = reason.trim().length < 3;
  const decide = (action) => run(action, () => call(http.post(`/auctions/${id}/decision`, { action, reason: reason.trim() || undefined })), action === 'approve' ? 'Approved' : 'Rejected');
  const control = (action) => run(action, () => call(http.post(`/auctions/${id}/control`, { action, reason: reason.trim(), ...(action === 'extend' ? { minutes: Number(minutes) } : {}) })), `Done: ${action}`);
  const voidBid = (bidId) => {
    const why = window.prompt('Why is this bid being voided? (shown in the audit log)');
    if (!why || why.trim().length < 3) return;
    run(`void-${bidId}`, () => call(http.post(`/auctions/${id}/bids/${bidId}/void`, { reason: why.trim() })), 'Bid voided — standing recalculated');
  };

  return (
    <Modal open wide title={a?.listing?.title || 'Auction'} onClose={onClose}>
      {!a ? (
        <Spinner />
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge>
            {a.outcome && <Badge tone="neutral">{OUTCOME[a.outcome]}</Badge>}
            {a.managed && <Badge tone="blue">Managed by our team</Badge>}
            <span className="font-mono text-neutral-500">{a.listing?.listingNo}</span>
            <span className="text-neutral-500">{a.listing?.place}</span>
          </div>

          {a.managed?.note && <p className="rounded-lg bg-blue-50 p-3 text-blue-900">Internal note: {a.managed.note}</p>}

          {a.listing?.media?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {a.listing.media.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-24 w-24 shrink-0 rounded-lg border object-cover" /></a>)}
            </div>
          )}
          <p className="whitespace-pre-line">{a.listing?.description}</p>

          <div className="grid gap-3 rounded-xl bg-neutral-50 p-4 sm:grid-cols-3">
            <div><div className="text-xs uppercase text-neutral-500">Starting</div><div className="font-semibold">{fmt(a.startingMinor, a.currency)}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Reserve (hidden)</div><div className="font-semibold">{fmt(a.reserveMinor, a.currency)}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Buy now</div><div className="font-semibold">{fmt(a.buyNowMinor ?? null, a.currency)}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Current</div><div className="font-semibold">{fmt(a.currentMinor, a.currency)}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Leader</div><div className="font-semibold">{a.state.highestBidder ? `${a.state.highestBidder.name || '—'} (${a.state.highestBidder.phone})` : '—'}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Bids / bidders</div><div className="font-semibold">{a.bidCount} / {a.bidderCount}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Start</div><div>{when(a.startAt)}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">End</div><div>{when(a.endAt)}{a.extensions > 0 && <span className="text-amber-700"> (+{a.extensions} ext.)</span>}</div></div>
            <div><div className="text-xs uppercase text-neutral-500">Seller</div><div>{a.seller.name || '—'} · {a.seller.phone}</div></div>
            {a.winner && <div><div className="text-xs uppercase text-neutral-500">Winner</div><div>{a.winner.name || '—'} · {a.winner.phone} · {fmt(a.finalMinor, a.currency)}</div></div>}
          </div>

          {a.moderation?.reason && <div className="rounded-lg bg-amber-50 p-3 text-amber-900">Last decision: {a.moderation.reason}</div>}

          {(can('auctions.decide') || can('auctions.control')) && !['ended', 'cancelled'].includes(a.status) && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <Field label="Reason (shown to the seller / bidders; required for everything except approve)">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Photos missing, item reported, technical issue…" />
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                {a.status === 'pending_review' && can('auctions.decide') && (
                  <>
                    <Button variant="brand" loading={busy === 'approve'} onClick={() => decide('approve')}>Approve</Button>
                    <Button variant="outline" loading={busy === 'reject'} disabled={needReason} onClick={() => decide('reject')}>Reject</Button>
                  </>
                )}
                {can('auctions.control') && (
                  <>
                    {a.status === 'live' && <Button variant="outline" loading={busy === 'suspend'} disabled={needReason} onClick={() => control('suspend')}>Suspend</Button>}
                    {a.status === 'suspended' && <Button variant="outline" loading={busy === 'resume'} disabled={needReason} onClick={() => control('resume')}>Resume</Button>}
                    {['live', 'scheduled', 'suspended'].includes(a.status) && (
                      <div className="flex items-end gap-2">
                        <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-24" />
                        <Button variant="outline" loading={busy === 'extend'} disabled={needReason || !(Number(minutes) > 0)} onClick={() => control('extend')}>Extend (minutes)</Button>
                      </div>
                    )}
                    {a.status !== 'pending_review' && <Button variant="danger" loading={busy === 'cancel'} disabled={needReason} onClick={() => control('cancel')}>Cancel auction</Button>}
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 font-semibold">Bids ({a.bids.length})</h3>
            <DataTable
              rows={a.bids}
              empty="No bids yet"
              columns={[
                { key: 'alias', header: 'Alias', render: (b) => `Bidder ${b.alias}` },
                { key: 'bidder', header: 'Bidder', render: (b) => <span>{b.bidder.name || '—'} <span className="text-neutral-500">{b.bidder.phone}</span></span> },
                { key: 'amount', header: 'Amount', render: (b) => fmt(b.amountMinor, a.currency) },
                { key: 'max', header: 'Private max', render: (b) => fmt(b.maxMinor, a.currency) },
                { key: 'kind', header: 'Kind' },
                { key: 'at', header: 'Time', render: (b) => when(b.at) },
                {
                  key: 'status',
                  header: '',
                  render: (b) =>
                    b.status === 'voided' ? (
                      <Badge tone="red">Voided{b.voidReason ? `: ${b.voidReason}` : ''}</Badge>
                    ) : can('auctions.void_bid') && ['live', 'suspended'].includes(a.status) ? (
                      <Button variant="outline" loading={busy === `void-${b.id}`} onClick={() => voidBid(b.id)}>Void</Button>
                    ) : null,
                },
              ]}
            />
          </div>

          {a.deals.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">Deals</h3>
              <DataTable
                rows={a.deals}
                columns={[
                  { key: 'buyer', header: 'Buyer', render: (d) => `${d.buyer.name || '—'} · ${d.buyer.phone}` },
                  { key: 'amount', header: 'Amount', render: (d) => fmt(d.amountMinor, a.currency) },
                  { key: 'source', header: 'From' },
                  { key: 'status', header: 'Status', render: (d) => <Badge tone={DEAL_TONE[d.status]}>{d.status.replace(/_/g, ' ')}</Badge> },
                  { key: 'createdAt', header: 'Created', render: (d) => when(d.createdAt) },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function AuctionsPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('pending_review');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setError('');
    call(http.get('/auctions', { params: { status: tab || undefined, q: q || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    // the live tab doubles as a monitor: refresh it every 10 seconds
    const live = tab === 'live' ? setInterval(load, 10_000) : null;
    return () => {
      clearTimeout(t);
      if (live) clearInterval(live);
    };
  }, [load, q, tab]);

  return (
    <>
      <PageHeader
        title="Auctions"
        subtitle="Review new auctions, watch live ones, and step in when needed. Every action is recorded in the audit log."
        actions={can('auctions.decide') && <Button variant="brand" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New managed auction</Button>}
      />
      <div className="flex flex-wrap items-start gap-2">
        <Tabs tabs={TABS} value={tab} onChange={(k) => { setTab(k); setPage(1); }} badge={{ pending_review: meta?.pending, live: meta?.live }} />
        <div className="ml-auto w-64"><Input placeholder="Search title or ad number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty={tab === 'pending_review' ? 'Nothing waiting for review 🎉' : 'No auctions'}
            onRowClick={(r) => setSelected(r.id)}
            columns={[
              { key: 'cover', header: '', render: (r) => (r.cover ? <img src={r.cover} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-neutral-100" />) },
              { key: 'title', header: 'Item', render: (r) => (<div><div className="font-medium">{r.title}</div><div className="font-mono text-xs text-neutral-500">{r.listingNo}{r.managed ? ' · Managed' : ''}</div></div>) },
              { key: 'price', header: 'Current / start', render: (r) => fmt(r.currentMinor ?? r.startingMinor, r.currency) },
              { key: 'bids', header: 'Bids', render: (r) => r.bidCount },
              { key: 'seller', header: 'Seller', render: (r) => r.seller?.name || r.seller?.phone || '—' },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge> },
              { key: 'endAt', header: 'Ends', render: (r) => when(r.endAt) },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {selected && <AuctionPanel id={selected} onClose={() => setSelected(null)} onChanged={load} />}
      {creating && (
        <ManagedAuctionForm
          onClose={() => setCreating(false)}
          onCreated={(newId) => {
            setCreating(false);
            setTab('');
            load();
            setSelected(newId);
          }}
        />
      )}
    </>
  );
}

/* ───── deals ───── */

const DEAL_TONE = { awaiting_confirmation: 'amber', in_progress: 'blue', completed: 'green', buyer_defaulted: 'red', seller_defaulted: 'red', cancelled: 'neutral', disputed: 'red' };
const DEAL_TABS = [
  { key: 'disputed', label: 'Disputed' },
  { key: 'awaiting_confirmation', label: 'Awaiting confirmation' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: '', label: 'All' },
];

function ResolveDeal({ deal, onClose, onDone }) {
  const [outcome, setOutcome] = useState('completed');
  const [strike, setStrike] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await call(http.post(`/auctions/deals/${deal.id}/resolve`, { outcome, note: note.trim(), strike: strike || null }));
      toast.success('Deal closed');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Resolve: ${deal.title}`} onClose={onClose} footer={<Button variant="brand" loading={busy} disabled={note.trim().length < 3} onClick={save}>Close deal</Button>}>
      <div className="space-y-4 text-sm">
        {deal.disputeReason && <div className="rounded-lg bg-red-50 p-3 text-red-800">Reported problem: {deal.disputeReason}</div>}
        <Field label="Outcome">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="completed">Completed — the sale went through</option>
            <option value="cancelled">Cancelled — the sale did not happen</option>
          </Select>
        </Field>
        <Field label="Strike (optional)">
          <Select value={strike} onChange={(e) => setStrike(e.target.value)}>
            <option value="">No strike</option>
            <option value="buyer">Strike the buyer ({deal.buyer?.name || deal.buyer?.phone})</option>
            <option value="seller">Strike the seller ({deal.seller?.name || deal.seller?.phone})</option>
          </Select>
        </Field>
        <Field label="Note (sent to both people)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DealsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('disputed');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(null);

  const load = useCallback(() => {
    setError('');
    call(http.get('/auctions/deals', { params: { status: tab || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, page]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Auction Deals" subtitle="What happens after an auction is won: confirmation, handover, and disputes." />
      <Tabs tabs={DEAL_TABS} value={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="No deals"
            columns={[
              { key: 'title', header: 'Item', render: (d) => <span className="font-medium">{d.title}</span> },
              { key: 'amount', header: 'Amount', render: (d) => fmt(d.amountMinor, d.currency) },
              { key: 'buyer', header: 'Buyer', render: (d) => `${d.buyer?.name || '—'} · ${d.buyer?.phone || ''}` },
              { key: 'seller', header: 'Seller', render: (d) => `${d.seller?.name || '—'} · ${d.seller?.phone || ''}` },
              { key: 'status', header: 'Status', render: (d) => <Badge tone={DEAL_TONE[d.status]}>{d.status.replace(/_/g, ' ')}</Badge> },
              { key: 'issue', header: 'Problem', render: (d) => <span className="line-clamp-2 max-w-xs">{d.disputeReason || '—'}</span> },
              { key: 'createdAt', header: 'Created', render: (d) => when(d.createdAt) },
              {
                key: 'act',
                header: '',
                render: (d) => (can('auctions.decide') && ['disputed', 'in_progress', 'awaiting_confirmation'].includes(d.status) ? <Button variant="outline" onClick={() => setResolving(d)}>Resolve</Button> : null),
              },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {resolving && <ResolveDeal deal={resolving} onClose={() => setResolving(null)} onDone={load} />}
    </>
  );
}

/* ───── strikes ───── */

function StrikesPage() {
  const { can } = useAuth();
  const [active, setActive] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    call(http.get('/auctions/strikes', { params: { active: String(active), page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [active, page]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (s) => {
    const reason = window.prompt('Why remove this strike? (e.g. appeal accepted)');
    if (!reason || reason.trim().length < 3) return;
    try {
      await call(http.delete(`/auctions/strikes/${s.id}`, { data: { reason: reason.trim() } }));
      toast.success('Strike removed');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Strikes" subtitle="Winners who did not go ahead and sellers who backed out. Limits are set in Settings › Auctions." />
      <Tabs tabs={[{ key: 'active', label: 'Active' }, { key: 'all', label: 'All' }]} value={active ? 'active' : 'all'} onChange={(k) => { setActive(k === 'active'); setPage(1); }} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="No strikes"
            columns={[
              { key: 'user', header: 'User', render: (s) => `${s.user?.name || '—'} · ${s.user?.phone || ''}` },
              { key: 'role', header: 'As', render: (s) => (s.role === 'buyer' ? 'Bidder' : 'Seller') },
              { key: 'reason', header: 'Reason' },
              { key: 'createdAt', header: 'Given', render: (s) => when(s.createdAt) },
              { key: 'expiresAt', header: 'Expires', render: (s) => (s.removedAt ? <Badge tone="neutral">Removed</Badge> : when(s.expiresAt)) },
              { key: 'act', header: '', render: (s) => (can('auctions.decide') && !s.removedAt ? <Button variant="outline" onClick={() => remove(s)}>Remove</Button> : null) },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export default {
  key: 'auctions',
  section: 'Management',
  nav: [
    { label: 'Auctions', path: '/auctions', icon: Gavel, permission: 'auctions.view' },
    { label: 'Auction Deals', path: '/auction-deals', icon: Handshake, permission: 'auctions.view' },
    { label: 'Strikes', path: '/strikes', icon: ShieldAlert, permission: 'auctions.view' },
  ],
  routes: [
    { path: '/auctions', element: <AuctionsPage />, permission: 'auctions.view' },
    { path: '/auction-deals', element: <DealsPage />, permission: 'auctions.view' },
    { path: '/strikes', element: <StrikesPage />, permission: 'auctions.view' },
  ],
};
