import mongoose from 'mongoose';

/** Cache of machine translations so each English text is translated once per language. */
const schema = new mongoose.Schema(
  {
    lang: { type: String, required: true },
    hash: { type: String, required: true }, // sha1 of the English source text
    source: { type: String, required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ lang: 1, hash: 1 }, { unique: true });

export const TranslationCache = mongoose.model('TranslationCache', schema);

/**
 * The app's whole UI text in one language, ready to send (one document per language).
 * `strings` is the flat { "auth.title": "…" } object as JSON text (keys contain dots).
 * `sourceVersion` changes when en.json (or a hand-written file) changes; `version` is a hash of the strings.
 */
const bundleSchema = new mongoose.Schema(
  {
    lang: { type: String, required: true, unique: true },
    sourceVersion: { type: String, required: true },
    version: { type: String, required: true },
    strings: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const TranslationBundle = mongoose.model('TranslationBundle', bundleSchema);

/** A string an admin corrected by hand. Always wins over the machine translation. */
const overrideSchema = new mongoose.Schema(
  {
    lang: { type: String, required: true },
    key: { type: String, required: true },
    text: { type: String, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true }
);
overrideSchema.index({ lang: 1, key: 1 }, { unique: true });

export const TranslationOverride = mongoose.model('TranslationOverride', overrideSchema);

/** Small key/value store for i18n data fetched from Google (e.g. the list of supported languages). */
const metaSchema = new mongoose.Schema({ _id: String, value: mongoose.Schema.Types.Mixed }, { timestamps: true });

export const I18nMeta = mongoose.model('I18nMeta', metaSchema);
