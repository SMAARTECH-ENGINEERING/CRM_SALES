// Runs the Postman collection, top to bottom, against a real server on a
// throwaway database - every request, with its test scripts.
//
//   npm run test:postman                        (from the repository root)
//   npm run test:postman -- --folder Leads      one folder
//   npm run test:postman -- --verbose           list every request and its status
//
// It starts its own server (port 5096, database crm_postman_run), creates an
// administrator for the run, and removes the database and its uploads
// afterwards. It never touches the database in .env. Newman is fetched with
// npx the first time.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const POSTMAN = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(POSTMAN, '../server');

// Newman is a tool for this script only, not a dependency of the app: it is
// installed once into a folder of its own, outside the project.
const TOOLS = path.join(os.tmpdir(), 'crm-postman-tools');
if (!fs.existsSync(path.join(TOOLS, 'node_modules', 'newman'))) {
  fs.mkdirSync(TOOLS, { recursive: true });
  console.log('Installing Newman (first run only)...');
  const installed = spawnSync('npm', ['install', '--prefix', TOOLS, '--no-audit', '--no-fund', 'newman'], { stdio: 'inherit', shell: true });
  if (installed.status !== 0) throw new Error('Could not install Newman');
}
const newman = createRequire(path.join(TOOLS, 'package.json'))('newman');
const PORT = Number(process.env.POSTMAN_PORT) || 5096;
const DB = process.env.POSTMAN_MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_postman_run';
const ADMIN = { email: 'postman.admin@example.com', password: 'Postman!Adm1n#Pass' };
const args = process.argv.slice(2);
const folder = args.includes('--folder') ? args[args.indexOf('--folder') + 1] : undefined;

const env = { ...process.env, NODE_ENV: 'development', PORT: String(PORT), MONGODB_URI: DB, LOG_LEVEL: 'warn', SMTP_URL: '', SMTP_HOST: '', STORAGE_DRIVER: 'local', UPLOAD_DIR: 'uploads-postman-run', RATE_LIMIT_ENABLED: 'false', CONTRACT_REMINDER_INTERVAL_MINUTES: '0', NOTIFICATION_CHECK_INTERVAL_MINUTES: '0', ADMIN_PASSWORD: ADMIN.password };
const mongoose = (await import(pathToFileURL(SERVER + '/node_modules/mongoose/index.js').href)).default;
await mongoose.connect(DB);
await mongoose.connection.dropDatabase();
const made = spawnSync(process.execPath, ['scripts/create-admin.js', '--first-name', 'Postman', '--last-name', 'Admin', '--email', ADMIN.email], { cwd: SERVER, env, encoding: 'utf8' });
if (made.status !== 0) throw new Error(made.stdout + made.stderr);
const server = spawn(process.execPath, ['src/server.js'], { cwd: SERVER, env, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/api/v1/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const environment = JSON.parse(fs.readFileSync(`${POSTMAN}/CRM.postman_environment.json`, 'utf8'));
const set = (key, value) => {
  const entry = environment.values.find((v) => v.key === key);
  if (entry) entry.value = value;
  else environment.values.push({ key, value, type: 'default', enabled: true });
};
set('baseUrl', `http://localhost:${PORT}/api/v1`);
set('userEmail', ADMIN.email);
set('userPassword', ADMIN.password);
set('newPassword', 'Postman!Adm1n#Pass2');
set('managedUserPassword', 'Managed!Us3r#Pass');

const summary = await new Promise((resolve, reject) =>
  newman.run({ collection: `${POSTMAN}/CRM.postman_collection.json`, environment, folder, workingDir: POSTMAN, reporters: [], timeoutRequest: 20000 }, (err, s) => (err ? reject(err) : resolve(s)))
);
const { stats, failures, executions } = summary.run;
console.log(`folders: ${folder ?? 'all'}   requests: ${stats.requests.total} (failed to send: ${stats.requests.failed})   assertions: ${stats.assertions.total}, failed: ${stats.assertions.failed}`);
const seen = new Set();
for (const f of failures) {
  const where = `${f.parent?.name ?? ''} / ${f.source?.name ?? ''}`;
  const line = `  ✖ ${where}: ${f.error.message.slice(0, 170)}`;
  if (!seen.has(line)) console.log(line);
  seen.add(line);
}
if (args.includes('--verbose')) for (const e of executions) console.log(e.response?.code, e.item.name);

await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
fs.rmSync(`${SERVER}/uploads-postman-run`, { recursive: true, force: true });
process.exit(stats.assertions.failed || stats.requests.failed ? 1 : 0);
