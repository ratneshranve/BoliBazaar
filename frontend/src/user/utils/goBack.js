import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Back button: return to the previous screen in the app. When the screen was opened directly
 * (a link, a notification, a refresh) there is nothing to go back to, so open `fallback` in its place —
 * replacing, never adding, so Back can't bounce between two screens.
 */
export const useGoBack = (fallback = '/') => {
  const navigate = useNavigate();
  return useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
};
