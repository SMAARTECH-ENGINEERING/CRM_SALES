import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// How urgent a lead is.
export default createLeadConfigModel('LeadPriority', {
  // Rank for sorting leads by urgency: a higher number is more urgent.
  level: { type: Number, required: true, min: 1, max: 100 },
  color: colorField,
  isDefault: defaultField,
});
