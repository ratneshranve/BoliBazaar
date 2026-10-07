import mongoose from 'mongoose';

/** Append-only. No update/delete endpoints exist for this collection. */
const auditLogSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: ['admin', 'user', 'system'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId },
    actorName: { type: String },
    action: { type: String, required: true }, // e.g. "settings.update"
    entityType: { type: String, required: true },
    entityId: { type: String },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
