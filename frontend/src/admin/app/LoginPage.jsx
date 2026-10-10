import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Gavel, KeyRound, LayoutDashboard, Lock, Mail, ShieldCheck, Tags } from 'lucide-react';
import { useAuth } from '@core/AuthContext';
import { call, errorMessage, http } from '@core/api';
import { env } from '@core/env';
import { Button } from '@components/ui';

/** Branding is public (the same data the app gets at start-up), so the login screen can show the real name and logo. */
const usePublicBranding = () => {
  const [branding, setBranding] = useState(null);
  useEffect(() => {
    fetch(`${env.apiBaseUrl}/config/bootstrap`)
      .then((r) => r.json())
      .then((j) => setBranding(j?.data?.branding ?? null))
      .catch(() => setBranding(null));
  }, []);
  useEffect(() => {
    if (branding?.primaryColor) document.documentElement.style.setProperty('--brand', branding.primaryColor);
    document.title = branding?.appName ? `${branding.appName} Admin` : 'Admin';
  }, [branding]);
  return branding;
};

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-2xs outline-none transition placeholder:text-slate-400 focus:border-[var(--brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand)_15%,transparent)]';

function IconInput({ icon: Icon, right, ...props }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input {...props} className={inputCls + (right ? ' pr-11' : '')} />
      {right && <div className="absolute right-2 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <IconInput
      icon={Lock}
      type={show ? 'text' : 'password'}
      {...props}
      right={
        <button type="button" onClick={() => setShow((v) => !v)} className="rounded-lg p-2 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

const Label = ({ children }) => <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</label>;
const Alert = ({ tone = 'error', children }) => (
  <div className={`whitespace-pre-line rounded-xl border p-3.5 text-sm font-medium ${tone === 'error' ? 'border-rose-200/70 bg-rose-50 text-rose-700' : 'border-emerald-200/70 bg-emerald-50 text-emerald-800'}`}>{children}</div>
);

export default function LoginPage() {
  const { admin, login } = useAuth();
  const branding = usePublicBranding();
  const [mode, setMode] = useState('login'); // login | forgot | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to="/" replace />;

  const go = (next) => {
    setError('');
    setNotice('');
    setMode(next);
  };

  const run = async (fn) => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitLogin = (e) => {
    e.preventDefault();
    run(() => login(email.trim(), password));
  };
  const submitForgot = (e) => {
    e.preventDefault();
    run(async () => {
      await call(http.post('/auth/forgot-password', { email: email.trim() }));
      setMode('reset');
      setNotice(`If ${email.trim()} belongs to an admin account, a 6-digit code is on its way. It expires in 10 minutes.`);
    });
  };
  const submitReset = (e) => {
    e.preventDefault();
    if (newPassword !== confirm) return setError('The two passwords do not match.');
    run(async () => {
      await call(http.post('/auth/reset-password', { email: email.trim(), code: code.trim(), newPassword }));
      setPassword('');
      setCode('');
      setNewPassword('');
      setConfirm('');
      setMode('login');
      setNotice('Password changed. Sign in with your new password.');
    });
  };

  const name = branding?.appName;
  const logo = branding?.logoDark?.url || branding?.logo?.url;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* brand side */}
      <aside className="relative hidden w-[46%] overflow-hidden bg-neutral-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl" style={{ background: 'var(--brand)' }} />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          {logo ? <img src={logo} alt="" className="h-11 w-auto max-w-[180px] object-contain" /> : <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--brand)' }}><ShieldCheck className="h-6 w-6" /></div>}
          {name && <span className="text-xl font-bold tracking-tight">{name}</span>}
        </div>
        <div className="relative max-w-md space-y-6">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Run your marketplace from one place.</h2>
          {branding?.tagline && <p className="text-lg text-neutral-300">{branding.tagline}</p>}
          <ul className="space-y-3 text-sm text-neutral-300">
            {[
              [LayoutDashboard, 'Live dashboard and reports'],
              [Tags, 'Review ads, categories and reports'],
              [Gavel, 'Monitor auctions as bids come in'],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10"><Icon className="h-4 w-4" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-neutral-500">Staff access only. Every action is recorded in the audit log.</p>
      </aside>

      {/* form side */}
      <main className="flex flex-1 items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {branding?.logo?.url ? <img src={branding.logo.url} alt="" className="h-10 w-auto max-w-[160px] object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: 'var(--brand)' }}><ShieldCheck className="h-5 w-5" /></div>}
            {name && <span className="text-lg font-bold text-slate-900">{name}</span>}
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-9">
            {mode === 'login' && (
              <form onSubmit={submitLogin} className="space-y-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
                  <p className="mt-1 text-sm text-slate-500">Sign in to the admin panel</p>
                </div>
                {notice && <Alert tone="ok">{notice}</Alert>}
                <div>
                  <Label>Email</Label>
                  <IconInput icon={Mail} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@company.com" />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label>Password</Label>
                    <button type="button" onClick={() => go('forgot')} className="mb-1.5 text-xs font-semibold text-[var(--brand)] hover:underline">Forgot password?</button>
                  </div>
                  <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password" />
                </div>
                {error && <Alert>{error}</Alert>}
                <Button type="submit" variant="brand" loading={loading} className="w-full py-3">Sign in</Button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={submitForgot} className="space-y-5">
                <button type="button" onClick={() => go('login')} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back to sign in</button>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">Forgot your password?</h1>
                  <p className="mt-1 text-sm text-slate-500">Enter your admin email. We'll email you a 6-digit code to set a new password.</p>
                </div>
                <div>
                  <Label>Email</Label>
                  <IconInput icon={Mail} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@company.com" />
                </div>
                {error && <Alert>{error}</Alert>}
                <Button type="submit" variant="brand" loading={loading} className="w-full py-3">Send code</Button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={submitReset} className="space-y-5">
                <button type="button" onClick={() => go('forgot')} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Use a different email</button>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set a new password</h1>
                  <p className="mt-1 text-sm text-slate-500">Enter the code from your email and choose a new password (at least 10 characters).</p>
                </div>
                {notice && <Alert tone="ok">{notice}</Alert>}
                <div>
                  <Label>6-digit code</Label>
                  <IconInput icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus placeholder="••••••" />
                </div>
                <div>
                  <Label>New password</Label>
                  <PasswordInput autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="At least 10 characters" />
                </div>
                <div>
                  <Label>Confirm new password</Label>
                  <PasswordInput autoComplete="new-password" minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="Type it again" />
                </div>
                {error && <Alert>{error}</Alert>}
                <Button type="submit" variant="brand" loading={loading} disabled={code.length !== 6} className="w-full py-3">Change password</Button>
                <button type="button" disabled={loading} onClick={submitForgot} className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-900">Didn't get it? Send a new code</button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
