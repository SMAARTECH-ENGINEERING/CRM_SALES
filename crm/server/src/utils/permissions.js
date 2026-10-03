import { ROLE_STATUS } from '../constants/index.js';

// Access decisions are made from the user's role document as loaded from
// MongoDB for the current request (see middleware/authenticate.js) - never from
// the token, the request body, or a role name.

// How to load a user's role so the helpers below can evaluate it.
export const ROLE_WITH_PERMISSIONS = {
  path: 'roleId',
  populate: { path: 'permissions', select: 'key module action description' },
};

// Every permission key the code asks for registers itself here, so a typo (a key
// that does not exist in the database) can be reported at startup instead of
// silently denying everyone.
const declared = new Set();

export function declarePermission(key) {
  declared.add(key);
  return key;
}

export const declaredPermissions = () => [...declared];

const isActive = (role) => role?.status === ROLE_STATUS.ACTIVE;

// Keys stored on a role (which must have `permissions` populated).
export function roleKeys(role) {
  return (role?.permissions ?? []).map((permission) => permission?.key).filter(Boolean);
}

export function isSuperAdmin(user) {
  const role = user?.roleId;
  return isActive(role) && role.isSuperAdmin === true;
}

export function hasPermission(user, key) {
  const role = user?.roleId;
  if (!isActive(role)) return false;
  return role.isSuperAdmin === true || roleKeys(role).includes(key);
}

// True when granting `keys` would not hand out more access than the actor has.
export function coversKeys(actor, keys) {
  if (isSuperAdmin(actor)) return true;
  return keys.every((key) => hasPermission(actor, key));
}

// True when `role` carries no more access than the actor has. The role's status
// is ignored on purpose: an inactive role could be reactivated later.
export function coversRole(actor, role) {
  if (isSuperAdmin(actor)) return true;
  if (!role || role.isSuperAdmin) return !role;
  return coversKeys(actor, roleKeys(role));
}
