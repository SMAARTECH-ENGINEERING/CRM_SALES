import { colorField, createLeadConfigModel } from './shared/leadConfig.js';

// What a document is (Quotation, Purchase Order, Technical Specification,
// Installation Report, ...). Administrators manage the list; nothing in code
// refers to the names.
export default createLeadConfigModel('DocumentType', {
  color: colorField,
});
