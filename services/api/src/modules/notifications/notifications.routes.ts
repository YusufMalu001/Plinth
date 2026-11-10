import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import { verifyAccessToken } from '../auth/auth.tokens';
import { UnauthorizedError } from '../../common/errors/AppError';

export const notificationsRouter = Router();

// Middleware to authenticate user on notification routes
function authenticateUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : req.cookies?.accessToken;

  if (!token) {
    throw new UnauthorizedError('Authentication token required');
  }

  const decoded = verifyAccessToken(token);
  req.user = {
    id: decoded.sub,
    email: decoded.email,
    role: decoded.role
  };
  next();
}

notificationsRouter.use(authenticateUser);

/**
 * GET /api/v1/notifications
 * Lists notifications for the authenticated user.
 */
notificationsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : undefined;
    const take = req.query.take ? parseInt(req.query.take as string, 10) : undefined;

    const result = await notificationService.listUserNotifications(req.user!.id, { unreadOnly, skip, take });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read.
 */
notificationsRouter.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markAsRead(req.user!.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/notifications/mark-all-read
 * Marks all notifications for the authenticated user as read.
 */
notificationsRouter.post('/mark-all-read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markAllAsRead(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
