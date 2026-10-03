import Joi from 'joi';
import { DASHBOARD_PERIOD } from '../constants/index.js';
import { objectId } from './common.validator.js';

const MAX_CUSTOM_DAYS = 3660;
const DAY_MS = 24 * 60 * 60 * 1000;
const date = Joi.date().iso();

const base = {
  // today | week | month (default) | quarter | year | custom
  period: Joi.string()
    .valid(...Object.values(DASHBOARD_PERIOD))
    .empty('')
    .default(DASHBOARD_PERIOD.MONTH),
  // Both needed for "custom" (inclusive dates); ignored otherwise.
  from: date.empty('').when('period', { is: DASHBOARD_PERIOD.CUSTOM, then: Joi.required() }),
  to: date.empty('').when('period', { is: DASHBOARD_PERIOD.CUSTOM, then: Joi.required() }),
  // One organization instead of all - for users who may see all of them.
  organizationId: objectId.empty(''),
};

// A custom range must run forwards and not be absurdly long.
function checkRange(value, helpers) {
  if (value.period !== DASHBOARD_PERIOD.CUSTOM) return value;
  if (value.to < value.from) return helpers.message('"to" must not be before "from"');
  if ((value.to - value.from) / DAY_MS > MAX_CUSTOM_DAYS) return helpers.message(`A custom period may cover at most ${MAX_CUSTOM_DAYS} days`);
  return value;
}

export const dashboardQuery = Joi.object(base).custom(checkRange);
export const opportunityDashboardQuery = Joi.object({ ...base, pipelineId: objectId.empty('') }).custom(checkRange);
