import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ['user', 'admin'], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    purpose: {
      type: String,
      enum: ['listing', 'avatar', 'chat', 'chat_file', 'document', 'kyc', 'resume', 'banner', 'branding', 'category', 'cms'],
      required: true,
    },
    visibility: { type: String, enum: ['public', 'private'], required: true },
    provider: { type: String, enum: ['cloudinary', 'local', 'private'], required: true },
    key: { type: String, required: true },
    url: { type: String }, // only for public media
    name: String, // original file name (private documents)
    mime: String,
    size: Number,
    width: Number,
    height: Number,
    status: { type: String, enum: ['ready', 'rejected', 'deleted'], default: 'ready' },
    attachedTo: { kind: String, id: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

mediaSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
mediaSchema.index({ 'attachedTo.kind': 1, 'attachedTo.id': 1 });

export const Media = mongoose.model('Media', mediaSchema);
