import Config from 'react-native-config';

/** Phone settings from apps/user-app/.env (react-native-config). Missing required values are reported, never guessed. */
const required = { API_BASE_URL: Config.API_BASE_URL, SOCKET_URL: Config.SOCKET_URL, DEFAULT_COUNTRY_CODE: Config.DEFAULT_COUNTRY_CODE };

export const missingEnv = Object.entries(required)
  .filter(([, v]) => !v || String(v).trim() === '')
  .map(([k]) => k);

export const env = {
  googleMapsApiKey: Config.GOOGLE_MAPS_API_KEY || '',
  apiBaseUrl: (Config.API_BASE_URL || '').replace(/\/$/, ''),
  socketUrl: (Config.SOCKET_URL || '').replace(/\/$/, ''),
  webUrl: (Config.WEB_URL || '').replace(/\/$/, ''), // the website, for share links
  defaultCountryCode: (Config.DEFAULT_COUNTRY_CODE || '').toUpperCase(),
  firebase: {}, // the phone uses android/app/google-services.json
  firebaseVapidKey: '',
};
