import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage, uploadImage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Switch } from '@components/ui';

/** SOP 15.5 advertising products. */
const TYPES = {
  banner: { label: 'Website Banner Ad', hint: 'Shown in the home page banner carousel, labelled "Ad".' },
  sponsored_listing: { label: 'Sponsored Listing', hint: 'An ad shown at the top of search results, labelled "Sponsored".' },
  category_sponsorship: { label: 'Category Sponsorship', hint: 'A banner on top of a category\'s results, labelled "Sponsored".' },
  business_promotion: { label: 'Business Promotion', hint: 'A business profile in the home page "Promoted businesses" row.' },
};
const fmt = (minor, currency, factor = 100) => (currency ? new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / factor) : '—');
const toDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const in30 = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

function AdForm({ ad, onClose, onSaved }) {
  const [f, setF] = useState(
    ad
      ? { type: ad.type, advertiserName: ad.advertiser.name, advertiserContact: ad.advertiser.contact || '', title: ad.title || '', subtitle: ad.subtitle || '', image: ad.image, route: ad.route || '', listingNo: ad.listing?.listingNo || '', categoryId: ad.category?.id || '', sellerPublicId: ad.seller?.publicId || '', startAt: toDate(ad.startAt), endAt: toDate(ad.endAt), status: ad.status, price: ad.priceMinor / ad.factor, paid: ad.paid, paymentNote: ad.paymentNote || '' }
      : { type: 'banner', advertiserName: '', advertiserContact: '', title: '', subtitle: '', image: null, route: '', listingNo: '', categoryId: '', sellerPublicId: '', startAt: today(), endAt: in30(), status: 'active', price: 0, paid: false, paymentNote: '' }
  );
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    call(http.get('/categories'))
      .then(({ data }) => {
        const flat = [];
        const walk = (nodes, prefix) => nodes.forEach((c) => { flat.push({ id: c.id, name: prefix + c.name }); walk(c.children || [], `${prefix}${c.name} › `); });
        walk(data, '');
        setCategories(flat);
      })
      .catch(() => {});
  }, []);

  const pick = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const m = await uploadImage(file, 'banner');
      set({ image: { url: m.url, mediaId: m.id } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    const body = {
      type: f.type,
      advertiser: { name: f.advertiserName.trim(), contact: f.advertiserContact.trim() || undefined },
      title: f.title.trim() || undefined,
      subtitle: f.subtitle.trim() || undefined,
      image: f.image || null,
      route: f.route.trim() || undefined,
      listingNo: f.type === 'sponsored_listing' ? f.listingNo.trim() : undefined,
      categoryId: f.type === 'category_sponsorship' ? f.categoryId || undefined : undefined,
      sellerPublicId: f.type === 'business_promotion' ? f.sellerPublicId.trim() : undefined,
      startAt: f.startAt,
      endAt: `${f.endAt}T23:59:59`,
      status: f.status,
      price: Number(f.price) || 0,
      paid: f.paid,
      paymentNote: f.paymentNote.trim() || undefined,
    };
    try {
      await call(ad ? http.put(`/ads/${ad.id}`, body) : http.post('/ads', body));
      toast.success('Saved');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const needsImage = ['banner', 'category_sponsorship'].includes(f.type);
  return (
    <Modal open wide title={ad ? 'Edit ad' : 'New ad'} onClose={onClose} footer={<Button variant="brand" loading={busy} disabled={!f.advertiserName.trim() || uploading} onClick={save}>Save</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" hint={TYPES[f.type].hint}>
          <Select value={f.type} onChange={(e) => set({ type: e.target.value })} disabled={Boolean(ad)}>
            {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Advertiser"><Input value={f.advertiserName} onChange={(e) => set({ advertiserName: e.target.value })} placeholder="Company or person" /></Field>
        <Field label="Advertiser contact (optional)"><Input value={f.advertiserContact} onChange={(e) => set({ advertiserContact: e.target.value })} placeholder="Phone or email" /></Field>
        {f.type === 'sponsored_listing' && <Field label="Ad number to sponsor" hint="e.g. LDEMO003 — shown on the ad's detail in Listings"><Input value={f.listingNo} onChange={(e) => set({ listingNo: e.target.value.toUpperCase() })} className="font-mono" /></Field>}
        {f.type === 'category_sponsorship' && (
          <Field label="Category">
            <Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        {f.type === 'business_promotion' && <Field label="Business profile id" hint="The id in the seller's profile link: /u/<id>"><Input value={f.sellerPublicId} onChange={(e) => set({ sellerPublicId: e.target.value })} className="font-mono" /></Field>}
        {f.type !== 'sponsored_listing' && (
          <>
            <Field label="Title"><Input value={f.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Subtitle (optional)"><Input value={f.subtitle} maxLength={160} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
          </>
        )}
        {['banner', 'category_sponsorship'].includes(f.type) && <Field label="Opens (app path, optional)" hint="e.g. /search?q=bike or /u/<id>"><Input value={f.route} onChange={(e) => set({ route: e.target.value })} /></Field>}
        {f.type !== 'sponsored_listing' && (
          <Field label={`Picture${needsImage ? '' : ' (optional)'}`}>
            <div className="flex items-center gap-3">
              {f.image?.url && <img src={f.image.url} alt="" className="h-14 w-24 rounded object-cover" />}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
              {uploading && <span className="text-xs text-neutral-500">Uploading…</span>}
            </div>
          </Field>
        )}
        <Field label="Starts"><Input type="date" value={f.startAt} onChange={(e) => set({ startAt: e.target.value })} /></Field>
        <Field label="Ends"><Input type="date" value={f.endAt} onChange={(e) => set({ endAt: e.target.value })} /></Field>
        <Field label="Price charged"><Input type="number" value={f.price} onChange={(e) => set({ price: e.target.value })} /></Field>
        <Field label="Payment reference (optional)"><Input value={f.paymentNote} onChange={(e) => set({ paymentNote: e.target.value })} placeholder="Invoice or transfer no." /></Field>
        <Switch checked={f.paid} onChange={(x) => set({ paid: x })} label="Paid" description="Counts in revenue reports from the day it is marked paid." />
        <Switch checked={f.status === 'active'} onChange={(x) => set({ status: x ? 'active' : 'paused' })} label="Showing" description="Turn off to pause the ad." />
      </div>
    </Modal>
  );
}

function AdsPage() {
  const { can } = useAuth();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined);

  const load = useCallback(() => {
    setError('');
    call(http.get('/ads', { params: { type: type || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [type, page]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Ads Manager" subtitle="Advertising revenue (SOP §15.5): banner ads, sponsored listings, category sponsorship and business promotions. Every ad is shown to users as Ad / Sponsored." actions={can('ads.edit') && <Button variant="brand" onClick={() => setEditing(null)}>New ad</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[['', 'All'], ...Object.entries(TYPES).map(([k, t]) => [k, t.label])].map(([k, l]) => (
          <button key={k} onClick={() => { setType(k); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${type === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>{l}</button>
        ))}
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="No ads yet"
            onRowClick={can('ads.edit') ? (a) => setEditing(a) : undefined}
            columns={[
              { key: 'type', header: 'Product', render: (a) => TYPES[a.type].label },
              { key: 'advertiser', header: 'Advertiser', render: (a) => <div><div className="font-medium">{a.advertiser.name}</div><div className="text-xs text-neutral-500">{a.title || a.listing?.title || a.category?.name || a.seller?.name || ''}</div></div> },
              { key: 'dates', header: 'Runs', render: (a) => `${new Date(a.startAt).toLocaleDateString()} → ${new Date(a.endAt).toLocaleDateString()}` },
              { key: 'status', header: 'Status', render: (a) => <Badge tone={a.running ? 'green' : 'neutral'}>{a.running ? 'Showing' : a.status === 'paused' ? 'Paused' : 'Not running'}</Badge> },
              { key: 'price', header: 'Price', render: (a) => <span>{fmt(a.priceMinor, a.currency, a.factor)} {a.paid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid</Badge>}</span> },
              { key: 'stats', header: 'Views / taps', render: (a) => `${a.impressions.toLocaleString('en-IN')} / ${a.clicks.toLocaleString('en-IN')}` },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {editing !== undefined && <AdForm ad={editing} onClose={() => setEditing(undefined)} onSaved={load} />}
    </>
  );
}

export default {
  key: 'ads',
  section: 'Management',
  nav: [{ label: 'Ads Manager', path: '/ads', icon: Megaphone, permission: 'ads.view' }],
  routes: [{ path: '/ads', element: <AdsPage />, permission: 'ads.view' }],
};
