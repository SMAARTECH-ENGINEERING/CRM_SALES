import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import authenticate, { optionalAuthenticate } from '../middleware/authenticate.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';
import { MESSAGES } from '../constants/index.js';
import * as preferenceService from '../services/preference.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { updatePreferencesSchema } from '../validators/preference.validator.js';
import {
  changePasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from '../validators/auth.validator.js';

const router = Router();

// Open or admin-only depending on ALLOW_PUBLIC_REGISTRATION (enforced in the service).
router.post('/register', optionalAuthenticate, validate({ body: registerSchema }), authController.register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh-token', validate({ body: refreshTokenSchema }), authController.refreshToken);

router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);

// The signed-in user's own interface preferences. PUT merges: only the keys
// sent change, and null puts one back to its default.
router.get('/preferences', authenticate, async (req, res) =>
  sendSuccess(res, { message: MESSAGES.PREFERENCES_RETRIEVED, data: { preferences: await preferenceService.getPreferences(req.user._id) } })
);
router.put('/preferences', authenticate, validate({ body: updatePreferencesSchema }), async (req, res) =>
  sendSuccess(res, {
    message: MESSAGES.PREFERENCES_UPDATED,
    data: { preferences: await preferenceService.updatePreferences(req.user._id, req.validated.body) },
  })
);

export default router;
