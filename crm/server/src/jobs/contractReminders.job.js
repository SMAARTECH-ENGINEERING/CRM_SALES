import env from '../config/env.js';
import logger from '../config/logger.js';
import { runReminderCheck } from '../services/contractReminder.service.js';

const MINUTE_MS = 60 * 1000;

let timer = null;
let running = false;

async function tick() {
  // A slow run is never overlapped by the next one.
  if (running) return;
  running = true;
  try {
    await runReminderCheck();
  } catch (err) {
    logger.error({ err }, 'Contract reminder check failed');
  } finally {
    running = false;
  }
}

// Runs the contract reminder check now and then every
// CONTRACT_REMINDER_INTERVAL_MINUTES (0 = off). Started by server.js only, so
// tests and scripts never send reminders by accident.
export function startContractReminderJob() {
  const minutes = env.contractReminderIntervalMinutes;
  if (!minutes) {
    logger.info('Contract reminder check is off (CONTRACT_REMINDER_INTERVAL_MINUTES=0)');
    return;
  }
  tick();
  timer = setInterval(tick, minutes * MINUTE_MS);
  // Never keeps the process alive on its own.
  timer.unref();
  logger.info(`Contract reminder check every ${minutes} minute(s)`);
}

export function stopContractReminderJob() {
  if (timer) clearInterval(timer);
  timer = null;
}
