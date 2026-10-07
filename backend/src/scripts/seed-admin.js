/**
 * Creates the Super Admin role and the first super-admin account from env
 * (ADMIN_SEED_NAME / ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD). Safe to run again: it never overwrites.
 *   npm run seed:admin
 */
import bcrypt from 'bcryptjs';
import { env } from '../core/config/env.js';
import { connectMongo, disconnectMongo } from '../core/db/mongo.js';
import { Role, AdminUser } from '../modules/staff/staff.models.js';

const run = async () => {
  const { ADMIN_SEED_NAME: name, ADMIN_SEED_EMAIL: email, ADMIN_SEED_PASSWORD: password } = env;
  if (!name || !email || !password) {
    console.error('Set ADMIN_SEED_NAME, ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in backend/.env');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('ADMIN_SEED_PASSWORD must be at least 10 characters');
    process.exit(1);
  }

  await connectMongo();

  let role = await Role.findOne({ isSuper: true });
  if (!role) {
    role = await Role.create({ name: 'Super Admin', description: 'Full access', permissions: [], isSuper: true, isSystem: true });
    console.log('Created role: Super Admin');
  }

  const existing = await AdminUser.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Admin ${email} already exists — nothing changed.`);
  } else {
    await AdminUser.create({ name, email, passwordHash: await bcrypt.hash(password, 12), roleId: role._id });
    console.log(`Created super admin: ${email}`);
    console.log('Remove ADMIN_SEED_PASSWORD from .env now.');
  }
  await disconnectMongo();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
