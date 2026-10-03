import { PROJECT_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A state a project can be in. Administrators manage the list; code looks only
// at `category`, never at the name.
export default createLeadConfigModel('ProjectStatus', {
  category: {
    type: String,
    enum: Object.values(PROJECT_STATUS_CATEGORY),
    default: PROJECT_STATUS_CATEGORY.NOT_STARTED,
  },
  color: colorField,
  isDefault: defaultField,
});
