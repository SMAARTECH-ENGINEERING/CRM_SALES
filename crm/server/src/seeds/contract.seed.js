// Initial contract types, statuses, billing cycles and reminder periods. Loaded
// into MongoDB ONCE (see seedContractSettings in services/seed.service.js);
// after that they belong to the administrators, who manage them in Settings.
// Nothing in the application refers to these names or numbers - statuses are
// read by their `category`, reminders by whatever periods are active.

export const CONTRACT_TYPE_SEED = [
  { name: 'Annual Maintenance (AMC)', color: '#1976d2', description: 'Scheduled maintenance and repairs for a year' },
  { name: 'Comprehensive AMC', color: '#2e7d32', description: 'Maintenance including spare parts' },
  { name: 'Support Plan', color: '#7b1fa2', description: 'Help desk and remote support' },
  { name: 'Warranty Extension', color: '#ed6c02', description: 'Cover beyond the manufacturer warranty' },
];

// category: draft | active | expired | renewed | cancelled
export const CONTRACT_STATUS_SEED = [
  { name: 'Draft', category: 'draft', color: '#757575', description: 'Being prepared' },
  { name: 'Active', category: 'active', color: '#2e7d32', isDefault: true, description: 'In force; gets expiry reminders' },
  { name: 'Expired', category: 'expired', color: '#d32f2f', description: 'The end date has passed' },
  { name: 'Renewed', category: 'renewed', color: '#0288d1', description: 'Replaced by a new contract' },
  { name: 'Cancelled', category: 'cancelled', color: '#616161', description: 'Ended early' },
];

// `months`: the length of one cycle; none for a single charge.
export const BILLING_CYCLE_SEED = [
  { name: 'Monthly', months: 1 },
  { name: 'Quarterly', months: 3 },
  { name: 'Half-yearly', months: 6 },
  { name: 'Yearly', months: 12, isDefault: true },
  { name: 'One-time', description: 'Billed once for the whole term' },
];

export const CONTRACT_REMINDER_PERIOD_SEED = [
  { name: '30 days before', daysBefore: 30 },
  { name: '15 days before', daysBefore: 15 },
  { name: '7 days before', daysBefore: 7 },
];
