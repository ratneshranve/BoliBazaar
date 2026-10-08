/**
 * Creates the Super Admin role and a super-admin account. Credentials are typed in the
 * terminal (never read from env or files). Safe to run again: it never overwrites.
 *   npm run seed:admin
 */
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { connectMongo, disconnectMongo } from '../core/db/mongo.js';
import { Role, AdminUser } from '../modules/staff/staff.models.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

/** Prompt without echoing the typed characters. */
const askHidden = (question) =>
  new Promise((resolve) => {
    const out = rl.output;
    const original = rl._writeToOutput;
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl._writeToOutput = original;
      out.write('\n');
      resolve(answer);
    });
  });

const run = async () => {
  const name = (await ask('Admin name: ')).trim();
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  const password = await askHidden('Password (min 10 characters): ');
  rl.close();

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('A name and a valid email are required.');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }

  await connectMongo();

  let role = await Role.findOne({ isSuper: true });
  if (!role) {
    role = await Role.create({ name: 'Super Admin', description: 'Full access', permissions: [], isSuper: true, isSystem: true });
    console.log('Created role: Super Admin');
  }

  if (await AdminUser.findOne({ email })) {
    console.log(`Admin ${email} already exists — nothing changed.`);
  } else {
    await AdminUser.create({ name, email, passwordHash: await bcrypt.hash(password, 12), roleId: role._id });
    console.log(`Created super admin: ${email}`);
  }
  await disconnectMongo();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
