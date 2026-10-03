import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { TOKEN_TYPES } from '../constants/index.js';

const ALGORITHM = 'HS256';

export function signAccessToken(payload) {
  return jwt.sign({ ...payload, type: TOKEN_TYPES.ACCESS }, env.jwt.accessSecret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwt.accessExpiresIn,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign({ ...payload, type: TOKEN_TYPES.REFRESH }, env.jwt.refreshSecret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwt.refreshExpiresIn,
    // Makes every refresh token unique, even two issued within the same second.
    jwtid: crypto.randomUUID(),
  });
}

function verify(token, secret, expectedType) {
  const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
  if (decoded.type !== expectedType) {
    throw new jwt.JsonWebTokenError('Unexpected token type');
  }
  return decoded;
}

export function verifyAccessToken(token) {
  return verify(token, env.jwt.accessSecret, TOKEN_TYPES.ACCESS);
}

export function verifyRefreshToken(token) {
  return verify(token, env.jwt.refreshSecret, TOKEN_TYPES.REFRESH);
}
