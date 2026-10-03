import { Router } from 'express';
import * as opportunity from '../controllers/opportunity.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  assignOpportunitySchema,
  boardQuery,
  createOpportunitySchema,
  listOpportunitiesQuery,
  moveOpportunitySchema,
  opportunityOptionsQuery,
  opportunityPagingQuery,
  updateOpportunitySchema,
} from '../validators/opportunity.validator.js';

const router = Router();

router.use(authenticate);

const read = requirePermission('opportunities.read');
const update = requirePermission('opportunities.update');

router.get('/', read, validate({ query: listOpportunitiesQuery }), opportunity.listOpportunities);
// A pipeline as Kanban columns. Declared before /:id so "board" is not read as an id.
router.get('/board', read, validate({ query: boardQuery }), opportunity.getBoard);
// Number and name for opportunity pickers on other screens.
router.get(
  '/options',
  authorize('opportunities.read', 'quotations.create', 'quotations.update'),
  validate({ query: opportunityOptionsQuery }),
  opportunity.listOpportunityOptions
);
router.post(
  '/',
  requirePermission('opportunities.create'),
  validate({ body: createOpportunitySchema }),
  opportunity.createOpportunity
);
router.get('/:id', read, validate({ params: idParam }), opportunity.getOpportunity);
router.put('/:id', update, validate({ params: idParam, body: updateOpportunitySchema }), opportunity.updateOpportunity);
router.delete(
  '/:id',
  requirePermission('opportunities.delete'),
  validate({ params: idParam }),
  opportunity.deleteOpportunity
);

router.patch(
  '/:id/stage',
  update,
  validate({ params: idParam, body: moveOpportunitySchema }),
  opportunity.moveOpportunity
);
router.patch(
  '/:id/assign',
  requirePermission('opportunities.assign'),
  validate({ params: idParam, body: assignOpportunitySchema }),
  opportunity.assignOpportunity
);

router.get('/:id/timeline', read, validate({ params: idParam, query: opportunityPagingQuery }), opportunity.getTimeline);

// An opportunity's activities and follow-ups are served by the generic endpoints:
//   GET /activities?opportunityId=<id>      GET /followups?relatedType=opportunity&relatedId=<id>

export default router;
