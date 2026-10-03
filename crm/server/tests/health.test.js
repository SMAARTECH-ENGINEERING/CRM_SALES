import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';

// Env must be in place before the app (and its config) is imported.
process.env.NODE_ENV = 'test';
process.env.API_PREFIX = '/api/v1';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/crm_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-000';

const { default: app } = await import('../src/app.js');

test('GET /api/v1/health returns the health payload', async () => {
  const res = await request(app).get('/api/v1/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, message: 'CRM API is running' });
});

test('unknown routes return the standard error format', async () => {
  const res = await request(app).get('/api/v1/does-not-exist');

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(typeof res.body.message, 'string');
  assert.ok(Array.isArray(res.body.errors));
});

test('malformed JSON returns a 400 in the standard error format', async () => {
  const res = await request(app)
    .post('/api/v1/health')
    .set('Content-Type', 'application/json')
    .send('{"broken":');

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.ok(Array.isArray(res.body.errors));
});

test('security headers are set and x-powered-by is removed', async () => {
  const res = await request(app).get('/api/v1/health');

  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
