import mongoose from 'mongoose';

const { Schema } = mongoose;

export const LEAD_TYPES = ['application', 'enquiry']; // job ad → application, service ad → enquiry
export const LEAD_STATUSES = ['new', 'seen', 'shortlisted', 'declined', 'withdrawn'];

/** A job application or a service enquiry sent to an ad's owner. One per person per ad. */
const leadSchema = new Schema(
  {
    type: { type: String, enum: LEAD_TYPES, required: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // who receives it
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // applicant / enquirer
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    statusChangedAt: Date,
  },
  { timestamps: true }
);
leadSchema.index({ listingId: 1, senderId: 1 }, { unique: true });
leadSchema.index({ ownerId: 1, createdAt: -1 });
leadSchema.index({ senderId: 1, createdAt: -1 });

export const Lead = mongoose.model('Lead', leadSchema);
