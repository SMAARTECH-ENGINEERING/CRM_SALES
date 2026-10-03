import { MESSAGES, USER_STATUS } from '../constants/index.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { hashPassword } from '../utils/password.js';
import { assertPasswordPolicy } from './settings.service.js';
import {
  coversRole,
  declarePermission,
  hasPermission,
  ROLE_WITH_PERMISSIONS,
} from '../utils/permissions.js';
import { searchFilter } from '../utils/query.js';
import { assertDepartmentExists } from './department.service.js';
import { getAssignableRole, getDefaultRole } from './role.service.js';

const ASSIGN_ROLE = declarePermission('users.assignRole');

const POPULATE = [
  ROLE_WITH_PERMISSIONS,
  { path: 'departmentId', select: 'name' },
  { path: 'organizationId', select: 'name' },
  { path: 'createdBy', select: 'firstName lastName email' },
];

const SEARCH_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'designation'];
const OPTION_SEARCH_FIELDS = ['firstName', 'lastName', 'email'];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isSelf = (actor, target) => actor.id === target.id;

// --- authorization rules -----------------------------------------------------

// Managing (editing, deactivating, resetting, deleting) someone with more access
// than yourself would be a path to privilege escalation - e.g. resetting an
// administrator's password and signing in as them.
function assertCanManage(actor, target) {
  if (!coversRole(actor, target.roleId)) {
    throw ApiError.forbidden(MESSAGES.USER_MANAGE_FORBIDDEN);
  }
}

// Assigning a role needs the dedicated permission, and the role may not carry
// more access than the actor has.
function assertCanAssignRole(actor, role) {
  if (!hasPermission(actor, ASSIGN_ROLE) || !coversRole(actor, role)) {
    throw ApiError.forbidden(MESSAGES.ROLE_ASSIGN_FORBIDDEN);
  }
}

// --- helpers -----------------------------------------------------------------

export async function assertEmailAvailable(email, excludeId) {
  const filter = excludeId ? { email, _id: { $ne: excludeId } } : { email };
  const existing = await User.findOne(filter).select('deletedAt').setOptions({ withDeleted: true });
  if (!existing) return;

  const message = existing.deletedAt ? MESSAGES.EMAIL_DELETED_USER : MESSAGES.EMAIL_TAKEN;
  throw ApiError.conflict(message, [{ field: 'email', message }]);
}

async function assertOrganizationExists(organizationId) {
  if (!(await Organization.exists({ _id: organizationId, isActive: true }))) {
    throw ApiError.badRequest(MESSAGES.ORGANIZATION_NOT_FOUND, [{ field: 'organizationId', message: MESSAGES.ORGANIZATION_NOT_FOUND }]);
  }
}

async function findUser(id) {
  const user = await User.findById(id).populate(POPULATE);
  if (!user) throw ApiError.notFound(MESSAGES.USER_NOT_FOUND);
  return user;
}

// Optional text fields: an empty string or null clears the value.
function applyOptional(user, input, fields) {
  for (const field of fields) {
    if (field in input) user[field] = input[field] || undefined;
  }
}

function revokeSessions(user) {
  user.tokenVersion += 1;
  user.refreshTokenHash = undefined;
}

// --- operations --------------------------------------------------------------

export async function listUsers({ page, limit, search, status, roleId, departmentId, sortBy, sortOrder }) {
  const filter = {};
  if (status) filter.status = status;
  if (roleId) filter.roleId = roleId;
  if (departmentId) filter.departmentId = departmentId;

  if (search) {
    // Every word must match at least one field, so "jane smith" finds Jane Smith.
    filter.$and = search
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => {
        const pattern = new RegExp(escapeRegex(term), 'i');
        return { $or: SEARCH_FIELDS.map((field) => ({ [field]: pattern })) };
      });
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 };

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export function getUser(id) {
  return findUser(id);
}

// Minimal list of active users for "assign to" pickers on other screens. It
// exposes names and emails only, so it does not need full users.read access.
export async function listUserOptions({ search, limit }) {
  const users = await User.find({ status: USER_STATUS.ACTIVE, ...searchFilter(search, OPTION_SEARCH_FIELDS) })
    .select('firstName lastName email')
    .sort({ firstName: 1, lastName: 1 })
    .collation({ locale: 'en', strength: 2 })
    .limit(limit);

  return users.map((user) => ({ id: user.id, fullName: user.fullName, email: user.email }));
}

export async function createUser(input, actor) {
  let role;
  if (input.roleId) {
    role = await getAssignableRole(input.roleId);
    assertCanAssignRole(actor, role);
  } else {
    role = await getDefaultRole();
  }

  if (input.departmentId) await assertDepartmentExists(input.departmentId);
  if (input.organizationId) await assertOrganizationExists(input.organizationId);
  await assertEmailAvailable(input.email);
  await assertPasswordPolicy(input.password);

  const user = new User({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    roleId: role._id,
    departmentId: input.departmentId || undefined,
    organizationId: input.organizationId || undefined,
    createdBy: actor.id,
  });
  applyOptional(user, input, ['phone', 'designation', 'profileImage']);
  await user.save();

  return findUser(user.id);
}

export async function updateUser(id, input, actor) {
  const user = await findUser(id);
  assertCanManage(actor, user);

  if (input.roleId && input.roleId !== String(user.roleId?._id)) {
    if (isSelf(actor, user)) throw ApiError.forbidden(MESSAGES.OWN_ROLE_FORBIDDEN);
    const role = await getAssignableRole(input.roleId);
    assertCanAssignRole(actor, role);
    user.roleId = role._id;
    // Access changed: make the user's existing tokens unusable.
    revokeSessions(user);
  }

  if (input.email && input.email !== user.email) {
    await assertEmailAvailable(input.email, user.id);
    user.email = input.email;
  }

  if ('organizationId' in input) {
    if (input.organizationId) await assertOrganizationExists(input.organizationId);
    user.organizationId = input.organizationId || undefined;
  }

  if ('departmentId' in input) {
    if (input.departmentId) await assertDepartmentExists(input.departmentId);
    user.departmentId = input.departmentId || undefined;
  }

  if (input.firstName) user.firstName = input.firstName;
  if (input.lastName) user.lastName = input.lastName;
  applyOptional(user, input, ['phone', 'designation', 'profileImage']);

  await user.save();
  return findUser(id);
}

export async function setUserStatus(id, status, actor) {
  const user = await findUser(id);
  if (isSelf(actor, user)) throw ApiError.forbidden(MESSAGES.OWN_STATUS_FORBIDDEN);
  assertCanManage(actor, user);

  user.status = status;
  if (status === USER_STATUS.INACTIVE) revokeSessions(user);

  await user.save();
  return user;
}

export async function resetUserPassword(id, newPassword, actor) {
  const user = await findUser(id);
  if (isSelf(actor, user)) throw ApiError.forbidden(MESSAGES.OWN_RESET_FORBIDDEN);
  assertCanManage(actor, user);

  await assertPasswordPolicy(newPassword, 'newPassword');
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  revokeSessions(user);

  await user.save();
}

export async function deleteUser(id, actor) {
  const user = await findUser(id);
  if (isSelf(actor, user)) throw ApiError.forbidden(MESSAGES.OWN_DELETE_FORBIDDEN);
  assertCanManage(actor, user);

  user.deletedAt = new Date();
  user.status = USER_STATUS.INACTIVE;
  revokeSessions(user);

  await user.save();
}
