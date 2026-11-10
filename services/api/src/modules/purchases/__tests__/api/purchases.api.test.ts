import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../../app';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../../database';
import crypto from 'crypto';

jest.mock('../../../../common/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: req.headers['x-actor-id'] as string || 'dev-system-user', email: 'test@example.com', role: 'admin' };
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: req.headers['x-actor-id'] as string || 'dev-system-user', email: 'test@example.com', role: 'admin' };
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

const describeWithTestDatabase = (name: string, fn: () => void) => {
  if (process.env.TEST_DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

// Real DbPermissionChecker is wired into purchases.routes.ts (scoped RBAC), so tests must seed
// actual Role/Permission/UserRole rows rather than injecting a mock checker.
async function grantPermissions(actorId: string, permissions: Array<{ action: string; resource: string }>) {
  const role = await prisma.rbacRole.create({
    data: { name: `test-role-${actorId}-${crypto.randomUUID().substring(0, 8)}`, allLocations: true }
  });
  for (const p of permissions) {
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

const CREATOR_PERMISSIONS = [
  { action: 'request', resource: 'PurchaseRequisition' },
  { action: 'read', resource: 'PurchaseRequisition' },
  { action: 'submit', resource: 'PurchaseRequisition' },
  { action: 'cancel', resource: 'PurchaseRequisition' },
  { action: 'create', resource: 'PurchaseOrder' },
  { action: 'read', resource: 'PurchaseOrder' }
];

const APPROVER_PERMISSIONS = [
  { action: 'read', resource: 'PurchaseRequisition' },
  { action: 'approve', resource: 'PurchaseRequisition' },
  { action: 'self_approve', resource: 'PurchaseRequisition' },
  { action: 'reject', resource: 'PurchaseRequisition' },
  { action: 'request_changes', resource: 'PurchaseRequisition' },
  { action: 'cancel', resource: 'PurchaseRequisition' },
  { action: 'read', resource: 'PurchaseOrder' },
  { action: 'approve', resource: 'PurchaseOrder' },
  { action: 'self_approve', resource: 'PurchaseOrder' },
  { action: 'issue', resource: 'PurchaseOrder' },
  { action: 'revise', resource: 'PurchaseOrder' },
  { action: 'cancel', resource: 'PurchaseOrder' },
  { action: 'delete', resource: 'PurchaseOrder' },
  { action: 'export', resource: 'PurchaseOrder' }
];

describeWithTestDatabase('Module 2 - Purchases API Integration Tests', () => {
  let deptId: string;
  let uomId: string;
  let vendorId: string;
  let productId: string;

  beforeEach(async () => {
    // Setup master data needed for purchases
    const factory = await prisma.factory.create({ data: { code: `FAC-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Factory' } });
    const dept = await prisma.department.create({ data: { code: `DEPT-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Dept', factoryId: factory.id } });
    deptId = dept.id;

    const uom = await prisma.unitOfMeasure.create({ data: { code: `UOM-${crypto.randomUUID().substring(0, 8)}`, name: 'Each', symbol: 'EA' } });
    uomId = uom.id;

    const vendor = await prisma.vendor.create({ data: { code: `VEN-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Vendor', status: 'APPROVED' } });
    vendorId = vendor.id;

    const category = await prisma.category.create({ data: { code: `CAT-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Category', parentId: null } });
    const family = await prisma.productFamily.create({ data: { code: `FAM-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Family', categoryId: category.id } });
    const product = await prisma.product.create({ data: { sku: `SKU-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Product', uomId, status: 'APPROVED', productFamilyId: family.id, categoryId: category.id } });
    productId = product.id;

    await prisma.user.createMany({
      data: [
        { id: 'creator-user', email: 'creator@test.com', name: 'Creator', password: 'password', role: 'employee' },
        { id: 'approver-user', email: 'approver@test.com', name: 'Approver', password: 'password', role: 'admin' }
      ],
      skipDuplicates: true
    });

    await grantPermissions('creator-user', CREATOR_PERMISSIONS);
    await grantPermissions('approver-user', APPROVER_PERMISSIONS);
  });

  afterAll(async () => {
    // Basic cleanup logic if needed
  });

  describe('Happy Path: PR -> submit -> approve -> PO generate -> issue', () => {
    it('should complete full procurement cycle', async () => {
      // 1. Create PR
      const prNumber = `PR-${crypto.randomUUID().substring(0, 8)}`;
      const createRes = await request(app)
        .post('/api/v1/purchases/requisitions')
        .set('x-actor-id', 'creator-user')
        .send({
          prNumber,
          departmentId: deptId,
          needDate: new Date().toISOString(),
          lines: [{ productId, uomId, requestedQuantity: 10 }]
        });

      expect(createRes.status).toBe(201);
      const prId = createRes.body.data.id;

      // 2. Submit PR
      const submitRes = await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/submit`)
        .set('x-actor-id', 'creator-user');
      expect(submitRes.status).toBe(200);

      // 3. Approve PR (as a different user)
      const approvePrRes = await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/approve`)
        .set('x-actor-id', 'approver-user')
        .send({ reason: 'Looks good' });
      expect(approvePrRes.status).toBe(200);
      expect(approvePrRes.body.data.status).toBe('APPROVED');

      // 4. Generate PO
      const poNumber = `PO-${crypto.randomUUID().substring(0, 8)}`;
      const generatePoRes = await request(app)
        .post('/api/v1/purchases/orders')
        .set('x-actor-id', 'creator-user')
        .send({
          poNumber,
          prId,
          vendorId,
          lines: [{ productId, uomId, quantity: 10, needDate: new Date().toISOString() }]
        });

      expect(generatePoRes.status).toBe(201);
      const poId = generatePoRes.body.data.id;

      // 5. Approve PO
      const approvePoRes = await request(app)
        .post(`/api/v1/purchases/orders/${poId}/approve`)
        .set('x-actor-id', 'approver-user');
      expect(approvePoRes.status).toBe(200);

      // 6. Send/Issue PO
      const sendPoRes = await request(app)
        .post(`/api/v1/purchases/orders/${poId}/send`)
        .set('x-actor-id', 'approver-user')
        .send({ method: 'EMAIL' });
      expect(sendPoRes.status).toBe(200);
      expect(sendPoRes.body.data.status).toBe('SENT');
    });
  });

  describe('Duplicate Checking', () => {
    it('should reject duplicate numbers but allow repeated products/materials', async () => {
      const prNumber = `PR-${crypto.randomUUID().substring(0, 8)}`;

      // Create first PR
      await request(app)
        .post('/api/v1/purchases/requisitions')
        .set('x-actor-id', 'creator-user')
        .send({
          prNumber,
          departmentId: deptId,
          needDate: new Date().toISOString(),
          lines: [{ productId, uomId, requestedQuantity: 10 }]
        });

      // Try hard duplicate
      const hardDupRes = await request(app)
        .post('/api/v1/purchases/requisitions')
        .set('x-actor-id', 'creator-user')
        .send({
          prNumber, // Exact same number
          departmentId: deptId,
          needDate: new Date().toISOString(),
          lines: [{ productId, uomId, requestedQuantity: 5 }]
        });

      expect(hardDupRes.status).toBe(409);
      expect(hardDupRes.body.error.code).toBe('DUPLICATE_ERROR');

      // A different PR number for the same product is valid and should create
      // independently; product/material overlap is not a duplicate condition.
      const prNumber2 = `PR-${crypto.randomUUID().substring(0, 8)}`;
      const repeatedProductRes = await request(app)
        .post('/api/v1/purchases/requisitions')
        .set('x-actor-id', 'creator-user')
        .send({
          prNumber: prNumber2,
          departmentId: deptId, // Same dept
          needDate: new Date().toISOString(),
          lines: [{ productId, uomId, requestedQuantity: 5 }] // Same product
        });

      expect(repeatedProductRes.status).toBe(201);
    });
  });

  describe('Creator Cannot Approve', () => {
    it('should return 403 Forbidden when creator tries to self-approve PR', async () => {
      const prNumber = `PR-${crypto.randomUUID().substring(0, 8)}`;
      const createRes = await request(app)
        .post('/api/v1/purchases/requisitions')
        .set('x-actor-id', 'creator-user')
        .send({
          prNumber,
          departmentId: deptId,
          needDate: new Date().toISOString(),
          lines: [{ productId, uomId, requestedQuantity: 10 }]
        });
      const prId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/submit`)
        .set('x-actor-id', 'creator-user');

      // creator-user was never granted 'approve'/'self_approve' on PurchaseRequisition.
      const approveRes = await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/approve`)
        .set('x-actor-id', 'creator-user');

      expect(approveRes.status).toBe(403);
    });
  });

  describe('Invalid State Transition', () => {
    it('should return 422 Unprocessable Entity when submitting an APPROVED PR', async () => {
      const prNumber = `PR-${crypto.randomUUID().substring(0, 8)}`;
      const createRes = await request(app)
        .post('/api/v1/purchases/requisitions')
        .set('x-actor-id', 'creator-user')
        .send({
          prNumber,
          departmentId: deptId,
          needDate: new Date().toISOString(),
          lines: [{ productId, uomId, requestedQuantity: 10 }]
        });
      const prId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/submit`)
        .set('x-actor-id', 'creator-user');

      await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/approve`)
        .set('x-actor-id', 'approver-user');

      // Try to submit again
      const invalidSubmitRes = await request(app)
        .post(`/api/v1/purchases/requisitions/${prId}/submit`)
        .set('x-actor-id', 'creator-user');

      expect(invalidSubmitRes.status).toBe(422);
      expect(invalidSubmitRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });
});
