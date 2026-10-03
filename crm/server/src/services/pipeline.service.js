import { HTTP_STATUS, MESSAGES, OPPORTUNITY_STATUS, PIPELINE_STATUS, STAGE_TYPE } from '../constants/index.js';
import Opportunity from '../models/Opportunity.js';
import Pipeline from '../models/Pipeline.js';
import PipelineStage from '../models/PipelineStage.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/query.js';

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };
const ACTIVE = PIPELINE_STATUS.ACTIVE;
const STAGE_SORT = { pipelineId: 1, order: 1, _id: 1 };

// --- helpers -----------------------------------------------------------------

const conflict = (message, field) => ApiError.conflict(message, field ? [{ field, message }] : []);
const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const empty = (value) => value === undefined || value === null || value === '';

async function findPipeline(id) {
  const pipeline = await Pipeline.findById(id);
  if (!pipeline) throw ApiError.notFound(MESSAGES.PIPELINE_NOT_FOUND);
  return pipeline;
}

async function findStage(id) {
  const stage = await PipelineStage.findById(id);
  if (!stage) throw ApiError.notFound(MESSAGES.STAGE_NOT_FOUND);
  return stage;
}

async function assertPipelineNameAvailable(name, excludeId) {
  const filter = excludeId ? { name, _id: { $ne: excludeId } } : { name };
  if (await Pipeline.exists(filter).collation(CASE_INSENSITIVE)) {
    throw conflict(MESSAGES.PIPELINE_NAME_TAKEN, 'name');
  }
}

async function assertStageNameAvailable(pipelineId, name, excludeId) {
  const filter = { pipelineId, name, ...(excludeId ? { _id: { $ne: excludeId } } : {}) };
  if (await PipelineStage.exists(filter).collation(CASE_INSENSITIVE)) {
    throw conflict(MESSAGES.STAGE_NAME_TAKEN, 'name');
  }
}

// Exactly one default: making a pipeline the default takes it away from the others.
function clearOtherDefaults(keepId) {
  return Pipeline.updateMany({ _id: { $ne: keepId }, isDefault: true }, { $set: { isDefault: false } });
}

// Rewrites the positions of a pipeline's stages as 1..n in the given order.
function writeOrder(stageIds) {
  if (!stageIds.length) return null;
  return PipelineStage.bulkWrite(
    stageIds.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } } }))
  );
}

const withCounts = async (pipeline) => ({
  ...pipeline.toJSON(),
  stageCount: await PipelineStage.countDocuments({ pipelineId: pipeline._id }),
  opportunityCount: await Opportunity.countDocuments({ pipelineId: pipeline._id }),
});

// --- pipelines ---------------------------------------------------------------

// Everything by default (the Pipelines screen); pickers pass status=active.
export async function listPipelines({ status, search } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');

  const pipelines = await Pipeline.find(filter).sort({ isDefault: -1, name: 1 }).collation(CASE_INSENSITIVE);
  return Promise.all(pipelines.map(withCounts));
}

export async function getPipeline(id) {
  const pipeline = await findPipeline(id);
  const stages = await PipelineStage.find({ pipelineId: pipeline._id }).sort(STAGE_SORT);
  return { pipeline: await withCounts(pipeline), stages };
}

export async function createPipeline(input, actor) {
  await assertPipelineNameAvailable(input.name);

  const pipeline = new Pipeline({
    name: input.name,
    description: input.description || undefined,
    status: input.status ?? ACTIVE,
    createdBy: actor?.id,
  });
  // The first pipeline becomes the default: there must always be one.
  pipeline.isDefault = Boolean(input.isDefault) || !(await Pipeline.exists({ isDefault: true }));
  if (pipeline.isDefault && pipeline.status !== ACTIVE) {
    throw conflict(MESSAGES.PIPELINE_DEFAULT_INACTIVE, 'status');
  }

  await pipeline.save();
  if (pipeline.isDefault) await clearOtherDefaults(pipeline._id);
  return withCounts(pipeline);
}

export async function updatePipeline(id, input) {
  const pipeline = await findPipeline(id);

  if (input.name && input.name !== pipeline.name) {
    await assertPipelineNameAvailable(input.name, pipeline._id);
    pipeline.name = input.name;
  }
  if ('description' in input) pipeline.description = input.description || undefined;

  let becameDefault = false;
  if (typeof input.isDefault === 'boolean' && input.isDefault !== pipeline.isDefault) {
    // The default can only be moved, never simply switched off.
    if (!input.isDefault) throw conflict(MESSAGES.PIPELINE_DEFAULT_REQUIRED, 'isDefault');
    pipeline.isDefault = true;
    becameDefault = true;
  }
  if (input.status) pipeline.status = input.status;
  if (pipeline.isDefault && pipeline.status !== ACTIVE) {
    throw conflict(MESSAGES.PIPELINE_DEFAULT_INACTIVE, 'status');
  }

  await pipeline.save();
  if (becameDefault) await clearOtherDefaults(pipeline._id);
  return withCounts(pipeline);
}

export async function deletePipeline(id) {
  const pipeline = await findPipeline(id);

  // The default may go only when it is the last pipeline left.
  if (pipeline.isDefault && (await Pipeline.exists({ _id: { $ne: pipeline._id } }))) {
    throw ApiError.conflict(MESSAGES.PIPELINE_DEFAULT_DELETE);
  }
  if (await Opportunity.exists({ pipelineId: pipeline._id })) {
    throw ApiError.conflict(MESSAGES.PIPELINE_IN_USE);
  }

  await PipelineStage.deleteMany({ pipelineId: pipeline._id });
  await pipeline.deleteOne();
}

// --- stages ------------------------------------------------------------------

export async function listStages({ pipelineId, status } = {}) {
  const filter = {};
  if (pipelineId) {
    await findPipeline(pipelineId);
    filter.pipelineId = pipelineId;
  }
  if (status) filter.status = status;
  return PipelineStage.find(filter).sort(STAGE_SORT);
}

export async function createStage(input, actor) {
  if (!(await Pipeline.exists({ _id: input.pipelineId }))) {
    throw badReference('pipelineId', MESSAGES.PIPELINE_NOT_FOUND);
  }
  await assertStageNameAvailable(input.pipelineId, input.name);

  // New stages go to the end of the board; PATCH /reorder moves them.
  const last = await PipelineStage.findOne({ pipelineId: input.pipelineId }).sort({ order: -1 }).select('order');
  return PipelineStage.create({
    pipelineId: input.pipelineId,
    name: input.name,
    description: input.description || undefined,
    order: (last?.order ?? 0) + 1,
    probability: input.probability,
    color: input.color || undefined,
    type: input.type ?? STAGE_TYPE.OPEN,
    status: input.status ?? ACTIVE,
    createdBy: actor?.id,
  });
}

export async function updateStage(id, input) {
  const stage = await findStage(id);

  if (input.name && input.name !== stage.name) {
    await assertStageNameAvailable(stage.pipelineId, input.name, stage._id);
    stage.name = input.name;
  }
  if ('description' in input) stage.description = input.description || undefined;
  if ('color' in input) stage.color = input.color || undefined;
  if (!empty(input.probability)) stage.probability = input.probability;
  if (input.status) stage.status = input.status;

  const typeChanged = input.type && input.type !== stage.type;
  if (typeChanged) stage.type = input.type;
  await stage.save();

  // What the stage means has changed, so the deals sitting in it change with it.
  if (typeChanged) {
    const closed = stage.type !== STAGE_TYPE.OPEN;
    await Opportunity.updateMany(
      { stageId: stage._id },
      closed
        ? { $set: { status: stage.type, closedAt: new Date() } }
        : { $set: { status: OPPORTUNITY_STATUS.OPEN }, $unset: { closedAt: 1 } }
    );
  }
  return stage;
}

export async function deleteStage(id) {
  const stage = await findStage(id);
  if (await Opportunity.exists({ stageId: stage._id })) throw ApiError.conflict(MESSAGES.STAGE_IN_USE);

  await stage.deleteOne();
  // Close the gap so positions stay 1..n.
  const remaining = await PipelineStage.find({ pipelineId: stage.pipelineId }).sort(STAGE_SORT).select('_id');
  await writeOrder(remaining.map((item) => item._id));
}

// `stageIds` is the pipeline's complete list of stages in their new order.
export async function reorderStages({ pipelineId, stageIds }) {
  await findPipeline(pipelineId);

  const current = (await PipelineStage.distinct('_id', { pipelineId })).map(String);
  const complete = current.length === stageIds.length && current.every((stageId) => stageIds.includes(stageId));
  if (!complete) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [
      { field: 'stageIds', message: MESSAGES.STAGE_REORDER_MISMATCH },
    ]);
  }

  await writeOrder(stageIds);
  return PipelineStage.find({ pipelineId }).sort(STAGE_SORT);
}

// --- used by opportunities -----------------------------------------------------

// Where a new opportunity starts. With nothing given: the first active stage of
// the default pipeline. With a pipeline: its first active stage. With a stage:
// that stage (which must belong to the pipeline, if one is given too).
export async function resolveStartingStage({ pipelineId, stageId } = {}) {
  if (stageId) {
    const stage = await PipelineStage.findById(stageId);
    if (!stage) throw badReference('stageId', MESSAGES.STAGE_NOT_FOUND);
    if (pipelineId && String(stage.pipelineId) !== pipelineId) {
      throw badReference('stageId', MESSAGES.STAGE_WRONG_PIPELINE);
    }
    if (stage.status !== ACTIVE) throw badReference('stageId', MESSAGES.STAGE_INACTIVE);

    const pipeline = await Pipeline.findById(stage.pipelineId);
    if (pipeline.status !== ACTIVE) throw badReference('pipelineId', MESSAGES.PIPELINE_INACTIVE);
    return { pipeline, stage };
  }

  let pipeline;
  if (pipelineId) {
    pipeline = await Pipeline.findById(pipelineId);
    if (!pipeline) throw badReference('pipelineId', MESSAGES.PIPELINE_NOT_FOUND);
    if (pipeline.status !== ACTIVE) throw badReference('pipelineId', MESSAGES.PIPELINE_INACTIVE);
  } else {
    pipeline = await Pipeline.findOne({ isDefault: true, status: ACTIVE });
    if (!pipeline) throw ApiError.conflict(MESSAGES.PIPELINE_NONE);
  }

  const stage = await PipelineStage.findOne({ pipelineId: pipeline._id, status: ACTIVE }).sort(STAGE_SORT);
  if (!stage) {
    throw pipelineId ? badReference('pipelineId', MESSAGES.PIPELINE_NO_STAGE) : ApiError.conflict(MESSAGES.PIPELINE_NONE);
  }
  return { pipeline, stage };
}

// The stage an existing opportunity is being moved to: it must exist, be active
// and belong to the opportunity's own pipeline.
export async function resolveTargetStage(pipelineId, stageId) {
  const stage = await PipelineStage.findById(stageId);
  if (!stage) throw badReference('stageId', MESSAGES.STAGE_NOT_FOUND);
  if (String(stage.pipelineId) !== String(pipelineId)) throw badReference('stageId', MESSAGES.STAGE_WRONG_PIPELINE);
  if (stage.status !== ACTIVE) throw badReference('stageId', MESSAGES.STAGE_INACTIVE);
  return stage;
}
