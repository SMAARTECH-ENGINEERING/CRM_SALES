import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as scraper from '../services/scraper.service.js';
import { importRecords } from '../services/scraperImport.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import { createJobSchema, exportQuery, importPreviewSchema, importSchema, listJobsQuery, listPagesQuery, listRecordsQuery, recheckSchema, recordIdsQuery, updateRecordSchema } from '../validators/scraper.validator.js';

// The web data scraper: jobs that collect public business details from web
// pages, and the results, reviewed before anything is imported into the CRM.
//
//   scraper.read     see jobs (your own; every user's with scraper.viewAll) and results
//   scraper.create   create, cancel and re-run jobs; correct results and choose what to do with them
//   scraper.import   import results - also needs companies.create and contacts.create
//                    (and leads.create to create leads)
//   scraper.export   export results to Excel / CSV
//   scraper.delete   delete a job and its results
const router = Router();
router.use(authenticate);

const read = requirePermission('scraper.read');
const create = requirePermission('scraper.read', 'scraper.create');
const importing = requirePermission('scraper.read', 'scraper.import', 'companies.create', 'contacts.create');

router.get('/stats', read, async (req, res) => sendSuccess(res, { message: MESSAGES.SCRAPE_STATS, data: await scraper.getStats(req.user) }));

// --- jobs ---
router.get('/jobs', read, validate({ query: listJobsQuery }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_JOBS_LISTED, data: await scraper.listJobs(req.validated.query, req.user) })
);
router.post('/jobs', create, validate({ body: createJobSchema }), async (req, res) => {
  const job = await scraper.createJob(req.validated.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.SCRAPE_JOB_CREATED, data: { job } });
});
router.get('/jobs/:id', read, validate({ params: idParam }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_JOB_RETRIEVED, data: { job: await scraper.getJob(req.validated.params.id, req.user) } })
);
router.post('/jobs/:id/cancel', create, validate({ params: idParam }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_JOB_CANCELLED, data: { job: await scraper.cancelJob(req.validated.params.id, req.user) } })
);
router.post('/jobs/:id/rerun', create, validate({ params: idParam }), async (req, res) =>
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.SCRAPE_JOB_CREATED, data: { job: await scraper.rerunJob(req.validated.params.id, req.user) } })
);
router.delete('/jobs/:id', requirePermission('scraper.read', 'scraper.delete'), validate({ params: idParam }), async (req, res) => {
  await scraper.deleteJob(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.SCRAPE_JOB_DELETED });
});

// --- pages visited (and failed) ---
router.get('/pages', read, validate({ query: listPagesQuery }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_PAGES_LISTED, data: await scraper.listPages(req.validated.query, req.user) })
);

// --- results --- (declared before /records/:id)
router.get('/records', read, validate({ query: listRecordsQuery }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_RECORDS_LISTED, data: await scraper.listRecords(req.validated.query, req.user) })
);
router.get('/records/ids', read, validate({ query: recordIdsQuery }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_RECORDS_LISTED, data: { ids: await scraper.listRecordIds(req.validated.query, req.user) } })
);
router.get('/records/export', requirePermission('scraper.read', 'scraper.export'), validate({ query: exportQuery }), async (req, res) => {
  const { format, ...filters } = req.validated.query;
  const file = await scraper.exportRecords(filters, format, req.user);
  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(file.buffer);
});
router.post('/records/recheck', create, validate({ body: recheckSchema }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_RECORDS_LISTED, data: { rechecked: await scraper.recheckRecords(req.validated.body.recordIds, req.user) } })
);
router.get('/records/:id', read, validate({ params: idParam }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_RECORDS_LISTED, data: { record: await scraper.getRecord(req.validated.params.id, req.user) } })
);
router.patch('/records/:id', create, validate({ params: idParam, body: updateRecordSchema }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_RECORD_UPDATED, data: { record: await scraper.updateRecord(req.validated.params.id, req.validated.body, req.user) } })
);

// --- import --- preview first (nothing changes), then in batches.
router.post('/import/preview', importing, validate({ body: importPreviewSchema }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_IMPORT_PREVIEW, data: await importRecords(req.validated.body, req.user, { dryRun: true }) })
);
router.post('/import', importing, validate({ body: importSchema }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SCRAPE_IMPORT_DONE, data: await importRecords(req.validated.body, req.user) })
);

export default router;
