import logger from '../config/logger.js';
import TimelineEvent from '../models/TimelineEvent.js';
import { paginationMeta } from '../utils/query.js';

// The actor may since have been deleted; their name should still show.
const ACTOR = { path: 'actorId', select: 'firstName lastName email', options: { withDeleted: true } };

// Compares two { field: displayValue } snapshots and returns what changed.
export function diffSnapshots(before, after, labels) {
  return Object.keys(labels)
    .filter((field) => (before[field] ?? '') !== (after[field] ?? ''))
    .map((field) => ({
      field,
      label: labels[field],
      from: before[field] || undefined,
      to: after[field] || undefined,
    }));
}

// History must never block the action it describes: a failed write is logged
// and the request carries on.
export async function recordEvent({ entityType, entityId, action, changes = [], summary, actor }) {
  try {
    await TimelineEvent.create({ entityType, entityId, action, changes, summary, actorId: actor?._id });
  } catch (err) {
    logger.error({ err, entityType, entityId, action }, 'Failed to record timeline event');
  }
}

export function countEvents(entityType, entityId) {
  return TimelineEvent.countDocuments({ entityType, entityId });
}

export async function listEvents(entityType, entityId, { page, limit }) {
  const filter = { entityType, entityId };
  const [events, total] = await Promise.all([
    TimelineEvent.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(ACTOR),
    TimelineEvent.countDocuments(filter),
  ]);

  return { events, pagination: paginationMeta({ page, limit }, total) };
}
