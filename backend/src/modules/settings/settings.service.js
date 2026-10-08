import { Setting } from './settings.model.js';
import { settingGroups } from './settings.schemas.js';
import { redis } from '../../core/db/redis.js';
import { ApiError } from '../../core/utils/ApiError.js';
import { integrations } from '../../core/config/env.js';
import { catalogueCodes } from '../i18n/catalogue.js';

const CACHE_TTL_SEC = 30;
const cacheKey = (key) => `settings:${key}`;

const assertKnown = (key) => {
  if (!settingGroups[key]) throw ApiError.notFound('SETTING_NOT_FOUND', `Unknown settings group "${key}"`);
};

/** Read a group (cached). Creates it with its structural initial state the first time. */
export const getSetting = async (key) => {
  assertKnown(key);
  const cached = await redis.get(cacheKey(key));
  if (cached) return JSON.parse(cached);

  let doc = await Setting.findOne({ key }).lean();
  if (!doc) {
    doc = (await Setting.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, value: settingGroups[key].initial, version: 1 } },
      { upsert: true, new: true, lean: true }
    ));
  }
  const payload = { value: doc.value, version: doc.version, updatedAt: doc.updatedAt };
  await redis.set(cacheKey(key), JSON.stringify(payload), 'EX', CACHE_TTL_SEC);
  return payload;
};

export const getSettingValue = async (key) => (await getSetting(key)).value;

const validateBusinessRules = (key, value) => {
  if (key === 'languages') {
    const bad = value.enabled.filter((c) => !catalogueCodes.includes(c));
    if (bad.length) throw ApiError.badRequest('LANGUAGE_UNKNOWN', `Unknown language: ${bad.join(', ')}`);
    if (!value.enabled.includes('en')) throw ApiError.badRequest('ENGLISH_REQUIRED', 'English must stay enabled (it is the source language)');
    if (!value.enabled.includes(value.default)) throw ApiError.badRequest('DEFAULT_LANGUAGE_INVALID', 'The default language must be one of the enabled languages');
  }
  if (key === 'storage' && value.provider === 'cloudinary' && !integrations.cloudinary.configured) {
    throw ApiError.badRequest('INTEGRATION_NOT_CONFIGURED', 'Cloudinary credentials are not set in backend .env');
  }
};

/** Replace a group (full validated value). Returns { before, after } for audit. */
export const updateSetting = async (key, value, adminId) => {
  assertKnown(key);
  const parsed = settingGroups[key].schema.safeParse(value);
  if (!parsed.success) {
    const fields = {};
    parsed.error.issues.forEach((i) => {
      fields[i.path.join('.')] = i.message;
    });
    throw ApiError.badRequest('VALIDATION_FAILED', 'Invalid settings', { fields });
  }
  validateBusinessRules(key, parsed.data);

  const before = await getSettingValue(key);
  const doc = await Setting.findOneAndUpdate(
    { key },
    { $set: { value: parsed.data, updatedBy: adminId }, $inc: { version: 1 } },
    { new: true, upsert: true, lean: true }
  );
  await redis.del(cacheKey(key));
  return { before, after: doc.value, version: doc.version };
};

/** All public groups, used by the app bootstrap. */
export const getPublicSettings = async () => {
  const out = {};
  for (const [key, def] of Object.entries(settingGroups)) {
    if (def.public) out[key] = await getSetting(key);
  }
  return out;
};
