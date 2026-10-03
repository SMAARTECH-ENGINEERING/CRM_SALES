// Initial ticket categories, priorities and statuses. Loaded into MongoDB ONCE
// (see seedTicketSettings in services/seed.service.js); after that they belong
// to the administrators, who manage them in Settings. Nothing in the
// application refers to these names - statuses are read by their `category`,
// priorities by their `level`.

export const TICKET_CATEGORY_SEED = [
  { name: 'General Enquiry', color: '#757575', description: 'Questions and requests for information' },
  { name: 'Technical Issue', color: '#d32f2f', description: 'Something does not work' },
  { name: 'Billing', color: '#ed6c02', description: 'Invoices, payments and refunds' },
  { name: 'Delivery', color: '#0288d1', description: 'Shipping, installation and handover' },
  { name: 'Feature Request', color: '#7b1fa2', description: 'Suggestions and improvements' },
];

// `level` ranks urgency: a higher number is more urgent.
export const TICKET_PRIORITY_SEED = [
  { name: 'Low', level: 1, color: '#757575' },
  { name: 'Medium', level: 2, color: '#1976d2', isDefault: true },
  { name: 'High', level: 3, color: '#ed6c02' },
  { name: 'Urgent', level: 4, color: '#d32f2f' },
];

// category: open | in_progress | waiting | resolved | closed
export const TICKET_STATUS_SEED = [
  { name: 'New', category: 'open', color: '#1976d2', isDefault: true, description: 'Not picked up yet' },
  { name: 'In Progress', category: 'in_progress', color: '#7b1fa2', description: 'Being worked on' },
  { name: 'Waiting on Customer', category: 'waiting', color: '#ed6c02', description: 'Needs an answer from the customer' },
  { name: 'Resolved', category: 'resolved', color: '#2e7d32', description: 'Solved; awaiting confirmation' },
  { name: 'Closed', category: 'closed', color: '#616161', description: 'Finished' },
];
