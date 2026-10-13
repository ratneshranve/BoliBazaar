/**
 * Gives every category a matching icon: transparent background, same canvas size, content centred.
 * Icons are Microsoft Fluent Emoji 3D (MIT licence, github.com/microsoft/fluentui-emoji).
 * Uploads go through the active storage provider (Admin › Settings › Storage) like any admin upload.
 *
 *   node src/scripts/seed-category-icons.js                  only categories without an icon
 *   node src/scripts/seed-category-icons.js --force          replace every category's icon
 *   node src/scripts/seed-category-icons.js --preview <dir>  write PNGs to <dir>, no upload / DB change
 *   node src/scripts/seed-category-icons.js --photos <dir>   use product photos instead: <dir>/<parent>__<slug>.png
 *                                                            (main category: <slug>.png) shot on a plain white
 *                                                            background; the white is cut out. Categories without
 *                                                            a photo keep their icon. Combine with --preview to check.
 *
 * Categories added later (slug not listed below) are skipped and reported; add them to ICONS.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { connectMongo, disconnectMongo } from '../core/db/mongo.js';
import { storePublicImage } from '../core/services/storage.js';
import { Category } from '../modules/categories/category.model.js';
import { Media } from '../modules/uploads/media.model.js';
import { AdminUser } from '../modules/staff/staff.models.js';

const SOURCE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';
const CANVAS = 512; // every icon is this square size
const CONTENT = 448; // the drawing is scaled to fit this box, so all icons look equally big

/** "<parent slug>/<slug>" (or "<slug>" for main categories) → Fluent emoji name. */
const ICONS = {
  // Main categories
  property: 'House',
  vehicles: 'Automobile',
  electronics: 'Desktop computer',
  'home-furniture': 'Couch and lamp',
  agriculture: 'Man farmer',
  industrial: 'Factory',
  fashion: 'Shopping bags',
  'kids-hobby': 'Kite',
  business: 'Chart increasing',
  jobs: 'Briefcase',
  services: 'Hammer and wrench',

  // Property
  'property/houses-villas': 'House with garden',
  'property/flats-apartments': 'Cityscape',
  'property/builder-floors': 'Houses',
  'property/plots-residential-land': 'Round pushpin',
  'property/agricultural-land-farms': 'Sheaf of rice',
  'property/farmhouses': 'Hut',
  'property/commercial-land': 'Triangular flag',
  'property/shops-showrooms': 'Department store',
  'property/offices-commercial-space': 'Office building',
  'property/godowns-warehouses': 'Package',
  'property/industrial-land-buildings': 'Factory',
  'property/hostel-pg': 'Hotel',
  'property/new-projects': 'Building construction',

  // Vehicles
  'vehicles/cars': 'Oncoming automobile',
  'vehicles/motorcycles': 'Motorcycle',
  'vehicles/scooters': 'Motor scooter',
  'vehicles/electric-vehicles': 'Electric plug',
  'vehicles/bicycles': 'Bicycle',
  'vehicles/trucks-trailers': 'Articulated lorry',
  'vehicles/buses-passenger-vehicles': 'Bus',
  'vehicles/commercial-vehicles': 'Pickup truck',
  'vehicles/tractors-farm-vehicles': 'Tractor',
  'vehicles/auto-e-rickshaw': 'Auto rickshaw',
  'vehicles/construction-vehicles': 'Building construction',
  'vehicles/spare-parts-accessories': 'Wheel',

  // Electronics
  'electronics/mobile-phones': 'Mobile phone',
  'electronics/laptops-computers': 'Laptop',
  'electronics/tablets': 'Clipboard',
  'electronics/tvs': 'Television',
  'electronics/cameras-lenses': 'Camera with flash',
  'electronics/printers-scanners': 'Printer',
  'electronics/computer-accessories': 'Computer mouse',
  'electronics/audio-speakers': 'Headphone',
  'electronics/networking-equipment': 'Satellite antenna',
  'electronics/gaming-wearables': 'Video game',
  'electronics/other-electronics': 'Radio',

  // Home & Furniture
  'home-furniture/sofas-furniture': 'Couch and lamp',
  'home-furniture/beds-wardrobes': 'Bed',
  'home-furniture/tables-chairs': 'Chair',
  'home-furniture/fridges': 'Ice',
  'home-furniture/washing-machines': 'Bubbles',
  'home-furniture/acs-coolers': 'Snowflake',
  'home-furniture/fans': 'Folding hand fan',
  'home-furniture/kitchen-appliances': 'Cooking',
  'home-furniture/home-de-cor': 'Framed picture',
  'home-furniture/inverters-batteries': 'Battery',
  'home-furniture/other-household-items': 'Bucket',

  // Agriculture
  'agriculture/tractors-farm-machinery': 'Tractor',
  'agriculture/harvesters': 'Ear of corn',
  'agriculture/pumps-irrigation': 'Potable water',
  'agriculture/farm-tools': 'Axe',
  'agriculture/seeds-farm-inputs': 'Seedling',
  'agriculture/animal-husbandry-equipment': 'Cow',
  'agriculture/agricultural-land': 'Sheaf of rice',
  'agriculture/agricultural-produce': 'Carrot',
  'agriculture/warehousing-agri-services': 'Package',

  // Industrial
  'industrial/factory-machinery': 'Mechanical arm',
  'industrial/packaging-machines': 'Package',
  'industrial/food-processing-machines': 'Canned food',
  'industrial/printing-machines': 'Printer',
  'industrial/welding-equipment': 'Fire',
  'industrial/construction-equipment': 'Building construction',
  'industrial/shop-equipment-fixtures': 'Shopping cart',
  'industrial/hotel-restaurant-equipment': 'Fork and knife with plate',
  'industrial/office-equipment': 'Fax machine',
  'industrial/business-stock-inventory': 'Clipboard',

  // Fashion
  'fashion/clothes': 'T-shirt',
  'fashion/footwear': 'Running shoe',
  'fashion/bags': 'Handbag',
  'fashion/watches': 'Watch',
  'fashion/accessories-jewellery': 'Ring',
  'fashion/other-personal-items': 'Sunglasses',

  // Kids & Hobby
  'kids-hobby/toys': 'Teddy bear',
  'kids-hobby/baby-furniture-gear': 'Baby bottle',
  'kids-hobby/sports-equipment': 'Cricket game',
  'kids-hobby/fitness-equipment': 'Flexed biceps',
  'kids-hobby/musical-instruments': 'Guitar',
  'kids-hobby/books': 'Books',
  'kids-hobby/collectibles-hobbies': 'Artist palette',

  // Business
  'business/shop-business-for-sale': 'Convenience store',
  'business/franchise-opportunities': 'Handshake',
  'business/wholesale-bulk-sale': 'Shopping cart',
  'business/business-equipment-machinery': 'Gear',

  // Jobs
  'jobs/driver': 'Oncoming taxi',
  'jobs/delivery': 'Delivery truck',
  'jobs/sales-marketing': 'Megaphone',
  'jobs/office-data-entry': 'Keyboard',
  'jobs/teacher-tutor': 'Woman teacher',
  'jobs/cook-chef': 'Man cook',
  'jobs/security-guard': 'Man guard',
  'jobs/electrician-technician': 'High voltage',
  'jobs/construction-labour': 'Man construction worker',
  'jobs/factory-production': 'Man factory worker',
  'jobs/accountant': 'Abacus',
  'jobs/it-software': 'Man technologist',
  'jobs/healthcare-nursing': 'Woman health worker',
  'jobs/beautician-salon': 'Lipstick',
  'jobs/retail-shop-staff': 'Shopping bags',
  'jobs/hotel-restaurant-staff': 'Bellhop bell',
  'jobs/housekeeping-domestic-help': 'Broom',
  'jobs/farm-worker': 'Woman farmer',
  'jobs/other-jobs': 'Man office worker',

  // Services
  'services/electrician': 'Light bulb',
  'services/plumber': 'Wrench',
  'services/carpenter': 'Carpentry saw',
  'services/mechanic': 'Man mechanic',
  'services/painter': 'Paintbrush',
  'services/computer-services': 'Desktop computer',
  'services/repair-services': 'Toolbox',
  'services/cleaning-services': 'Sponge',
  'services/packers-movers': 'Delivery truck',
  'services/tutors-classes': 'Graduation cap',
  'services/beauty-wellness': 'Nail polish',
  'services/events-catering': 'Party popper',
  'services/construction-renovation': 'Brick',
  'services/local-business-services': 'Convenience store',
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const previewDir = args.includes('--preview') ? path.resolve(args[args.indexOf('--preview') + 1] || 'category-icons') : null;
const photosDir = args.includes('--photos') ? path.resolve(args[args.indexOf('--photos') + 1]) : null;

const fileStem = (name) => name.toLowerCase().replace(/ /g, '_');

/** People/hand emojis live under a skin-tone folder; everything else directly under 3D/. */
const download = async (name) => {
  const dir = encodeURIComponent(name);
  const urls = [`${SOURCE}/${dir}/3D/${fileStem(name)}_3d.png`, `${SOURCE}/${dir}/Default/3D/${fileStem(name)}_3d_default.png`];
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`Icon "${name}" not found in Fluent Emoji`);
};

/**
 * Make the white studio background of a product photo transparent. Only near-white pixels connected to the
 * image border are removed (white parts inside the product stay); edge pixels get partial alpha and their
 * white fringe is taken out so the cut-out looks clean on any background.
 */
const CLEAR = 10; // "distance from white" below this: fully transparent
const SOLID = 48; // above this: fully opaque
const cutOutWhite = async (buffer) => {
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

const readPhoto = async (key) => {
  try {
    return await fs.readFile(path.join(photosDir, `${key.replace('/', '__')}.png`));
  } catch {
    return null;
  }
};

/** Trim empty edges, scale to the same box, centre on a transparent square canvas. */
const normalise = async (buffer) => {
  const trimmed = await sharp(buffer).ensureAlpha().trim({ threshold: 1 }).toBuffer();
  const fitted = await sharp(trimmed)
    .resize({ width: CONTENT, height: CONTENT, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const pad = (CANVAS - CONTENT) / 2;
  return sharp(fitted)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
};

const run = async () => {
  await connectMongo();
  const cats = await Category.find({}).sort({ depth: 1, order: 1 });
  const slugById = new Map(cats.map((c) => [String(c._id), c.slug]));
  const owner = previewDir ? null : await AdminUser.findOne({ isSuper: true }).select('_id').lean();
  if (!previewDir && !owner) throw new Error('No super admin found — run npm run seed:admin first');
  if (previewDir) await fs.mkdir(previewDir, { recursive: true });

  const cache = new Map(); // same picture used twice is processed/uploaded once
  const done = [];
  const skipped = [];
  for (const cat of cats) {
    const key = cat.parentId ? `${slugById.get(String(cat.parentId))}/${cat.slug}` : cat.slug;
    let source;
    let load;
    if (photosDir) {
      const photo = await readPhoto(key);
      if (!photo) {
        skipped.push(`${key} (no photo)`);
        continue;
      }
      source = `photo:${crypto.createHash('sha1').update(photo).digest('hex')}`; // identical files share one upload
      load = () => cutOutWhite(photo);
    } else {
      const emoji = ICONS[key];
      if (!emoji) {
        skipped.push(`${key} (no icon mapped)`);
        continue;
      }
      if (!force && !previewDir && cat.icon?.url) {
        skipped.push(`${key} (already has an icon)`);
        continue;
      }
      source = emoji;
      load = () => download(emoji);
    }

    if (!cache.has(source)) {
      const png = await normalise(await load());
      if (previewDir) {
        cache.set(source, png);
      } else {
        const stored = await storePublicImage({ buffer: png, size: png.length }, 'category');
        const media = await Media.create({ ownerType: 'admin', ownerId: owner._id, purpose: 'category', visibility: 'public', ...stored });
        cache.set(source, { url: media.url, mediaId: media._id });
      }
    }

    if (previewDir) {
      await fs.writeFile(path.join(previewDir, `${key.replace('/', '__')}.png`), cache.get(source));
    } else {
      cat.icon = cache.get(source);
      await cat.save();
    }
    const label = photosDir ? 'photo' : source;
    done.push(`${key} → ${label}`);
    console.log(`✓ ${key} → ${label}`);
  }

  console.log(`\n${done.length} ${previewDir ? `previewed in ${previewDir}` : 'updated'}, ${skipped.length} skipped`);
  skipped.forEach((s) => console.log(`  - ${s}`));
};

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(disconnectMongo);
