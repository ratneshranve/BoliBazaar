import { useCallback, useEffect, useState } from 'react';
import { ListChecks, MapPin } from 'lucide-react';
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

  const canModerate = can('listings.moderate');
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

  const load = useCallback(() => {
    setError('');
    call(http.get('/listings', { params: { status: tab || undefined, q: q || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <>
      <PageHeader title="Listings" subtitle="Review new ads before they go live, and manage existing ones" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t.key ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            {t.label}
            {t.key === 'pending_review' && meta?.pending > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{meta.pending}</span>}
          </button>
        ))}
        <div className="ml-auto w-64">
          <Input placeholder="Search title or ad number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty={tab === 'pending_review' ? 'Nothing waiting for review 🎉' : 'No listings'}
            onRowClick={(r) => setSelected(r.id)}
            columns={[
              { key: 'cover', header: '', render: (r) => (r.cover ? <img src={r.cover} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-neutral-100" />) },
              { key: 'title', header: 'Ad', render: (r) => (<div><div className="font-medium">{r.title}</div><div className="font-mono text-xs text-neutral-500">{r.listingNo}</div></div>) },
              { key: 'price', header: 'Price', render: (r) => money(r.price) },
              { key: 'owner', header: 'Seller', render: (r) => r.owner?.name || r.owner?.phone || '—' },
              { key: 'place', header: 'Place' },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={TONE[r.status]}>{LABEL[r.status] || r.status}</Badge> },
              { key: 'createdAt', header: 'Posted', render: (r) => new Date(r.createdAt).toLocaleString() },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {selected && <ListingReview id={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

export default {
  key: 'listings',
  section: 'Management',
  nav: [{ label: 'Listings', path: '/listings', icon: ListChecks, permission: 'listings.view' }],
  routes: [{ path: '/listings', element: <ListingsPage />, permission: 'listings.view' }],
};
