import { useAuth } from '@core/AuthContext';
import { Field, Input } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

export default function MarketplacePage() {
  const state = useSetting('marketplace');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;

  let preview = '';
  try {
    preview = v ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: v.currency, maximumFractionDigits: 0 }).format(425000) : '';
  } catch {
    preview = 'Unknown currency';
  }

  return (
    <SettingsShell title="Marketplace" subtitle="Defaults that apply to every ad" state={state} canEdit={edit}>
      {v && (
        <Field label="Currency" hint={`ISO code such as INR, USD, EUR. Shown to users as: ${preview}. Applies to new ads.`}>
          <Input value={v.currency} maxLength={3} disabled={!edit} onChange={(e) => update({ currency: e.target.value.toUpperCase() })} className="max-w-32" />
        </Field>
      )}
    </SettingsShell>
  );
}
