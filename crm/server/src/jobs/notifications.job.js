import env from '../config/env.js';
import logger from '../config/logger.js';
import { runNotificationChecks } from '../services/notification.service.js';

const MINUTE_MS = 60 * 1000;

let timer = null;
let running = false;

async function tick() {
  // A slow run is never overlapped by the next one.
  if (running) return;
  running = true;
  try {
    await runNotificationChecks();
  } catch (err) {
    logger.error({ err }, 'Notification check failed');
  } finally {
    running = false;
  }
}

// Looks for follow-ups that have come due and payments that have become
// overdue, now and then every NOTIFICATION_CHECK_INTERVAL_MINUTES (0 = off).
// Started by server.js only, so tests and scripts never notify by accident.
export function startNotificationJob() {
  const minutes = env.notificationCheckIntervalMinutes;
  if (!minutes) {
    logger.info('Notification check is off (NOTIFICATION_CHECK_INTERVAL_MINUTES=0)');
    return;
  }
  tick();
  timer = setInterval(tick, minutes * MINUTE_MS);
  timer.unref();
  logger.info(`Notification check every ${minutes} minute(s)`);
}

export function stopNotificationJob() {
  if (timer) clearInterval(timer);
  timer = null;
}
