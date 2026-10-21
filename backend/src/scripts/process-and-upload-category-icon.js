import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { connectMongo, disconnectMongo } from '../core/db/mongo.js';
import { storePublicImage } from '../core/services/storage.js';
import { Category } from '../modules/categories/category.model.js';
import { Media } from '../modules/uploads/media.model.js';
import { AdminUser } from '../modules/staff/staff.models.js';

const CANVAS = 512;
const CONTENT = 448;
const CLEAR = 12;
const SOLID = 45;

/** Cut out white/light background with flood fill from corners */
export const cutOutWhite = async (buffer) => {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const dist = new Uint8Array(n);
  for (let i = 0; i < n; i++) dist[i] = 255 - Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);

  const background = new Uint8Array(n);
  const stack = [];
  const visit = (i) => {
    if (!background[i] && dist[i] < SOLID) {
      background[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) visit(x), visit((h - 1) * w + x);
  for (let y = 0; y < h; y++) visit(y * w), visit(y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < n - w) visit(i + w);
  }

  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const a = background[i] ? Math.min(1, Math.max(0, (dist[i] - CLEAR) / (SOLID - CLEAR))) : 1;
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = a > 0.02 ? Math.max(0, Math.min(255, Math.round((data[i * 3 + c] - 255 * (1 - a)) / a))) : 0;
    }
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
};

/** Trim empty edges, scale to CONTENTxCONTENT, center in CANVASxCANVAS transparent WebP */
export const normalise = async (buffer) => {
  const trimmed = await sharp(buffer).ensureAlpha().trim({ threshold: 1 }).toBuffer();
  const fitted = await sharp(trimmed)
    .resize({ width: CONTENT, height: CONTENT, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const pad = (CANVAS - CONTENT) / 2;
  return sharp(fitted)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer();
};

export const updateCategoryIcon = async (slug, imagePathOrBuffer) => {
  await connectMongo();
  try {
    const cat = await Category.findOne({ slug });
    if (!cat) throw new Error(`Category ${slug} not found`);

    const owner = await AdminUser.findOne({ isSuper: true }).select('_id').lean();
    if (!owner) throw new Error('No super admin found');

    const rawBuffer = Buffer.isBuffer(imagePathOrBuffer)
      ? imagePathOrBuffer
      : await fs.readFile(imagePathOrBuffer);

    const cutout = await cutOutWhite(rawBuffer);
    const normalised = await normalise(cutout);

    const stored = await storePublicImage({ buffer: normalised, size: normalised.length }, 'category');
    const media = await Media.create({
      ownerType: 'admin',
      ownerId: owner._id,
      purpose: 'category',
      visibility: 'public',
      ...stored,
    });

    cat.icon = { url: media.url, mediaId: media._id };
    await cat.save();
    console.log(`✓ Updated [${slug}]: ${media.url}`);
    return { slug, url: media.url, mediaId: media._id };
  } finally {
    await disconnectMongo();
  }
};

// Direct CLI usage: node src/scripts/process-and-upload-category-icon.js <slug> <imagePath>
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [slug, imagePath] = process.argv.slice(2);
  if (!slug || !imagePath) {
    console.error('Usage: node src/scripts/process-and-upload-category-icon.js <slug> <imagePath>');
    process.exit(1);
  }
  updateCategoryIcon(slug, path.resolve(imagePath))
    .then((r) => console.log('Done:', r))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
