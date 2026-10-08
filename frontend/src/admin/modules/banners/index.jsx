import { useCallback, useEffect, useState } from 'react';
import { GalleryHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import ImageUpload from '@components/ImageUpload';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from '@components/ui';

const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const flatten = (nodes, depth = 0, out = []) => {
  nodes.forEach((n) => {
    out.push({ id: n.id, label: `${'— '.repeat(depth)}${n.name}` });
    flatten(n.children, depth + 1, out);
  });
  return out;
};

function BannerForm({ banner, categories, onClose, onSaved }) {
  const [f, setF] = useState({
    title: banner?.title || '',
    subtitle: banner?.subtitle || '',
    image: banner?.image || null,
    actionType: banner?.action.type || 'none',
    categoryId: banner?.action.categoryId || '',
    order: banner?.order ?? 0,
    status: banner?.status || 'active',
    startAt: toLocal(banner?.startAt),
    endAt: toLocal(banner?.endAt),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        title: f.title,
        subtitle: f.subtitle,
        image: { url: f.image.url, mediaId: f.image.mediaId },
        action: f.actionType === 'category' ? { type: 'category', categoryId: f.categoryId } : { type: 'none' },
        order: Number(f.order) || 0,
        status: f.status,
        startAt: f.startAt ? new Date(f.startAt).toISOString() : null,
        endAt: f.endAt ? new Date(f.endAt).toISOString() : null,
      };
      if (banner) await call(http.put(`/cms/banners/${banner.id}`, body));
      else await call(http.post('/cms/banners', body));
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={banner ? 'Edit banner' : 'New banner'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="brand" loading={busy} disabled={!f.image || (f.actionType === 'category' && !f.categoryId)} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ImageUpload label="Banner image *" purpose="banner" aspect="h-28 w-56" value={f.image} onChange={(v) => setF({ ...f, image: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (optional)" hint="English — translated automatically"><Input value={f.title} maxLength={80} onChange={set('title')} /></Field>
          <Field label="Subtitle (optional)"><Input value={f.subtitle} maxLength={160} onChange={set('subtitle')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When tapped">
            <Select value={f.actionType} onChange={set('actionType')}>
              <option value="none">Nothing</option>
              <option value="category">Open a category</option>
            </Select>
          </Field>
          {f.actionType === 'category' && (
            <Field label="Category">
              <Select value={f.categoryId} onChange={set('categoryId')}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Order" hint="Lower first"><Input type="number" min="0" value={f.order} onChange={set('order')} /></Field>
          <Field label="Show from"><Input type="datetime-local" value={f.startAt} onChange={set('startAt')} /></Field>
          <Field label="Show until"><Input type="datetime-local" value={f.endAt} onChange={set('endAt')} /></Field>
        </div>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')} className="max-w-48">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

const state = (b) => {
  const now = Date.now();
  if (b.status === 'paused') return ['neutral', 'Paused'];
  if (b.startAt && new Date(b.startAt).getTime() > now) return ['blue', 'Scheduled'];
  if (b.endAt && new Date(b.endAt).getTime() < now) return ['amber', 'Expired'];
  return ['green', 'Live'];
};

function BannersPage() {
  const { can } = useAuth();
  const canEdit = can('cms.edit');
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [b, c] = await Promise.all([call(http.get('/cms/banners')), call(http.get('/categories'))]);
      setItems(b.data);
      setCategories(flatten(c.data));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (b) => {
    if (!window.confirm('Delete this banner?')) return;
    try {
      await call(http.delete(`/cms/banners/${b.id}`));
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!items) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Banners"
        subtitle="Promotional images shown at the top of the app's home screen"
        actions={canEdit && <Button variant="brand" onClick={() => setForm({})}><Plus className="h-4 w-4" /> New banner</Button>}
      />
      {items.length === 0 ? (
        <Card className="py-12 text-center">
          <GalleryHorizontal className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
          <p className="font-semibold">No banners yet</p>
          <p className="mt-1 text-sm text-neutral-500">The home screen shows no banner area until at least one is live.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => {
            const [tone, label] = state(b);
            return (
              <Card key={b.id} className="overflow-hidden p-0">
                <img src={b.image.url} alt="" className="h-36 w-full bg-neutral-100 object-cover" />
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <Badge tone={tone}>{label}</Badge>
                    <span className="text-xs text-neutral-500">Order {b.order}</span>
                  </div>
                  <div className="font-semibold">{b.title || <span className="text-neutral-400">No title</span>}</div>
                  <div className="text-xs text-neutral-500">
                    {b.startAt ? `From ${new Date(b.startAt).toLocaleDateString()} ` : ''}
                    {b.endAt ? `until ${new Date(b.endAt).toLocaleDateString()}` : ''}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" onClick={() => setForm({ banner: b })}><Pencil className="h-4 w-4" /> Edit</Button>
                      <Button variant="outline" onClick={() => remove(b)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {form && <BannerForm banner={form.banner} categories={categories} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </>
  );
}

export default {
  key: 'banners',
  section: 'Configuration',
  nav: [{ label: 'Banners', path: '/banners', icon: GalleryHorizontal, permission: 'cms.view' }],
  routes: [{ path: '/banners', element: <BannersPage />, permission: 'cms.view' }],
};
