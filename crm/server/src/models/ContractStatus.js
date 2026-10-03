import { CONTRACT_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A state a contract can be in. Administrators manage the list; code looks only
// at `category` (only active contracts get expiry reminders), never the name.
export default createLeadConfigModel('ContractStatus', {
  category: {
    type: String,
    enum: Object.values(CONTRACT_STATUS_CATEGORY),
    default: CONTRACT_STATUS_CATEGORY.ACTIVE,
  },
  color: colorField,
  isDefault: defaultField,
});
