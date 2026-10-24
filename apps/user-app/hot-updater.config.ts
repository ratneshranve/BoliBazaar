/**
 * Over-the-air updates (Hot Updater): `npx hot-updater deploy -p android` builds the app's JavaScript, signs it and
 * uploads it to the BoliBazaar server (backend/src/modules/ota), where phones on the same app version pick it up.
 *
 * Secrets stay out of git. Put them in apps/user-app/.env.hotupdater (git-ignored) or the terminal environment:
 *   HOT_UPDATER_SERVER_URL=https://bolibazaar.in            (default)
 *   HOT_UPDATER_ADMIN_TOKEN=<same value as in the server's backend/.env>
 *   HOT_UPDATER_SIGNING_PRIVATE_KEY_PATH=./keys/private-key.pem   (default; back this file up, never share it)
 */
import { existsSync } from 'node:fs';
import { bare } from '@hot-updater/bare';
import { standaloneRepository, standaloneStorage } from '@hot-updater/standalone';
import { defineConfig } from 'hot-updater';

if (existsSync('.env.hotupdater')) process.loadEnvFile('.env.hotupdater');

const server = (process.env.HOT_UPDATER_SERVER_URL || 'https://bolibazaar.in').replace(/\/$/, '');
const auth = { Authorization: `Bearer ${process.env.HOT_UPDATER_ADMIN_TOKEN ?? ''}` };

export default defineConfig({
  build: bare({ enableHermes: true }),
  storage: standaloneStorage({ baseUrl: `${server}/api/v1/hot-updater/storage`, protocol: 'bbfs', commonHeaders: auth }),
  database: standaloneRepository({ baseUrl: `${server}/api/v1/hot-updater/admin`, commonHeaders: auth }),
  // an update goes to phones whose installed APK has the same versionName (android/app/build.gradle)
  updateStrategy: 'appVersion',
  signing: {
    enabled: true,
    privateKeyPath: process.env.HOT_UPDATER_SIGNING_PRIVATE_KEY_PATH ?? './keys/private-key.pem',
  },
});
