// Call before importing the app: config is read once, at import time.
// Each test file gets its own database because node:test runs files in parallel.
export function setTestEnv(dbName, overrides = {}) {
  const base = process.env.MONGODB_TEST_URI_BASE ?? 'mongodb://127.0.0.1:27017';
  Object.assign(process.env, {
    NODE_ENV: 'test',
    API_PREFIX: '/api/v1',
    // Always forced, so tests can never touch the database named in .env.
    MONGODB_URI: `${base}/${dbName}`,
    JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0000',
    JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-000',
    BCRYPT_SALT_ROUNDS: '10',
    // Never reach a real mail server from tests, whatever .env says.
    SMTP_URL: '',
    SMTP_HOST: '',
    MAIL_FROM: '',
    // Audit entries are written after each response; only the audit tests want them.
    AUDIT_ENABLED: 'false',
    ...overrides,
  });
}
