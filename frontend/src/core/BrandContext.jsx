import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { call, http } from './api';

const BrandContext = createContext({ branding: null, reload: () => {} });

/** Loads Admin › Settings › Branding so the panel shows the configured logo / name / accent. */
export function BrandProvider({ children }) {
  const { admin } = useAuth();
  const [branding, setBranding] = useState(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await call(http.get('/settings/branding'));
      setBranding(data.value);
    } catch {
      setBranding(null);
    }
  }, []);

  useEffect(() => {
    if (admin) reload();
  }, [admin, reload]);

  useEffect(() => {
    document.title = branding?.appName ? `${branding.appName} Admin` : 'Admin';
    if (branding?.primaryColor) document.documentElement.style.setProperty('--brand', branding.primaryColor);
  }, [branding]);

  const value = useMemo(() => ({ branding, reload }), [branding, reload]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
