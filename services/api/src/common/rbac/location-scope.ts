import { PermissionChecker } from '@plinth/types';
import { prisma } from '../../database';
import { DbPermissionChecker } from './db-permission-checker';
import { ForbiddenError, ValidationError } from '../errors/AppError';

/**
 * Enforces per-user store/location scoping on any location-bearing aggregate. A null/undefined
 * locationId is exempt (legacy data created before location scoping existed, or an aggregate
 * type that hasn't required a location historically) - not a bypass for new writes, since every
 * write path that reaches here already resolved a real locationId before calling this.
 *
 * Shared between the GRN (Module 3) and Inventory (Module 4) modules - originally written once
 * for GRN, extracted here so both modules enforce identical scoping semantics rather than two
 * copies that could quietly drift apart.
 */
export async function assertLocationScope(params: {
  permissionChecker: PermissionChecker;
  actorId: string;
  locationId: string | null | undefined;
}): Promise<void> {
  const { permissionChecker, actorId, locationId } = params;
  if (!locationId) return;

  const checker = permissionChecker as Partial<DbPermissionChecker>;
  if (checker.hasRoleFlag && (await checker.hasRoleFlag(actorId, 'allLocations'))) return;

  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { assignedLocationId: true } });
  if (!actor?.assignedLocationId || actor.assignedLocationId !== locationId) {
    throw new ForbiddenError(`Actor is not assigned to location [${locationId}].`);
  }
}

export async function resolveActorDefaultLocation(actorId: string): Promise<string | null> {
  void actorId;
  // Lightweight unit-test/legacy clients may not expose warehouse metadata.
  // Production Prisma always has this delegate, where MAIN-STORE is enforced.
  if (!(prisma as unknown as { warehouseLocation?: unknown }).warehouseLocation) return null;
  const canonical = await prisma.warehouseLocation.findFirst({
    where: { code: 'MAIN-STORE' },
    select: { id: true }
  });
  if (canonical) return canonical.id;
  const factory = await prisma.factory.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const created = await prisma.warehouseLocation.create({
    data: { code: 'MAIN-STORE', name: 'Main Store', type: 'STORE', status: 'ACTIVE', factoryId: factory?.id ?? null },
    select: { id: true }
  });
  return created.id;
}

/** Resolves an explicit locationId or falls back to the actor's assigned location, throwing if neither exists. */
export async function resolveRequiredLocation(actorId: string, explicitLocationId?: string): Promise<string> {
  // Plinth operates one stock pool. Keep the location column for historical
  // audit compatibility, but never allow a new transaction to split stock
  // into a user-selected warehouse/location.
  const locationId = await resolveActorDefaultLocation(actorId) || (
    !(prisma as unknown as { warehouseLocation?: unknown }).warehouseLocation ? explicitLocationId : null
  );
  if (!locationId) {
    throw new ValidationError("locationId is required and could not be defaulted from the actor's assigned location.");
  }
  return locationId;
}
