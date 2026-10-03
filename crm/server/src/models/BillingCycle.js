import { createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// How often a contract is billed (Monthly, Quarterly, Yearly, One-time, ...).
// `months` is the length of one cycle; none for a one-time charge.
export default createLeadConfigModel('BillingCycle', {
  months: { type: Number, min: 1, max: 120 },
  isDefault: defaultField,
});
