/** Environment values (Vite). Missing required values are reported, never silently defaulted. */
const required = { VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL };

export const missingEnv = Object.entries(required)
  .filter(([, v]) => !v || String(v).trim() === '')
  .map(([k]) => k);

export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
};
