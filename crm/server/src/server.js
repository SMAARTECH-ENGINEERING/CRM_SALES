import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import env from './config/env.js';
import logger from './config/logger.js';
import {
  backfillCustomers,
  seedActivityTypes,
  flagQualifiedLeadStatuses,
  seedLeadConfig,
  seedPipelines,
  seedProjectStatuses,
  seedOrderStatuses,
  seedQuotationStatuses,
  seedContractSettings,
  seedPaymentSettings,
  seedDocumentSettings,
  seedTicketSettings,
  syncRbac,
  verifyDeclaredPermissions,
} from './services/seed.service.js';
import { startContractReminderJob, stopContractReminderJob } from './jobs/contractReminders.job.js';
import { startNotificationJob, stopNotificationJob } from './jobs/notifications.job.js';
import { attachSocket, closeSocket } from './realtime/socket.js';
import { backfillSearchKeys } from './services/search.service.js';
import { backfillDocumentDetails } from './services/document.service.js';
import { resumeScrapeJobs } from './services/scraper.service.js';

const SHUTDOWN_TIMEOUT_MS = 10000;

let server;

async function start() {
  await connectDB();
  await syncRbac();
  await seedLeadConfig();
  await flagQualifiedLeadStatuses();
  await seedActivityTypes();
  await seedPipelines();
  await seedQuotationStatuses();
  await seedOrderStatuses();
  await backfillCustomers();
  await seedProjectStatuses();
  await seedTicketSettings();
  await seedContractSettings();
  await seedPaymentSettings();
  await seedDocumentSettings();
  await backfillDocumentDetails();
  await backfillSearchKeys();
  await verifyDeclaredPermissions();
  await resumeScrapeJobs();
  server = app.listen(env.port, () => {
    logger.info(`CRM API listening on http://localhost:${env.port}${env.apiPrefix} [${env.nodeEnv}]`);
    startContractReminderJob();
    startNotificationJob();
  });
  // Real-time notifications share the HTTP server and its port.
  attachSocket(server);
  server.on('error', (err) => {
    logger.fatal({ err }, 'HTTP server error');
    process.exit(1);
  });
}

async function shutdown(reason, exitCode = 0) {
  logger.info(`Shutting down (${reason})`);
  const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
  force.unref();
  stopContractReminderJob();
  stopNotificationJob();
  closeSocket();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    exitCode = 1;
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
