/** Environment values. Missing required values are reported, never silently defaulted. */
const required = {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_DEFAULT_COUNTRY_CODE: import.meta.env.VITE_DEFAULT_COUNTRY_CODE,
};

export const missingEnv = Object.entries(required)
  .filter(([, v]) => !v || String(v).trim() === '')
  .map(([k]) => k);

export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  defaultCountryCode: (import.meta.env.VITE_DEFAULT_COUNTRY_CODE || '').toUpperCase(),
};
