// Initial payment methods and statuses. Loaded into MongoDB ONCE (see
// seedPaymentSettings in services/seed.service.js); after that they belong to
// the administrators, who manage them in Settings. Nothing in the application
// refers to these names - statuses are read by their `category`.

export const PAYMENT_METHOD_SEED = [
  { name: 'Bank Transfer', color: '#1976d2', description: 'NEFT, RTGS, IMPS or wire' },
  { name: 'UPI', color: '#2e7d32' },
  { name: 'Cheque', color: '#ed6c02' },
  { name: 'Cash', color: '#757575' },
  { name: 'Card', color: '#7b1fa2', description: 'Credit or debit card' },
];

// category: unpaid | partially_paid | paid | cancelled
export const PAYMENT_STATUS_SEED = [
  { name: 'Unpaid', category: 'unpaid', color: '#ed6c02', description: 'Nothing received yet' },
  { name: 'Partially Paid', category: 'partially_paid', color: '#0288d1', description: 'Part of the amount received' },
  { name: 'Paid', category: 'paid', color: '#2e7d32', description: 'Received in full' },
  { name: 'Cancelled', category: 'cancelled', color: '#616161', description: 'Not to be collected' },
];
