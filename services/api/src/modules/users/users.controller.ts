import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@plinth/types';
import { UnauthorizedError } from '../../common/errors/AppError';
import { authService } from '../auth/auth.service';
import { createRoleDefinition, listRolesWithPermissions, listRoleDefinitions, updateRoleDefinition, updateRolePermissions as saveRolePermissions } from './rbac';
import { invalidateActorCapabilities } from '../../common/rbac/permission-cache';

function actor(req: Request) {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return { id: req.user.id, requestId: req.id, ipAddress: req.ip };
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const data = await authService.listUsers(page, limit);
    res.status(200).json({ success: true, data, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function accessBootstrap(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [users, roles] = await Promise.all([
      authService.listUsers(page, limit),
      listRoleDefinitions()
    ]);
    res.status(200).json({ success: true, data: { users: users.users, roles }, requestId: req.id });
  } catch (error) { next(error); }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authService.createUser(req.body, actor(req));
    res.status(201).json({
      success: true,
      data: { user },
      message: 'User created successfully',
      requestId: req.id
    });
  } catch (error) {
    next(error);
  }
}

export async function updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authService.updateStatus(req.params.id, req.body.isActive, actor(req));
    invalidateActorCapabilities(req.params.id);
    res.status(200).json({ success: true, data: { user }, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.body.roleDefinitionId
      ? await authService.updateRoleDefinition(req.params.id, req.body.roleDefinitionId, actor(req))
      : await authService.updateRole(req.params.id, req.body.role as UserRole, actor(req));
    invalidateActorCapabilities(req.params.id);
    res.status(200).json({ success: true, data: { user }, requestId: req.id });
  } catch (error) { next(error); }
}

export async function listRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ success: true, data: { roles: await listRoleDefinitions(), legacyRoles: await listRolesWithPermissions() }, requestId: req.id });
  } catch (error) { next(error); }
}

export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { const role = await createRoleDefinition(req.body); res.status(201).json({ success: true, data: { role }, message: 'Role created successfully', requestId: req.id }); }
  catch (error) { next(error); }
}

export async function editRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { const role = await updateRoleDefinition(req.params.id, req.body); res.status(200).json({ success: true, data: { role }, message: 'Role updated successfully', requestId: req.id }); }
  catch (error) { next(error); }
}

export async function updateRolePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await saveRolePermissions(req.params.role as UserRole, req.body.permissionIds);
    res.status(200).json({ success: true, data: { roles }, message: 'Role permissions updated', requestId: req.id });
  } catch (error) { next(error); }
}
