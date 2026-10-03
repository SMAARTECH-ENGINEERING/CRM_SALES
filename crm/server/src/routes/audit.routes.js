import { Router } from 'express';
import { MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as auditService from '../services/audit.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { listAuditLogsQuery } from '../validators/audit.validator.js';
import { idParam } from '../validators/common.validator.js';

// Read-only: entries are written by middleware/audit.js and can never be
// changed or deleted through the API. Reading needs audit.read; how much of
// the log a reader sees is decided in the service (audit.viewAll for all).
const router = Router();
router.use(authenticate);

const read = requirePermission('audit.read');

router.get('/', read, validate({ query: listAuditLogsQuery }), async (req, res) => {
  const data = await auditService.listAuditLogs(req.validated.query, req.user);
  return sendSuccess(res, { message: MESSAGES.AUDIT_LOGS_LISTED, data });
});
// The values the filters can take. Declared before /:id.
router.get('/filters', read, async (req, res) => sendSuccess(res, { message: MESSAGES.AUDIT_FILTERS, data: await auditService.getAuditFilters(req.user) }));
router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const auditLog = await auditService.getAuditLog(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.AUDIT_LOG_RETRIEVED, data: { auditLog } });
});

export default router;
