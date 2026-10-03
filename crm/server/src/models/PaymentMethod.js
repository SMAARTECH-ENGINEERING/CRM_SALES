import { colorField, createLeadConfigModel } from './shared/leadConfig.js';

// How money was received (bank transfer, cheque, UPI, ...). Administrators
// manage the list; nothing in code refers to the names.
export default createLeadConfigModel('PaymentMethod', {
  color: colorField,
});
