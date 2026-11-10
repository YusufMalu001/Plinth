import { describe, it, expect, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { DbPermissionChecker } from '../db-permission-checker';

function makePrisma(userRoleRows: unknown[]): PrismaClient {
  return {
    userRole: {
      findMany: jest.fn().mockResolvedValue(userRoleRows as never)
    }
  } as unknown as PrismaClient;
}

function grant(overrides: { organizationId?: string | null; allLocations?: boolean; permissions: Array<{ action: string; resource: string }> }) {
  return {
    organizationId: overrides.organizationId ?? null,
    role: {
      allLocations: overrides.allLocations ?? false,
      permissions: overrides.permissions.map((p) => ({ permission: p }))
    }
  };
}

describe('DbPermissionChecker', () => {
  it('always allows the system actor without querying grants', async () => {
    const prisma = makePrisma([]);
    const checker = new DbPermissionChecker(prisma);

    const allowed = await checker.can('system', 'finalize', 'GoodsReceiptNote');

    expect(allowed).toBe(true);
    expect(prisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('denies when the actor has no matching grant', async () => {
    const prisma = makePrisma([]);
    const checker = new DbPermissionChecker(prisma);

    const allowed = await checker.can('actor-1', 'finalize', 'GoodsReceiptNote');

    expect(allowed).toBe(false);
  });

  it('allows when an ungated (organizationId: null) grant matches the action/resource', async () => {
    const prisma = makePrisma([grant({ permissions: [{ action: 'finalize', resource: 'GoodsReceiptNote' }] })]);
    const checker = new DbPermissionChecker(prisma);

    const allowed = await checker.can('actor-1', 'finalize', 'GoodsReceiptNote');

    expect(allowed).toBe(true);
  });

  it('denies a grant scoped to a different action/resource pair', async () => {
    const prisma = makePrisma([grant({ permissions: [{ action: 'read', resource: 'GoodsReceiptNote' }] })]);
    const checker = new DbPermissionChecker(prisma);

    const allowed = await checker.can('actor-1', 'finalize', 'GoodsReceiptNote');

    expect(allowed).toBe(false);
  });

  it('includes org-scoped grants matching the request scope in the query', async () => {
    const prisma = makePrisma([grant({ organizationId: 'org-1', permissions: [{ action: 'finalize', resource: 'GoodsReceiptNote' }] })]);
    const checker = new DbPermissionChecker(prisma);

    const allowed = await checker.can('actor-1', 'finalize', 'GoodsReceiptNote', { organizationId: 'org-1' });

    expect(allowed).toBe(true);
    expect(prisma.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'actor-1',
          OR: expect.arrayContaining([{ organizationId: null }, { organizationId: 'org-1' }])
        })
      })
    );
  });

  describe('hasRoleFlag', () => {
    it('returns true when any granted role carries the flag', async () => {
      const prisma = makePrisma([grant({ allLocations: true, permissions: [] })]);
      const checker = new DbPermissionChecker(prisma);

      expect(await checker.hasRoleFlag('actor-1', 'allLocations')).toBe(true);
    });

    it('returns false when no granted role carries the flag', async () => {
      const prisma = makePrisma([grant({ allLocations: false, permissions: [] })]);
      const checker = new DbPermissionChecker(prisma);

      expect(await checker.hasRoleFlag('actor-1', 'allLocations')).toBe(false);
    });
  });
});
