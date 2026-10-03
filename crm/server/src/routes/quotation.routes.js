import { Router } from 'express';
import * as quotation from '../controllers/quotation.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  calculateQuotationSchema,
  createQuotationSchema,
  listQuotationsQuery,
  quotationPagingQuery,
  quotationStatusSchema,
  sendQuotationSchema,
  updateQuotationSchema,
} from '../validators/quotation.validator.js';

const router = Router();

router.use(authenticate);

const read = requirePermission('quotations.read');
const update = requirePermission('quotations.update');

router.get('/', read, validate({ query: listQuotationsQuery }), quotation.listQuotations);
// Prices lines and totals without saving - what the builder shows while typing.
// Declared before /:id so "calculate" is not read as an id.
router.post(
  '/calculate',
  authorize('quotations.create', 'quotations.update'),
  validate({ body: calculateQuotationSchema }),
  quotation.calculateQuotation
);
router.post(
  '/',
  requirePermission('quotations.create'),
  validate({ body: createQuotationSchema }),
  quotation.createQuotation
);
router.get('/:id', read, validate({ params: idParam }), quotation.getQuotation);
router.put('/:id', update, validate({ params: idParam, body: updateQuotationSchema }), quotation.updateQuotation);
router.delete('/:id', requirePermission('quotations.delete'), validate({ params: idParam }), quotation.deleteQuotation);

router.patch(
  '/:id/status',
  update,
  validate({ params: idParam, body: quotationStatusSchema }),
  quotation.changeStatus
);
router.post(
  '/:id/send',
  requirePermission('quotations.send'),
  validate({ params: idParam, body: sendQuotationSchema }),
  quotation.sendQuotation
);
// Responds with the PDF file itself (application/pdf).
router.post('/:id/pdf', read, validate({ params: idParam }), quotation.downloadPdf);

router.get('/:id/timeline', read, validate({ params: idParam, query: quotationPagingQuery }), quotation.getTimeline);

export default router;
