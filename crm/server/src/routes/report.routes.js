import { Router } from 'express';
import { MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as reportService from '../services/report.service.js';
import { buildExport } from '../services/reportExport.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { exportReportQuery, reportParams, runReportQuery } from '../validators/report.validator.js';

// reports.read opens reporting; each report also needs the permission to read
// its module (checked in the service), and exporting needs reports.export.
const router = Router();
router.use(authenticate);

const read = requirePermission('reports.read');

// The reports this user can run, with their columns and filters.
router.get('/', read, async (req, res) => sendSuccess(res, { message: MESSAGES.REPORTS_LISTED, data: await reportService.listReports(req.user) }));

// One page of a report. ?from=&to=&dateField=&search=&sortBy=&sortOrder=&page=&limit= plus the report's own filters.
router.get('/:key', read, validate({ params: reportParams, query: runReportQuery }), async (req, res) => {
  const data = await reportService.runReport(req.validated.params.key, req.validated.query, req.user);
  return sendSuccess(res, { message: MESSAGES.REPORT_RETRIEVED, data });
});

// The same report as a file: ?format=csv | xlsx | pdf. The body is the file.
router.get('/:key/export', requirePermission('reports.read', 'reports.export'), validate({ params: reportParams, query: exportReportQuery }), async (req, res) => {
  const { format, ...query } = req.validated.query;
  const data = await reportService.collectReport(req.validated.params.key, query, req.user);
  const file = await buildExport(data, format);
  res.attachment(file.fileName);
  res.type(file.contentType);
  res.set('Cache-Control', 'private, no-store');
  // So a client can warn that the file does not hold every matching row.
  res.set('X-Report-Rows', String(data.rows.length));
  res.set('X-Report-Total-Rows', String(data.totalRows));
  res.set('X-Report-Truncated', String(data.truncated));
  return res.send(file.buffer);
});

export default router;
