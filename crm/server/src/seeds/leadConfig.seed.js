// Initial lead configuration. Loaded into MongoDB ONCE (see seedLeadConfig in
// services/seed.service.js); after that the values belong to the administrators,
// who add, rename, reorder, deactivate and delete them from the Lead settings
// screen. Nothing in the application - server or client - refers to these names.
//
// Order here becomes the initial display order.

export const LEAD_SOURCE_SEED = [
  { name: 'Website', description: 'Enquiry form or chat on the website' },
  { name: 'Referral', description: 'Recommended by a customer or partner' },
  { name: 'Cold Call', description: 'Outbound call by the sales team' },
  { name: 'Email Campaign', description: 'Response to a marketing email' },
  { name: 'Social Media', description: 'Enquiry through a social network' },
  { name: 'Trade Show', description: 'Met at an exhibition or event' },
  { name: 'Walk-in', description: 'Visited the office in person' },
];

// `category` says what the status means for the pipeline: open, won or lost.
// `isQualified` marks the statuses that count as "qualified" in reports.
export const LEAD_STATUS_SEED = [
  { name: 'New', category: 'open', color: '#1976d2', isDefault: true, description: 'Not yet contacted' },
  { name: 'Contacted', category: 'open', color: '#0288d1', description: 'First contact made' },
  { name: 'Qualified', category: 'open', color: '#7b1fa2', isQualified: true, description: 'Need, budget and authority confirmed' },
  { name: 'Proposal Sent', category: 'open', color: '#ed6c02', isQualified: true, description: 'Quotation or proposal shared' },
  { name: 'Negotiation', category: 'open', color: '#f57c00', isQualified: true, description: 'Terms under discussion' },
  { name: 'Won', category: 'won', color: '#2e7d32', isQualified: true, description: 'Converted to business' },
  { name: 'Lost', category: 'lost', color: '#d32f2f', description: 'Did not proceed' },
];

// `level` ranks urgency: a higher number is more urgent.
export const LEAD_PRIORITY_SEED = [
  { name: 'Low', level: 1, color: '#757575' },
  { name: 'Medium', level: 2, color: '#1976d2', isDefault: true },
  { name: 'High', level: 3, color: '#ed6c02' },
  { name: 'Urgent', level: 4, color: '#d32f2f' },
];
