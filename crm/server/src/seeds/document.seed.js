// Initial document types and statuses. Loaded into MongoDB ONCE (see
// seedDocumentSettings in services/seed.service.js); after that they belong to
// the administrators, who manage them under Lists and statuses. Nothing in the
// application refers to these names - statuses are read by their `category`.

export const DOCUMENT_TYPE_SEED = [
  { name: 'Quotation', color: '#1976d2' },
  { name: 'Purchase Order', color: '#2e7d32' },
  { name: 'Technical Specification', color: '#7b1fa2' },
  { name: 'BOQ', color: '#00838f', description: 'Bill of quantities' },
  { name: 'Drawing', color: '#5d4037' },
  { name: 'Installation Report', color: '#ef6c00' },
  { name: 'Commissioning Report', color: '#c62828' },
  { name: 'AMC Document', color: '#455a64' },
  { name: 'Invoice', color: '#6a1b9a' },
  { name: 'Other', color: '#757575' },
];

// category: draft | final | archived
export const DOCUMENT_STATUS_SEED = [
  { name: 'Draft', category: 'draft', color: '#757575', isDefault: true, description: 'Being prepared or edited' },
  { name: 'Final', category: 'final', color: '#2e7d32', description: 'Approved; the version to send or keep' },
  { name: 'Archived', category: 'archived', color: '#616161', description: 'Kept for reference only' },
];
