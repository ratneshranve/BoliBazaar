import mongoose from 'mongoose';

const { Schema } = mongoose;

const otpSchema = new Schema(
  {
    target: { type: String, required: true }, // E.164 phone, or "<userId>:<email>" for email_verify
    purpose: { type: String, enum: ['login', 'change_phone', 'delete_account', 'email_verify'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
    ip: String,
    deviceId: String,
  },
  { timestamps: true }
);
otpSchema.index({ target: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    deviceId: String,
    platform: String,
    deviceName: String,
    appVersion: String,
    ip: String,
    lastUsedAt: Date,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokeReason: String,
  },
  { timestamps: true }
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    deviceId: { type: String, required: true },
    fcmToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    osVersion: String,
    appVersion: String,
    model: String,
    locale: String,
    pushEnabled: { type: Boolean, default: true },
    lastSeenAt: Date,
  },
  { timestamps: true }
);
deviceSchema.index({ userId: 1, deviceId: 1 });

export const OtpRequest = mongoose.model('OtpRequest', otpSchema);
export const Session = mongoose.model('Session', sessionSchema);
export const Device = mongoose.model('Device', deviceSchema);
