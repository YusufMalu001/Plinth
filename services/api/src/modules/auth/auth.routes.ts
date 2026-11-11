import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginRequestSchema } from '@plinth/validation';
import { requireAuth } from '../../common/middleware/auth';
import { requireTrustedOrigin } from '../../common/middleware/trustedOrigin';
import { validate } from '../../common/middleware/validation';
import { changePassword, login, logout, me, refresh, updateMe } from './auth.controller';
const router = Router();
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDevelopment ? 1000 : 10,
  skip: () => isDevelopment,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' },
    requestId: req.id
  })
});

router.post('/auth/login', requireTrustedOrigin, loginLimiter, validate(loginRequestSchema), login);
router.post('/auth/refresh', requireTrustedOrigin, refresh);
router.post('/auth/logout', requireTrustedOrigin, logout);
router.get('/auth/me', requireAuth, me);
router.patch('/auth/me', requireAuth, updateMe);
router.post('/auth/change-password', requireAuth, changePassword);
export default router;
