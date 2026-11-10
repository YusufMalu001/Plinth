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
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next()
}));

jest.setTimeout(300000);

// Real DbPermissionChecker is wired into material-issue.routes.ts (scoped RBAC), so tests must
// seed actual Role/Permission/UserRole rows. Test users use role 'employee' (not 'admin') so the
// DB-level admin bypass never masks the granted-permission checks under test.
const MATERIAL_ISSUE_PERMISSIONS: Array<{ action: string; resource: string }> = [
  { action: 'view', resource: 'MaterialIssue' },
  { action: 'request', resource: 'MaterialIssue' },
  { action: 'prepare', resource: 'MaterialIssue' },
  { action: 'verify', resource: 'MaterialIssue' },
  { action: 'issue', resource: 'MaterialIssue' },
  { action: 'acknowledge', resource: 'MaterialIssue' },
  { action: 'return', resource: 'MaterialIssue' },
  { action: 'replace', resource: 'MaterialIssue' }
];

async function grantMaterialIssueAccess(actorId: string, options: { allLocations?: boolean } = {}) {
  const role = await prisma.rbacRole.create({
    data: { name: `test-role-${actorId}-${crypto.randomUUID().substring(0, 8)}`, allLocations: options.allLocations ?? true }
  });
  for (const p of MATERIAL_ISSUE_PERMISSIONS) {
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

describeWithTestDatabase('Module 7 - Material Issue API Integration Tests', () => {
  let productId: string;
  let materialId: string;
  let uomId: string;
  let locationId: string;
  let bomVersionId: string;

  async function seedBalance(qty: number) {
    await prisma.stockBalance.create({
      data: { itemKey: `MATERIAL:${materialId}`, materialId, uomId, locationId, ownership: 'OWNED', onHandQuantity: qty, reservedQuantity: 0 }
    });
  }

  async function createReleasedPlan(quantity = 10) {
    const planNumber = `PP-${crypto.randomUUID().substring(0, 8)}`;
    return prisma.productionPlan.create({
      data: {
        planNumber,
        scheduleDate: new Date(),
        productId,
        bomVersionId,
        scheduleType: 'FIRM',
        quantity,
        status: 'APPROVED',
        batchIdentity: `BATCH-${planNumber}`,
        createdByActorId: 'clerk-user'
      }
    });
  }

  beforeEach(async () => {
    const uom = await prisma.unitOfMeasure.create({
      data: { code: `UOM-${crypto.randomUUID().substring(0, 8)}`, name: 'Kilograms', symbol: 'kg' }
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

    const material = await prisma.material.create({
      data: {
        code: `MAT-${crypto.randomUUID().substring(0, 8)}`,
        name: 'Test Material',
        materialType: 'RAW_MATERIAL',
        uomId,
        specs: {},
        status: 'APPROVED'
      }
    });
    materialId = material.id;

    const location = await prisma.warehouseLocation.create({
      data: { code: `WH-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Store', type: 'STORE', status: 'ACTIVE' }
    });
    locationId = location.id;

    await prisma.user.createMany({
      data: [
        { id: 'clerk-user', email: 'mi-clerk@test.com', name: 'Clerk', password: 'password', role: 'employee' },
        { id: 'supervisor-user', email: 'mi-supervisor@test.com', name: 'Supervisor', password: 'password', role: 'employee' },
        { id: 'outsider-user', email: 'mi-outsider@test.com', name: 'Outsider', password: 'password', role: 'employee' }
      ],
      skipDuplicates: true
    });
    await prisma.user.update({ where: { id: 'clerk-user' }, data: { assignedLocationId: locationId } });
    await prisma.user.update({ where: { id: 'supervisor-user' }, data: { assignedLocationId: locationId } });

    await grantMaterialIssueAccess('clerk-user');
    await grantMaterialIssueAccess('supervisor-user');

    const bomVersion = await prisma.bomVersion.create({
      data: {
        bomNumber: `BOM-${crypto.randomUUID().substring(0, 8)}`,
        productId,
        variantScopeKey: '',
        version: 1,
        status: 'APPROVED',
        effectiveDate: new Date('2026-01-01'),
        createdByActorId: 'clerk-user',
        approvedByActorId: 'supervisor-user',
        approvedAt: new Date()
      }
    });
    bomVersionId = bomVersion.id;

    await prisma.bomLine.create({
      data: {
        bomVersionId,
        lineType: 'COMPONENT',
        materialId,
        uomId,
        quantityMode: 'SCALED',
        quantity: 1,
        roundingRule: 'NONE'
      }
    });
  });

  describe('Batch-to-issue lifecycle', () => {
    it('walks request -> verify -> prepare -> hand-over -> acknowledge, posts exactly one traceable ledger deduction, and rejects duplicate acknowledgement', async () => {
      await seedBalance(100);
      const plan = await createReleasedPlan(10);

      const requestRes = await request(app)
        .post('/api/v1/material-issues')
        .set('x-actor-id', 'clerk-user')
        .send({ productionPlanId: plan.id, locationId });
      expect(requestRes.status).toBe(201);
      expect(requestRes.body.data.status).toBe('REQUESTED');
      expect(requestRes.body.data.bomVersionId).toBe(bomVersionId);
      const issueId = requestRes.body.data.id;
      expect(requestRes.body.data.lines).toHaveLength(1);
      expect(requestRes.body.data.lines[0].requiredQuantity).toBe(10); // SCALED 1/unit * 10 units

      const verifyRes = await request(app).post(`/api/v1/material-issues/${issueId}/verify`).set('x-actor-id', 'clerk-user').send({});
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.status).toBe('VERIFIED');

      const prepareRes = await request(app).post(`/api/v1/material-issues/${issueId}/prepare`).set('x-actor-id', 'clerk-user').send({});
      expect(prepareRes.status).toBe(200);
      expect(prepareRes.body.data.status).toBe('PREPARED');

      const handOverRes = await request(app).post(`/api/v1/material-issues/${issueId}/hand-over`).set('x-actor-id', 'supervisor-user').send({});
      expect(handOverRes.status).toBe(200);
      expect(handOverRes.body.data.status).toBe('HANDED_OVER');
      expect(handOverRes.body.data.challanNumber).toBeTruthy();

      const ackRes = await request(app).post(`/api/v1/material-issues/${issueId}/acknowledge`).set('x-actor-id', 'clerk-user').send({});
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe('POSTED');

      // Exactly one explainable stock deduction tied to schedule/batch/product.
      const ledgerEntries = await prisma.stockLedgerEntry.findMany({ where: { materialId, entryType: 'PRODUCTION_ISSUE' } });
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].quantity).toBe(10);
      expect(ledgerEntries[0].note).toContain(plan.id);

      const balance = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `MATERIAL:${materialId}`, uomId, locationId, ownership: 'OWNED' } }
      });
      expect(balance?.onHandQuantity).toBe(90);

      // Duplicate acknowledgement must be rejected, not double-post.
      const duplicateAck = await request(app).post(`/api/v1/material-issues/${issueId}/acknowledge`).set('x-actor-id', 'clerk-user').send({});
      expect(duplicateAck.status).toBe(422);
      const ledgerAfterDuplicate = await prisma.stockLedgerEntry.findMany({ where: { materialId, entryType: 'PRODUCTION_ISSUE' } });
      expect(ledgerAfterDuplicate).toHaveLength(1);
    });

    it('moves to SHORTAGE (not a silent partial issue) when stock is insufficient, and blocks prepare', async () => {
      await seedBalance(3); // required is 10
      const plan = await createReleasedPlan(10);

      const requestRes = await request(app)
        .post('/api/v1/material-issues')
        .set('x-actor-id', 'clerk-user')
        .send({ productionPlanId: plan.id, locationId });
      const issueId = requestRes.body.data.id;

      const verifyRes = await request(app).post(`/api/v1/material-issues/${issueId}/verify`).set('x-actor-id', 'clerk-user').send({});
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.status).toBe('SHORTAGE');
      expect(verifyRes.body.data.lines[0].shortageQuantity).toBe(7);

      const prepareRes = await request(app).post(`/api/v1/material-issues/${issueId}/prepare`).set('x-actor-id', 'clerk-user').send({});
      expect(prepareRes.status).toBe(422);
    });

    it('rejects requesting a material issue against a plan without an approved BOM/schedule', async () => {
      await seedBalance(100);
      const draftBomVersion = await prisma.bomVersion.create({
        data: {
          bomNumber: `BOM-${crypto.randomUUID().substring(0, 8)}`,
          productId,
          variantScopeKey: '',
          version: 2,
          status: 'DRAFT',
          createdByActorId: 'clerk-user'
        }
      });
      const planNumber = `PP-${crypto.randomUUID().substring(0, 8)}`;
      const plan = await prisma.productionPlan.create({
        data: {
          planNumber,
          scheduleDate: new Date(),
          productId,
          bomVersionId: draftBomVersion.id,
          scheduleType: 'FIRM',
          quantity: 10,
          status: 'PENDING_APPROVAL',
          createdByActorId: 'clerk-user'
        }
      });

      const requestRes = await request(app)
        .post('/api/v1/material-issues')
        .set('x-actor-id', 'clerk-user')
        .send({ productionPlanId: plan.id, locationId });
      expect(requestRes.status).toBe(422);
    });

    it('replays the same MaterialIssue on idempotency-key retry instead of double-requesting', async () => {
      await seedBalance(100);
      const plan = await createReleasedPlan(10);
      const idempotencyKey = crypto.randomUUID();

      const first = await request(app)
        .post('/api/v1/material-issues')
        .set('x-actor-id', 'clerk-user')
        .set('Idempotency-Key', idempotencyKey)
        .send({ productionPlanId: plan.id, locationId });
      const second = await request(app)
        .post('/api/v1/material-issues')
        .set('x-actor-id', 'clerk-user')
        .set('Idempotency-Key', idempotencyKey)
        .send({ productionPlanId: plan.id, locationId });

      expect(first.body.data.id).toBe(second.body.data.id);
      const count = await prisma.materialIssue.count({ where: { productionPlanId: plan.id } });
      expect(count).toBe(1);
    });
  });

  describe('Return / replacement', () => {
    it('accepts a return within the outstanding issued quantity and rejects one beyond it', async () => {
      await seedBalance(100);
      const plan = await createReleasedPlan(10);
      const requestRes = await request(app).post('/api/v1/material-issues').set('x-actor-id', 'clerk-user').send({ productionPlanId: plan.id, locationId });
      const issueId = requestRes.body.data.id;
      const lineId = requestRes.body.data.lines[0].id;
      await request(app).post(`/api/v1/material-issues/${issueId}/verify`).set('x-actor-id', 'clerk-user').send({});
      await request(app).post(`/api/v1/material-issues/${issueId}/prepare`).set('x-actor-id', 'clerk-user').send({});
      await request(app).post(`/api/v1/material-issues/${issueId}/hand-over`).set('x-actor-id', 'supervisor-user').send({});
      await request(app).post(`/api/v1/material-issues/${issueId}/acknowledge`).set('x-actor-id', 'clerk-user').send({});

      const tooMuch = await request(app)
        .post(`/api/v1/material-issues/${issueId}/returns`)
        .set('x-actor-id', 'supervisor-user')
        .send({ materialIssueLineId: lineId, returnType: 'UNUSED_RETURN', quantity: 11 });
      expect(tooMuch.status).toBe(400);

      const returnRes = await request(app)
        .post(`/api/v1/material-issues/${issueId}/returns`)
        .set('x-actor-id', 'supervisor-user')
        .send({ materialIssueLineId: lineId, returnType: 'UNUSED_RETURN', quantity: 4 });
      expect(returnRes.status).toBe(201);

      const ackReturn = await request(app)
        .post(`/api/v1/material-issues/${issueId}/returns/${returnRes.body.data.id}/acknowledge`)
        .set('x-actor-id', 'supervisor-user')
        .send({});
      expect(ackReturn.status).toBe(200);
      expect(ackReturn.body.data.status).toBe('POSTED');

      const balance = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `MATERIAL:${materialId}`, uomId, locationId, ownership: 'OWNED' } }
      });
      expect(balance?.onHandQuantity).toBe(94); // 100 - 10 issued + 4 returned
    });
  });

  describe('RBAC scope separation', () => {
    it('returns 403 when an outsider with no MaterialIssue permissions tries to request', async () => {
      await seedBalance(100);
      const plan = await createReleasedPlan(10);
      const res = await request(app).post('/api/v1/material-issues').set('x-actor-id', 'outsider-user').send({ productionPlanId: plan.id, locationId });
      expect(res.status).toBe(403);
    });

    it('returns 403 when an actor with no location grant verifies at a scoped location', async () => {
      await seedBalance(100);
      const plan = await createReleasedPlan(10);
      await grantMaterialIssueAccess('outsider-user', { allLocations: false });
      const requestRes = await request(app).post('/api/v1/material-issues').set('x-actor-id', 'clerk-user').send({ productionPlanId: plan.id, locationId });
      const issueId = requestRes.body.data.id;

      const res = await request(app).post(`/api/v1/material-issues/${issueId}/verify`).set('x-actor-id', 'outsider-user').send({});
      expect(res.status).toBe(403);
    });
  });

  describe('Concurrent depletion (no negative stock)', () => {
    it('allows exactly one of two concurrently-acknowledged issues to post when stock only covers one', async () => {
      await seedBalance(10);
      const planA = await createReleasedPlan(10);
      const planB = await createReleasedPlan(10);

      const reqA = await request(app).post('/api/v1/material-issues').set('x-actor-id', 'clerk-user').send({ productionPlanId: planA.id, locationId });
      const reqB = await request(app).post('/api/v1/material-issues').set('x-actor-id', 'clerk-user').send({ productionPlanId: planB.id, locationId });
      const idA = reqA.body.data.id;
      const idB = reqB.body.data.id;

      // verify() only reads the current balance snapshot (it never reserves), so both plans
      // legitimately see the same 10 available units and both pass through to HANDED_OVER -
      // exactly the real-world race this guards against (two clerks each check stock, both see
      // enough, only one can actually walk away with the goods). The real "no negative stock"
      // guard is StockLedgerRepository.postEntry()'s conditional decrement, exercised below by
      // acknowledging both concurrently.
      for (const id of [idA, idB]) {
        await request(app).post(`/api/v1/material-issues/${id}/verify`).set('x-actor-id', 'clerk-user').send({});
        await request(app).post(`/api/v1/material-issues/${id}/prepare`).set('x-actor-id', 'clerk-user').send({});
        await request(app).post(`/api/v1/material-issues/${id}/hand-over`).set('x-actor-id', 'supervisor-user').send({});
      }

      const [ackA, ackB] = await Promise.all([
        request(app).post(`/api/v1/material-issues/${idA}/acknowledge`).set('x-actor-id', 'clerk-user').send({}),
        request(app).post(`/api/v1/material-issues/${idB}/acknowledge`).set('x-actor-id', 'clerk-user').send({})
      ]);

      const statuses = [ackA.status, ackB.status].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = ackA.status === 200 ? ackA : ackB;
      expect(winner.body.data.status).toBe('POSTED');

      const balance = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey: `MATERIAL:${materialId}`, uomId, locationId, ownership: 'OWNED' } }
      });
      expect(balance?.onHandQuantity).toBe(0);
    });
  });
});
