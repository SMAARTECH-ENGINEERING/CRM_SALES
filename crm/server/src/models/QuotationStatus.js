import { QUOTATION_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A state a quotation can be in. Administrators manage the list.
export default createLeadConfigModel('QuotationStatus', {
  // What the status means: draft, sent, accepted, rejected or expired. Code
  // that needs to know (e.g. "may this still be edited?") looks at this, never
  // at the name.
  category: {
    type: String,
    enum: Object.values(QUOTATION_STATUS_CATEGORY),
    default: QUOTATION_STATUS_CATEGORY.DRAFT,
  },
  color: colorField,
  isDefault: defaultField,
});
