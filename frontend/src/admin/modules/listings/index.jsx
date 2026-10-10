import { useCallback, useEffect, useState } from 'react';
import { Download, ListChecks, Lock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from '@components/ui';

const TONE = { pending_review: 'amber', published: 'green', paused: 'neutral', rejected: 'red', expired: 'neutral', sold: 'blue', removed: 'red', deleted: 'neutral' };
const LABEL = { pending_review: 'Pending review', published: 'Live', paused: 'Paused', rejected: 'Rejected', expired: 'Expired', sold: 'Sold', removed: 'Removed' };
const TABS = [
  { key: 'pending_review', label: 'Pending review' },
  { key: 'published', label: 'Live' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'removed', label: 'Removed' },
  { key: '', label: 'All' },
];

export const money = (p) => {
  if (!p) return '—';
  if (p.type === 'on_request') return 'Price on request';
  if (p.type === 'free') return 'Free';
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: p.currency }).resolvedOptions().maximumFractionDigits;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: p.currency, maximumFractionDigits: digits }).format((p.amountMinor ?? 0) / 10 ** digits) + (p.type === 'negotiable' ? ' (negotiable)' : '');
};

function ListingReview({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [l, setL] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    call(http.get(`/listings/${id}`)).then((r) => setL(r.data)).catch((e) => toast.error(errorMessage(e)));
  }, [id]);

  // hold the review lock while this window is open; let it go when it closes
  const holding = l?.status === 'pending_review' && l?.lock?.mine;
  useEffect(() => {
    if (!holding) return undefined;
    const beat = setInterval(() => call(http.post(`/listings/${id}/lock`)).catch(() => {}), 60_000);
    return () => {
      clearInterval(beat);
      call(http.delete(`/listings/${id}/lock`)).catch(() => {});
    };
  }, [holding, id]);

  const decide = async (action) => {
    setBusy(action);
    try {
      await call(http.post(`/listings/${id}/decision`, { action, reason: reason.trim() || undefined }));
      toast.success(action === 'approve' ? 'Approved — the ad is live' : action === 'reject' ? 'Rejected' : 'Removed');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const lockedByOther = l?.lock && !l.lock.mine;
  const canModerate = can('listings.moderate') && !lockedByOther;
  const reviewable = l && ['pending_review', 'rejected'].includes(l.status);
  const removable = l && !['removed', 'sold'].includes(l.status);
  const needReason = reason.trim().length < 3;

  return (
    <Modal open wide title={l ? `${l.title}` : 'Listing'} onClose={onClose}>
      {!l ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone={TONE[l.status]}>{LABEL[l.status] || l.status}</Badge>
            <span className="font-mono text-neutral-500">{l.listingNo}</span>
            <span className="font-semibold">{money(l.price)}</span>
            <span className="text-neutral-500">{l.category}</span>
          </div>

          {lockedByOther && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              <Lock className="h-4 w-4" /> {l.lock.by} is reviewing this ad right now. You can look, but not decide, until they finish.
            </div>
          )}

          {l.video && <video src={l.video} controls preload="metadata" className="max-h-56 w-full rounded-lg bg-black" />}

          {l.media.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {l.media.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="" className="h-28 w-28 shrink-0 rounded-lg border border-neutral-200 object-cover" />
                </a>
              ))}
            </div>
          )}

          <p className="whitespace-pre-line text-sm">{l.description}</p>

          {l.attributes.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {l.attributes.map((a) => (
                <div key={a.key}>
                  <dt className="text-xs uppercase text-neutral-500">{a.label}</dt>
                  <dd className="font-medium">{Array.isArray(a.value) ? a.value.join(', ') : String(a.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="grid gap-4 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-neutral-500">Seller</div>
              <div className="font-medium">{l.owner?.name || '—'}</div>
              <div className="text-neutral-600">{l.owner?.phone}</div>
              {l.ownerStatus && l.ownerStatus !== 'active' && <Badge tone="red">Account {l.ownerStatus}</Badge>}
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs uppercase text-neutral-500"><MapPin className="h-3.5 w-3.5" /> Location (exact, admin only)</div>
              <div className="font-medium">{l.location.label}</div>
              {l.location.lat != null && (
                <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${l.location.lat},${l.location.lng}`}>
                  {l.location.lat.toFixed(5)}, {l.location.lng.toFixed(5)} — open in Maps
                </a>
              )}
            </div>
          </div>

          {l.moderation?.reason && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Last decision: {l.moderation.reason}</div>
          )}

          {canModerate && (reviewable || removable) && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <Field label="Reason (shown to the seller; required to reject or remove)">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Photos are blurry, wrong category, prohibited item…" />
              </Field>
              <div className="flex flex-wrap gap-2">
                {reviewable && <Button variant="brand" loading={busy === 'approve'} onClick={() => decide('approve')}>Approve</Button>}
                {l.status === 'pending_review' && <Button variant="outline" loading={busy === 'reject'} disabled={needReason} onClick={() => decide('reject')}>Reject</Button>}
                {removable && <Button variant="danger" loading={busy === 'remove'} disabled={needReason} onClick={() => decide('remove')}>Remove</Button>}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ListingsPage() {
  const [tab, setTab] = useState('pending_review');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const { can } = useAuth();
  const [picked, setPicked] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // 'approve' | 'reject' | 'remove'
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const runBulk = async () => {
    setBulkBusy(true);
    try {
      const { data } = await call(http.post('/listings/bulk', { ids: [...picked], action: bulk, reason: bulkReason.trim() || undefined }));
      if (data.failed) toast.warning(`${data.done} done, ${data.failed} skipped: ${[...new Set(data.results.filter((r) => !r.ok).map((r) => r.message))].join('; ')}`);
      else toast.success(`${data.done} ads updated`);
      setPicked(new Set());
      setBulk(null);
      setBulkReason('');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await http.get('/listings/export.csv', { params: { status: tab || undefined, q: q || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `listings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const load = useCallback(() => {
    setError('');
    call(http.get('/listings', { params: { status: tab || undefined, q: q || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
        setPicked((p) => new Set([...p].filter((id) => r.data.some((x) => x.id === id))));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <>
      <PageHeader title="Listings" subtitle="Review new ads before they go live, and manage existing ones" actions={can('listings.export') && <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>} />
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 shadow-2xs ${
                tab === t.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200/80'
              }`}
            >
              {t.label}
              {t.key === 'pending_review' && meta?.pending > 0 && (
                <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                  {meta.pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-72">
          <Input placeholder="Search title or ad number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      {picked.size > 0 && can('listings.moderate') && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-md">
          <span className="mr-2 text-sm font-semibold text-slate-700">{picked.size} selected</span>
          {['pending_review', 'rejected', ''].includes(tab) && <Button variant="brand" onClick={() => setBulk('approve')}>Approve</Button>}
          {['pending_review', ''].includes(tab) && <Button variant="outline" onClick={() => setBulk('reject')}>Reject</Button>}
          <Button variant="danger" onClick={() => setBulk('remove')}>Remove</Button>
          <Button variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      )}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty={tab === 'pending_review' ? 'Nothing waiting for review 🎉' : 'No listings'}
            onRowClick={(r) => setSelected(r.id)}
            columns={[
              ...(can('listings.moderate')
                ? [{
                    key: 'pick',
                    header: <input type="checkbox" aria-label="Select all on this page" checked={rows.length > 0 && rows.every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />,
                    render: (r) => <input type="checkbox" aria-label={`Select ${r.listingNo}`} checked={picked.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePick(r.id)} />,
                  }]
                : []),
              { key: 'cover', header: '', render: (r) => (r.cover ? <img src={r.cover} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-neutral-100" />) },
              { key: 'title', header: 'Ad', render: (r) => (<div><div className="font-medium">{r.title}</div><div className="font-mono text-xs text-neutral-500">{r.listingNo}</div></div>) },
              { key: 'price', header: 'Price', render: (r) => money(r.price) },
              { key: 'owner', header: 'Seller', render: (r) => r.owner?.name || r.owner?.phone || '—' },
              { key: 'place', header: 'Place' },
              { key: 'status', header: 'Status', render: (r) => (<div className="flex flex-col items-start gap-1"><Badge tone={TONE[r.status]}>{LABEL[r.status] || r.status}</Badge>{r.lockedBy && <span className="flex items-center gap-1 text-xs text-amber-700"><Lock className="h-3 w-3" /> {r.lockedBy}</span>}</div>) },
              { key: 'createdAt', header: 'Posted', render: (r) => new Date(r.createdAt).toLocaleString() },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {selected && <ListingReview id={selected} onClose={() => { setSelected(null); load(); }} onChanged={load} />}
      {bulk && (
        <Modal
          open
          title={`${bulk === 'approve' ? 'Approve' : bulk === 'reject' ? 'Reject' : 'Remove'} ${picked.size} ads`}
          onClose={() => setBulk(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulk(null)}>Cancel</Button>
              <Button variant={bulk === 'remove' ? 'danger' : 'brand'} loading={bulkBusy} disabled={bulk !== 'approve' && bulkReason.trim().length < 3} onClick={runBulk}>Confirm</Button>
            </div>
          }
        >
          <p className="mb-3 text-sm text-slate-600">Each seller is notified. Ads another admin is reviewing right now, or that are not in the right state, are skipped.</p>
          {bulk !== 'approve' && (
            <Field label="Reason (shown to every seller)">
              <Textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. Prohibited item, misleading photos…" />
            </Field>
          )}
        </Modal>
      )}
    </>
  );
}

export default {
  key: 'listings',
  section: 'Management',
  nav: [{ label: 'Listings', path: '/listings', icon: ListChecks, permission: 'listings.view' }],
  routes: [{ path: '/listings', element: <ListingsPage />, permission: 'listings.view' }],
};
