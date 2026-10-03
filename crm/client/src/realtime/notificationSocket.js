import { io } from 'socket.io-client';
import tokenStorage from '../utils/tokenStorage.js';
import env from '../utils/env.js';

const EVENT = 'notification:new';
const RETRY_MIN_MS = 5 * 1000;
const RETRY_MAX_MS = 60 * 1000;

// Opens the real-time connection for the signed-in user and returns a function
// that closes it.
//
//  - `onNotification({ notification, unreadCount })`: a new notification arrived
//  - `onRefused()`: the server would not accept the token (it has probably
//    expired). The caller should make any API request - that refreshes the
//    token - and the connection is tried again by itself.
//
// Real time is a convenience, not a requirement: if the connection cannot be
// made, the notifications are still fetched periodically (see useNotifications).
export function connectNotifications({ onNotification, onRefused }) {
  // Socket.IO is served by the API server itself, at its origin.
  const socket = io(new URL(env.apiBaseUrl).origin, {
    // Read at every (re)connection, so a refreshed token is picked up.
    auth: (send) => send({ token: tokenStorage.getAccessToken() }),
    reconnectionDelayMax: RETRY_MAX_MS,
  });

  let retry = null;
  let delay = RETRY_MIN_MS;
  socket.on(EVENT, onNotification);
  socket.on('connect', () => {
    delay = RETRY_MIN_MS;
  });
  socket.on('connect_error', () => {
    // A network failure is retried by socket.io itself; a refusal is not.
    if (socket.active) return;
    onRefused?.();
    clearTimeout(retry);
    retry = setTimeout(() => socket.connect(), delay);
    delay = Math.min(delay * 2, RETRY_MAX_MS);
  });

  return () => {
    clearTimeout(retry);
    socket.disconnect();
  };
}
