import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@core/AuthContext';
import { errorMessage } from '@core/api';
import { Button, Field, Input } from '@components/ui';

export default function LoginPage() {
  const { admin, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-2xl border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Portal</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 font-normal">Sign in to manage your marketplace</p>
        </div>
        <Field label="Email Address">
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="admin@example.com" />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
        </Field>
        {error && <div className="whitespace-pre-line rounded-xl bg-rose-50 border border-rose-200/60 p-3.5 text-xs sm:text-sm text-rose-700 font-medium">{error}</div>}
        <Button type="submit" loading={loading} className="w-full py-3">
          Sign In
        </Button>
      </form>
    </div>
  );
}
