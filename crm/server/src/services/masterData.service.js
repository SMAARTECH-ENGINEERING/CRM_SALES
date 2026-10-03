import { MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/query.js';

// Operations shared by the simple named lists (see models/shared/masterData.js).

export function listActive(Model, { search } = {}) {
  const filter = { isActive: true };
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');
  return Model.find(filter).sort({ name: 1 }).collation({ locale: 'en', strength: 2 });
}

export async function createEntry(Model, { name, description }, actor) {
  // Names are unique regardless of case ("IT" vs "it").
  const clash = await Model.exists({ name }).collation({ locale: 'en', strength: 2 });
  if (clash) {
    throw ApiError.conflict(MESSAGES.MASTER_DATA_NAME_TAKEN, [
      { field: 'name', message: MESSAGES.MASTER_DATA_NAME_TAKEN },
    ]);
  }
  return Model.create({ name, description: description || undefined, createdBy: actor.id });
}

// For a reference that is about to be stored on another record.
export async function assertActiveEntry(Model, id, field, message) {
  if (!(await Model.exists({ _id: id, isActive: true }))) {
    throw ApiError.badRequest(message, [{ field, message }]);
  }
}
