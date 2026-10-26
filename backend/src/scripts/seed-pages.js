/**
 * Publishes the Terms, Privacy Policy and Support pages from src/scripts/pages/*.txt.
 * Safe to run again: a page that already has text is left alone unless --force is passed.
 *   npm run seed:pages            (only empty pages)
 *   npm run seed:pages -- --force (overwrite; bumps the version so users accept again)
 */
import { readFile } from 'node:fs/promises';
import { connectMongo, disconnectMongo } from '../core/db/mongo.js';
import { getPageDoc, savePage } from '../modules/cms/page.service.js';

const PAGES = [
  { slug: 'terms', title: 'Terms & Conditions' },
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'support', title: 'Help & Support' },
];

const force = process.argv.includes('--force');

const run = async () => {
  await connectMongo();
  for (const { slug, title } of PAGES) {
    const existing = await getPageDoc(slug);
    if (existing?.body?.en && !force) {
      console.log(`${slug}: already published (version ${existing.version}) — left unchanged`);
      continue;
    }
    const body = (await readFile(new URL(`./pages/${slug}.txt`, import.meta.url), 'utf8')).trim();
    const { doc } = await savePage(slug, { title, body }, undefined);
    console.log(`${slug}: published "${title}" (version ${doc.version})`);
  }
  await disconnectMongo();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
