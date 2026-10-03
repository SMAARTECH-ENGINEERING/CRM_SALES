import { Router } from 'express';
import { MESSAGES } from '../constants/index.js';
import * as order from '../controllers/order.controller.js';
import { listOrderOptions } from '../services/order.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  createOrderSchema,
  fromQuotationSchema,
  listOrdersQuery,
  orderOptionsQuery,
  orderPagingQuery,
  orderStatusSchema,
  quotationIdParam,
  updateOrderSchema,
} from '../validators/order.validator.js';

const router = Router();

router.use(authenticate);

const read = requirePermission('orders.read');
const create = requirePermission('orders.create');
const update = requirePermission('orders.update');

router.get('/', read, validate({ query: listOrdersQuery }), order.listOrders);
router.post('/', create, validate({ body: createOrderSchema }), order.createOrder);
// Number and date for order pickers on other screens (projects). Before /:id.
router.get(
  '/options',
  authorize('orders.read', 'projects.create', 'projects.update', 'payments.create', 'payments.update'),
  validate({ query: orderOptionsQuery }),
  async (req, res) => {
    const orders = await listOrderOptions(req.validated.query);
    return sendSuccess(res, { message: MESSAGES.ORDER_OPTIONS, data: { orders } });
  }
);
// Declared before /:id so "from-quotation" is not read as an id.
router.post(
  '/from-quotation/:quotationId',
  create,
  validate({ params: quotationIdParam, body: fromQuotationSchema }),
  order.createFromQuotation
);
router.get('/:id', read, validate({ params: idParam }), order.getOrder);
router.put('/:id', update, validate({ params: idParam, body: updateOrderSchema }), order.updateOrder);
router.delete('/:id', requirePermission('orders.delete'), validate({ params: idParam }), order.deleteOrder);
router.patch('/:id/status', update, validate({ params: idParam, body: orderStatusSchema }), order.changeStatus);
router.get('/:id/timeline', read, validate({ params: idParam, query: orderPagingQuery }), order.getTimeline);

export default router;
