import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, call, http } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => (auth.token() ? auth.admin() : null));
  const [loading, setLoading] = useState(Boolean(auth.token()));

  const logout = useCallback(() => {
    auth.clear();
    setAdmin(null);
  }, []);

  useEffect(() => {
    window.addEventListener('admin:logout', logout);
    return () => window.removeEventListener('admin:logout', logout);
  }, [logout]);

  // Refresh profile + permissions from the server on load
  useEffect(() => {
    if (!auth.token()) return;
    call(http.get('/auth/me'))
      .then(({ data }) => {
        auth.save(null, data);
        setAdmin(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await call(http.post('/auth/login', { email, password }));
    auth.save(data.accessToken, data.admin);
    setAdmin(data.admin);
  }, []);

  const can = useCallback(
    (perm) => {
      if (!admin) return false;
      if (admin.role?.isSuper) return true;
      if (!perm) return true;
      const list = Array.isArray(perm) ? perm : [perm];
      return list.some((p) => admin.permissions?.includes(p));
    },
    [admin]
  );

  const value = useMemo(() => ({ admin, loading, login, logout, can }), [admin, loading, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
