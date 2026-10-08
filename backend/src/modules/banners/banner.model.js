import mongoose from 'mongoose';

const { Schema } = mongoose;

const bannerSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 80 }, // optional, English, translated on read
    subtitle: { type: String, trim: true, maxlength: 160 },
    image: { url: { type: String, required: true }, mediaId: { type: Schema.Types.ObjectId, ref: 'Media' } },
    // What tapping the banner does
    action: {
      type: { type: String, enum: ['none', 'category'], default: 'none' },
      categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
    startAt: Date,
    endAt: Date,
  },
  { timestamps: true }
);

bannerSchema.index({ status: 1, order: 1 });

export const Banner = mongoose.model('Banner', bannerSchema);
