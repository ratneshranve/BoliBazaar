import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { createHotUpdater } from '@hot-updater/server';
import { mongoAdapter } from '@hot-updater/server/adapters/mongodb';
import { createStorageAdapter, createStorageUri, getContentType, parseStorageUri } from '@hot-updater/plugin-core';
import { env } from '../../core/config/env.js';

/**
 * Over-the-air app updates (Hot Updater), served by this backend:
 *  - the update records live in this MongoDB (collections bundles, releases, release_catalogs, channels, …),
 *  - the update files live on this server's disk (HOT_UPDATER_DIR, default UPLOAD_DIR/ota),
 *  - phones ask /api/v1/hot-updater/… on start and download from /api/v1/hot-updater/files/….
 * The laptop's `npx hot-updater deploy` (apps/user-app/hot-updater.config.ts) uploads through ota.routes.js.
 */

export const OTA_PROTOCOL = 'bbfs';
const BUCKET = 'ota';

export const otaRoot = () => path.resolve(env.HOT_UPDATER_DIR || path.join(env.UPLOAD_DIR, 'ota'));

/** Absolute path of a stored key, never outside the update folder. */
export const otaFile = (key) => {
  const root = otaRoot();
  const file = path.resolve(root, key);
  if (!key || file === root || !file.startsWith(root + path.sep)) throw new Error(`Invalid update file key: ${key}`);
  return file;
};

const keyOf = (storageUri) => {
  const { bucket, key } = parseStorageUri(storageUri, OTA_PROTOCOL); // throws for another protocol
  if (bucket !== BUCKET) throw new Error(`Not an update file of this server: ${storageUri}`);
  return key;
};

const uriOf = (key) => createStorageUri({ protocol: OTA_PROTOCOL, bucket: BUCKET, key });

const isFile = async (file) => {
  try {
    return (await fsp.stat(file)).isFile();
  } catch {
    return false;
  }
};

/** Public download address of a stored key (what phones fetch). */
export const otaDownloadUrl = (key) => `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/v1/hot-updater/files/${key.split('/').map(encodeURIComponent).join('/')}`;

const listFiles = async (dir, base = '') => {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
};

/** Update files on this server's disk. */
export const diskStorage = createStorageAdapter({
  name: 'bolibazaar-disk',
  protocol: OTA_PROTOCOL,

  async put({ key, body }) {
    const file = otaFile(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.part`;
    await pipeline(Readable.fromWeb(body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, file); // a half-written file is never served
    return { storageUri: uriOf(key) };
  },

  async get({ storageUri }) {
    const file = otaFile(keyOf(storageUri));
    if (!(await isFile(file))) return { response: null };
    return { response: new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { 'content-type': getContentType(file) } }) };
  },

  async getDownloadUrl({ storageUri }) {
    return { url: otaDownloadUrl(keyOf(storageUri)) };
  },

  async exists({ storageUri }) {
    return { exists: await isFile(otaFile(keyOf(storageUri))) };
  },

  async delete({ storageUri }) {
    await fsp.rm(otaFile(keyOf(storageUri)), { force: true });
    return { deleted: true };
  },

  async listObjects(prefix = '') {
    const root = otaRoot();
    const keys = (await listFiles(root)).filter((k) => k.startsWith(prefix) && !k.endsWith('.part'));
    return Promise.all(
      keys.map(async (key) => {
        const st = await fsp.stat(path.join(root, key));
        return { key, storageUri: uriOf(key), size: st.size, lastModifiedAt: st.mtime };
      })
    );
  },

  async deleteObjects(keys) {
    await Promise.all(keys.map((k) => fsp.rm(otaFile(k), { force: true })));
  },
});

/** The Hot Updater server on a connected MongoClient (update data needs MongoDB transactions: Atlas has them). */
export const createOtaServer = (client) =>
  createHotUpdater({
    database: mongoAdapter({ client }),
    storage: diskStorage,
    clientAccess: 'public', // update files are public anyway (they are inside every APK); uploads need the admin token
  });

let server = null;
/** The running app's instance, on mongoose's own connection. */
export const ota = () => (server ??= createOtaServer(mongoose.connection.getClient()));
