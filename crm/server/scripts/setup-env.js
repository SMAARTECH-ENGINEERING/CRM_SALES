// Creates server/.env from .env.example with freshly generated JWT secrets.
// Safe to re-run: an existing .env is never overwritten.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = path.join(serverRoot, '.env.example');
const envPath = path.join(serverRoot, '.env');

if (fs.existsSync(envPath)) {
  console.log('server/.env already exists - left untouched');
  process.exit(0);
}

const secret = () => crypto.randomBytes(48).toString('hex');

const contents = fs
  .readFileSync(examplePath, 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret()}`)
  .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${secret()}`);

fs.writeFileSync(envPath, contents);
console.log('Created server/.env with generated JWT secrets');
