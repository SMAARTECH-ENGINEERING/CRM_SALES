import { Router } from 'express';
import * as pipeline from '../controllers/pipeline.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  createPipelineSchema,
  createStageSchema,
  listPipelinesQuery,
  listStagesQuery,
  reorderStagesSchema,
  updatePipelineSchema,
  updateStageSchema,
} from '../validators/pipeline.validator.js';

// Pipelines and stages are changed by whoever holds pipelines.manage, and read
// by anyone who works with opportunities (the board and the forms need them) or
// converts leads into them.
const manage = requirePermission('pipelines.manage');
const read = authorize(
  'pipelines.manage',
  'opportunities.read',
  'opportunities.create',
  'opportunities.update',
  'leads.convert'
);

export const pipelineRoutes = Router();
pipelineRoutes.use(authenticate);

pipelineRoutes.get('/', read, validate({ query: listPipelinesQuery }), pipeline.listPipelines);
pipelineRoutes.post('/', manage, validate({ body: createPipelineSchema }), pipeline.createPipeline);
pipelineRoutes.get('/:id', read, validate({ params: idParam }), pipeline.getPipeline);
pipelineRoutes.put('/:id', manage, validate({ params: idParam, body: updatePipelineSchema }), pipeline.updatePipeline);
pipelineRoutes.delete('/:id', manage, validate({ params: idParam }), pipeline.deletePipeline);

export const pipelineStageRoutes = Router();
pipelineStageRoutes.use(authenticate);

pipelineStageRoutes.get('/', read, validate({ query: listStagesQuery }), pipeline.listStages);
pipelineStageRoutes.post('/', manage, validate({ body: createStageSchema }), pipeline.createStage);
// Declared before /:id so "reorder" is not read as an id.
pipelineStageRoutes.patch('/reorder', manage, validate({ body: reorderStagesSchema }), pipeline.reorderStages);
pipelineStageRoutes.put('/:id', manage, validate({ params: idParam, body: updateStageSchema }), pipeline.updateStage);
pipelineStageRoutes.delete('/:id', manage, validate({ params: idParam }), pipeline.deleteStage);
