import request from 'supertest';

// Import lazily: models read config, which must be set by setTestEnv() first.
const { default: Permission } = await import('../../src/models/Permission.js');
const { default: Role } = await import('../../src/models/Role.js');
const { default: User } = await import('../../src/models/User.js');
const { hashPassword } = await import('../../src/utils/password.js');
const { syncRbac } = await import('../../src/services/seed.service.js');

export const PASSWORD = 'Str0ng!Passw0rd';

// Loads the permission catalogue and seed roles, as the server does on start.
export const seedRbac = syncRbac;

export const superAdminRole = () => Role.findOne({ isSuperAdmin: true });
export const defaultRole = () => Role.findOne({ isDefault: true });

export async function allKeys(module) {
  const permissions = await Permission.find(module ? { module } : {});
  return permissions.map((permission) => permission.key);
}

let roleCounter = 0;

// A custom role holding exactly the given permission keys.
export async function createRole(keys, name = `Role ${++roleCounter}`) {
  const permissions = await Permission.find({ key: { $in: keys } });
  if (permissions.length !== keys.length) throw new Error(`Unknown permission key in: ${keys}`);
  return Role.create({ name, permissions: permissions.map((permission) => permission._id) });
}

export async function createUser(role, overrides = {}) {
  const n = await User.countDocuments().setOptions({ withDeleted: true });
  return User.create({
    firstName: 'Test',
    lastName: `Person${n}`,
    email: `person${n}@example.com`,
    passwordHash: await hashPassword(PASSWORD),
    roleId: role._id,
    ...overrides,
  });
}

export async function loginAs(app, user) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: PASSWORD });
  return res.body.data.accessToken;
}
