import { createLeadConfigModel } from './shared/leadConfig.js';

// A tax that can be applied to a product. Managed by administrators.
export default createLeadConfigModel('Tax', {
  // Percentage, e.g. 18 for 18%.
  rate: { type: Number, required: true, min: 0, max: 100 },
});
