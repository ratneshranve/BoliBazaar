import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A place is a map point plus a readable label (from Google). `geo.coordinates` is [lng, lat]. */
const locationRefSchema = new Schema(
  {
    label: String, // "Bagbahara, Mahasamund, Chhattisgarh"
    name: String,
    placeId: String,
    countryCode: String,
    address: { type: Schema.Types.Mixed }, // { area, city, district, state, country, pin }
    geo: { type: { type: String, enum: ['Point'] }, coordinates: [Number] },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    name: { type: String, trim: true, maxlength: 80 },
    avatar: { url: String, mediaId: { type: Schema.Types.ObjectId, ref: 'Media' } },
    about: { type: String, trim: true, maxlength: 500 },

    phone: {
      e164: { type: String, required: true },
      countryCode: String,
      verifiedAt: Date,
    },
    email: {
      address: { type: String, lowercase: true, trim: true },
      verifiedAt: Date,
    },

    ageConfirmedAt: Date,
    language: String,
    countryCode: String,
    timezone: String,
    homeLocation: locationRefSchema,
    savedLocations: [
      new Schema({ label: { type: String, maxlength: 40 }, location: locationRefSchema, radiusKm: Number }, { timestamps: true }),
    ],

    seller: {
      type: { type: String, enum: ['individual', 'business'], default: 'individual' },
      businessProfileId: { type: Schema.Types.ObjectId, ref: 'BusinessProfile' },
    },

    privacy: {
      showPhone: { type: String, enum: ['never', 'verified_users', 'everyone'], default: 'never' },
      allowCalls: { type: Boolean, default: false },
      allowWhatsApp: { type: Boolean, default: false },
      callHours: { from: String, to: String },
      showOnlineStatus: { type: Boolean, default: true },
      readReceipts: { type: Boolean, default: true },
    },

    notificationPrefs: { type: Schema.Types.Mixed, default: {} },

    // badges granted by the team after document review
    verification: { idVerifiedAt: Date, businessVerifiedAt: Date, businessName: String },
    deletionRequestedAt: Date,

    status: {
      type: String,
      enum: ['active', 'limited', 'suspended', 'banned', 'deactivated', 'pending_deletion', 'deleted'],
      default: 'active',
    },
    statusReason: String,
    suspendedUntil: Date,

    consents: [{ docType: String, version: Number, acceptedAt: Date, ip: String }],
    profileCompletedAt: Date,
    lastActiveAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ 'phone.e164': 1 }, { unique: true });
userSchema.index({ 'email.address': 1 }, { unique: true, partialFilterExpression: { 'email.address': { $type: 'string' } } });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ name: 'text', 'phone.e164': 'text', 'email.address': 'text' });

export const User = mongoose.model('User', userSchema);
