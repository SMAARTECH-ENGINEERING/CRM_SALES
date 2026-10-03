import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as customerService from '../services/customer.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import {
  createCustomerSchema,
  customerPagingQuery,
  listCustomersQuery,
  updateCustomerSchema,
} from '../validators/customer.validator.js';

const router = Router();
router.use(authenticate);

const read = requirePermission('customers.read');

router.get('/', read, validate({ query: listCustomersQuery }), async (req, res) => {
  const data = await customerService.listCustomers(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CUSTOMERS_LISTED, data });
});

router.post('/', requirePermission('customers.create'), validate({ body: createCustomerSchema }), async (req, res) => {
  const customer = await customerService.createCustomer(req.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.CUSTOMER_CREATED, data: { customer } });
});

router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const customer = await customerService.getCustomer(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.CUSTOMER_RETRIEVED, data: { customer } });
});

// The 360-degree view: every section with its real count (or "not available
// yet"), plus order, quotation, opportunity and activity figures.
router.get('/:id/summary', read, validate({ params: idParam }), async (req, res) => {
  const data = await customerService.getCustomerSummary(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.CUSTOMER_SUMMARY, data });
});

// The customer's own history and its company's.
router.get('/:id/timeline', read, validate({ params: idParam, query: customerPagingQuery }), async (req, res) => {
  const data = await customerService.getCustomerTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CUSTOMER_TIMELINE, data });
});

router.put(
  '/:id',
  requirePermission('customers.update'),
  validate({ params: idParam, body: updateCustomerSchema }),
  async (req, res) => {
    const customer = await customerService.updateCustomer(req.validated.params.id, req.body, req.user);
    return sendSuccess(res, { message: MESSAGES.CUSTOMER_UPDATED, data: { customer } });
  }
);

router.delete('/:id', requirePermission('customers.delete'), validate({ params: idParam }), async (req, res) => {
  await customerService.deleteCustomer(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.CUSTOMER_DELETED });
});

// Each tab's records come from the existing endpoints, filtered by company:
//   GET /contacts?companyId=  /activities?companyId=  /opportunities?companyId=
//   GET /quotations?companyId=  /orders?companyId=

export default router;
