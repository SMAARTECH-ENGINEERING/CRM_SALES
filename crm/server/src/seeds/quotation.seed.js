// Initial quotation statuses. Loaded into MongoDB ONCE (see
// seedQuotationStatuses in services/seed.service.js); after that they belong to
// the administrators, who add, rename, reorder, deactivate and delete them in
// Settings. Nothing in the application - server or client - refers to these names.
//
// `category` says what the status means: draft, sent, accepted, rejected or
// expired. Order here becomes the initial display order.
export const QUOTATION_STATUS_SEED = [
  { name: 'Draft', category: 'draft', color: '#757575', isDefault: true, description: 'Being prepared' },
  { name: 'Sent', category: 'sent', color: '#1976d2', description: 'Shared with the customer' },
  { name: 'Accepted', category: 'accepted', color: '#2e7d32', description: 'Customer agreed' },
  { name: 'Rejected', category: 'rejected', color: '#d32f2f', description: 'Customer declined' },
  { name: 'Expired', category: 'expired', color: '#ed6c02', description: 'Validity ran out' },
];
