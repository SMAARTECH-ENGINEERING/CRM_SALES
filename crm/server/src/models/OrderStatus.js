import { ORDER_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A state an order can be in. Administrators manage the list.
export default createLeadConfigModel('OrderStatus', {
  // What the status means: open, in progress, completed or cancelled. Code that
  // needs to know (e.g. "may this still be edited?") looks at this, never at the name.
  category: {
    type: String,
    enum: Object.values(ORDER_STATUS_CATEGORY),
    default: ORDER_STATUS_CATEGORY.OPEN,
  },
  color: colorField,
  isDefault: defaultField,
});
