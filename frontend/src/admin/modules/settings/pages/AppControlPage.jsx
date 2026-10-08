import { useAuth } from '@core/AuthContext';
import { Field, Input, Switch, Textarea } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting, toNull, fromNull } from '../useSetting';

const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function AppControlPage() {
  const state = useSetting('appControl');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  const m = v?.maintenance;
  const setM = (patch) => update({ maintenance: { ...m, ...patch } });

  return (
    <SettingsShell title="Maintenance" subtitle="Temporarily close the user app while you make changes" state={state} canEdit={edit}>
      {v && (
        <div className={`rounded-xl border p-4 ${m.enabled ? 'border-amber-300 bg-amber-50' : 'border-neutral-200'}`}>
          <Switch
            checked={m.enabled}
            disabled={!edit}
            onChange={(x) => setM({ enabled: x })}
            label="Maintenance mode"
            description="When ON, the user app shows the maintenance screen and the API rejects user requests."
          />
          <div className="mt-3 grid gap-4">
            <Field label="Title">
              <Input value={fromNull(m.title)} disabled={!edit} maxLength={80} onChange={(e) => setM({ title: toNull(e.target.value) })} />
            </Field>
            <Field label="Message">
              <Textarea value={fromNull(m.message)} disabled={!edit} maxLength={500} onChange={(e) => setM({ message: toNull(e.target.value) })} />
            </Field>
            <Field label="Expected back at" hint="Optional — shown to users">
              <Input
                type="datetime-local"
                value={toLocalInput(m.until)}
                disabled={!edit}
                onChange={(e) => setM({ until: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </Field>
            <Field label="Tester user IDs allowed during maintenance" hint="One user ID per line (from Users › details). They can still use the app.">
              <Textarea
                value={m.allowUserIds.join('\n')}
                disabled={!edit}
                onChange={(e) => setM({ allowUserIds: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              />
            </Field>
          </div>
        </div>
      )}
    </SettingsShell>
  );
}
