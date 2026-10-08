import mongoose from 'mongoose';

const { Schema } = mongoose;

export const LISTING_TYPES = ['sell', 'rent', 'wanted', 'service', 'job', 'business', 'auction'];
export const ATTRIBUTE_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'year'];

const mediaRef = new Schema({ url: String, mediaId: { type: Schema.Types.ObjectId, ref: 'Media' } }, { _id: false });

/** One form field of a category (rendered by the app's dynamic form; Phase 3). Text is English, translated on read. */
const attributeSchema = new Schema(
  {
    key: { type: String, required: true, match: /^[a-z][a-z0-9_]*$/ },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: ATTRIBUTE_TYPES, required: true },
    required: { type: Boolean, default: false },
    unit: { type: String, trim: true },
    options: [new Schema({ value: { type: String, required: true }, label: { type: String, required: true } }, { _id: false })],
    min: Number,
    max: Number,
    maxLength: Number,
    filterable: { type: Boolean, default: false },
    showOnCard: { type: Boolean, default: false },
    group: { type: String, trim: true },
  },
  { _id: false }
);

const categorySchema = new Schema(
  {
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    ancestors: [{ type: Schema.Types.ObjectId }],
    depth: { type: Number, default: 0 },
    name: { type: String, required: true, trim: true, maxlength: 80 }, // English; translated on read
    slug: { type: String, required: true },
    icon: { type: mediaRef, default: undefined },
    image: { type: mediaRef, default: undefined },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'hidden'], default: 'active' }, // hidden: not shown, existing listings stay
    listingTypes: [{ type: String, enum: LISTING_TYPES }],
    attributes: [attributeSchema],
    rules: {
      minPhotos: { type: Number, default: 1 },
      maxPhotos: { type: Number, default: 10 },
      requiresReview: { type: Boolean, default: true },
      validityDays: { type: Number, default: 30 },
    },
  },
  { timestamps: true }
);

categorySchema.index({ parentId: 1, slug: 1 }, { unique: true });
categorySchema.index({ parentId: 1, order: 1 });
categorySchema.index({ ancestors: 1 });

export const Category = mongoose.model('Category', categorySchema);
