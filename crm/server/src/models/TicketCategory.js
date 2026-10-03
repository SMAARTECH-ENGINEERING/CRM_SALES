import { colorField, createLeadConfigModel } from './shared/leadConfig.js';

// What a ticket is about (billing, technical issue, ...). Administrators manage the list.
export default createLeadConfigModel('TicketCategory', { color: colorField });
