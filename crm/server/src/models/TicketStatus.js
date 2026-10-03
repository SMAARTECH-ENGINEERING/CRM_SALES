import { TICKET_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// A state a ticket can be in. Administrators manage the list; code looks only
// at `category` (resolved and closed set resolvedAt / closedAt), never the name.
export default createLeadConfigModel('TicketStatus', {
  category: {
    type: String,
    enum: Object.values(TICKET_STATUS_CATEGORY),
    default: TICKET_STATUS_CATEGORY.OPEN,
  },
  color: colorField,
  isDefault: defaultField,
});
