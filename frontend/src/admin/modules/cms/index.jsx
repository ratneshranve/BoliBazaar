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

// Languages the app supports. English is required (it is the fallback for every other language).
const LANGS = [
  { code: 'en', label: 'English', required: true },
  { code: 'hi', label: 'हिन्दी (Hindi)', required: false },
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
      setForm({ title: { ...data.title }, body: { ...data.body } });
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

  const setLang = (field, code, value) => setForm((f) => ({ ...f, [field]: { ...f[field], [code]: value } }));
  const dirty = JSON.stringify(form) !== JSON.stringify({ title: page.title, body: page.body });
  const valid = form.title.en?.trim() && form.body.en?.trim();

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await call(http.put(`/cms/pages/${slug}`, form));
      setPage(data);
      setForm({ title: { ...data.title }, body: { ...data.body } });
      toast.success(`Saved — version ${data.version}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">{note}</p>
        <div className="flex items-center gap-2 text-sm">
          {page.version > 0 ? <Badge tone="green">Published · version {page.version}</Badge> : <Badge tone="amber">Not published</Badge>}
          {page.updatedAt && <span className="text-neutral-500">Updated {new Date(page.updatedAt).toLocaleString()}</span>}
        </div>
      </div>

      {LANGS.map(({ code, label, required }) => (
        <div key={code} className="space-y-3 rounded-xl border border-neutral-200 p-4">
          <div className="text-sm font-semibold">
            {label} {required ? <span className="text-red-600">*</span> : <span className="font-normal text-neutral-500">(optional — falls back to English)</span>}
          </div>
          <Field label="Title">
            <Input value={form.title[code] || ''} maxLength={120} disabled={!canEdit} onChange={(e) => setLang('title', code, e.target.value)} />
          </Field>
          <Field label="Content" hint={`${(form.body[code] || '').length.toLocaleString()} characters · plain text, blank line between paragraphs`}>
            <Textarea rows={14} value={form.body[code] || ''} disabled={!canEdit} onChange={(e) => setLang('body', code, e.target.value)} className="font-sans leading-relaxed" />
          </Field>
        </div>
      ))}

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
      <PageHeader title="Content Pages" subtitle="Terms, Privacy and Support text shown inside the app — no external web pages needed" />
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
