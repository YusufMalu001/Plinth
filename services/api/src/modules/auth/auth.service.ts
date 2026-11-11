import crypto from 'crypto';
/* eslint-disable @typescript-eslint/no-explicit-any */
import argon2 from 'argon2';
import { Role } from '@prisma/client';
import { SafeUser, UserRole } from '@plinth/types';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../common/errors/AppError';
import { config } from '../../config';
import { prisma } from '../../database';
import { authRepository } from './auth.repository';
import { ensureDepartmentInchargeRole } from '../users/rbac';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  tokenHashesMatch,
  verifyRefreshToken
} from './auth.tokens';

interface SafeUserSource {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  roleDefinitionId?: string | null;
  roleDefinition?: { id: string; key: string; name: string } | null;
  isActive: boolean;
  employeeId: string | null;
  phone: string | null;
  department: string | null;
  title: string | null;
  dateOfHire: Date | null;
  employeeStatus: string | null;
  mustChangePassword?: boolean;
  onboardingCompleted?: boolean;
  onboardingToken?: string | null;
  employeeRefId?: string | null;
  assignedDepartmentId?: string | null;
  assignedDepartmentRef?: {
    id: string;
    name: string;
    code: string;
    isAssembly: boolean;
  } | null;
  employeeRef?: {
    department?: {
      id: string;
      name: string;
      code: string;
      isAssembly: boolean;
    } | null;
  } | null;
  assignedOrganizationId?: string | null;
  assignedLocationId?: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  userRoles?: Array<{ role: { id: string; name: string; permissions?: Array<{ permission: { action: string; resource: string } }> } }>;
}

function safeUser(user: SafeUserSource): SafeUser {
  // A user can have several RBAC assignments. Prisma does not guarantee the
  // relation order, so never let an arbitrary role (for example
  // procurement_manager) replace the role the account was provisioned for.
  // Keep the workflow-facing role deterministic and human-readable.
  const rolePriority = [
    'admin',
    'super-admin',
    'department_head',
    'department-head',
    'department_incharge',
    'department-incharge',
    'shop_floor_operator',
    'shop-floor-operator',
    'store-manager',
    'store_manager',
    'inventory-manager',
    'inventory_manager',
    'procurement_manager',
    'procurement-officer',
    'quality_inspector',
    'quality_manager'
  ];
  const assignedRole = [...(user.userRoles ?? [])].sort((a, b) => {
    const ai = rolePriority.indexOf(a.role.name.toLowerCase().replace(/\s+/g, '-'));
    const bi = rolePriority.indexOf(b.role.name.toLowerCase().replace(/\s+/g, '-'));
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  })[0]?.role;
  const roleLabel = (key: string) => ({
    'store-manager': 'Store Manager',
    'inventory-manager': 'Inventory Manager',
    'procurement_manager': 'Procurement Manager',
    'procurement-officer': 'Procurement Officer',
    'super-admin': 'Super Admin',
    'department_incharge': 'Department In-Charge',
    'department-incharge': 'Department In-Charge',
    'department_head': 'Department Head',
    'shop_floor_operator': 'Shop Floor Operator',
    admin: 'Admin'
  } as Record<string, string>)[key] ?? key.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    roleDefinition: assignedRole ? { id: assignedRole.id, key: assignedRole.name, name: roleLabel(assignedRole.name) } : null,
    roles: user.userRoles?.map(item => ({ id: item.role.id, key: item.role.name, name: item.role.name })) ?? [],
    permissions: [...new Set((user.userRoles ?? []).flatMap(item => item.role.permissions ?? []).map(item => `${item.permission.action}:${item.permission.resource}`.toLowerCase()))],
    isActive: user.isActive,
    employeeId: user.employeeId,
    phone: user.phone,
    department: user.department,
    title: user.title,
    dateOfHire: user.dateOfHire?.toISOString() ?? null,
    employeeStatus: user.employeeStatus,
    mustChangePassword: user.mustChangePassword ?? false,
    onboardingCompleted: user.onboardingCompleted ?? false,
    onboardingToken: user.onboardingToken ?? null,
    employeeRefId: user.employeeRefId ?? null,
    assignedDepartmentId: user.assignedDepartmentId ?? (user.assignedDepartmentRef || user.employeeRef?.department)?.id ?? null,
    assignedDepartment: (() => {
      const dept = user.assignedDepartmentRef || user.employeeRef?.department || null;
      if (!dept) return null;
      const isAssembly = Boolean(
        dept.isAssembly ||
        (dept.name && /assembly/i.test(dept.name)) ||
        (dept.code && /assembly/i.test(dept.code)) ||
        (user.department && /assembly/i.test(user.department))
      );
      return {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        isAssembly
      };
    })(),
    isAssemblyDepartment: (() => {
      const dept = user.assignedDepartmentRef || user.employeeRef?.department || null;
      return Boolean(
        dept?.isAssembly ||
        (dept?.name && /assembly/i.test(dept.name)) ||
        (dept?.code && /assembly/i.test(dept.code)) ||
        (user.department && /assembly/i.test(user.department))
      );
    })(),
    assignedOrganizationId: user.assignedOrganizationId ?? null,
    assignedLocationId: user.assignedLocationId ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

function expiryDate() {
  return new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

export const authService = {
  async login(input: {
    email: string;
    password: string;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    let user = await authRepository.findUserByEmail(normalizedEmail);
    const defaultPassword = 'Plinth@2026!';

    // If user account is not found yet, check if employee exists with this email or username
    if (!user) {
      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { email: { equals: normalizedEmail, mode: 'insensitive' } },
            { employeeCode: { equals: input.email.trim(), mode: 'insensitive' } }
          ]
        }
      });

      if (employee) {
        const empEmail = employee.email.trim().toLowerCase();
        // Check if user already exists under employee's exact email
        user = await authRepository.findUserByEmail(empEmail);
        if (!user) {
          const hashedPassword = await argon2.hash(input.password || defaultPassword, { type: argon2.argon2id });
          await prisma.user.create({
            data: {
              email: empEmail,
              firstName: employee.firstName,
              lastName: employee.lastName,
              name: `${employee.firstName} ${employee.lastName}`.trim(),
              password: hashedPassword,
              role: 'employee',
              employeeRefId: employee.id,
              employeeId: employee.employeeCode,
              phone: employee.phone || null,
              title: employee.designation || employee.role || 'Employee',
              initialPassword: input.password || defaultPassword,
              mustChangePassword: true,
              onboardingCompleted: false
            }
          });
          user = await authRepository.findUserByEmail(empEmail);
        }
      }
    }

    let validPassword = user ? await argon2.verify(user.password, input.password).catch(() => false) : false;

    // Fallback: If verification against hashed password fails:
    // 1. Matches user.initialPassword
    // 2. Or matches system default initial password
    // 3. Or matches default password and user has mustChangePassword
    if (user && !validPassword) {
      const matchesInitial = user.initialPassword && user.initialPassword === input.password;
      const matchesDefault = input.password === defaultPassword;

      if (matchesInitial || matchesDefault) {
        const newHashed = await argon2.hash(input.password, { type: argon2.argon2id });
        await prisma.user.update({
          where: { id: user.id },
          data: { password: newHashed, initialPassword: input.password }
        });
        validPassword = true;
      }
    }

    if (!user || !validPassword) {
      await authRepository.audit({
        action: 'AUTH_LOGIN_FAILED',
        requestId: input.requestId,
        ipAddress: input.ipAddress
      });
      throw new UnauthorizedError('Invalid email or password');
    }
    if (!user.isActive) throw new ForbiddenError('This account is inactive');
    const sessionId = crypto.randomUUID();
    const refreshToken = signRefreshToken(user, sessionId);
    await authRepository.createSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: expiryDate(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
    await authRepository.markLogin(user.id);
    // Re-read the user with role permissions included. The update query only
    // returns scalar user fields, but the client-side navigation guard needs
    // the complete server-issued capability payload on the first response.
    const updatedUser = await authRepository.findUserById(user.id);
    if (!updatedUser) throw new UnauthorizedError('Authentication required');
    await authRepository.audit({
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCEEDED',
      resourceId: user.id,
      requestId: input.requestId,
      ipAddress: input.ipAddress
    });
    return { accessToken: signAccessToken(updatedUser), refreshToken, user: safeUser(updatedUser) };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload.jti) throw new UnauthorizedError('Authentication required');
    const session = await authRepository.findSession(payload.jti);
    const suppliedHash = hashRefreshToken(refreshToken);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      !tokenHashesMatch(session.refreshTokenHash, suppliedHash)
    ) {
      if (session) await authRepository.revokeSession(session.id);
      throw new UnauthorizedError('Session has expired');
    }
    const nextRefreshToken = signRefreshToken(session.user, session.id);
    await authRepository.rotateSession(session.id, hashRefreshToken(nextRefreshToken), expiryDate());
    const hydratedUser = await authRepository.findUserById(session.user.id);
    if (!hydratedUser) throw new UnauthorizedError('Authentication required');
    return {
      accessToken: signAccessToken(hydratedUser),
      refreshToken: nextRefreshToken,
      user: safeUser(hydratedUser)
    };
  },

  async logout(refreshToken: string | undefined, requestId: string, ipAddress?: string) {
    if (!refreshToken) return;
    try {
      const payload = verifyRefreshToken(refreshToken);
      if (payload.jti) {
        await authRepository.revokeSession(payload.jti);
        await authRepository.audit({
          userId: payload.sub,
          action: 'AUTH_LOGOUT',
          resourceId: payload.sub,
          requestId,
          ipAddress
        });
      }
    } catch {
      // Logout is idempotent; invalid or expired cookies are still cleared by the controller.
    }
  },

  async currentUser(userId: string) {
    let user = await authRepository.findUserById(userId);
    if (!user || !user.isActive) throw new UnauthorizedError('Authentication required');
    const hasDepartmentInchargeRole = user.userRoles?.some(({ role }) => role.name.toLowerCase().replace(/-/g, '_') === 'department_incharge');
    const hasExecutionGrant = user.userRoles?.some(({ role }) =>
      role.name.toLowerCase().replace(/-/g, '_') === 'department_incharge' &&
      role.permissions?.some(({ permission }) => permission.action === 'view' && permission.resource.toLowerCase() === 'departmentexecution')
    );
    if (hasDepartmentInchargeRole && !hasExecutionGrant) {
      await ensureDepartmentInchargeRole();
      user = await authRepository.findUserById(userId);
      if (!user || !user.isActive) throw new UnauthorizedError('Authentication required');
    }
    return safeUser(user);
  },

  async listUsers(page: number = 1, limit: number = 20) {
    const validPage = Math.max(1, Number(page) || 1);
    const validLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const [users, total] = await authRepository.listUsers((validPage - 1) * validLimit, validLimit);
    return { users: users.map(safeUser), page: validPage, limit: validLimit, total };
  },

  async createUser(
    input: { email: string; password: string; name?: string; role: UserRole; roleDefinitionId?: string },
    actor: { id: string; requestId: string; ipAddress?: string }
  ) {
    if (await authRepository.findUserByEmail(input.email)) throw new ConflictError('Email is already in use');
    const user = await authRepository.createUser({
      email: input.email,
      name: input.name,
      role: input.role as unknown as Role,
      password: await argon2.hash(input.password, { type: argon2.argon2id }),
    });
    if (input.roleDefinitionId) await authRepository.updateUserRoleDefinition(user.id, input.roleDefinitionId);
    await authRepository.audit({
      userId: actor.id,
      action: 'USER_CREATED',
      resourceId: user.id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      after: { email: user.email, role: user.role, isActive: user.isActive }
    });
    return safeUser(input.roleDefinitionId ? (await authRepository.findUserById(user.id))! : user);
  },

  async updateStatus(
    id: string,
    isActive: boolean,
    actor: { id: string; requestId: string; ipAddress?: string }
  ) {
    if (id === actor.id && !isActive) throw new ForbiddenError('You cannot deactivate your own account');
    const existing = await authRepository.findUserById(id);
    if (!existing) throw new NotFoundError('User not found');
    const user = await authRepository.updateUserStatus(id, isActive);
    await authRepository.audit({
      userId: actor.id,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      resourceId: id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      before: { isActive: existing.isActive },
      after: { isActive }
    });
    return safeUser(user);
  },

  async updateRole(
    id: string,
    role: UserRole,
    actor: { id: string; requestId: string; ipAddress?: string }
  ) {
    if (id === actor.id && role !== 'admin') throw new ForbiddenError('You cannot remove your own administrator access');
    const existing = await authRepository.findUserById(id);
    if (!existing) throw new NotFoundError('User not found');
    const user = await authRepository.updateUserRole(id, role as unknown as Role);
    await authRepository.audit({
      userId: actor.id,
      action: 'USER_ROLE_UPDATED',
      resourceId: id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      before: { role: existing.role },
      after: { role: user.role }
    });
    return safeUser(user);
  },

  async updateRoleDefinition(id: string, roleDefinitionId: string | null, actor: { id: string; requestId: string; ipAddress?: string }) {
    if (id === actor.id && !roleDefinitionId) throw new ForbiddenError('You cannot remove your own administrator access');
    const existing = await authRepository.findUserById(id);
    if (!existing) throw new NotFoundError('User not found');
    const user = await authRepository.updateUserRoleDefinition(id, roleDefinitionId);
    if (!user) throw new NotFoundError('User not found');
    await authRepository.audit({ userId: actor.id, action: 'USER_ROLE_UPDATED', resourceId: id, requestId: actor.requestId, ipAddress: actor.ipAddress, before: { role: existing.role }, after: { role: user.role } });
    return safeUser(user);
  },

  async updateMe(
    id: string,
    data: { firstName?: string; lastName?: string; email?: string },
    actor: { requestId: string; ipAddress?: string }
  ) {
    const existing = await authRepository.findUserById(id);
    if (!existing) throw new NotFoundError('User not found');
    
    // Simple email collision check if email is changed
    if (data.email && data.email !== existing.email) {
      if (await authRepository.findUserByEmail(data.email)) {
        throw new ConflictError('Email is already in use');
      }
    }

    const user = await authRepository.updateUser(id, data);
    
    await authRepository.audit({
      userId: id,
      action: 'USER_PROFILE_UPDATED',
      resourceId: id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      before: { firstName: existing.firstName, lastName: existing.lastName, email: existing.email },
      after: { firstName: user.firstName, lastName: user.lastName, email: user.email }
    });
    return safeUser(user);
  },
  async changePassword(userId: string, newPassword: string) {
    const hashedPassword = await argon2.hash(newPassword, { type: argon2.argon2id });
    const updated = await authRepository.updateUserPassword(userId, hashedPassword, false, newPassword);
    return safeUser(updated);
  }
};
