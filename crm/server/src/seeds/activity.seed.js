// Initial activity types. Loaded into MongoDB ONCE (see seedActivityTypes in
// services/seed.service.js); after that they belong to the administrators, who
// add, rename, reorder, deactivate and delete them in Settings. Nothing in the
// application - server or client - refers to these names.
//
// Order here becomes the initial display order.
export const ACTIVITY_TYPE_SEED = [
  { name: 'Call', color: '#1976d2', description: 'Phone or video call' },
  { name: 'Meeting', color: '#7b1fa2', description: 'Meeting in person or online' },
  { name: 'Email', color: '#0288d1', description: 'Email sent or received' },
  { name: 'Task', color: '#ed6c02', description: 'Something to get done' },
  { name: 'Note', color: '#757575', description: 'Something worth recording' },
  { name: 'Demo', color: '#2e7d32', description: 'Product demonstration' },
  { name: 'Site Visit', color: '#f57c00', description: "Visit to the customer's premises" },
];
