// Initial order statuses. Loaded into MongoDB ONCE (see seedOrderStatuses in
// services/seed.service.js); after that they belong to the administrators, who
// add, rename, reorder, deactivate and delete them in Settings. Nothing in the
// application refers to these names.
//
// `category` says what the status means: open, in_progress, completed or
// cancelled. Order here becomes the initial display order.
export const ORDER_STATUS_SEED = [
  { name: 'New', category: 'open', color: '#757575', isDefault: true, description: 'Received, not yet confirmed' },
  { name: 'Confirmed', category: 'in_progress', color: '#1976d2', description: 'Accepted and scheduled' },
  { name: 'Processing', category: 'in_progress', color: '#7b1fa2', description: 'Being prepared' },
  { name: 'Shipped', category: 'in_progress', color: '#ed6c02', description: 'On its way' },
  { name: 'Delivered', category: 'completed', color: '#2e7d32', description: 'Delivered to the customer' },
  { name: 'Cancelled', category: 'cancelled', color: '#d32f2f', description: 'Will not be fulfilled' },
];
