import { DOCUMENT_STATUS_CATEGORY } from '../constants/index.js';
import { colorField, createLeadConfigModel, defaultField } from './shared/leadConfig.js';

// Where a document stands (Draft, Final, Archived, ...). Administrators name
// the statuses; the code only reads each one's category.
export default createLeadConfigModel('DocumentStatus', {
  category: { type: String, enum: Object.values(DOCUMENT_STATUS_CATEGORY), default: DOCUMENT_STATUS_CATEGORY.DRAFT },
  color: colorField,
  isDefault: defaultField,
});
