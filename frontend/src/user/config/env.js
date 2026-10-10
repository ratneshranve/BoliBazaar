/** Environment values. Missing required values are reported, never silently defaulted. */
const required = {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_DEFAULT_COUNTRY_CODE: import.meta.env.VITE_DEFAULT_COUNTRY_CODE,
};

export const missingEnv = Object.entries(required)
  .filter(([, v]) => !v || String(v).trim() === '')
  .map(([k]) => k);

export const env = {
  // Maps JavaScript API key (browser). Optional: without it the picker still works via search and GPS, just without the map.
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  defaultCountryCode: (import.meta.env.VITE_DEFAULT_COUNTRY_CODE || '').toUpperCase(),
  // Firebase web config for browser push. Optional: without it push is simply off on the website.
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  },
  firebaseVapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',
};
