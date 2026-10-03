import bcrypt from 'bcryptjs';
import env from '../config/env.js';

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
