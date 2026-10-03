import User from '../models/User.js';

// A user's own interface preferences: theme, language, text size, the sidebar,
// table columns, the dashboard layout. They decide how the app looks to that
// user and nothing else - no permission, record or business rule depends on
// them - so the server only stores them and checks their shape.

export async function getPreferences(userId) {
  const user = await User.findById(userId).select('preferences').lean();
  return user?.preferences ?? {};
}

// Merges `changes` into what is stored: only the keys sent are replaced. A key
// sent as null is removed, which puts that preference back to its default.
export async function updatePreferences(userId, changes) {
  const set = {};
  const unset = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) unset[`preferences.${key}`] = 1;
    else set[`preferences.${key}`] = value;
  }
  const update = { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) };
  // Not a change to the user's record as others see it: updatedAt stays.
  if (Object.keys(update).length) await User.updateOne({ _id: userId }, update, { timestamps: false });
  return getPreferences(userId);
}
