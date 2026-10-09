import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage, uploadImage } from '@core/api';
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '@components/ui';
import { PlaceSearch } from '../settings/pages/LocationPage';

/** Leaf categories that allow auctions, with their full path for the picker. */
const auctionLeaves = (nodes, path = [], out = []) => {
  for (const n of nodes) {
    if (n.status !== 'active') continue;
    const here = [...path, n.name];
    if (n.children?.length) auctionLeaves(n.children, here, out);
    else if (!n.listingTypes?.length || n.listingTypes.includes('auction')) out.push({ ...n, label: here.join(' › ') });
  }
  return out;
};

/** Find the seller account by name or phone. */
function SellerSearch({ value, onPick }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      return undefined;
    }
    timer.current = setTimeout(() => {
      call(http.get('/auctions/sellers', { params: { q: q.trim() } }))
        .then((r) => setItems(r.data))
        .catch((e) => toast.error(errorMessage(e)));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm">
        <span><span className="font-medium">{value.name || 'No name'}</span> <span className="text-neutral-500">{value.phone}</span></span>
        <button type="button" className="text-neutral-500 hover:text-neutral-900" onClick={() => onPick(null)} aria-label="Change seller"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input placeholder="Seller's name or mobile number" value={q} onChange={(e) => setQ(e.target.value)} />
      {items.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {items.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => { onPick(u); setQ(''); setItems([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50">
                <span className="font-medium">{u.name || 'No name'}</span> <span className="text-neutral-500">{u.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && items.length === 0 && <p className="mt-1 text-xs text-neutral-500">No matching user. The seller must sign up in the app first.</p>}
    </div>
  );
}

/** One input per category form field (same rules the app applies). */
function AttributeInput({ a, value, onChange }) {
  if (a.type === 'select') {
    return (
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {a.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  }
  if (a.type === 'multiselect') {
    const set = new Set(value || []);
    return (
      <div className="flex flex-wrap gap-2">
        {a.options.map((o) => (
          <label key={o.value} className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={set.has(o.value)} onChange={(e) => { if (e.target.checked) set.add(o.value); else set.delete(o.value); onChange([...set]); }} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (a.type === 'boolean') {
    return (
      <Select value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  }
  if (a.type === 'textarea') return <Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
  const numeric = ['number', 'year'].includes(a.type);
  return (
    <Input
      type={a.type === 'date' ? 'date' : numeric ? 'number' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : numeric ? Number(e.target.value) : e.target.value)}
    />
  );
}

const EMPTY = { title: '', description: '', startingBid: '', reservePrice: '', buyNowPrice: '', increment: '', startAt: '', durationHours: '72', note: '' };

/**
 * Admin-Managed auction (SOP §6.2): our team lists an item for a seller account and runs it.
 * It opens straight away (or at the chosen start) without the review queue; the seller gets
 * the result and handles the deal as usual. Recorded in the audit log.
 */
export default function ManagedAuctionForm({ onClose, onCreated }) {
  const [tree, setTree] = useState(null);
  const [seller, setSeller] = useState(null);
  const [categoryId, setCategoryId] = useState('');
  const [attrs, setAttrs] = useState({});
  const [place, setPlace] = useState(null);
  const [photos, setPhotos] = useState([]); // { id, url } | { key, uploading: true }
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    call(http.get('/categories')).then((r) => setTree(r.data)).catch((e) => toast.error(errorMessage(e)));
  }, []);
  const leaves = useMemo(() => (tree ? auctionLeaves(tree) : []), [tree]);
  const category = leaves.find((c) => c.id === categoryId);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  const addPhotos = async (files) => {
    for (const file of [...files]) {
      const key = `${file.name}-${Math.random()}`;
      setPhotos((p) => [...p, { key, uploading: true }]);
      try {
        const up = await uploadImage(file, 'listing');
        setPhotos((p) => p.map((x) => (x.key === key ? { key, id: up.id, url: up.url } : x)));
      } catch (e) {
        setPhotos((p) => p.filter((x) => x.key !== key));
        toast.error(errorMessage(e));
      }
    }
  };

  const num = (v) => (v === '' ? null : Number(v));
  const ready = seller && category && place && f.title.trim().length >= 3 && f.description.trim().length >= 10 && Number(f.startingBid) > 0 && Number(f.durationHours) > 0 && !photos.some((p) => p.uploading);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        sellerId: seller.id,
        note: f.note.trim() || undefined,
        categoryId,
        title: f.title.trim(),
        description: f.description.trim(),
        attributes: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== '')),
        mediaIds: photos.map((p) => p.id),
        location: { label: place.label, name: place.name, placeId: place.placeId, lat: place.lat, lng: place.lng, address: place.address ?? {} },
        auction: {
          startingBid: Number(f.startingBid),
          reservePrice: num(f.reservePrice),
          buyNowPrice: num(f.buyNowPrice),
          increment: num(f.increment),
          startAt: f.startAt ? new Date(f.startAt).toISOString() : null,
          durationHours: Number(f.durationHours),
        },
      };
      const { data } = await call(http.post('/auctions', body));
      toast.success(data.status === 'live' ? 'Auction is live' : 'Auction scheduled');
      onCreated(data.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="New managed auction"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="brand" loading={saving} disabled={!ready} onClick={save}>Create and open</Button>
        </>
      }
    >
      {!tree ? (
        <Spinner />
      ) : (
        <div className="space-y-5 text-sm">
          <p className="rounded-lg bg-blue-50 p-3 text-blue-900">
            Our team lists and runs this auction for the seller. It skips the review queue, shows a “Managed by our team” label, and the seller account receives the result and handles the deal.
          </p>

          <Field label="Seller account" hint="The person or organisation selling the item. They must have signed up in the app.">
            <SellerSearch value={seller} onPick={setSeller} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setAttrs({}); }}>
                <option value="">Choose…</option>
                {leaves.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Item location" hint={place ? undefined : 'Search the map'}>
              {place ? (
                <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
                  <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-neutral-500" />{place.label}</span>
                  <button type="button" onClick={() => setPlace(null)} aria-label="Change location" className="text-neutral-500 hover:text-neutral-900"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <PlaceSearch onPick={setPlace} placeholder="Town, village or area…" />
              )}
            </Field>
          </div>

          <Field label="Title"><Input maxLength={80} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={4} maxLength={2000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>

          {category?.attributes?.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {category.attributes.map((a) => (
                <Field key={a.key} label={`${a.label}${a.required ? ' *' : ''}${a.unit ? ` (${a.unit})` : ''}`}>
                  <AttributeInput a={a} value={attrs[a.key]} onChange={(v) => setAttrs((x) => ({ ...x, [a.key]: v }))} />
                </Field>
              ))}
            </div>
          )}

          <Field label={`Photos${category ? ` (${category.rules?.minPhotos ?? 0}–${category.rules?.maxPhotos ?? 10})` : ''}`}>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.key} className="relative h-20 w-20">
                  {p.uploading ? <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-neutral-100"><Spinner /></div> : <img src={p.url} alt="" className="h-20 w-20 rounded-lg border object-cover" />}
                  {!p.uploading && (
                    <button type="button" onClick={() => setPhotos((x) => x.filter((y) => y.key !== p.key))} className="absolute -right-2 -top-2 rounded-full bg-neutral-900 p-1 text-white" aria-label="Remove photo">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => fileInput.current?.click()} className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:bg-neutral-50" aria-label="Add photos">
                <ImagePlus className="h-6 w-6" />
              </button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starting bid *"><Input type="number" min="1" value={f.startingBid} onChange={(e) => set({ startingBid: e.target.value })} /></Field>
            <Field label="Reserve price" hint="Hidden from bidders"><Input type="number" min="1" value={f.reservePrice} onChange={(e) => set({ reservePrice: e.target.value })} /></Field>
            <Field label="Buy-now price"><Input type="number" min="1" value={f.buyNowPrice} onChange={(e) => set({ buyNowPrice: e.target.value })} /></Field>
            <Field label="Bid step" hint="Empty = platform table"><Input type="number" min="1" value={f.increment} onChange={(e) => set({ increment: e.target.value })} /></Field>
            <Field label="Starts" hint="Empty = now"><Input type="datetime-local" value={f.startAt} onChange={(e) => set({ startAt: e.target.value })} /></Field>
            <Field label="Runs for (hours) *"><Input type="number" min="1" value={f.durationHours} onChange={(e) => set({ durationHours: e.target.value })} /></Field>
          </div>

          <Field label="Internal note" hint="Why our team runs this auction (shown only in the admin panel and audit log)">
            <Input maxLength={500} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Bank-owned vehicle, papers verified" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
