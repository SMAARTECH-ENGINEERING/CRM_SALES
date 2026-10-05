import axiosClient from './axiosClient.js';

// The lead configuration lists. This describes their *shape* (API path, wording,
// which extra fields each has) - never their contents. The values themselves
// (source names, status names, ...) exist only in the database and are always
// fetched from the API.
export const LEAD_CONFIG = Object.freeze({
  SOURCES: { resource: 'lead-sources', title: 'Sources', singular: 'source', fields: [], hasDefault: false },
  STATUSES: {
    resource: 'lead-statuses',
    title: 'Statuses',
    singular: 'status',
    fields: ['category', 'color', 'isQualified'],
    hasDefault: true,
  },
  PRIORITIES: {
    resource: 'lead-priorities',
    title: 'Priorities',
    singular: 'priority',
    fields: ['level', 'color'],
    hasDefault: true,
  },
});

// Activity types are managed the same way and have the same shape.
export const ACTIVITY_CONFIG = Object.freeze({
  TYPES: {
    resource: 'activity-types',
    title: 'Activity types',
    singular: 'activity type',
    fields: ['color'],
    hasDefault: false,
  },
});

// The product catalogue lists: again the same shape, each with one field of its own.
export const CATALOG_CONFIG = Object.freeze({
  CATEGORIES: {
    resource: 'product-categories',
    title: 'Categories',
    singular: 'category',
    fields: ['skuPrefix'],
    hasDefault: false,
  },
  UNITS: { resource: 'units', title: 'Units', singular: 'unit', fields: ['symbol'], hasDefault: false },
  TAXES: { resource: 'taxes', title: 'Taxes', singular: 'tax', fields: ['rate'], hasDefault: false },
});

// Quotation statuses: the same shape as lead statuses, but what a status can
// *mean* is different, so the list carries its own fixed set of meanings.
export const QUOTATION_CONFIG = Object.freeze({
  STATUSES: {
    resource: 'quotation-statuses',
    title: 'Quotation statuses',
    singular: 'quotation status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new quotations',
    categories: [
      { value: 'draft', label: 'Draft', hint: 'Being prepared' },
      { value: 'sent', label: 'Sent', hint: 'With the customer' },
      { value: 'accepted', label: 'Accepted', hint: 'Customer agreed; locked' },
      { value: 'rejected', label: 'Rejected', hint: 'Customer declined; locked' },
      { value: 'expired', label: 'Expired', hint: 'Validity ran out' },
    ],
  },
});

// Order statuses: same shape again, with their own fixed set of meanings.
export const ORDER_CONFIG = Object.freeze({
  STATUSES: {
    resource: 'order-statuses',
    title: 'Order statuses',
    singular: 'order status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new orders',
    categories: [
      { value: 'open', label: 'Open', hint: 'Received, not started' },
      { value: 'in_progress', label: 'In progress', hint: 'Being fulfilled' },
      { value: 'completed', label: 'Completed', hint: 'Fulfilled; locked' },
      { value: 'cancelled', label: 'Cancelled', hint: 'Will not be fulfilled; locked' },
    ],
  },
});

// Project and task statuses: same shape, each with its own fixed set of meanings.
export const PROJECT_CONFIG = Object.freeze({
  STATUSES: {
    resource: 'project-statuses',
    title: 'Project statuses',
    singular: 'project status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new projects',
    categories: [
      { value: 'not_started', label: 'Not started', hint: 'Planned' },
      { value: 'active', label: 'Active', hint: 'Work under way' },
      { value: 'on_hold', label: 'On hold', hint: 'Paused' },
      { value: 'completed', label: 'Completed', hint: 'Delivered; sets the actual end date' },
      { value: 'cancelled', label: 'Cancelled', hint: 'Stopped' },
    ],
  },
  TASK_STATUSES: {
    resource: 'task-statuses',
    title: 'Task statuses',
    singular: 'task status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new tasks',
    categories: [
      { value: 'todo', label: 'To do', hint: 'Not started' },
      { value: 'in_progress', label: 'In progress', hint: 'Being worked on' },
      { value: 'done', label: 'Done', hint: 'Counts towards progress' },
      { value: 'cancelled', label: 'Cancelled', hint: 'Left out of progress' },
    ],
  },
});

// Ticket categories, priorities and statuses.
export const TICKET_CONFIG = Object.freeze({
  CATEGORIES: {
    resource: 'ticket-categories',
    title: 'Ticket categories',
    singular: 'ticket category',
    fields: ['color'],
    hasDefault: false,
  },
  PRIORITIES: {
    resource: 'ticket-priorities',
    title: 'Ticket priorities',
    singular: 'ticket priority',
    fields: ['level', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new tickets',
  },
  STATUSES: {
    resource: 'ticket-statuses',
    title: 'Ticket statuses',
    singular: 'ticket status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new tickets',
    categories: [
      { value: 'open', label: 'Open', hint: 'Not picked up yet' },
      { value: 'in_progress', label: 'In progress', hint: 'Being worked on' },
      { value: 'waiting', label: 'Waiting', hint: 'Needs an answer from the customer' },
      { value: 'resolved', label: 'Resolved', hint: 'Records when it was resolved' },
      { value: 'closed', label: 'Closed', hint: 'No more replies until reopened' },
    ],
  },
});

// Contract types, statuses, billing cycles and expiry reminder periods.
export const CONTRACT_CONFIG = Object.freeze({
  TYPES: {
    resource: 'contract-types',
    title: 'Contract types',
    singular: 'contract type',
    fields: ['color'],
    hasDefault: false,
  },
  STATUSES: {
    resource: 'contract-statuses',
    title: 'Contract statuses',
    singular: 'contract status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new contracts',
    categories: [
      { value: 'draft', label: 'Draft', hint: 'Being prepared' },
      { value: 'active', label: 'Active', hint: 'In force; gets expiry reminders' },
      { value: 'expired', label: 'Expired', hint: 'Set automatically once the end date passes' },
      { value: 'renewed', label: 'Renewed', hint: 'Replaced by a new contract' },
      { value: 'cancelled', label: 'Cancelled', hint: 'Ended early' },
    ],
  },
  BILLING_CYCLES: {
    resource: 'billing-cycles',
    title: 'Billing cycles',
    singular: 'billing cycle',
    fields: ['months'],
    hasDefault: true,
    defaultLabel: 'Default for new contracts',
  },
  REMINDER_PERIODS: {
    resource: 'contract-reminder-periods',
    title: 'Contract reminder periods',
    singular: 'reminder period',
    fields: ['daysBefore'],
    hasDefault: false,
  },
});

// Payment methods and statuses. Which of unpaid / partially paid / paid a
// payment has is worked out by the API from its amounts; the list only says
// what each is called and how it looks.
export const PAYMENT_CONFIG = Object.freeze({
  METHODS: {
    resource: 'payment-methods',
    title: 'Payment methods',
    singular: 'payment method',
    fields: ['color'],
    hasDefault: false,
  },
  STATUSES: {
    resource: 'payment-statuses',
    title: 'Payment statuses',
    singular: 'payment status',
    fields: ['category', 'color'],
    hasDefault: false,
    categories: [
      { value: 'unpaid', label: 'Unpaid', hint: 'Nothing received yet' },
      { value: 'partially_paid', label: 'Partially paid', hint: 'Part of the amount received' },
      { value: 'paid', label: 'Paid', hint: 'Received in full' },
      { value: 'cancelled', label: 'Cancelled', hint: 'Not to be collected; left out of totals' },
    ],
  },
});

// Document types and statuses. A status's meaning is draft, final or archived.
export const DOCUMENT_CONFIG = Object.freeze({
  TYPES: {
    resource: 'document-types',
    title: 'Document types',
    singular: 'document type',
    fields: ['color'],
    hasDefault: false,
  },
  STATUSES: {
    resource: 'document-statuses',
    title: 'Document statuses',
    singular: 'document status',
    fields: ['category', 'color'],
    hasDefault: true,
    defaultLabel: 'Default for new documents',
    categories: [
      { value: 'draft', label: 'Draft', hint: 'Being worked on' },
      { value: 'final', label: 'Final', hint: 'Ready to send' },
      { value: 'archived', label: 'Archived', hint: 'Kept for reference' },
    ],
  },
});

// `params`: { isActive: true } for what a lead form offers; omit for everything.
export function listLeadConfig(resource, params, { signal } = {}) {
  return axiosClient.get(`/${resource}`, { params, signal });
}

export function createLeadConfig(resource, data) {
  return axiosClient.post(`/${resource}`, data);
}

export function updateLeadConfig(resource, id, data) {
  return axiosClient.put(`/${resource}/${id}`, data);
}

export function deleteLeadConfig(resource, id) {
  return axiosClient.delete(`/${resource}/${id}`);
}
