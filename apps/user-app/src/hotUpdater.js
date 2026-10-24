import { HotUpdater } from '@hot-updater/react-native';
import { env } from '../../../frontend/src/user/config/env';

/**
 * Over-the-air updates: on start the app asks the BoliBazaar server for a newer JavaScript bundle made for this
 * app version (backend/src/modules/ota). It downloads in the background and is used from the next start; an update
 * marked "force" reloads the app straight away. Bundles must be signed with the team's key (AndroidManifest
 * com.hotupdater.PUBLIC_KEY), so nobody else can send code to phones.
 */
export const hotUpdater = HotUpdater.init({
  baseURL: `${env.apiBaseUrl}/hot-updater`,
  requestTimeout: 10000,
  onError: (err) => console.warn('[ota]', err?.message || String(err)), // never blocks the app: it keeps its current code
});
