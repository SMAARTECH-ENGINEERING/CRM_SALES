import { createLeadConfigModel } from './shared/leadConfig.js';

// What a product is sold in: pieces, kilograms, hours, ... Managed by administrators.
export default createLeadConfigModel('Unit', {
  // Short form shown next to quantities, e.g. "kg". Unique regardless of case.
  symbol: { type: String, required: true, trim: true, maxlength: 15 },
});
