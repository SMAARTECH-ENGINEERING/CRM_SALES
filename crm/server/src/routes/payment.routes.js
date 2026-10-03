import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as paymentService from '../services/payment.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import {
  createPaymentSchema,
  listPaymentsQuery,
  paymentPagingQuery,
  paymentStatsQuery,
  updatePaymentSchema,
} from '../validators/payment.validator.js';

const router = Router();
router.use(authenticate);

const read = requirePermission('payments.read');

router.get('/', read, validate({ query: listPaymentsQuery }), async (req, res) => {
  const data = await paymentService.listPayments(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PAYMENTS_LISTED, data });
});
// Totals by state, overdue and outstanding. Declared before /:id.
router.get('/stats', read, validate({ query: paymentStatsQuery }), async (req, res) => {
  const data = await paymentService.getPaymentStats(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PAYMENT_STATS, data });
});
router.post('/', requirePermission('payments.create'), validate({ body: createPaymentSchema }), async (req, res) => {
  const payment = await paymentService.createPayment(req.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.PAYMENT_CREATED, data: { payment } });
});
router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const payment = await paymentService.getPayment(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PAYMENT_RETRIEVED, data: { payment } });
});
router.put('/:id', requirePermission('payments.update'), validate({ params: idParam, body: updatePaymentSchema }), async (req, res) => {
  const payment = await paymentService.updatePayment(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.PAYMENT_UPDATED, data: { payment } });
});
router.delete('/:id', requirePermission('payments.delete'), validate({ params: idParam }), async (req, res) => {
  await paymentService.deletePayment(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.PAYMENT_DELETED });
});
router.get('/:id/timeline', read, validate({ params: idParam, query: paymentPagingQuery }), async (req, res) => {
  const data = await paymentService.getPaymentTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PAYMENT_TIMELINE, data });
});

export default router;
