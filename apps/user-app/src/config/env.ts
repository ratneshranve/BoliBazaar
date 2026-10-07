import Config from 'react-native-config';

/**
 * All environment values come from .env via react-native-config.
 * Missing required values are reported (ConfigErrorScreen) instead of silently defaulting.
 */
const REQUIRED = ['APP_ENV', 'API_BASE_URL', 'SOCKET_URL', 'DEFAULT_COUNTRY_CODE'] as const;

export const missingEnv: string[] = REQUIRED.filter(k => !Config[k] || String(Config[k]).trim() === '');

export const env = {
  appEnv: Config.APP_ENV as string,
  apiBaseUrl: (Config.API_BASE_URL ?? '').replace(/\/$/, ''),
  socketUrl: (Config.SOCKET_URL ?? '').replace(/\/$/, ''),
  googleMapsApiKey: Config.GOOGLE_MAPS_API_KEY,
  defaultCountryCode: (Config.DEFAULT_COUNTRY_CODE ?? '').toUpperCase(),
  isDev: Config.APP_ENV === 'development',
};
