import { PrismaClient } from '@prisma/client';
import { PermissionChecker, ScopeContext } from '@plinth/types';
import { prisma as defaultPrisma } from '../../database';
import { getActorCapabilities, hasCapability } from './permission-cache';

/**
 * Real, DB-backed PermissionChecker for the GRN + Procurement modules.
 * Replaces AllowAllPermissionChecker for these two modules only - every other module
 * keeps running on the global default (see authorize.ts) until it opts in the same way.
 */
export class DbPermissionChecker implements PermissionChecker {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async can(actorId: string, action: string, resource: string, scope?: ScopeContext): Promise<boolean> {
    if (actorId === 'system') return true;
    // Lightweight injected test/compatibility clients may expose only the
    // legacy userRole delegate. Production clients use the cached fast path.
    if (!(this.prisma as unknown as { user?: unknown }).user) {
      const grants = await this.prisma.userRole.findMany({ where: { userId: actorId, OR: [{ organizationId: null }, ...(scope?.organizationId ? [{ organizationId: scope.organizationId }] : [])] }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
      return grants.some(grant => grant.role.permissions.some(permission => permission.permission.action === action && permission.permission.resource === resource));
    }
    void scope;
    return hasCapability(await getActorCapabilities(this.prisma, actorId), action, resource);
  }

  /** Extra method beyond the PermissionChecker interface - not part of the shared contract,
   *  so test doubles (MockPermissionChecker etc.) don't need to implement it. */
  async hasRoleFlag(actorId: string, flag: 'allLocations'): Promise<boolean> {
    if (!(this.prisma as unknown as { user?: unknown }).user) {
      const grants = await this.prisma.userRole.findMany({ where: { userId: actorId }, include: { role: true } });
      return grants.some(grant => grant.role[flag]);
    }
    const capabilities = await getActorCapabilities(this.prisma, actorId);
    return capabilities.admin || (flag === 'allLocations' && capabilities.allLocations);
  }
}
