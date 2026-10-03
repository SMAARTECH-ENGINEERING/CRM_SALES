import { MESSAGES } from '../constants/index.js';
import { sendSuccess } from '../utils/apiResponse.js';

export function getHealth(req, res) {
  return sendSuccess(res, { message: MESSAGES.HEALTH_OK, omitData: true });
}
