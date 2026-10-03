import axiosClient from './axiosClient.js';

export function listQuotations(params, { signal } = {}) {
  return axiosClient.get('/quotations', { params, signal });
}

export function getQuotation(id, { signal } = {}) {
  return axiosClient.get(`/quotations/${id}`, { signal });
}

// Prices the lines and totals on the server without saving anything.
// `data`: { items: [{ productId, quantity, unitPrice?, discountPercent? }], discountPercent, quotationId? }
export function calculateQuotation(data, { signal } = {}) {
  return axiosClient.post('/quotations/calculate', data, { signal });
}

// Totals are never sent: the API calculates them from the products.
export function createQuotation(data) {
  return axiosClient.post('/quotations', data);
}

export function updateQuotation(id, data) {
  return axiosClient.put(`/quotations/${id}`, data);
}

export function deleteQuotation(id) {
  return axiosClient.delete(`/quotations/${id}`);
}

export function changeQuotationStatus(id, statusId) {
  return axiosClient.patch(`/quotations/${id}/status`, { statusId });
}

// `data`: { to?, subject?, message? }. The response says whether an email went out.
export function sendQuotation(id, data) {
  return axiosClient.post(`/quotations/${id}/send`, data);
}

// Resolves to the PDF as a Blob.
export function getQuotationPdf(id) {
  return axiosClient.post(`/quotations/${id}/pdf`, null, { responseType: 'blob' });
}

export function getQuotationTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/quotations/${id}/timeline`, { params, signal });
}
