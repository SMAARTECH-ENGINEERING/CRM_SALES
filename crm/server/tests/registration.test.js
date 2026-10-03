import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

// Registration closed, as it is by default in production.
setTestEnv('crm_test_registration', { ALLOW_PUBLIC_REGISTRATION: 'false' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { createRole, createUser, defaultRole, loginAs, PASSWORD, seedRbac } = await import(
  './helpers/fixtures.js'
);

const API = '/api/v1/auth';
const newUser = { firstName: 'New', lastName: 'User', email: 'new.user@example.com', password: PASSWORD };

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('anonymous registration is rejected when public registration is off', async () => {
  const res = await request(app).post(`${API}/register`).send(newUser);

  assert.equal(res.status, 403);
  assert.equal(await User.countDocuments({ email: newUser.email }), 0);
});

test('a user without users.create cannot register others', async () => {
  const user = await createUser(await defaultRole());
  const res = await request(app)
    .post(`${API}/register`)
    .set('Authorization', `Bearer ${await loginAs(app, user)}`)
    .send(newUser);

  assert.equal(res.status, 403);
});

test('a user holding users.create can register a user, who gets the default role', async () => {
  const creator = await createUser(await createRole(['users.create']));
  const res = await request(app)
    .post(`${API}/register`)
    .set('Authorization', `Bearer ${await loginAs(app, creator)}`)
    .send(newUser);

  assert.equal(res.status, 201);
  assert.equal(res.body.data.user.role.isDefault, true);
  assert.equal(res.body.data.user.createdBy, creator.id);
});
