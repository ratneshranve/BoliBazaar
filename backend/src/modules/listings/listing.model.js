import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PRICE_TYPES = ['fixed', 'negotiable', 'on_request', 'free'];
export const SHIP_COVERAGE = ['city', 'state', 'country', 'worldwide'];
export const SHIP_FEE_TYPES = ['free', 'paid', 'discuss'];
/** Listing types that are physical goods and can be delivered (SOP §16 shipping information). */
export const SHIPPABLE_TYPES = ['sell', 'auction', 'business'];
export const CONDITIONS = ['new', 'used', 'refurbished'];
/** draft is kept on the device; the server only stores submitted listings */
export const LISTING_STATUSES = ['payment_pending', 'pending_review', 'published', 'paused', 'rejected', 'expired', 'sold', 'removed', 'deleted'];

const geoPoint = { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], default: undefined } };

const listingSchema = new Schema(
  {
    listingNo: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryPath: [{ type: Schema.Types.ObjectId }], // ancestors + the category itself
    listingType: { type: String, required: true },

    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    attributes: { type: Schema.Types.Mixed, default: {} }, // validated against the category's form fields
    condition: { type: String, enum: CONDITIONS },

    price: {
      type: { type: String, enum: PRICE_TYPES, required: true },
      amountMinor: { type: Number, min: 0 }, // minor units (paise, cents…)
      currency: { type: String, required: true },
    },

    // pickup only unless delivery is on; the platform does not handle shipping or the money for it
    shipping: {
      delivery: { type: Boolean, default: false },
      coverage: { type: String, enum: SHIP_COVERAGE },
      feeType: { type: String, enum: SHIP_FEE_TYPES },
      feeMinor: { type: Number, min: 0 },
      note: { type: String, maxlength: 200 },
    },

    media: [new Schema({ mediaId: { type: Schema.Types.ObjectId, ref: 'Media' }, url: String }, { _id: false })],

    location: {
      label: String,
      name: String,
      placeId: String,
      address: Schema.Types.Mixed, // { area, city, district, state, country, countryCode, pin }
      geo: geoPoint, // exact — never sent to other users
    },
    publicGeo: geoPoint, // shifted by the admin's "public location shift"; the only point other users see

    status: { type: String, enum: LISTING_STATUSES, required: true },
    moderation: { reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' }, reviewedAt: Date, reason: String },
    publishedAt: Date,
    expiresAt: Date,
    soldAt: Date,

    // paid boosts (see payments/Promotion); each is active while its date is in the future
    promo: { featuredUntil: Date, topUntil: Date, homepageUntil: Date, categoryUntil: Date, locationUntil: Date },
    paidListing: Boolean, // posted by paying the ad fee (does not use up the free quota)

    stats: { views: { type: Number, default: 0 }, favourites: { type: Number, default: 0 }, phoneReveals: { type: Number, default: 0 } },
    searchText: { type: String, default: '' }, // lowercase title + description + category + attribute values
  },
  { timestamps: true, minimize: false }
);

listingSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });
listingSchema.index({ status: 1, expiresAt: 1, publishedAt: -1 });
listingSchema.index({ categoryPath: 1, status: 1, publishedAt: -1 });
listingSchema.index({ publicGeo: '2dsphere' });
listingSchema.index({ status: 1, createdAt: 1 }); // moderation queue
listingSchema.index({ 'promo.featuredUntil': 1, status: 1 });
listingSchema.index({ 'promo.homepageUntil': 1, status: 1 });
listingSchema.index({ 'promo.categoryUntil': 1, status: 1 });
listingSchema.index({ 'promo.locationUntil': 1, status: 1 });
listingSchema.index({ 'promo.topUntil': 1, status: 1 });
listingSchema.index({ 'location.address.countryCode': 1, 'location.address.state': 1, 'location.address.district': 1 });

export const Listing = mongoose.model('Listing', listingSchema);

const favouriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    priceAtSaveMinor: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
favouriteSchema.index({ userId: 1, listingId: 1 }, { unique: true });
favouriteSchema.index({ userId: 1, createdAt: -1 });

export const Favourite = mongoose.model('Favourite', favouriteSchema);
