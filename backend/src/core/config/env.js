import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Always read backend/.env, whatever folder the process was started from (PM2, systemd, repo root…).
// Values already set in the real environment win over the file.
export const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
dotenv.config({ path: ENV_FILE });

/** FIREBASE_SERVICE_ACCOUNT is the downloaded service-account JSON as a single line. */
const parseServiceAccount = (raw) => {
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be the service-account JSON on one line, wrapped in single quotes');
  }
  for (const k of ['project_id', 'client_email', 'private_key']) {
    if (typeof json[k] !== 'string' || !json[k]) throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing "${k}"`);
  }
  // tolerate a key whose newlines were double-escaped
  if (!json.private_key.includes('\n')) json.private_key = json.private_key.replace(/\\n/g, '\n');
  return json;
};

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const required = (name) => z.string({ required_error: `${name} is required` }).trim().min(1, `${name} is required`);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production']),
    PORT: z.coerce.number().int().positive(),
    CORS_ORIGINS: required('CORS_ORIGINS'),
    PUBLIC_BASE_URL: z.string().url(),
    // the user website's address, used in sitemap.xml and robots.txt (search engines)
    PUBLIC_WEB_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),

    MONGODB_URI: required('MONGODB_URI'),
    REDIS_ENABLED: z.enum(['true', 'false'], { errorMap: () => ({ message: 'REDIS_ENABLED must be "true" or "false"' }) }),
    BULLMQ_ENABLED: z.enum(['true', 'false'], { errorMap: () => ({ message: 'BULLMQ_ENABLED must be "true" or "false"' }) }),
    REDIS_URL: optional,

    USER_JWT_SECRET: z.string().min(32, 'USER_JWT_SECRET must be at least 32 chars'),
    ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 chars'),
    OTP_HASH_SECRET: z.string().min(32, 'OTP_HASH_SECRET must be at least 32 chars'),
    USER_ACCESS_TOKEN_TTL: required('USER_ACCESS_TOKEN_TTL'),
    USER_REFRESH_TOKEN_DAYS: z.coerce.number().int().positive(),
    ADMIN_ACCESS_TOKEN_TTL: required('ADMIN_ACCESS_TOKEN_TTL'),

    UPLOAD_DIR: required('UPLOAD_DIR'),
    MAX_UPLOAD_MB: z.coerce.number().positive(),

    SMS_PROVIDER: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['smsindiahub', 'msg91', 'twilio', 'console']).optional()),
    // Testing switch: when true every login OTP is DEFAULT_OTP and no SMS is sent. Keep false for real users.
    DEFAULT_OTP_ENABLED: z.enum(['true', 'false']),
    DEFAULT_OTP: optional,
    // SMS India Hub (same gateway as OyeChotuu). The message must match the DLT-approved template exactly; {{otp}} is replaced with the code.
    SMS_INDIA_HUB_API_KEY: optional,
    SMS_INDIA_HUB_SENDER_ID: optional,
    SMS_INDIA_HUB_USERNAME: optional,
    SMS_INDIA_HUB_DLT_TEMPLATE_ID: optional,
    SMS_INDIA_HUB_OTP_MESSAGE: optional,
    MSG91_AUTH_KEY: optional,
    MSG91_OTP_TEMPLATE_ID: optional,
    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_FROM_NUMBER: optional,

    // Firebase Admin (push). The whole service-account JSON as ONE single-quoted line.
    FIREBASE_SERVICE_ACCOUNT: optional,

    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    CLOUDINARY_FOLDER: optional,

    GOOGLE_TRANSLATE_API_KEY: optional,
    // Places API (New) + Geocoding API. Used by the server only, so the key is never sent to apps.
    GOOGLE_MAPS_SERVER_KEY: optional,

    RAZORPAY_KEY_ID: optional,
    RAZORPAY_KEY_SECRET: optional,
    RAZORPAY_WEBHOOK_SECRET: optional,

    // SMTP email (optional). All four of host/user/pass/from turn email on.
    EMAIL_HOST: optional,
    EMAIL_PORT: z.preprocess((v) => (v === '' || v === undefined ? 587 : v), z.coerce.number().int().positive()),
    EMAIL_USER: optional,
    EMAIL_PASS: optional,
    EMAIL_FROM: optional,
  })
  .superRefine((env, ctx) => {
    const need = (keys, why) =>
      keys.forEach((k) => {
        if (!env[k]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${k} is required ${why}` });
      });

    if (env.REDIS_ENABLED === 'true') need(['REDIS_URL'], 'when REDIS_ENABLED=true');
    if (env.BULLMQ_ENABLED === 'true' && env.REDIS_ENABLED !== 'true') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BULLMQ_ENABLED'], message: 'BULLMQ_ENABLED=true requires REDIS_ENABLED=true (BullMQ runs on Redis)' });
    }
    if (env.DEFAULT_OTP_ENABLED === 'true' && !/^\d{4,8}$/.test(env.DEFAULT_OTP || '')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DEFAULT_OTP'], message: 'DEFAULT_OTP must be 4-8 digits when DEFAULT_OTP_ENABLED=true' });
    }
    if (env.DEFAULT_OTP_ENABLED !== 'true' && !env.SMS_PROVIDER) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMS_PROVIDER'], message: 'Set SMS_PROVIDER (smsindiahub | msg91 | twilio | console), or DEFAULT_OTP_ENABLED=true for testing' });
    }
    if (env.SMS_PROVIDER === 'smsindiahub') {
      need(['SMS_INDIA_HUB_API_KEY', 'SMS_INDIA_HUB_SENDER_ID', 'SMS_INDIA_HUB_OTP_MESSAGE'], 'when SMS_PROVIDER=smsindiahub');
      if (env.SMS_INDIA_HUB_OTP_MESSAGE && !env.SMS_INDIA_HUB_OTP_MESSAGE.includes('{{otp}}')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMS_INDIA_HUB_OTP_MESSAGE'], message: 'Put {{otp}} where the code goes in the message' });
      }
    }
    if (env.SMS_PROVIDER === 'msg91') need(['MSG91_AUTH_KEY', 'MSG91_OTP_TEMPLATE_ID'], 'when SMS_PROVIDER=msg91');
    if (env.SMS_PROVIDER === 'twilio') need(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'], 'when SMS_PROVIDER=twilio');
    if (env.SMS_PROVIDER === 'console' && env.NODE_ENV !== 'development') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMS_PROVIDER'], message: 'SMS_PROVIDER=console is only allowed when NODE_ENV=development' });
    }
    // In staging/production push must be configured.
    if (env.NODE_ENV !== 'development') {
      need(['FIREBASE_SERVICE_ACCOUNT'], 'outside development (push notifications)');
    }
    if (env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
      } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FIREBASE_SERVICE_ACCOUNT'], message: err.message });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || 'env'}: ${i.message}`);
  // eslint-disable-next-line no-console
  const where = fs.existsSync(ENV_FILE) ? `Settings file: ${ENV_FILE}` : `Settings file NOT FOUND: ${ENV_FILE} (copy backend/.env.example to it and fill it in)`;
  console.error(`\n[config] Invalid environment configuration:\n${lines.join('\n')}\n\n${where}\nSee backend/.env.example\n`);
  process.exit(1);
}

const e = parsed.data;

export const env = Object.freeze({
  ...e,
  isDev: e.NODE_ENV === 'development',
  isProd: e.NODE_ENV === 'production',
  redisEnabled: e.REDIS_ENABLED === 'true',
  bullmqEnabled: e.BULLMQ_ENABLED === 'true',
  defaultOtp: e.DEFAULT_OTP_ENABLED === 'true' ? e.DEFAULT_OTP : null,
  corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  firebaseServiceAccount: e.FIREBASE_SERVICE_ACCOUNT ? parseServiceAccount(e.FIREBASE_SERVICE_ACCOUNT) : undefined,
});

/** Which third-party integrations have credentials present (used by admin Integrations page). */
export const integrations = Object.freeze({
  sms: { provider: e.SMS_PROVIDER, configured: true },
  firebase: { configured: Boolean(e.FIREBASE_SERVICE_ACCOUNT) },
  cloudinary: { configured: Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET) },
  translate: { configured: Boolean(e.GOOGLE_TRANSLATE_API_KEY) },
  maps: { configured: Boolean(e.GOOGLE_MAPS_SERVER_KEY) },
  razorpay: { configured: Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET) },
  email: { configured: Boolean(e.EMAIL_HOST && e.EMAIL_USER && e.EMAIL_PASS && e.EMAIL_FROM) },
});
