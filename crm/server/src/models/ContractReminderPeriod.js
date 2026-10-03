import { createLeadConfigModel } from './shared/leadConfig.js';

// When to remind about a contract's end: `daysBefore` days before its end date.
// The periods are data - administrators add, change or switch them off in
// Settings; the reminder job reads whatever is active.
export default createLeadConfigModel('ContractReminderPeriod', {
  daysBefore: { type: Number, required: true, unique: true, min: 0, max: 365 },
});
