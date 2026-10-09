import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import ImageUpload from '@components/ImageUpload';
import { Badge, Button, Card, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Switch, Textarea } from '@components/ui';

const slugValue = (s) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');

/** Flatten the tree for a parent <select>, with indentation. Excludes a branch (when editing, to prevent cycles). */
const flatten = (nodes, exclude, depth = 0, out = []) => {
  for (const n of nodes) {
    if (n.id === exclude) continue;
    out.push({ id: n.id, label: `${'— '.repeat(depth)}${n.name}`, depth });
    flatten(n.children, exclude, depth + 1, out);
  }
  return out;
};

const DEFAULT_RULES = { minPhotos: 1, maxPhotos: 10, requiresReview: true, validityDays: 30 };

/* ───────── form-field (attribute) builder ───────── */

function AttributeEditor({ attrs, onChange, types, disabled }) {
  const set = (i, patch) => onChange(attrs.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const add = () => onChange([...attrs, { key: '', label: '', type: 'text', required: false, filterable: false, showOnCard: false, options: [] }]);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= attrs.length) return;
    const next = [...attrs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {attrs.length === 0 && <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">No form fields yet. Sellers will only see the common fields (title, description, price, photos, location).</p>}
      {attrs.map((a, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px]">
            <Field label="Label (English)">
              <Input
                value={a.label}
                disabled={disabled}
                onChange={(e) => set(i, { label: e.target.value, key: a.keyEdited ? a.key : slugValue(e.target.value) })}
              />
            </Field>
            <Field label="Key" hint="lowercase, no spaces">
              <Input value={a.key} disabled={disabled} onChange={(e) => set(i, { key: slugValue(e.target.value), keyEdited: true })} />
            </Field>
            <Field label="Type">
              <Select value={a.type} disabled={disabled} onChange={(e) => set(i, { type: e.target.value })}>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          {['select', 'multiselect'].includes(a.type) && (
            <div className="mt-3">
              <Field label="Options (one per line)">
                <Textarea
                  rows={3}
                  disabled={disabled}
                  value={a.options.map((o) => o.label).join('\n')}
                  onChange={(e) =>
                    set(i, {
                      options: e.target.value
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((label) => ({ label, value: slugValue(label) })),
                    })
                  }
                />
              </Field>
            </div>
          )}
          {a.type === 'number' && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field label="Unit (optional)"><Input value={a.unit || ''} disabled={disabled} onChange={(e) => set(i, { unit: e.target.value || undefined })} /></Field>
              <Field label="Min"><Input type="number" value={a.min ?? ''} disabled={disabled} onChange={(e) => set(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
              <Field label="Max"><Input type="number" value={a.max ?? ''} disabled={disabled} onChange={(e) => set(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {[['required', 'Required'], ['filterable', 'Use as filter'], ['showOnCard', 'Show on listing card']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={Boolean(a[k])} disabled={disabled} onChange={(e) => set(i, { [k]: e.target.checked })} /> {label}
              </label>
            ))}
            {!disabled && (
              <span className="ml-auto flex gap-1">
                <Button type="button" variant="outline" className="px-2 py-1" onClick={() => move(i, -1)}>↑</Button>
                <Button type="button" variant="outline" className="px-2 py-1" onClick={() => move(i, 1)}>↓</Button>
                <Button type="button" variant="outline" className="px-2 py-1" onClick={() => onChange(attrs.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
              </span>
            )}
          </div>
        </div>
      ))}
      {!disabled && <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add field</Button>}
    </div>
  );
}

/* ───────── category editor ───────── */

function CategoryForm({ node, parentId, tree, meta, canEdit, onClose, onSaved }) {
  const isNew = !node;
  const [tab, setTab] = useState('details');
  const [f, setF] = useState(() => ({
    name: node?.name || '',
    parentId: node ? node.parentId : parentId ?? null,
    order: node?.order ?? 0,
    status: node?.status || 'active',
    listingTypes: node?.listingTypes || [],
    icon: node?.icon || null,
    attributes: (node?.attributes || []).map((a) => ({ ...a, options: a.options || [], keyEdited: true })),
    rules: node?.rules || DEFAULT_RULES,
  }));
  const [busy, setBusy] = useState(false);
  const parents = useMemo(() => flatten(tree, node?.id), [tree, node]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        parentId: f.parentId || null,
        name: f.name,
        order: Number(f.order) || 0,
        status: f.status,
        listingTypes: f.listingTypes,
        icon: f.icon ? { url: f.icon.url, mediaId: f.icon.mediaId } : null,
        attributes: f.attributes.map(({ keyEdited, ...a }) => a),
        rules: f.rules,
      };
      if (isNew) await call(http.post('/categories', body));
      else await call(http.put(`/categories/${node.id}`, body));
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleType = (t) => setF((s) => ({ ...s, listingTypes: s.listingTypes.includes(t) ? s.listingTypes.filter((x) => x !== t) : [...s.listingTypes, t] }));

  return (
    <Modal
      open
      wide
      title={isNew ? 'New category' : `Edit: ${node.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {canEdit && <Button variant="brand" loading={busy} disabled={!f.name.trim()} onClick={save}>Save</Button>}
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {[['details', 'Details'], ['fields', `Form fields (${f.attributes.length})`], ['rules', 'Posting rules']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (English)" hint="Translated automatically for users of other languages">
              <Input value={f.name} maxLength={80} disabled={!canEdit} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Parent category">
              <Select value={f.parentId || ''} disabled={!canEdit} onChange={(e) => setF({ ...f, parentId: e.target.value || null })}>
                <option value="">— Top level —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Display order" hint="Lower numbers first">
              <Input type="number" min="0" value={f.order} disabled={!canEdit} onChange={(e) => setF({ ...f, order: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={f.status} disabled={!canEdit} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="active">Active (visible)</option>
                <option value="hidden">Hidden (no new ads; existing stay)</option>
              </Select>
            </Field>
          </div>
          <ImageUpload label="Icon" purpose="category" aspect="h-20 w-20" value={f.icon} onChange={(v) => setF({ ...f, icon: v })} />
          <div>
            <div className="mb-1 text-sm font-medium text-neutral-700">Allowed listing types</div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {meta.listingTypes.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm capitalize">
                  <input type="checkbox" checked={f.listingTypes.includes(t)} disabled={!canEdit} onChange={() => toggleType(t)} /> {t}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'fields' && <AttributeEditor attrs={f.attributes} types={meta.attributeTypes} disabled={!canEdit} onChange={(attributes) => setF({ ...f, attributes })} />}

      {tab === 'rules' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum photos"><Input type="number" min="0" max="30" value={f.rules.minPhotos} disabled={!canEdit} onChange={(e) => setF({ ...f, rules: { ...f.rules, minPhotos: Number(e.target.value) } })} /></Field>
          <Field label="Maximum photos"><Input type="number" min="1" max="30" value={f.rules.maxPhotos} disabled={!canEdit} onChange={(e) => setF({ ...f, rules: { ...f.rules, maxPhotos: Number(e.target.value) } })} /></Field>
          <Field label="Ad validity (days)"><Input type="number" min="1" max="365" value={f.rules.validityDays} disabled={!canEdit} onChange={(e) => setF({ ...f, rules: { ...f.rules, validityDays: Number(e.target.value) } })} /></Field>
          <div className="self-end">
            <Switch checked={f.rules.requiresReview} disabled={!canEdit} onChange={(v) => setF({ ...f, rules: { ...f.rules, requiresReview: v } })} label="Moderator review before publishing" />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ───────── pages ───────── */

/** A count card on top of the table. */
const StatCard = ({ label, value, tone = 'neutral', hint }) => (
  <Card className="py-3">
    <div className="text-xs uppercase text-neutral-500">{label}</div>
    <div className={`text-2xl font-bold ${tone === 'green' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'blue' ? 'text-blue-600' : 'text-neutral-900'}`}>{(value ?? 0).toLocaleString('en-IN')}</div>
    {hint && <div className="text-xs text-neutral-500">{hint}</div>}
  </Card>
);

/** Shared loader for both pages: the paged rows from the server, plus the tree + meta the edit form needs. */
function useCategoryTable(level) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [parentId, setParentId] = useState(() => new URLSearchParams(window.location.search).get('parentId') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [tree, setTree] = useState(null);
  const [fieldMeta, setFieldMeta] = useState(null);
  const [error, setError] = useState('');

  const loadRows = useCallback(() => {
    setError('');
    call(http.get('/categories/list', { params: { level, q: q || undefined, status: status || undefined, parentId: parentId || undefined, page, limit } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [level, q, status, parentId, page, limit]);

  const loadTree = useCallback(() => {
    Promise.all([call(http.get('/categories')), call(http.get('/categories/meta'))])
      .then(([t, m]) => {
        setTree(t.data);
        setFieldMeta(m.data);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    const t = setTimeout(loadRows, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadRows, q]);
  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const reload = () => {
    loadRows();
    loadTree();
  };
  const filter = (fn) => (v) => {
    fn(v);
    setPage(1);
  };
  return { q, setQ: filter(setQ), status, setStatus: filter(setStatus), parentId, setParentId: filter(setParentId), page, setPage, limit, setLimit: filter(setLimit), rows, meta, tree, fieldMeta, error, reload };
}

const Icon = ({ c }) => (c.icon?.url ? <img src={c.icon.url} alt="" className="h-9 w-9 rounded object-contain" /> : <div className="flex h-9 w-9 items-center justify-center rounded bg-neutral-100 text-sm font-semibold text-neutral-500">{c.name.charAt(0)}</div>);

function Filters({ t, showParent, tops }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="w-64"><Input placeholder="Search by name" value={t.q} onChange={(e) => t.setQ(e.target.value)} /></div>
      <div className="w-40"><Select value={t.status} onChange={(e) => t.setStatus(e.target.value)}>
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="hidden">Hidden</option>
      </Select></div>
      {showParent && (
        <div className="w-56"><Select value={t.parentId} onChange={(e) => t.setParentId(e.target.value)}>
          <option value="">All main categories</option>
          {(tops || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></div>
      )}
    </div>
  );
}

const useRemove = (reload) =>
  useCallback(
    async (row) => {
      if (!window.confirm(`Delete "${row.name}"?${row.subcategoryCount ? ` It has ${row.subcategoryCount} subcategories.` : ''}`)) return;
      try {
        await call(http.delete(`/categories/${row.id}`));
        toast.success('Deleted');
        reload();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [reload]
  );

function CategoriesPage() {
  const { can } = useAuth();
  const canEdit = can('categories.edit');
  const t = useCategoryTable('top');
  const [form, setForm] = useState(null); // { node?, parentId? }
  const [importing, setImporting] = useState(false);
  const remove = useRemove(t.reload);
  const s = t.meta?.stats;

  const importStarter = async () => {
    if (!window.confirm('Import the starter category list (Property, Vehicles, Electronics, Jobs, Services…)? You can edit or delete everything afterwards.')) return;
    setImporting(true);
    try {
      const { data } = await call(http.post('/categories/import-starter'));
      toast.success(`Imported ${data.count} categories`);
      t.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Main categories. Each has its own form fields, allowed listing types and rules. Manage the ones below them under Subcategories."
        actions={canEdit && <Button variant="brand" disabled={!t.tree} onClick={() => setForm({ parentId: null })}><Plus className="h-4 w-4" /> New category</Button>}
      />
      {s && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Main categories" value={s.total} />
          <StatCard label="Active" value={s.active} tone="green" />
          <StatCard label="Hidden" value={s.hidden} tone="amber" />
          <StatCard label="Subcategories" value={s.subcategories} tone="blue" />
          <StatCard label="With form fields" value={s.withFields} />
          <StatCard label="Live ads" value={s.liveAds} hint="across all categories" />
        </div>
      )}
      {t.error && <ErrorBox message={t.error} onRetry={t.reload} />}
      {!t.rows && !t.error && <Spinner />}
      {t.rows && s?.total === 0 && !t.q && !t.status ? (
        <Card className="py-12 text-center">
          <FolderTree className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
          <p className="font-semibold">No categories yet</p>
          <p className="mx-auto mb-4 mt-1 max-w-md text-sm text-neutral-500">Create your own, or start from the standard list used by classifieds (you can edit everything later).</p>
          {canEdit && (
            <div className="flex justify-center gap-2">
              <Button variant="brand" disabled={!t.tree} onClick={() => setForm({ parentId: null })}>Create the first category</Button>
              <Button variant="outline" loading={importing} onClick={importStarter}>Import starter list</Button>
            </div>
          )}
        </Card>
      ) : (
        t.rows && (
          <>
            <Filters t={t} />
            <DataTable
              rows={t.rows}
              empty="No categories match"
              columns={[
                { key: 'icon', header: '', render: (c) => <Icon c={c} /> },
                { key: 'name', header: 'Category', render: (c) => <div><div className="font-medium">{c.name}</div><div className="text-xs text-neutral-500">{c.listingTypes.join(', ') || 'all listing types'}</div></div> },
                { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'active' ? 'green' : 'amber'}>{c.status}</Badge> },
                { key: 'subs', header: 'Subcategories', render: (c) => (c.subcategoryCount ? <Link to={`/subcategories?parentId=${c.id}`} className="font-semibold text-blue-600 hover:underline">{c.subcategoryCount}</Link> : '0') },
                { key: 'fields', header: 'Form fields', render: (c) => c.attributes.length },
                { key: 'ads', header: 'Live ads', render: (c) => c.liveAds.toLocaleString('en-IN') },
                { key: 'order', header: 'Order', render: (c) => c.order },
                {
                  key: 'act',
                  header: '',
                  render: (c) =>
                    canEdit && (
                      <span className="flex justify-end gap-1">
                        <Button variant="outline" className="px-2 py-1" title="Edit" disabled={!t.tree} onClick={() => setForm({ node: c })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="outline" className="px-2 py-1" title="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
                      </span>
                    ),
                },
              ]}
            />
            <Pagination meta={t.meta} onPage={t.setPage} onLimit={t.setLimit} />
          </>
        )
      )}
      {form && t.tree && t.fieldMeta && <CategoryForm node={form.node} parentId={form.parentId} tree={t.tree} meta={t.fieldMeta} canEdit={canEdit} onClose={() => setForm(null)} onSaved={() => { setForm(null); t.reload(); }} />}
    </>
  );
}

function SubcategoriesPage() {
  const { can } = useAuth();
  const canEdit = can('categories.edit');
  const t = useCategoryTable('sub');
  const [form, setForm] = useState(null);
  const remove = useRemove(t.reload);
  const s = t.meta?.stats;
  const tops = t.tree || [];

  return (
    <>
      <PageHeader
        title="Subcategories"
        subtitle="Everything below a main category — this is where ads are posted. Filter by main category to work on one branch."
        actions={canEdit && <Button variant="brand" disabled={!t.tree || tops.length === 0} onClick={() => setForm({ parentId: t.parentId || tops[0]?.id })}><Plus className="h-4 w-4" /> New subcategory</Button>}
      />
      {s && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Subcategories" value={s.total} />
          <StatCard label="Active" value={s.active} tone="green" />
          <StatCard label="Hidden" value={s.hidden} tone="amber" />
          <StatCard label="With form fields" value={s.withFields} tone="blue" />
          <StatCard label="Nested (level 3+)" value={s.deeper} />
          <StatCard label="Live ads" value={s.liveAds} hint="across all categories" />
        </div>
      )}
      {t.error && <ErrorBox message={t.error} onRetry={t.reload} />}
      {!t.rows && !t.error && <Spinner />}
      {t.rows && (
        <>
          <Filters t={t} showParent tops={tops} />
          <DataTable
            rows={t.rows}
            empty={tops.length ? 'No subcategories match' : 'Create a main category first (Categories page)'}
            columns={[
              { key: 'icon', header: '', render: (c) => <Icon c={c} /> },
              { key: 'name', header: 'Subcategory', render: (c) => <div><div className="font-medium">{c.name}</div><div className="text-xs text-neutral-500">{c.path.join(' › ')}</div></div> },
              { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'active' ? 'green' : 'amber'}>{c.status}</Badge> },
              { key: 'types', header: 'Listing types', render: (c) => <span className="text-xs">{c.listingTypes.join(', ') || 'all'}</span> },
              { key: 'fields', header: 'Form fields', render: (c) => c.attributes.length },
              { key: 'rules', header: 'Photos · review', render: (c) => <span className="text-xs">{c.rules?.minPhotos ?? 0}–{c.rules?.maxPhotos ?? 0} · {c.rules?.requiresReview ? 'reviewed' : 'instant'}</span> },
              { key: 'ads', header: 'Live ads', render: (c) => c.liveAds.toLocaleString('en-IN') },
              {
                key: 'act',
                header: '',
                render: (c) =>
                  canEdit && (
                    <span className="flex justify-end gap-1">
                      <Button variant="outline" className="px-2 py-1" title="Edit" disabled={!t.tree} onClick={() => setForm({ node: c })}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" className="px-2 py-1" title="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  ),
              },
            ]}
          />
          <Pagination meta={t.meta} onPage={t.setPage} onLimit={t.setLimit} />
        </>
      )}
      {form && t.tree && t.fieldMeta && <CategoryForm node={form.node} parentId={form.parentId} tree={t.tree} meta={t.fieldMeta} canEdit={canEdit} onClose={() => setForm(null)} onSaved={() => { setForm(null); t.reload(); }} />}
    </>
  );
}

export default {
  key: 'categories',
  section: 'Management',
  nav: [
    { label: 'Categories', path: '/categories', icon: FolderTree, permission: 'categories.view' },
    { label: 'Subcategories', path: '/subcategories', icon: FolderOpen, permission: 'categories.view' },
  ],
  routes: [
    { path: '/categories', element: <CategoriesPage />, permission: 'categories.view' },
    { path: '/subcategories', element: <SubcategoriesPage />, permission: 'categories.view' },
  ],
};
