import { colorField, createLeadConfigModel } from './shared/leadConfig.js';

// A kind of activity (call, meeting, ...). Managed by administrators; the same
// shape as the lead configuration lists.
export default createLeadConfigModel('ActivityType', { color: colorField });
