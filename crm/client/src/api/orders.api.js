import axiosClient from './axiosClient.js';

export function listOrders(params, { signal } = {}) {
  return axiosClient.get('/orders', { params, signal });
}

// For pickers: { companyId, search, limit }, or { id } for one order.
export function listOrderOptions(params, { signal } = {}) {
  return axiosClient.get('/orders/options', { params, signal });
}

export function getOrder(id, { signal } = {}) {
  return axiosClient.get(`/orders/${id}`, { signal });
}

// An order entered directly. Totals are never sent: the API prices the lines.
export function createOrder(data) {
  return axiosClient.post('/orders', data);
}

// The API checks the quotation exists, belongs to the company, is accepted and
// has no order yet. `data`: { orderDate?, deliveryDate?, assignedTo?, notes?, statusId? }
export function createOrderFromQuotation(quotationId, data) {
  return axiosClient.post(`/orders/from-quotation/${quotationId}`, data);
}

export function updateOrder(id, data) {
  return axiosClient.put(`/orders/${id}`, data);
}

export function deleteOrder(id) {
  return axiosClient.delete(`/orders/${id}`);
}

export function changeOrderStatus(id, statusId) {
  return axiosClient.patch(`/orders/${id}/status`, { statusId });
}

export function getOrderTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/orders/${id}/timeline`, { params, signal });
}
