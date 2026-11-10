import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../../app';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../../database';
import crypto from 'crypto';
import { PoStatus } from '@prisma/client';

jest.mock('../../../../common/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: (req.headers['x-actor-id'] as string) || 'dev-finance-user',
      email: 'test@example.com',
      role: (req.headers['x-actor-role'] as string) || 'admin'
    };
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: (req.headers['x-actor-id'] as string) || 'dev-finance-user',
      email: 'test@example.com',
      role: (req.headers['x-actor-role'] as string) || 'admin'
    };
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

const FINANCE_PERMISSIONS: Array<{ action: string; resource: string }> = [
  { action: 'read', resource: 'FinanceIntegration' },
  { action: 'create', resource: 'FinanceMapping' },
  { action: 'approve', resource: 'FinanceMapping' },
  { action: 'queue', resource: 'FinanceIntegration' },
  { action: 'export', resource: 'FinanceIntegration' },
  { action: 'retry', resource: 'FinanceIntegration' },
  { action: 'acknowledge', resource: 'FinanceIntegration' },
  { action: 'reconcile', resource: 'FinanceIntegration' }
];

async function grantFinanceAccess(actorId: string, actions?: string[]) {
  const role = await prisma.rbacRole.create({
    data: {
      name: `finance-role-${actorId}-${crypto.randomUUID().substring(0, 8)}`,
      allLocations: true
    }
  });

  const targetPermissions = actions
    ? FINANCE_PERMISSIONS.filter((p) => actions.includes(p.action))
    : FINANCE_PERMISSIONS;

  for (const p of targetPermissions) {
    const key = `${p.action}:${p.resource}`;
    const permission = await prisma.permission.upsert({
      where: { action_resource: { action: p.action, resource: p.resource } },
      update: { key },
      create: { ...p, key }
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id }
    });
  }

  await prisma.userRole.create({
    data: { userId: actorId, roleId: role.id, organizationId: null }
  });
}

const describeWithTestDatabase = (name: string, fn: () => void) => {
  if (process.env.TEST_DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};
const isDbAvailable = Boolean(process.env.TEST_DATABASE_URL);

describeWithTestDatabase('Module 18 - Finance / Tally Integration API Tests', () => {
  let vendorId: string;
  let poId: string;
  let poNumber: string;
  let adminActorId: string;
  let creatorActorId: string;
  let unauthActorId: string;

  beforeEach(async () => {
    if (!isDbAvailable) return;
    adminActorId = `finance-admin-${crypto.randomUUID().substring(0, 8)}`;
    creatorActorId = `finance-creator-${crypto.randomUUID().substring(0, 8)}`;
    unauthActorId = `finance-unauth-${crypto.randomUUID().substring(0, 8)}`;

    await prisma.user.createMany({
      data: [
        { id: adminActorId, email: `${adminActorId}@test.com`, name: 'Finance Admin', password: 'password', role: 'admin' },
        { id: creatorActorId, email: `${creatorActorId}@test.com`, name: 'Finance Creator', password: 'password', role: 'employee' },
        { id: unauthActorId, email: `${unauthActorId}@test.com`, name: 'Finance Unauth', password: 'password', role: 'employee' }
      ],
      skipDuplicates: true
    });

    await grantFinanceAccess(adminActorId);
    await grantFinanceAccess(creatorActorId, ['create', 'read', 'queue']);

    const vendor = await prisma.vendor.create({
      data: {
        code: `VEN-${crypto.randomUUID().substring(0, 8)}`,
        name: 'Tally Test Vendor'
      }
    });
    vendorId = vendor.id;

    poNumber = `PO-TEST-${crypto.randomUUID().substring(0, 8)}`;
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        vendorId,
        status: PoStatus.APPROVED,
        currency: 'INR',
        subtotal: 10000.0,
        taxAmount: 1800.0,
        totalAmount: 11800.0
      }
    });
    poId = po.id;
  });

  describe('Integration Readiness & Eligibility Endpoints', () => {
    it('returns readiness status showing PURCHASE_ORDER as ACTIVE and others as NOT_YET_SUPPORTED', async () => {
      if (!isDbAvailable) return;
      const res = await request(app)
        .get('/api/v1/finance/readiness')
        .set('x-actor-id', adminActorId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const poStatus = res.body.data.find((r: any) => r.sourceType === 'PURCHASE_ORDER');
      expect(poStatus.status).toBe('ACTIVE');

      const nonPo = res.body.data.filter((r: any) => r.sourceType !== 'PURCHASE_ORDER');
      expect(nonPo.every((r: any) => r.status === 'NOT_YET_SUPPORTED')).toBe(true);
    });

    it('returns NOT_YET_SUPPORTED on eligibility endpoint for non-PO source types', async () => {
      if (!isDbAvailable) return;
      const res = await request(app)
        .get('/api/v1/finance/eligibility?sourceType=SALES_INVOICE')
        .set('x-actor-id', adminActorId);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('NOT_YET_SUPPORTED');
      expect(res.body.data.eligibleCount).toBe(0);
    });

    it('returns eligible PURCHASE_ORDER items on eligibility endpoint', async () => {
      if (!isDbAvailable) return;
      const res = await request(app)
        .get('/api/v1/finance/eligibility?sourceType=PURCHASE_ORDER')
        .set('x-actor-id', adminActorId);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUPPORTED');
      expect(res.body.data.eligibleCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RBAC & Permission Enforcement', () => {
    it('returns 403 Forbidden when unauthorized user tries to export', async () => {
      if (!isDbAvailable) return;
      const res = await request(app)
        .post('/api/v1/finance/export')
        .set('x-actor-id', unauthActorId)
        .send({ jobId: crypto.randomUUID() });

      expect(res.status).toBe(403);
    });

    it('returns 403 Forbidden when unauthorized user tries to approve mapping', async () => {
      if (!isDbAvailable) return;
      const res = await request(app)
        .post(`/api/v1/finance/mappings/${crypto.randomUUID()}/approve`)
        .set('x-actor-id', unauthActorId);

      expect(res.status).toBe(403);
    });
  });

  describe('Full End-to-End PURCHASE_ORDER Export & Reconciliation Flow', () => {
    it('executes queue -> export -> manual acknowledge -> internal reconcile without error', async () => {
      if (!isDbAvailable) return;
      // 1. Queue the Purchase Order
      const queueRes = await request(app)
        .post('/api/v1/finance/queue')
        .set('x-actor-id', adminActorId)
        .send({
          sourceType: 'PURCHASE_ORDER',
          sourceIds: [poId]
        });

      expect(queueRes.status).toBe(201);
      expect(queueRes.body.data.status).toBe('QUEUED');
      const jobId = queueRes.body.data.id;
      const itemId = queueRes.body.data.items[0].id;

      // 2. Duplicate Queue Prevention: Trying to queue the same PO again returns 409
      const dupQueueRes = await request(app)
        .post('/api/v1/finance/queue')
        .set('x-actor-id', adminActorId)
        .send({
          sourceType: 'PURCHASE_ORDER',
          sourceIds: [poId]
        });

      expect(dupQueueRes.status).toBe(409);

      // 3. Trigger Batch Export
      const exportRes = await request(app)
        .post('/api/v1/finance/export')
        .set('x-actor-id', adminActorId)
        .send({ jobId });

      expect(exportRes.status).toBe(200);
      expect(exportRes.body.data.status).toBe('COMPLETED');
      expect(exportRes.body.data.batchFileRef).toBeDefined();

      // 4. Check Item Status is SENT (not yet ACKNOWLEDGED)
      const itemGetRes = await request(app)
        .get(`/api/v1/finance/items/${itemId}`)
        .set('x-actor-id', adminActorId);

      expect(itemGetRes.status).toBe(200);
      expect(itemGetRes.body.data.status).toBe('SENT');

      // 5. Premature Reconciliation returns 422
      const prematureReconRes = await request(app)
        .post(`/api/v1/finance/items/${itemId}/reconcile`)
        .set('x-actor-id', adminActorId)
        .send({ resolutionNotes: 'Trying to reconcile before acknowledgement' });

      expect(prematureReconRes.status).toBe(422);

      // 6. Manual Finance Acknowledgement
      const ackRes = await request(app)
        .post(`/api/v1/finance/items/${itemId}/acknowledge`)
        .set('x-actor-id', adminActorId)
        .send({
          externalReference: 'TALLY-VCH-2026-001',
          notes: 'Manually verified in Tally ERP 9'
        });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');

      // 7. Internal Consistency Reconciliation
      const reconRes = await request(app)
        .post(`/api/v1/finance/items/${itemId}/reconcile`)
        .set('x-actor-id', adminActorId)
        .send({ resolutionNotes: 'Internal self-consistency check passed' });

      expect(reconRes.status).toBe(200);
      expect(reconRes.body.data.item.status).toBe('RECONCILED');
      expect(reconRes.body.data.reconciliationRecord.status).toBe('INTERNALLY_CONSISTENT');
      expect(reconRes.body.data.reconciliationRecord.externalAmount).toBeNull();
    });
  });
});
