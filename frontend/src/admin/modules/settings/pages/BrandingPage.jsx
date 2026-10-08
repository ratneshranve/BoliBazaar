import { Field, Input } from '@components/ui';
import ImageUpload from '@components/ImageUpload';
import { useAuth } from '@core/AuthContext';
import { useBrand } from '@core/BrandContext';
import SettingsShell from '../SettingsShell';
import { useSetting, toNull, fromNull } from '../useSetting';

export default function BrandingPage() {
  const state = useSetting('branding');
  const { reload } = useBrand();
  const { can } = useAuth();
  const { value: v, update } = state;
  const edit = can('settings.edit');

  const text = (key, label, props = {}) => (
    <Field label={label}>
      <Input value={fromNull(v[key])} disabled={!edit} onChange={(e) => update({ [key]: toNull(e.target.value) })} {...props} />
    </Field>
  );

  const wrapped = { ...state, save: async (r) => { const ok = await state.save(r); if (ok) reload(); return ok; } };

  return (
    <SettingsShell title="Branding" subtitle="Name, logo and contact details shown in the app and this panel" state={wrapped} canEdit={edit}>
      {v && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('appName', 'App name', { maxLength: 60 })}
            {text('tagline', 'Tagline', { maxLength: 120 })}
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <ImageUpload label="Logo" purpose="branding" value={v.logo} onChange={(x) => update({ logo: x })} />
            <ImageUpload label="Logo (dark backgrounds)" purpose="branding" value={v.logoDark} onChange={(x) => update({ logoDark: x })} />
            <ImageUpload label="Icon" purpose="branding" value={v.icon} aspect="h-24 w-24" onChange={(x) => update({ icon: x })} />
            <ImageUpload label="Login screen picture" purpose="branding" value={v.loginImage ?? null} onChange={(x) => update({ loginImage: x })} />
          </div>
          <Field label="Primary colour" hint="Hex, e.g. #B0102F — used for the panel accent">
            <div className="flex items-center gap-3">
              <input type="color" value={v.primaryColor || '#b0102f'} disabled={!edit} onChange={(e) => update({ primaryColor: e.target.value.toUpperCase() })} className="h-10 w-14 cursor-pointer rounded border border-neutral-300" />
              <Input value={fromNull(v.primaryColor)} disabled={!edit} onChange={(e) => update({ primaryColor: toNull(e.target.value) })} placeholder="#B0102F" className="max-w-40" />
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('supportEmail', 'Support email', { type: 'email' })}
            {text('supportPhone', 'Support phone')}
            {text('whatsapp', 'WhatsApp number')}
            {text('website', 'Website', { type: 'url', placeholder: 'https://' })}
          </div>
        </>
      )}
    </SettingsShell>
  );
}
