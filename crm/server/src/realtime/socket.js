import { Server } from 'socket.io';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { USER_STATUS } from '../constants/index.js';
import User from '../models/User.js';
import { verifyAccessToken } from '../utils/jwt.js';

// Real-time delivery over Socket.IO, on the same HTTP server as the API.
//
// A browser connects with its access token ({ auth: { token } }); the token is
// checked exactly as for an API request. Each connection joins one room, named
// after its user, and the server only ever emits to that room - a client
// cannot subscribe to anyone else's.
//
// Nothing here is required for the API to work: without a socket server
// (tests, scripts) emitting is a no-op and clients fall back to fetching.

const RECHECK_MS = 5 * 60 * 1000;
const room = (userId) => `user:${userId}`;

let io = null;

// The user a token belongs to, or null when the token is no longer good.
async function userOf(token) {
  const claims = verifyAccessToken(token);
  const user = await User.findById(claims.sub).select('tokenVersion status');
  if (!user || user.tokenVersion !== claims.tv || user.status !== USER_STATUS.ACTIVE) return null;
  return { id: user.id, tokenVersion: user.tokenVersion };
}

export function attachSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // The API serves JSON only; no client bundle from here.
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const user = await userOf(socket.handshake.auth?.token ?? '');
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, tokenVersion } = socket.data.user;
    socket.join(room(id));

    // A connection outlives its token. Signing out, a password or role change
    // and deactivation all bump tokenVersion: the connection is then dropped.
    const timer = setInterval(async () => {
      try {
        const user = await User.findById(id).select('tokenVersion status');
        if (!user || user.tokenVersion !== tokenVersion || user.status !== USER_STATUS.ACTIVE) socket.disconnect(true);
      } catch (err) {
        logger.warn({ err }, 'Socket re-check failed');
      }
    }, RECHECK_MS);
    timer.unref();
    socket.on('disconnect', () => clearInterval(timer));
  });

  logger.info('Socket.IO attached for real-time notifications');
  return io;
}

// Sends an event to every open connection of one user. Never throws.
export function emitToUser(userId, event, payload) {
  try {
    io?.to(room(String(userId))).emit(event, payload);
  } catch (err) {
    logger.warn({ err, event }, 'Socket emit failed');
  }
}

export function closeSocket() {
  io?.close();
  io = null;
}
