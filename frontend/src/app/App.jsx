import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@core/AuthContext';
import { BrandProvider } from '@core/BrandContext';
import { missingEnv } from '@core/env';
import { modules } from '@modules/registry';
import AdminLayout from './AdminLayout';
import LoginPage from './LoginPage';
import { Spinner } from '@components/ui';

function Protected({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <Spinner />;
  return admin ? children : <Navigate to="/login" replace />;
}

function Guarded({ permission, children }) {
  const { can } = useAuth();
  return can(permission) ? children : <div className="rounded-xl bg-white p-8 text-center text-neutral-600">You don't have permission to view this page.</div>;
}

function ConfigError() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="mb-2 text-lg font-bold">Admin panel is not configured</h1>
        <p>These values are missing in <code>frontend/.env</code>:</p>
        <ul className="mt-2 list-disc pl-5 font-mono">
          {missingEnv.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  if (missingEnv.length) return <ConfigError />;
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <Protected>
                  <AdminLayout />
                </Protected>
              }
            >
              {modules.flatMap((m) =>
                m.routes.map((r) => (
                  <Route key={r.path} path={r.path} element={<Guarded permission={r.permission}>{r.element}</Guarded>} />
                ))
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <Toaster position="top-right" richColors />
        </BrandProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
