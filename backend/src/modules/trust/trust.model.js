import mongoose from 'mongoose';

const { Schema } = mongoose;

export const REPORT_TARGETS = ['listing', 'user', 'message'];
export const REPORT_STATUSES = ['received', 'under_review', 'action_taken', 'no_violation'];

/** Someone flagged an ad, a person or a chat message. */
const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' }, // whose content it is
    reason: { type: String, required: true },
    details: { type: String, maxlength: 1000 },
    snapshot: { type: Schema.Types.Mixed }, // what it said when reported (evidence)
    status: { type: String, enum: REPORT_STATUSES, default: 'received' },
    resolution: { note: String, by: { type: Schema.Types.ObjectId, ref: 'AdminUser' }, at: Date },
  },
  { timestamps: true }
);
reportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: 1 });

export const Report = mongoose.model('Report', reportSchema);

export const CASE_TYPES = ['support', 'grievance', 'fraud', 'appeal'];
export const CASE_STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];

/** Help desk ticket: support questions, grievances (IT Rules), fraud complaints and appeals. */
const caseSchema = new Schema(
  {
    caseNo: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: CASE_TYPES, required: true },
    subject: { type: String, required: true, maxlength: 140 },
    status: { type: String, enum: CASE_STATUSES, default: 'open' },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    related: { listingId: Schema.Types.ObjectId, auctionId: Schema.Types.ObjectId, dealId: Schema.Types.ObjectId, paymentId: Schema.Types.ObjectId, userId: Schema.Types.ObjectId },
    amountLost: Number, // fraud complaints (major units, as the user typed)
    messages: [
      new Schema(
        { by: { type: String, enum: ['user', 'admin', 'system'], required: true }, adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' }, text: { type: String, maxlength: 4000 }, mediaIds: [{ type: Schema.Types.ObjectId, ref: 'Media' }], internal: Boolean, at: { type: Date, default: Date.now } },
        { _id: true }
      ),
    ],
    assigneeId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    ackBy: Date,
    acknowledgedAt: Date,
    resolveBy: Date,
    resolvedAt: Date,
    lastUserMessageAt: Date,
    lastAdminMessageAt: Date,
  },
  { timestamps: true }
);
caseSchema.index({ userId: 1, createdAt: -1 });
caseSchema.index({ status: 1, resolveBy: 1 });
caseSchema.index({ type: 1, status: 1 });

export const Case = mongoose.model('Case', caseSchema);

export const VERIFICATION_TYPES = ['id', 'business'];

/** Documents sent for an "ID verified" or "Verified business" badge. Numbers are never stored in full. */
const verificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: VERIFICATION_TYPES, required: true },
    docType: { type: String, required: true }, // e.g. "PAN", "Driving licence", "GST certificate"
    docLast4: String,
    businessName: String,
    mediaIds: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reason: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    reviewedAt: Date,
  },
  { timestamps: true }
);
verificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
verificationSchema.index({ status: 1, createdAt: 1 });

export const Verification = mongoose.model('Verification', verificationSchema);
