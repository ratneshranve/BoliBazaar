import 'dotenv/config';
import { z } from 'zod';

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

    MONGODB_URI: required('MONGODB_URI'),
    REDIS_URL: required('REDIS_URL'),

    USER_JWT_SECRET: z.string().min(32, 'USER_JWT_SECRET must be at least 32 chars'),
    ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 chars'),
    OTP_HASH_SECRET: z.string().min(32, 'OTP_HASH_SECRET must be at least 32 chars'),
    USER_ACCESS_TOKEN_TTL: required('USER_ACCESS_TOKEN_TTL'),
    USER_REFRESH_TOKEN_DAYS: z.coerce.number().int().positive(),
    ADMIN_ACCESS_TOKEN_TTL: required('ADMIN_ACCESS_TOKEN_TTL'),

    UPLOAD_DIR: required('UPLOAD_DIR'),
    MAX_UPLOAD_MB: z.coerce.number().positive(),

    SMS_PROVIDER: z.enum(['msg91', 'twilio', 'console']),
    MSG91_AUTH_KEY: optional,
    MSG91_OTP_TEMPLATE_ID: optional,
    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_FROM_NUMBER: optional,

    FIREBASE_PROJECT_ID: optional,
    FIREBASE_CLIENT_EMAIL: optional,
    FIREBASE_PRIVATE_KEY: optional,

    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    CLOUDINARY_FOLDER: optional,

    RAZORPAY_KEY_ID: optional,
    RAZORPAY_KEY_SECRET: optional,
    RAZORPAY_WEBHOOK_SECRET: optional,

    ADMIN_SEED_NAME: optional,
    ADMIN_SEED_EMAIL: optional,
    ADMIN_SEED_PASSWORD: optional,
  })
  .superRefine((env, ctx) => {
    const need = (keys, why) =>
      keys.forEach((k) => {
        if (!env[k]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${k} is required ${why}` });
      });

    if (env.SMS_PROVIDER === 'msg91') need(['MSG91_AUTH_KEY', 'MSG91_OTP_TEMPLATE_ID'], 'when SMS_PROVIDER=msg91');
    if (env.SMS_PROVIDER === 'twilio') need(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'], 'when SMS_PROVIDER=twilio');
    if (env.SMS_PROVIDER === 'console' && env.NODE_ENV !== 'development') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMS_PROVIDER'], message: 'SMS_PROVIDER=console is only allowed when NODE_ENV=development' });
    }
    // In staging/production push must be configured.
    if (env.NODE_ENV !== 'development') {
      need(['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'], 'outside development (push notifications)');
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || 'env'}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`\n[config] Invalid environment configuration:\n${lines.join('\n')}\n\nSee backend/.env.example\n`);
  process.exit(1);
}

const e = parsed.data;

export const env = Object.freeze({
  ...e,
  isDev: e.NODE_ENV === 'development',
  isProd: e.NODE_ENV === 'production',
  corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  firebasePrivateKey: e.FIREBASE_PRIVATE_KEY ? e.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
});

/** Which third-party integrations have credentials present (used by admin Integrations page). */
export const integrations = Object.freeze({
  sms: { provider: e.SMS_PROVIDER, configured: true },
  firebase: { configured: Boolean(e.FIREBASE_PROJECT_ID && e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY) },
  cloudinary: { configured: Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET) },
  razorpay: { configured: Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET) },
});
