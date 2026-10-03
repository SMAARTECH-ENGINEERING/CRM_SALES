import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as orderService from '../services/order.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

const created = (res, order) =>
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.ORDER_CREATED, data: { order } });

export async function listOrders(req, res) {
  const data = await orderService.listOrders(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.ORDERS_LISTED, data });
}

export async function getOrder(req, res) {
  const order = await orderService.getOrder(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.ORDER_RETRIEVED, data: { order } });
}

export async function createOrder(req, res) {
  return created(res, await orderService.createOrder(req.body, req.user));
}

export async function createFromQuotation(req, res) {
  return created(res, await orderService.createOrderFromQuotation(req.validated.params.quotationId, req.body, req.user));
}

export async function updateOrder(req, res) {
  const order = await orderService.updateOrder(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.ORDER_UPDATED, data: { order } });
}

export async function deleteOrder(req, res) {
  await orderService.deleteOrder(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.ORDER_DELETED });
}

export async function changeStatus(req, res) {
  const order = await orderService.changeOrderStatus(req.validated.params.id, req.body.statusId, req.user);
  return sendSuccess(res, { message: MESSAGES.ORDER_STATUS_UPDATED, data: { order } });
}

export async function getTimeline(req, res) {
  const data = await orderService.getOrderTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.ORDER_TIMELINE, data });
}
