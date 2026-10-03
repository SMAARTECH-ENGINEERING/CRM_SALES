import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as pipelineService from '../services/pipeline.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listPipelines(req, res) {
  const pipelines = await pipelineService.listPipelines(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PIPELINES_LISTED, data: { pipelines } });
}

export async function getPipeline(req, res) {
  const data = await pipelineService.getPipeline(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PIPELINE_RETRIEVED, data });
}

export async function createPipeline(req, res) {
  const pipeline = await pipelineService.createPipeline(req.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.PIPELINE_CREATED, data: { pipeline } });
}

export async function updatePipeline(req, res) {
  const pipeline = await pipelineService.updatePipeline(req.validated.params.id, req.body);
  return sendSuccess(res, { message: MESSAGES.PIPELINE_UPDATED, data: { pipeline } });
}

export async function deletePipeline(req, res) {
  await pipelineService.deletePipeline(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PIPELINE_DELETED });
}

export async function listStages(req, res) {
  const stages = await pipelineService.listStages(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.STAGES_LISTED, data: { stages } });
}

export async function createStage(req, res) {
  const stage = await pipelineService.createStage(req.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.STAGE_CREATED, data: { stage } });
}

export async function updateStage(req, res) {
  const stage = await pipelineService.updateStage(req.validated.params.id, req.body);
  return sendSuccess(res, { message: MESSAGES.STAGE_UPDATED, data: { stage } });
}

export async function deleteStage(req, res) {
  await pipelineService.deleteStage(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.STAGE_DELETED });
}

export async function reorderStages(req, res) {
  const stages = await pipelineService.reorderStages(req.body);
  return sendSuccess(res, { message: MESSAGES.STAGES_REORDERED, data: { stages } });
}
