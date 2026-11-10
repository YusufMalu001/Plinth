import { Request, Response, NextFunction } from 'express';
import { PermissionChecker, ScopeContext } from '@synergy/types';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';
import { DatabasePermissionChecker } from '../../modules/users/rbac';
import { isAdminActor } from './auth';

// Default global permission checker instance (can be overridden via dependency injection)
let defaultPermissionChecker: PermissionChecker = new DatabasePermissionChecker();

export function setDefaultPermissionChecker(checker: PermissionChecker): void {
  defaultPermissionChecker = checker;
}

export function getDefaultPermissionChecker(): PermissionChecker {
  return defaultPermissionChecker;
}

/**
 * Authorization Middleware Factory.
 * Evaluates actor permissions via the injected PermissionChecker interface.
 * 
 * @param action - Action to perform (e.g. 'view', 'create', 'update', 'approve', 'deactivate', 'import', 'export')
 * @param resource - Resource target (e.g. 'Product', 'Material', 'UnitOfMeasure', 'Vendor', 'Customer')
 * @param permissionChecker - Optional injected PermissionChecker instance
 */
export function authorize(
  action: string | string[],
  resource: string | string[],
  permissionChecker?: PermissionChecker
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw new UnauthorizedError('User must be authenticated to access this resource');
      }

      // Admin is the platform authority. Keep the permission catalogue for
      // every other role, but do not make Admin depend on seeded RBAC rows.
      if (isAdminActor(req.user)) {
        next();
        return;
      }

      const checker = permissionChecker || defaultPermissionChecker;
      const scope: ScopeContext = {
        role: req.user.role,
        organizationId: req.user.organizationId ?? undefined,
        locationId: req.user.locationId ?? undefined,
        departmentId: req.user.departmentId ?? undefined
      };

      const actions = Array.isArray(action) ? action : [action];
      const resources = Array.isArray(resource) ? resource : [resource];
      let isAllowed = false;

      for (const res of resources) {
        for (const act of actions) {
          if (await checker.can(req.user.id, act, res, scope)) {
            isAllowed = true;
            break;
          }
        }
        if (isAllowed) break;
      }

      if (!isAllowed) {
        throw new ForbiddenError(
          `Permission denied: Actor [${req.user.id}] is not authorized to perform action [${actions.join('|')}] on resource [${resources.join('|')}].`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
