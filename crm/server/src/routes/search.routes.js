import { Router } from 'express';
import { MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import * as searchService from '../services/search.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { searchQuery } from '../validators/search.validator.js';

// GET /search?q=&limit= - open to every signed-in user. Which categories are
// searched (the modules the user may read) and which records (everything, the
// user's organization, or their own) is decided in the service.
const router = Router();
router.use(authenticate);

router.get('/', validate({ query: searchQuery }), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SEARCH_RESULTS, data: await searchService.search(req.user, req.validated.query) })
);

export default router;
