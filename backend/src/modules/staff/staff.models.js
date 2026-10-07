import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    permissions: [{ type: String }],
    isSuper: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false }, // cannot be deleted
  },
  { timestamps: true }
);

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    scopes: {
      countries: [{ type: String }],
      stateIds: [{ type: mongoose.Schema.Types.ObjectId }],
    },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    tokenVersion: { type: Number, default: 0 }, // bump to revoke all sessions
  },
  { timestamps: true }
);

export const Role = mongoose.model('Role', roleSchema);
export const AdminUser = mongoose.model('AdminUser', adminUserSchema);
