import Joi from 'joi';
import { PIPELINE_STATUS, STAGE_TYPE } from '../constants/index.js';
import { objectId } from './common.validator.js';

const description = Joi.string().trim().max(300).allow('', null);
const status = Joi.string().valid(...Object.values(PIPELINE_STATUS));
const color = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^#[0-9a-f]{6}$/)
  .allow('', null)
  .messages({ 'string.pattern.base': '{{#label}} must be a hex colour such as #1976d2' });

// --- pipelines ---------------------------------------------------------------

const pipelineName = Joi.string().trim().min(2).max(80);

export const listPipelinesQuery = Joi.object({
  // Omitted: everything. active: what opportunity forms offer.
  status: status.allow(''),
  search: Joi.string().trim().max(80).allow(''),
});

export const createPipelineSchema = Joi.object({
  name: pipelineName.required(),
  description,
  isDefault: Joi.boolean(),
  status,
});

// PUT applies the fields that are sent; anything omitted is left unchanged.
export const updatePipelineSchema = Joi.object({
  name: pipelineName,
  description,
  isDefault: Joi.boolean(),
  status,
}).min(1);

// --- stages ------------------------------------------------------------------

const stageName = Joi.string().trim().min(2).max(60);
// Percent: 25 means a 25% chance of winning.
const probability = Joi.number().integer().min(0).max(100);
const type = Joi.string().valid(...Object.values(STAGE_TYPE));
// Position is changed with PATCH /pipeline-stages/reorder, which keeps the
// whole pipeline consistent.
const order = Joi.forbidden().messages({ 'any.unknown': 'order is set with PATCH /pipeline-stages/reorder' });

export const listStagesQuery = Joi.object({
  pipelineId: objectId.allow(''),
  status: status.allow(''),
});

export const createStageSchema = Joi.object({
  pipelineId: objectId.required(),
  name: stageName.required(),
  description,
  probability: probability.required(),
  color,
  type,
  status,
  order,
});

export const updateStageSchema = Joi.object({
  name: stageName,
  description,
  probability,
  color,
  type,
  status,
  order,
  // A stage stays in its pipeline.
  pipelineId: Joi.forbidden(),
}).min(1);

export const reorderStagesSchema = Joi.object({
  pipelineId: objectId.required(),
  // Every stage of the pipeline, in the new left-to-right order.
  stageIds: Joi.array().items(objectId).min(1).max(100).unique().required(),
});
