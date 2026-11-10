import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@synergy/types';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';
import { ACCESS_COOKIE } from '../../modules/auth/auth.constants';
import { verifyAccessToken } from '../../modules/auth/auth.tokens';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const cookieToken = req.cookies?.[ACCESS_COOKIE];
    const header = req.get('authorization');
    const bearerToken = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    // A refreshed in-memory bearer must take precedence over an expired
    // cookie. Otherwise the browser keeps sending the stale cookie and the
    // successful refresh can never authenticate the retried request.
    const token = bearerToken || cookieToken;
    if (!token) throw new UnauthorizedError('Authentication required');
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role, roleDefinitionId: payload.roleDefinitionId, roleDefinitionKey: payload.roleDefinitionKey };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authenticate when a session is present, but allow token-based onboarding
 * links to continue without a session. This is only for endpoints that support
 * either a signed-in employee or an onboarding token.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  const header = req.get('authorization');
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const token = bearerToken || cookieToken;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        roleDefinitionId: payload.roleDefinitionId,
        roleDefinitionKey: payload.roleDefinitionKey
      };
    } catch {
      // A valid one-time onboarding token may authorize this request even if
      // an old access cookie is present. The service validates that token.
    }
  }

  next();
}

// Alias for master-data routes which expect authenticate
export const authenticate = requireAuth;

/**
 * Returns true for both the legacy built-in Admin role and the newer RBAC
 * Admin/Super Admin role definitions carried by the verified access token.
 */
export function isAdminActor(user?: Request['user']): boolean {
  const roleDefinition = String(user?.roleDefinitionKey || '').trim().toLowerCase().replace(/_/g, '-');
  return user?.role === 'admin' || roleDefinition === 'admin' || roleDefinition === 'super-admin';
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!isAdminActor(req.user) && !roles.includes(req.user.role)) return next(new ForbiddenError('Insufficient permissions'));
    next();
  };
}
