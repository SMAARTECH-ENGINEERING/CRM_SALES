import { TASK_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A state a project task can be in. Administrators manage the list; code looks
// only at `category`, never at the name.
export default createLeadConfigModel('TaskStatus', {
  category: {
    type: String,
    enum: Object.values(TASK_STATUS_CATEGORY),
    default: TASK_STATUS_CATEGORY.TODO,
  },
  color: colorField,
  isDefault: defaultField,
});
