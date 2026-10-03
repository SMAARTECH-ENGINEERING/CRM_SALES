import { createLeadConfigModel } from './shared/leadConfig.js';

// A grouping of products. Managed by administrators.
export default createLeadConfigModel('ProductCategory', {
  // Optional prefix for the SKUs generated for products in this category
  // (e.g. "ELEC" -> ELEC-000012). Without one, the configured default is used.
  skuPrefix: { type: String, trim: true, uppercase: true, match: /^[A-Z0-9]{1,10}$/ },
});
