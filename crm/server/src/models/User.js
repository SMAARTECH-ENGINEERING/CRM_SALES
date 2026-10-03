import mongoose from 'mongoose';
import { USER_STATUS } from '../constants/index.js';

const { ObjectId } = mongoose.Schema.Types;

// Reference fields and the key their populated document is exposed under in JSON.
// The reference field itself always serializes as a plain id.
const POPULATED_ALIASES = { roleId: 'role', departmentId: 'department', organizationId: 'organization', createdBy: 'createdByUser' };

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: ObjectId, ref: 'Role', required: true, index: true },
    departmentId: { type: ObjectId, ref: 'Department', index: true },
    // The organization (branch, region, business unit) the user works in. It
    // sets what their dashboard covers unless they hold dashboard.viewAll.
    organizationId: { type: ObjectId, ref: 'Organization', index: true },
    designation: { type: String, trim: true, maxlength: 100 },
    profileImage: { type: String, trim: true, maxlength: 2048 },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    lastLogin: { type: Date },
    // The user's own interface preferences (theme, language, table columns...).
    // Read and written only through /auth/preferences.
    preferences: { type: mongoose.Schema.Types.Mixed, select: false },
    createdBy: { type: ObjectId, ref: 'User' },

    // SHA-256 of the current refresh token; absent when signed out.
    refreshTokenHash: { type: String, select: false },
    // Embedded in tokens; incrementing it revokes every token issued before.
    tokenVersion: { type: Number, default: 0 },
    passwordChangedAt: { type: Date },
    // Soft delete: the record is kept so references from other records stay valid.
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      // Secrets never leave the server, even if a query explicitly selected them.
      transform(doc, ret) {
        delete ret._id;
        delete ret.passwordHash;
        delete ret.refreshTokenHash;
        delete ret.tokenVersion;
        delete ret.preferences;
        delete ret.deletedAt;

        for (const [path, alias] of Object.entries(POPULATED_ALIASES)) {
          const originalId = doc.populated(path);
          if (originalId) {
            ret[alias] = ret[path];
            ret[path] = String(originalId);
          }
        }
        return ret;
      },
    },
  }
);

userSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

// Deleted users are invisible to every read unless a query opts in with
// .setOptions({ withDeleted: true }).
function excludeDeleted() {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
}
userSchema.pre(/^find/, excludeDeleted);
userSchema.pre('countDocuments', excludeDeleted);

export default mongoose.model('User', userSchema);
