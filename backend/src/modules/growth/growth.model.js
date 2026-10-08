import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A search the user wants to come back to, optionally with alerts for new matching ads. */
const savedSearchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 60 },
    query: { type: Schema.Types.Mixed, required: true }, // same fields as GET /listings
    alerts: { type: Boolean, default: true },
    lastCheckedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
savedSearchSchema.index({ userId: 1, createdAt: -1 });
savedSearchSchema.index({ alerts: 1, lastCheckedAt: 1 });

export const SavedSearch = mongoose.model('SavedSearch', savedSearchSchema);

export const SEGMENTS = ['all', 'sellers', 'state', 'inactive'];

/** A message the admin sends to many users at once (in-app + push). */
const broadcastSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 80 },
    body: { type: String, required: true, maxlength: 300 },
    route: String,
    segment: { type: String, enum: SEGMENTS, required: true },
    state: String, // for segment "state"
    status: { type: String, enum: ['sending', 'sent', 'failed'], default: 'sending' },
    audience: Number,
    sentCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    finishedAt: Date,
  },
  { timestamps: true }
);

export const Broadcast = mongoose.model('Broadcast', broadcastSchema);
