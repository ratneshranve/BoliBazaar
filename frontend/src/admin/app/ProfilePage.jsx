import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '@core/AuthContext';
import { auth, call, errorMessage, http } from '@core/api';
import { Button, Card, Field, Input, PageHeader } from '@components/ui';

/** The signed-in admin's own account: details, change password, log out of every device. */
export default function ProfilePage() {
  const { admin, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < 10) return setError('Use at least 10 characters.');
    if (next !== confirm) return setError('The two new passwords do not match.');
    if (next === current) return setError('The new password must be different.');
    setSaving(true);
    try {
      const { data } = await call(http.post('/auth/change-password', { currentPassword: current, newPassword: next }));
      auth.save(data.accessToken, null); // other devices are signed out; this one keeps working
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed. You were signed out on other devices.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const logoutAll = async () => {
    if (!window.confirm('Sign out of the admin panel on every device, including this one?')) return;
    try {
      await call(http.post('/auth/logout-all'));
    } finally {
      logout();
    }
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Your admin account and password" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-700 text-white"><UserCircle2 className="h-7 w-7" /></div>
            <div>
              <div className="text-lg font-bold text-slate-900">{admin?.name}</div>
              <div className="text-sm text-slate-500">{admin?.email}</div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Role</dt><dd className="font-semibold text-slate-900">{admin?.role?.name || '—'}</dd></div>
            <div><dt className="text-slate-500">Last sign-in</dt><dd className="font-semibold text-slate-900">{admin?.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '—'}</dd></div>
          </dl>
          <Button variant="outline" onClick={logoutAll} className="w-full"><LogOut className="h-4 w-4" /> Sign out on all devices</Button>
        </Card>

        <Card>
          <form onSubmit={change} className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-slate-500" />
              <h2 className="text-base font-bold text-slate-900">Change password</h2>
            </div>
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="New password" hint="At least 10 characters">
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} />
            </Field>
            {error && <div className="rounded-xl border border-rose-200/70 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <Button type="submit" variant="brand" loading={saving}>Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
