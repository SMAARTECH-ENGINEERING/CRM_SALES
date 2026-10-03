import axiosClient from './axiosClient.js';

// With files the body goes as multipart/form-data, files under "attachments";
// without, as JSON.
function body(data, files = []) {
  if (!files.length) return data;
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, value);
  }
  for (const file of files) form.append('attachments', file);
  return form;
}

export function listTickets(params, { signal } = {}) {
  return axiosClient.get('/tickets', { params, signal });
}

// { byCategory: { open, in_progress, waiting, resolved, closed }, unassignedOpen, total }
export function getTicketStats(params, { signal } = {}) {
  return axiosClient.get('/tickets/stats', { params, signal });
}

export function getTicket(id, { signal } = {}) {
  return axiosClient.get(`/tickets/${id}`, { signal });
}

export function createTicket(data, files) {
  return axiosClient.post('/tickets', body(data, files));
}

export function updateTicket(id, data) {
  return axiosClient.put(`/tickets/${id}`, data);
}

export function deleteTicket(id) {
  return axiosClient.delete(`/tickets/${id}`);
}

// `assignedTo`: a user id, or null to unassign.
export function assignTicket(id, assignedTo) {
  return axiosClient.patch(`/tickets/${id}/assign`, { assignedTo });
}

export function changeTicketStatus(id, statusId) {
  return axiosClient.patch(`/tickets/${id}/status`, { statusId });
}

export function addReply(id, text, files) {
  return axiosClient.post(`/tickets/${id}/replies`, body({ body: text }, files));
}

export function addInternalNote(id, text, files) {
  return axiosClient.post(`/tickets/${id}/internal-notes`, body({ body: text }, files));
}

// { ticket, attachments, items: [{ kind: 'message' | 'event', ... }], counts }, oldest first.
export function getConversation(id, { signal } = {}) {
  return axiosClient.get(`/tickets/${id}/conversation`, { signal });
}

// Resolves to the file as a Blob.
export function downloadAttachment(id, attachmentId) {
  return axiosClient.get(`/tickets/${id}/attachments/${attachmentId}`, { responseType: 'blob' });
}
