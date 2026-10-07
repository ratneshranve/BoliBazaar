import mongoose from 'mongoose';

/** One document per settings group (branding, appControl, storage, features, security). */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, minimize: false }
);

export const Setting = mongoose.model('Setting', settingSchema);
