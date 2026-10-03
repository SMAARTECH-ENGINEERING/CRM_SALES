import axiosClient from './axiosClient.js';

// `state`: paid | partially_paid | unpaid | overdue | cancelled
export function listPayments(params, { signal } = {}) {
  return axiosClient.get('/payments', { params, signal });
}

// { byCategory: { unpaid, partially_paid, paid, cancelled: { count, amount, paid, remaining } },
//   overdue: { count, remaining }, totals: { count, amount, paid, outstanding },
//   order?: { grandTotal, invoiced, toInvoice } }
export function getPaymentStats(params, { signal } = {}) {
  return axiosClient.get('/payments/stats', { params, signal });
}

export function getPayment(id, { signal } = {}) {
  return axiosClient.get(`/payments/${id}`, { signal });
}

export function createPayment(data) {
  return axiosClient.post('/payments', data);
}

// Money received goes as `receivedAmount` (the API adds it) or as the new
// total `paidAmount`. The remaining amount is never sent: the API works it out.
export function updatePayment(id, data) {
  return axiosClient.put(`/payments/${id}`, data);
}

export function deletePayment(id) {
  return axiosClient.delete(`/payments/${id}`);
}

export function getPaymentTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/payments/${id}/timeline`, { params, signal });
}
