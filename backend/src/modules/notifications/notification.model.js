import mongoose from 'mongoose';

const { Schema } = mongoose;

/** In-app inbox entry. Removed automatically after 180 days. */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: String, required: true },
    group: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    route: String, // where tapping it leads, e.g. /listing/<id>
    readAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const Notification = mongoose.model('Notification', notificationSchema);

/** Admin-editable wording for each event (English; translated per user). */
const templateSchema = new Schema(
  {
    event: { type: String, required: true, unique: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 400 },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true }
);

export const NotificationTemplate = mongoose.model('NotificationTemplate', templateSchema);
