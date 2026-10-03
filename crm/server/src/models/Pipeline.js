import mongoose from 'mongoose';
import { PIPELINE_STATUS } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

// A sales process: an ordered set of stages (see PipelineStage) that an
// opportunity moves through. Pipelines are data - administrators create as many
// as the business needs.
const pipelineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    // The pipeline new opportunities go into when none is chosen. Exactly one.
    isDefault: { type: Boolean, default: false },
    // Inactive pipelines keep their opportunities but take no new ones.
    status: { type: String, enum: Object.values(PIPELINE_STATUS), default: PIPELINE_STATUS.ACTIVE },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions() }
);

export default mongoose.model('Pipeline', pipelineSchema);
