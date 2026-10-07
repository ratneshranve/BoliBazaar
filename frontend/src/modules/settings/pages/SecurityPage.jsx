import { useAuth } from '@core/AuthContext';
import { Field, Input } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const FIELDS = [
  { key: 'otpLength', label: 'OTP length (digits)', min: 4, max: 8 },
  { key: 'otpExpirySec', label: 'OTP validity (seconds)', min: 60, max: 900 },
  { key: 'otpResendSec', label: 'Resend wait (seconds)', min: 15, max: 300 },
  { key: 'otpMaxAttempts', label: 'Max wrong OTP attempts', min: 1, max: 10 },
  { key: 'otpMaxPerHour', label: 'Max OTPs per number / hour', min: 1, max: 20 },
  { key: 'otpMaxPerDay', label: 'Max OTPs per number / day', min: 1, max: 50 },
  { key: 'adminMaxFailedLogins', label: 'Admin: failed logins before lock', min: 3, max: 20 },
  { key: 'adminLockMinutes', label: 'Admin: lock duration (minutes)', min: 1, max: 1440 },
];

export default function SecurityPage() {
  const state = useSetting('security');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  return (
    <SettingsShell title="Security & OTP" subtitle="Login OTP rules and admin lockout policy" state={state} canEdit={edit}>
      {v && (
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={`${f.min}–${f.max}`}>
              <Input type="number" min={f.min} max={f.max} value={v[f.key]} disabled={!edit} onChange={(e) => update({ [f.key]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
      )}
    </SettingsShell>
  );
}
