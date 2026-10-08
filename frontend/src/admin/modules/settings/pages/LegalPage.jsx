import { useAuth } from '@core/AuthContext';
import { Field, Input } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting, toNull, fromNull } from '../useSetting';

const DOCS = [
  { key: 'terms', title: 'Terms & Conditions' },
  { key: 'privacy', title: 'Privacy Policy' },
];

export default function LegalPage() {
  const state = useSetting('legal');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  return (
    <SettingsShell
      title="Legal Versions"
      subtitle="New users must accept the current version before using the app. Increase the version number after changing a document."
      state={state}
      canEdit={edit}
    >
      {v &&
        DOCS.map(({ key, title }) => (
          <div key={key} className="grid gap-4 rounded-xl border border-neutral-200 p-4 sm:grid-cols-[140px_1fr]">
            <Field label={`${title} version`}>
              <Input
                type="number"
                min="1"
                value={fromNull(v[key].version)}
                disabled={!edit}
                onChange={(e) => update({ [key]: { ...v[key], version: e.target.value ? Number(e.target.value) : null } })}
              />
            </Field>
            <Field label="Public URL of the document" hint="Opened from the app (host it on your website or the public web)">
              <Input
                type="url"
                placeholder="https://"
                value={fromNull(v[key].url)}
                disabled={!edit}
                onChange={(e) => update({ [key]: { ...v[key], url: toNull(e.target.value) } })}
              />
            </Field>
          </div>
        ))}
    </SettingsShell>
  );
}
