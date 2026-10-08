import mongoose from 'mongoose';

const { Schema } = mongoose;

/** SOP 15.5 advertising products. */
export const AD_TYPES = ['banner', 'sponsored_listing', 'category_sponsorship', 'business_promotion'];

/** One advertising campaign sold by the team (contract and payment handled by the admin). */
const adSchema = new Schema(
  {
    type: { type: String, enum: AD_TYPES, required: true },
    advertiser: { name: { type: String, required: true, maxlength: 120 }, contact: { type: String, maxlength: 160 } },
    title: { type: String, maxlength: 80 },
    subtitle: { type: String, maxlength: 160 },
    image: { url: String, mediaId: { type: Schema.Types.ObjectId, ref: 'Media' } },
    route: String, // where tapping goes (app path), for banners and category sponsorships
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing' }, // sponsored listing
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' }, // category sponsorship
    sellerId: { type: Schema.Types.ObjectId, ref: 'User' }, // business promotion
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
    priceMinor: { type: Number, default: 0 },
    currency: String,
    paid: { type: Boolean, default: false },
    paidAt: Date,
    paymentNote: String, // invoice / transfer reference
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true }
);
adSchema.index({ type: 1, status: 1, startAt: 1, endAt: 1 });
adSchema.index({ categoryId: 1, type: 1 });

export const Ad = mongoose.model('Ad', adSchema);
