import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';

// Off in tests, and wherever RATE_LIMIT_ENABLED=false.
const skip = () => env.isTest || !env.rateLimit.enabled;

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler: (req, res, next) =>
    next(new ApiError(HTTP_STATUS.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY_REQUESTS)),
});

// Counts only failed logins, so normal use never trips it.
export const loginLimiter = rateLimit({
  windowMs: env.loginRateLimit.windowMs,
  limit: env.loginRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  handler: (req, res, next) =>
    next(new ApiError(HTTP_STATUS.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY_LOGIN_ATTEMPTS)),
});
