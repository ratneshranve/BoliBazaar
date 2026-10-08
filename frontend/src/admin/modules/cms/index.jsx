import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Textarea } from '@components/ui';

const TABS = [
  { slug: 'terms', label: 'Terms & Conditions', note: 'Users must accept the current version when they sign up.' },
  { slug: 'privacy', label: 'Privacy Policy', note: 'Users must accept the current version when they sign up.' },
  { slug: 'support', label: 'Help & Support', note: 'Shown on the Help & Support screen in the app.' },
];

function PageEditor({ slug, note, canEdit }) {
  const [page, setPage] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await call(http.get(`/cms/pages/${slug}`));
      setPage(data);
      setForm({ title: data.title, body: data.body });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [slug]);

  useEffect(() => {
    setPage(null);
    load();
  }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!page || !form) return <Spinner />;

  const dirty = form.title !== page.title || form.body !== page.body;
  const valid = form.title.trim() && form.body.trim();

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await call(http.put(`/cms/pages/${slug}`, { title: form.title, body: form.body }));
      setPage(data);
      setForm({ title: data.title, body: data.body });
      toast.success(`Saved — version ${data.version}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">{note}</p>
        <div className="flex items-center gap-2 text-sm">
          {page.version > 0 ? <Badge tone="green">Published · version {page.version}</Badge> : <Badge tone="amber">Not published</Badge>}
          {page.updatedAt && <span className="text-neutral-500">Updated {new Date(page.updatedAt).toLocaleString()}</span>}
        </div>
      </div>

      <Field label="Title">
        <Input value={form.title} maxLength={120} disabled={!canEdit} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>
      <Field label="Content (English)" hint={`${form.body.length.toLocaleString()} characters · plain text, blank line between paragraphs · translated automatically for users of other languages`}>
        <Textarea rows={18} value={form.body} disabled={!canEdit} onChange={(e) => setForm({ ...form, body: e.target.value })} className="font-sans leading-relaxed" />
      </Field>

      {canEdit && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">Changing the content creates a new version. Changes go live in the app immediately.</p>
          <Button variant="brand" loading={saving} disabled={!dirty || !valid} onClick={save}>
            Save &amp; publish
          </Button>
        </div>
      )}
    </Card>
  );
}

function ContentPages() {
  const { can } = useAuth();
  const [tab, setTab] = useState(TABS[0].slug);
  const current = TABS.find((t) => t.slug === tab);
  return (
    <>
      <PageHeader title="Content Pages" subtitle="Terms, Privacy and Support text shown inside the app. Write in English; other languages are translated automatically." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.slug} onClick={() => setTab(t.slug)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t.slug ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <PageEditor key={current.slug} slug={current.slug} note={current.note} canEdit={can('cms.edit')} />
    </>
  );
}

export default {
  key: 'cms',
  section: 'Configuration',
  nav: [{ label: 'Content Pages', path: '/content-pages', icon: FileText, permission: 'cms.view' }],
  routes: [{ path: '/content-pages', element: <ContentPages />, permission: 'cms.view' }],
};
