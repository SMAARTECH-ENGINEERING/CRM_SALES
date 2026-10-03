import mongoose from 'mongoose';
import { ROLE_STATUS } from '../constants/index.js';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    // An inactive role grants nothing and cannot be assigned.
    status: {
      type: String,
      enum: Object.values(ROLE_STATUS),
      default: ROLE_STATUS.ACTIVE,
      index: true,
    },
    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],

    // The flags below are set by the seed only - the API never accepts them.
    // System roles cannot be deleted or deactivated.
    isSystem: { type: Boolean, default: false },
    // Holds every permission implicitly, including ones added in the future.
    isSuperAdmin: { type: Boolean, default: false },
    // Assigned to users created without an explicit role.
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        delete ret._id;
        return ret;
      },
    },
  }
);

export default mongoose.model('Role', roleSchema);
