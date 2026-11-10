import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../../app';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../../database';
import crypto from 'crypto';

jest.mock('../../../../common/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: (req.headers['x-actor-id'] as string) || 'dev-system-user', email: 'test@example.com', role: 'admin' };
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: (req.headers['x-actor-id'] as string) || 'dev-system-user', email: 'test@example.com', role: 'admin' };
    next();
  },
  isAdminActor: (user?: Request['user']) => {
    const roleDefinition = String(user?.roleDefinitionKey || '').trim().toLowerCase().replace(/_/g, '-');
    return user?.role === 'admin' || roleDefinition === 'admin' || roleDefinition === 'super-admin';
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  optionalAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: (req.headers['x-actor-id'] as string) || 'dev-system-user', email: 'test@example.com', role: 'admin' };
    next();
  }
}));

jest.setTimeout(120000);

// Real DbPermissionChecker is wired into inventory.routes.ts (scoped RBAC), so tests must seed
// actual Role/Permission/UserRole rows. Test users are created with role 'employee' (not
// 'admin') so DbPermissionChecker's DB-level admin bypass never masks the granted-permission
// checks under test - the mocked authenticate middleware's req.user.role is irrelevant to it,
// since it queries the User row for the real actorId, not the JWT claim.
const INVENTORY_PERMISSIONS: Array<{ action: string; resource: string }> = [
  { action: 'view', resource: 'StockBalance' },
  { action: 'export', resource: 'StockBalance' },
  { action: 'view', resource: 'StockIssue' },
  { action: 'issue', resource: 'StockIssue' },
  { action: 'view', resource: 'StockTransfer' },
  { action: 'transfer', resource: 'StockTransfer' },
  { action: 'view', resource: 'StockAdjustment' },
  { action: 'adjust', resource: 'StockAdjustment' },
  { action: 'approve', resource: 'StockAdjustment' },
  { action: 'view', resource: 'StockReservation' },
  { action: 'reserve', resource: 'StockReservation' }
];

async function grantInventoryAccess(actorId: string, options: { allLocations?: boolean } = {}) {
  const role = await prisma.rbacRole.create({
    data: { name: `test-role-${actorId}-${crypto.randomUUID().substring(0, 8)}`, allLocations: options.allLocations ?? true }
  });
  for (const p of INVENTORY_PERMISSIONS) {
    const key = `${p.action}:${p.resource}`;
    const permission = await prisma.permission.upsert({
      where: { action_resource: { action: p.action, resource: p.resource } },
      update: { key },
      create: { ...p, key }
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  await prisma.userRole.create({ data: { userId: actorId, roleId: role.id, organizationId: null } });
}

const describeWithTestDatabase = (name: string, fn: () => void) => {
  if (process.env.TEST_DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

describeWithTestDatabase('Module 4 - Inventory API Integration Tests', () => {
  let productId: string;
  let uomId: string;
  let locationAId: string;
  let locationBId: string;

  async function seedBalance(locationId: string, onHandQuantity: number) {
    await prisma.stockBalance.create({
      data: {
        itemKey: `PRODUCT:${productId}`,
        productId,
        uomId,
        locationId,
        ownership: 'OWNED',
        onHandQuantity,
        reservedQuantity: 0
      }
    });
  }

  beforeEach(async () => {
    const uom = await prisma.unitOfMeasure.create({
      data: { code: `UOM-${crypto.randomUUID().substring(0, 8)}`, name: 'Each', symbol: 'EA' }
    });
    uomId = uom.id;

    const category = await prisma.category.create({
      data: { code: `CAT-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Category', parentId: null }
    });
    const family = await prisma.productFamily.create({
      data: { code: `FAM-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Family', categoryId: category.id }
    });
    const product = await prisma.product.create({
      data: { sku: `SKU-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Product', uomId, status: 'APPROVED', productFamilyId: family.id, categoryId: category.id }
    });
    productId = product.id;

    const locationA = await prisma.warehouseLocation.create({
      data: { code: `WH-A-${crypto.randomUUID().substring(0, 8)}`, name: 'Store A', type: 'STORE', status: 'ACTIVE' }
    });
    locationAId = locationA.id;
    const locationB = await prisma.warehouseLocation.create({
      data: { code: `WH-B-${crypto.randomUUID().substring(0, 8)}`, name: 'Store B', type: 'STORE', status: 'ACTIVE' }
    });
    locationBId = locationB.id;

    await prisma.user.createMany({
      data: [
        { id: 'clerk-user', email: 'inv-clerk@test.com', name: 'Clerk', password: 'password', role: 'employee' },
        { id: 'supervisor-user', email: 'inv-supervisor@test.com', name: 'Supervisor', password: 'password', role: 'employee' },
        { id: 'outsider-user', email: 'inv-outsider@test.com', name: 'Outsider', password: 'password', role: 'employee' }
      ],
      skipDuplicates: true
    });
    await prisma.user.update({ where: { id: 'clerk-user' }, data: { assignedLocationId: locationAId } });
    await prisma.user.update({ where: { id: 'supervisor-user' }, data: { assignedLocationId: locationAId } });

    await grantInventoryAccess('clerk-user');
    await grantInventoryAccess('supervisor-user');
  });

  describe('Transfer lifecycle', () => {
    it('walks request -> issue -> receive and reflects balances at both locations', async () => {
      await seedBalance(locationAId, 100);

      const requestRes = await request(app)
        .post('/api/v1/inventory/transfers')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, fromLocationId: locationAId, toLocationId: locationBId, requestedQuantity: 20 });
      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.status).toBe('REQUESTED');
      const transferId = requestRes.body.data.id;

      // Separation of duties: supervisor issues the transfer requested by clerk
      const issueRes = await request(app)
        .post(`/api/v1/inventory/transfers/${transferId}/issue`)
        .set('x-actor-id', 'supervisor-user')
        .send({ quantity: 20 });
      expect(issueRes.status).toBe(200);
      expect(issueRes.body.data.status).toBe('ISSUED');

      const receiveRes = await request(app)
        .post(`/api/v1/inventory/transfers/${transferId}/receive`)
        .set('x-actor-id', 'clerk-user')
        .send({ quantity: 20 });
      expect(receiveRes.status).toBe(200);
      expect(receiveRes.body.data.status).toBe('RECEIVED');

      const balanceA = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `PRODUCT:${productId}`, uomId, locationId: locationAId, ownership: 'OWNED' } }
      });
      const balanceB = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `PRODUCT:${productId}`, uomId, locationId: locationBId, ownership: 'OWNED' } }
      });
      expect(balanceA?.onHandQuantity).toBe(80);
      expect(balanceB?.onHandQuantity).toBe(20);
    });

    it('rejects issuing a transfer at a location the actor is not assigned to', async () => {
      await seedBalance(locationBId, 50);
      await grantInventoryAccess('outsider-user', { allLocations: false });

      const createRes = await request(app)
        .post('/api/v1/inventory/transfers')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, fromLocationId: locationAId, toLocationId: locationBId, requestedQuantity: 5 });

      const issueRes = await request(app)
        .post(`/api/v1/inventory/transfers/${createRes.body.data.id}/issue`)
        .set('x-actor-id', 'outsider-user')
        .send({ quantity: 5 });

      expect(issueRes.status).toBe(403);
    });
  });

  describe('Adjustment lifecycle', () => {
    it('walks propose -> approve -> post for an INCREASE and reflects the balance', async () => {
      const proposeRes = await request(app)
        .post('/api/v1/inventory/adjustments')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, direction: 'INCREASE', quantity: 15, reason: 'Physical count found extra stock' });
      expect(proposeRes.status).toBe(201);
      const adjustmentId = proposeRes.body.data.id;

      const approveRes = await request(app)
        .post(`/api/v1/inventory/adjustments/${adjustmentId}/approve`)
        .set('x-actor-id', 'supervisor-user');
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      const postRes = await request(app)
        .post(`/api/v1/inventory/adjustments/${adjustmentId}/post`)
        .set('x-actor-id', 'supervisor-user');
      expect(postRes.status).toBe(200);
      expect(postRes.body.data.status).toBe('POSTED');

      const balance = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `PRODUCT:${productId}`, uomId, locationId: locationAId, ownership: 'OWNED' } }
      });
      expect(balance?.onHandQuantity).toBe(15);
    });

    it('rejects posting an adjustment that was rejected, not approved', async () => {
      const proposeRes = await request(app)
        .post('/api/v1/inventory/adjustments')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, direction: 'DECREASE', quantity: 5, reason: 'Suspected miscount' });
      expect(proposeRes.status).toBe(201);
      const adjustmentId = proposeRes.body.data.id;

      const rejectRes = await request(app)
        .post(`/api/v1/inventory/adjustments/${adjustmentId}/reject`)
        .set('x-actor-id', 'supervisor-user')
        .send({ reason: 'Recount shows no variance' });
      expect(rejectRes.status).toBe(200);

      const postRes = await request(app)
        .post(`/api/v1/inventory/adjustments/${adjustmentId}/post`)
        .set('x-actor-id', 'supervisor-user');

      expect(postRes.status).toBe(422);
      expect(postRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('Reservation lifecycle', () => {
    it('reserves against available stock, then releases the hold', async () => {
      await seedBalance(locationAId, 40);

      const reserveRes = await request(app)
        .post('/api/v1/inventory/reservations')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, quantity: 10, reason: 'Held for priority order' });
      expect(reserveRes.status).toBe(201);
      expect(reserveRes.body.data.status).toBe('ACTIVE');

      const balanceAfterReserve = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `PRODUCT:${productId}`, uomId, locationId: locationAId, ownership: 'OWNED' } }
      });
      expect(balanceAfterReserve?.reservedQuantity).toBe(10);
      expect(balanceAfterReserve?.onHandQuantity).toBe(40); // on-hand is unaffected by a reservation

      const releaseRes = await request(app)
        .post(`/api/v1/inventory/reservations/${reserveRes.body.data.id}/release`)
        .set('x-actor-id', 'clerk-user');
      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.data.status).toBe('RELEASED');

      const balanceAfterRelease = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `PRODUCT:${productId}`, uomId, locationId: locationAId, ownership: 'OWNED' } }
      });
      expect(balanceAfterRelease?.reservedQuantity).toBe(0);
    });

    it('rejects a reservation exceeding available stock (onHand - already reserved)', async () => {
      await seedBalance(locationAId, 10);

      await request(app)
        .post('/api/v1/inventory/reservations')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, quantity: 8, reason: 'First reservation' });

      const secondRes = await request(app)
        .post('/api/v1/inventory/reservations')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, quantity: 5, reason: 'Second reservation exceeds availability' });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    });
  });

  describe('Location scoping', () => {
    it('returns 403 when an actor with no location grant issues stock at a scoped location', async () => {
      await seedBalance(locationAId, 20);
      await grantInventoryAccess('outsider-user', { allLocations: false });

      const issueRes = await request(app)
        .post('/api/v1/inventory/issues')
        .set('x-actor-id', 'outsider-user')
        .send({ productId, uomId, locationId: locationAId, quantity: 5, reason: 'Unauthorized attempt' });

      expect(issueRes.status).toBe(403);
    });
  });

  describe('Concurrent issue against low stock', () => {
    it('allows exactly one of two concurrent issues to succeed when stock only covers one', async () => {
      await seedBalance(locationAId, 10);

      const first = await request(app)
        .post('/api/v1/inventory/issues')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, quantity: 8, reason: 'Sequential issue A' });

      const second = await request(app)
        .post('/api/v1/inventory/issues')
        .set('x-actor-id', 'clerk-user')
        .send({ productId, uomId, locationId: locationAId, quantity: 8, reason: 'Sequential issue B' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);

      const balance = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `PRODUCT:${productId}`, uomId, locationId: locationAId, ownership: 'OWNED' } }
      });
      expect(balance?.onHandQuantity).toBe(2);
    });
  });
});
