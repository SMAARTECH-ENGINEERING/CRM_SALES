import { PAYMENT_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel } from './shared/leadConfig.js';

// A state a payment can be in. Administrators manage the names and colours;
// code looks only at `category`. Which of unpaid / partially paid / paid
// applies is worked out by the server from the amounts - the first active
// status of that category (by position) is the one used.
export default createLeadConfigModel('PaymentStatus', {
  category: { type: String, enum: Object.values(PAYMENT_STATUS_CATEGORY), required: true },
  color: colorField,
});
