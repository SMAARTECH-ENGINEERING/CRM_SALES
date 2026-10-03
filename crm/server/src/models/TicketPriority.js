import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// How urgent a ticket is. Administrators manage the list; `level` ranks it
// (higher is more urgent) so tickets can be sorted by urgency, whatever the names.
export default createLeadConfigModel('TicketPriority', {
  level: { type: Number, required: true, min: 1, max: 100 },
  color: colorField,
  isDefault: defaultField,
});
