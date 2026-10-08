import { useEffect, useState } from 'react';
import { call, http } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Field, Select, Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

export default function LanguagesPage() {
  const state = useSetting('languages');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const [catalogue, setCatalogue] = useState([]);
  const [translateReady, setTranslateReady] = useState(null);
  const { value: v, update } = state;

  useEffect(() => {
    call(http.get('/settings/language-catalogue')).then(({ data }) => setCatalogue(data));
    call(http.get('/settings/integrations')).then(({ data }) => setTranslateReady(data.translate.configured));
  }, []);

  const toggle = (code, on) => {
    const enabled = on ? [...v.enabled, code] : v.enabled.filter((c) => c !== code);
    update({ enabled, default: enabled.includes(v.default) ? v.default : 'en' });
  };

  return (
    <SettingsShell
      title="Languages"
      subtitle="Choose which languages users can pick. Content you write in English is translated automatically for each user's language."
      state={state}
      canEdit={edit}
    >
      {translateReady === false && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Automatic translation is not set up on the server, so users will see English everywhere. Add <code>GOOGLE_TRANSLATE_API_KEY</code> to the backend{' '}
          <code>.env</code> and restart it.
        </div>
      )}
      {v && (
        <>
          <Field label="Default language" hint="Used when the user hasn't picked one">
            <Select value={v.default} disabled={!edit} onChange={(e) => update({ default: e.target.value })} className="max-w-xs">
              {catalogue
                .filter((l) => v.enabled.includes(l.code))
                .map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} — {l.nativeName}
                  </option>
                ))}
            </Select>
          </Field>

          <div>
            <div className="mb-1 text-sm font-medium text-neutral-700">Available languages</div>
            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 px-4">
              {catalogue.map((l) => (
                <Switch
                  key={l.code}
                  checked={v.enabled.includes(l.code)}
                  disabled={!edit || l.code === 'en'}
                  onChange={(on) => toggle(l.code, on)}
                  label={
                    <span>
                      {l.name} <span className="text-neutral-500">· {l.nativeName}</span>
                      {l.code === 'en' && <Badge tone="blue"> source language</Badge>}
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
    </SettingsShell>
  );
}
