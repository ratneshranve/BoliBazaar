import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Textarea } from '@components/ui';

const GROUP_LABEL = { chat: 'Messages', listings: 'Ads', jobs: 'Applications & enquiries', system: 'System' };

function TemplateCard({ tpl, canEdit, onSaved }) {
  const [form, setForm] = useState({ title: tpl.title, body: tpl.body, enabled: tpl.enabled });
  const [saving, setSaving] = useState(false);
  const dirty = form.title !== tpl.title || form.body !== tpl.body || form.enabled !== tpl.enabled;

  const save = async () => {
    setSaving(true);
    try {
      await call(http.put(`/notifications/templates/${tpl.event}`, form));
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <code className="text-sm font-semibold text-neutral-800">{tpl.event}</code>
          <Badge tone="neutral">{GROUP_LABEL[tpl.group] || tpl.group}</Badge>
          {tpl.pushOnly && <Badge tone="amber">Phone push only</Badge>}
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={form.enabled} disabled={!canEdit} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Send this notification
        </label>
      </div>
      <Field label="Title">
        <Input value={form.title} maxLength={120} disabled={!canEdit} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>
      <Field label="Message" hint={`Variables you can use: ${tpl.vars.map((v) => `{{${v}}}`).join('  ')}`}>
        <Textarea rows={2} value={form.body} maxLength={400} disabled={!canEdit} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="brand" loading={saving} disabled={!dirty || !form.title.trim() || !form.body.trim()} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}

function Notifications() {
  const { can } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems((await call(http.get('/notifications/templates'))).data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!items) return <Spinner />;

  return (
    <>
      <PageHeader title="Notifications" subtitle="The wording of every alert users receive. Write in English — each user gets it translated into their own language automatically." />
      <div className="space-y-4">
        {items.map((t) => (
          <TemplateCard key={`${t.event}:${t.updatedAt}`} tpl={t} canEdit={can('notifications.edit')} onSaved={load} />
        ))}
      </div>
    </>
  );
}

export default {
  key: 'notifications',
  section: 'Configuration',
  nav: [{ label: 'Notifications', path: '/notifications', icon: Bell, permission: 'notifications.view' }],
  routes: [{ path: '/notifications', element: <Notifications />, permission: 'notifications.view' }],
};
