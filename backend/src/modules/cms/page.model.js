import mongoose from 'mongoose';

/** Page slugs managed from Admin › Content Pages. */
export const PAGE_SLUGS = ['terms', 'privacy', 'support', 'safety', 'prohibited'];
/** Slugs users must accept (version is recorded with their consent). */
export const CONSENT_SLUGS = ['terms', 'privacy'];

const pageSchema = new mongoose.Schema(
  {
    slug: { type: String, enum: PAGE_SLUGS, required: true, unique: true },
    title: { type: mongoose.Schema.Types.Mixed, default: {} }, // { en: "...", hi: "..." }
    body: { type: mongoose.Schema.Types.Mixed, default: {} }, // plain text per language
    version: { type: Number, default: 0 }, // bumps whenever the body text changes
    publishedAt: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, minimize: false }
);

export const ContentPage = mongoose.model('ContentPage', pageSchema);
