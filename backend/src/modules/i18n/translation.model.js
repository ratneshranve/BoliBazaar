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
