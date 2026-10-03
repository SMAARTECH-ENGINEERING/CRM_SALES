import { colorField, createLeadConfigModel } from './shared/leadConfig.js';

// What kind of contract it is (AMC, warranty extension, support plan, ...).
// Administrators manage the list; nothing in code refers to the names.
export default createLeadConfigModel('ContractType', {
  color: colorField,
});
