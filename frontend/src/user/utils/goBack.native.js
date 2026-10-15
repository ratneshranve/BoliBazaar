import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** Back: the previous screen, or `fallback` when this screen was opened first (a notification tap). */
export const useGoBack = () => {
  const navigate = useNavigate();
  return useCallback(() => navigate(-1), [navigate]);
};
