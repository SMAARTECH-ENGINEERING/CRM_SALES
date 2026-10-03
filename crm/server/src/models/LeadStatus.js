import { LEAD_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A stage in the lead pipeline.
export default createLeadConfigModel('LeadStatus', {
  // What the stage means: still being worked, won, or lost. Code that needs to
  // know whether a lead is closed looks at this, never at the name.
  category: {
    type: String,
    enum: Object.values(LEAD_STATUS_CATEGORY),
    default: LEAD_STATUS_CATEGORY.OPEN,
  },
  color: colorField,
  // Whether a lead in this status counts as "qualified" in reports. Set per
  // status by administrators; no status name means anything to the code.
  isQualified: { type: Boolean, default: false },
  isDefault: defaultField,
});
