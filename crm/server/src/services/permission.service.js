import { MESSAGES, ROLE_STATUS } from '../constants/index.js';
import Permission from '../models/Permission.js';
import ApiError from '../utils/ApiError.js';
import { isSuperAdmin, roleKeys } from '../utils/permissions.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function listPermissions({ module, search } = {}) {
  const filter = {};
  if (module) filter.module = module;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ key: pattern }, { description: pattern }];
  }
  return Permission.find(filter).sort({ module: 1, action: 1 });
}

// Turns permission keys from a request into documents, rejecting unknown keys.
export async function resolvePermissionKeys(keys) {
  const unique = [...new Set(keys)];
  const permissions = await Permission.find({ key: { $in: unique } });

  const found = new Set(permissions.map((permission) => permission.key));
  const unknown = unique.filter((key) => !found.has(key));
  if (unknown.length) {
    throw ApiError.badRequest(
      MESSAGES.PERMISSION_UNKNOWN,
      unknown.map((key) => ({ field: 'permissions', message: `Unknown permission: ${key}` }))
    );
  }
  return permissions;
}

// The flat list of keys a user effectively holds - what the client uses to
// decide which navigation entries and buttons to show.
export async function effectivePermissionKeys(user) {
  if (isSuperAdmin(user)) return Permission.distinct('key');
  if (user.roleId?.status !== ROLE_STATUS.ACTIVE) return [];
  return roleKeys(user.roleId).sort();
}

// A user as returned by the auth endpoints: the document plus `permissions`.
export async function presentCurrentUser(user) {
  return { ...user.toJSON(), permissions: await effectivePermissionKeys(user) };
}
