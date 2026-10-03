import { MESSAGES, ROLE_STATUS } from '../constants/index.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { coversKeys, coversRole, declarePermission, hasPermission } from '../utils/permissions.js';
import { resolvePermissionKeys } from './permission.service.js';

const ASSIGN_PERMISSIONS = declarePermission('roles.assignPermissions');

const PERMISSIONS = { path: 'permissions', select: 'key module action description' };

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- lookups used by other services ------------------------------------------

export async function getDefaultRole() {
  const role = await Role.findOne({ isDefault: true, status: ROLE_STATUS.ACTIVE }).populate(PERMISSIONS);
  // Only possible if the seed has not run; fail loudly rather than create users without a role.
  if (!role) throw new Error(MESSAGES.DEFAULT_ROLE_MISSING);
  return role;
}

// A role that is about to be given to a user.
export async function getAssignableRole(id) {
  const role = await Role.findById(id).populate(PERMISSIONS);
  const fail = (message) => ApiError.badRequest(message, [{ field: 'roleId', message }]);

  if (!role) throw fail(MESSAGES.ROLE_NOT_FOUND);
  if (role.status !== ROLE_STATUS.ACTIVE) throw fail(MESSAGES.ROLE_INACTIVE);
  return role;
}

// --- authorization rules -----------------------------------------------------

// Role management must not become a way to gain access:
//  - nobody edits the role they hold (no self-promotion, no locking yourself out);
//  - nobody edits a role that carries more access than they have.
function assertCanManage(actor, role) {
  if (String(actor.roleId?._id) === role.id) {
    throw ApiError.forbidden(MESSAGES.OWN_ROLE_MANAGE_FORBIDDEN);
  }
  if (!coversRole(actor, role)) throw ApiError.forbidden(MESSAGES.ROLE_MANAGE_FORBIDDEN);
}

// A permission can only be granted by someone who holds it.
function assertCanGrant(actor, keys) {
  if (!coversKeys(actor, keys)) throw ApiError.forbidden(MESSAGES.PERMISSION_GRANT_FORBIDDEN);
}

// --- helpers -----------------------------------------------------------------

async function findRole(id) {
  const role = await Role.findById(id).populate(PERMISSIONS);
  if (!role) throw ApiError.notFound(MESSAGES.ROLE_NOT_FOUND);
  return role;
}

async function assertNameAvailable(name, excludeId) {
  const filter = excludeId ? { name, _id: { $ne: excludeId } } : { name };
  const clash = await Role.exists(filter).collation({ locale: 'en', strength: 2 });
  if (clash) {
    throw ApiError.conflict(MESSAGES.ROLE_NAME_TAKEN, [
      { field: 'name', message: MESSAGES.ROLE_NAME_TAKEN },
    ]);
  }
}

// Number of (non-deleted) users per role id.
async function countUsers(roleIds) {
  const rows = await User.aggregate([
    { $match: { roleId: { $in: roleIds }, deletedAt: null } },
    { $group: { _id: '$roleId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function present(role) {
  const counts = await countUsers([role._id]);
  return { ...role.toJSON(), userCount: counts.get(role.id) ?? 0 };
}

// --- operations --------------------------------------------------------------

export async function listRoles({ page, limit, search, status, sortBy, sortOrder }) {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  const [roles, total] = await Promise.all([
    Role.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(PERMISSIONS),
    Role.countDocuments(filter),
  ]);

  const counts = await countUsers(roles.map((role) => role._id));

  return {
    roles: roles.map((role) => ({ ...role.toJSON(), userCount: counts.get(role.id) ?? 0 })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getRole(id) {
  return present(await findRole(id));
}

export async function createRole({ name, description, status, permissions: keys = [] }, actor) {
  // Creating a role with permissions is granting them, so it needs that right too.
  if (keys.length && !hasPermission(actor, ASSIGN_PERMISSIONS)) throw ApiError.forbidden();
  assertCanGrant(actor, keys);

  await assertNameAvailable(name);
  const permissions = await resolvePermissionKeys(keys);

  const role = await Role.create({
    name,
    description: description || undefined,
    status,
    permissions: permissions.map((permission) => permission._id),
  });
  return present(await findRole(role.id));
}

export async function updateRole(id, input, actor) {
  const role = await findRole(id);
  assertCanManage(actor, role);

  if (input.name && input.name !== role.name) {
    await assertNameAvailable(input.name, role._id);
    role.name = input.name;
  }
  if ('description' in input) role.description = input.description || undefined;

  if (input.status && input.status !== role.status) {
    // The full-access and default roles must stay usable.
    if (role.isSystem) throw ApiError.conflict(MESSAGES.ROLE_SYSTEM_STATUS);
    role.status = input.status;
  }

  await role.save();
  return present(role);
}

export async function setRolePermissions(id, keys, actor) {
  const role = await findRole(id);
  if (role.isSuperAdmin) throw ApiError.conflict(MESSAGES.ROLE_FULL_ACCESS_PERMISSIONS);

  assertCanManage(actor, role);
  assertCanGrant(actor, keys);

  const permissions = await resolvePermissionKeys(keys);
  role.permissions = permissions.map((permission) => permission._id);
  await role.save();

  // Nothing to revoke: permissions are resolved per request, so every user with
  // this role is affected from their next call.
  return present(await findRole(id));
}

export async function deleteRole(id, actor) {
  const role = await findRole(id);
  if (role.isSystem) throw ApiError.conflict(MESSAGES.ROLE_SYSTEM_DELETE);
  assertCanManage(actor, role);

  const counts = await countUsers([role._id]);
  if (counts.get(role.id)) throw ApiError.conflict(MESSAGES.ROLE_IN_USE);

  await role.deleteOne();
}
