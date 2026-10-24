/**
 * Hot Updater server definition for its command-line tools, which need their own database connection:
 *   cd apps/user-app && npx hot-updater db migrate ../../backend/hot-updater.server.mjs   (once, and after upgrading Hot Updater)
 * Reads MONGODB_URI etc. from backend/.env like the backend itself.
 */
import { MongoClient } from 'mongodb';
import { env } from './src/core/config/env.js';
import { createOtaServer } from './src/modules/ota/ota.service.js';

const client = new MongoClient(env.MONGODB_URI);
await client.connect();

export const hotUpdater = createOtaServer(client);
export default hotUpdater;
