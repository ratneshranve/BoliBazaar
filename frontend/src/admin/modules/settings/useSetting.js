import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';

/** Loads and saves one admin-managed settings group (e.g. 'branding', 'appControl'). */
export function useSetting(key) {
  const [value, setValue] = useState(null);
  const [version, setVersion] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await call(http.get(`/settings/${key}`));
      setValue(data.value);
      setVersion(data.version);
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };

  const replace = (next) => {
    setValue(next);
    setDirty(true);
  };

  const save = async (reason) => {
    setSaving(true);
    try {
      const { data } = await call(http.put(`/settings/${key}`, { value, reason }));
      setValue(data.value);
      setVersion(data.version);
      setDirty(false);
      toast.success('Saved');
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { value, version, error, saving, dirty, update, replace, save, reload: load };
}

/** '' ↔ null helpers for optional text fields */
export const toNull = (s) => (s === '' || s === undefined ? null : s);
export const fromNull = (s) => s ?? '';
