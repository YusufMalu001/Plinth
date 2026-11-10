import { Router } from 'express';
import { createRoleRequestSchema, createUserRequestSchema, userListRequestSchema, userStatusRequestSchema, updateUserRoleRequestSchema, updateRoleDefinitionRequestSchema, updateRolePermissionsRequestSchema } from '@synergy/validation';
import { requireAuth, requireRole } from '../../common/middleware/auth';
import { requireTrustedOrigin } from '../../common/middleware/trustedOrigin';
import { validate } from '../../common/middleware/validation';
import { accessBootstrap, createRole, createUser, editRole, listUsers, updateUserStatus, updateUserRole, listRoles, updateRolePermissions } from './users.controller';

const router = Router();

router.use('/users', requireAuth, requireRole('admin', 'manager', 'hr_manager', 'hr'));
router.use('/roles', requireAuth, requireRole('admin', 'manager', 'hr_manager', 'hr'));
router.get('/users', validate(userListRequestSchema), listUsers);
router.get('/access/bootstrap', requireAuth, requireRole('admin', 'manager', 'hr_manager', 'hr'), validate(userListRequestSchema), accessBootstrap);
router.post('/users', requireTrustedOrigin, validate(createUserRequestSchema), createUser);
router.patch('/users/:id/status', requireTrustedOrigin, validate(userStatusRequestSchema), updateUserStatus);
router.patch('/users/:id/role', requireTrustedOrigin, validate(updateUserRoleRequestSchema), updateUserRole);
router.get('/roles', listRoles);
router.post('/roles', requireTrustedOrigin, validate(createRoleRequestSchema), createRole);
router.patch('/roles/:id', requireTrustedOrigin, validate(updateRoleDefinitionRequestSchema), editRole);
router.put('/roles/:role/permissions', requireTrustedOrigin, validate(updateRolePermissionsRequestSchema), updateRolePermissions);

export default router;
