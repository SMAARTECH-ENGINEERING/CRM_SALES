import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema(
  {
    module: { type: String, required: true, trim: true, maxlength: 50, index: true },
    action: { type: String, required: true, trim: true, maxlength: 50 },
    // "<module>.<action>" - what routes ask for via requirePermission().
    key: { type: String, required: true, unique: true, trim: true, maxlength: 101 },
    description: { type: String, trim: true, maxlength: 500 },
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

export default mongoose.model('Permission', permissionSchema);
