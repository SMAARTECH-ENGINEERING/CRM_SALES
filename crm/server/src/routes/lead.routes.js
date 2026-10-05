import { Router } from 'express';
import * as lead from '../controllers/lead.controller.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import { MESSAGES } from '../constants/index.js';
import { emailLeads } from '../services/leadEmail.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  assignLeadSchema,
  bulkEmailSchema,
  convertLeadSchema,
  createLeadSchema,
  leadPagingQuery,
  leadStatusSchema,
  listLeadsQuery,
  updateLeadSchema,
} from '../validators/lead.validator.js';

const router = Router();

router.use(authenticate);

const read = requirePermission('leads.read');
const update = requirePermission('leads.update');

router.get('/', read, validate({ query: listLeadsQuery }), lead.listLeads);
router.post('/', requirePermission('leads.create'), validate({ body: createLeadSchema }), lead.createLead);
// One email to the contacts of several leads (each gets their own copy).
router.post('/bulk-email', read, requirePermission('leads.email'), validate({ body: bulkEmailSchema }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.LEAD_EMAIL_SENT, data: await emailLeads(req.validated.body, req.user) })
);

router.get('/:id', read, validate({ params: idParam }), lead.getLead);
router.put('/:id', update, validate({ params: idParam, body: updateLeadSchema }), lead.updateLead);
router.delete('/:id', requirePermission('leads.delete'), validate({ params: idParam }), lead.deleteLead);

router.patch(
  '/:id/assign',
  requirePermission('leads.assign'),
  validate({ params: idParam, body: assignLeadSchema }),
  lead.assignLead
);
router.patch('/:id/status', update, validate({ params: idParam, body: leadStatusSchema }), lead.changeStatus);
router.post(
  '/:id/convert',
  requirePermission('leads.convert'),
  validate({ params: idParam, body: convertLeadSchema }),
  lead.convertLead
);

router.get('/:id/timeline', read, validate({ params: idParam, query: leadPagingQuery }), lead.getTimeline);

// A lead's activities and follow-ups are served by the generic endpoints:
//   GET /activities?leadId=<id>      GET /followups?relatedType=lead&relatedId=<id>

export default router;
