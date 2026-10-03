import mongoose from 'mongoose';
import { PIPELINE_STATUS, STAGE_TYPE } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';
import { colorField } from './shared/leadConfig.js';

// One column of a pipeline's board.
const pipelineStageSchema = new mongoose.Schema(
  {
    pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    // Position on the board, left to right. Set by the server (see reorderStages).
    order: { type: Number, required: true },
    // Chance of winning, in percent, given to opportunities that enter the stage.
    probability: { type: Number, required: true, min: 0, max: 100 },
    color: colorField,
    // What reaching this stage means for the deal: still open, won or lost.
    type: { type: String, enum: Object.values(STAGE_TYPE), default: STAGE_TYPE.OPEN },
    // Inactive stages keep their opportunities but cannot be moved into.
    status: { type: String, enum: Object.values(PIPELINE_STATUS), default: PIPELINE_STATUS.ACTIVE },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions() }
);

pipelineStageSchema.index({ pipelineId: 1, order: 1 });

export default mongoose.model('PipelineStage', pipelineStageSchema);
