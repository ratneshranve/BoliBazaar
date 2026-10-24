# 19 — Over-the-air (OTA) app updates

Screens, text, layout and bug fixes reach phones **without a new APK**. Native changes (new permissions, new native
libraries, the Google Maps key, app icon/name, React Native upgrades) still need a new APK.

## How it works

```
your laptop                         bolibazaar.in (backend)                       phone (APK 1.0.11+)
npx hot-updater deploy ──upload──▶  /api/v1/hot-updater (admin, token)
  builds + signs the JS              MongoDB: bundles, releases, catalogs
                                     disk:    HOT_UPDATER_DIR (default UPLOAD_DIR/ota)
                                     /api/v1/hot-updater/release-catalogs/… ◀──── app start: "anything for 1.0.11?"
                                     /api/v1/hot-updater/files/…            ────▶ download in background
                                                                                  used from the next start
```

- An update goes only to phones whose installed APK has the **same versionName** (`android/app/build.gradle`).
- Phones accept only updates **signed with the team key** (`apps/user-app/keys/private-key.pem`; the public key is in
  `AndroidManifest.xml` as `com.hotupdater.PUBLIC_KEY`).
- If an update crashes on start, the phone goes back to the previous version by itself.
- Debug builds never use OTA (they load from Metro).

## One-time server setup (VPS)

1. Pull the code, then `cd backend && npm install` (new packages: `@hot-updater/server`, `mongodb`).
2. In `backend/.env` add a long random token (32+ characters), for example from `openssl rand -hex 32`:
   ```
   HOT_UPDATER_ADMIN_TOKEN=<random 64 hex characters>
   # optional: HOT_UPDATER_DIR=/var/bolibazaar/ota   (default: UPLOAD_DIR/ota)
   ```
   `PUBLIC_BASE_URL` must be the public https address of the API (download links are built from it).
3. Create the database collections (only once, and again after upgrading Hot Updater). From any machine whose
   `backend/.env` points at the production database:
   ```
   cd apps/user-app
   npx hot-updater db migrate ../../backend/hot-updater.server.mjs --yes
   ```
4. Restart the backend: `pm2 restart bolibazaar-backend --update-env` (it runs `node src/server.js`).
5. Check: `https://bolibazaar.in/api/v1/hot-updater/version` answers with `"adminProtocol":2`.
6. Rebuild the website so `https://bolibazaar.in/.well-known/assetlinks.json` is published (lets shared links open the
   app). If nginx blocks dot-folders, allow `/.well-known/`.

## One-time laptop setup

Create `apps/user-app/.env.hotupdater` (git-ignored — never commit it):
```
HOT_UPDATER_SERVER_URL=https://bolibazaar.in
HOT_UPDATER_ADMIN_TOKEN=<the same token as on the server>
```
Back up `apps/user-app/keys/private-key.pem` (like the APK keystore). Lose it and no new update can be signed for
APKs already installed; leak it and someone could sign updates.

## Push an update

```
cd apps/user-app
npx hot-updater deploy -p android -m "Fix search card layout"
```
Options: `-f` force (reloads phones as soon as it is downloaded) · `-r 20` give it to 20% first · `-t 1.0.11` target
a version explicitly · `-c <channel>` (default `production`).

Phones on that version get it the next time the app opens and use it from the following start (at once with `-f`).

## Undo / manage

```
npx hot-updater bundle list
npx hot-updater bundle disable <id>     # phones go back to the previous update (or the APK's own code)
npx hot-updater bundle delete <id>      # only after disabling
npx hot-updater bundle update <id> …    # change rollout / force
```

## When a new APK is still needed

New permission or native library, Maps key, app icon/name/splash, React Native upgrade, push setup. After a new APK
(new versionName), deploy updates again for that version. For APK releases, set the admin's update link
(Admin › Maintenance) to the `.apk` address: the app downloads it and opens Android's install screen itself.
