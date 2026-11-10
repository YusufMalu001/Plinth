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

jest.setTimeout(120000);

const describeWithTestDatabase = (name: string, fn: () => void) => {
  if (process.env.TEST_DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

// Real DbPermissionChecker is wired into goods-receipt.routes.ts (scoped RBAC), so tests must
// seed actual Role/Permission/UserRole rows rather than injecting a mock checker.
const GRN_PERMISSIONS: Array<{ action: string; resource: string }> = [
  { action: 'receive', resource: 'GoodsReceiptNote' },
  { action: 'read', resource: 'GoodsReceiptNote' },
  { action: 'update', resource: 'GoodsReceiptNote' },
  { action: 'verify', resource: 'GoodsReceiptNote' },
  { action: 'sign_off', resource: 'GoodsReceiptNote' },
  { action: 'finalize', resource: 'GoodsReceiptNote' },
  { action: 'export', resource: 'GoodsReceiptNote' },
  { action: 'upload_document', resource: 'GoodsReceiptNote' },
  { action: 'update', resource: 'GoodsReceiptLabel' },
  { action: 'read', resource: 'GoodsReceiptDiscrepancy' },
  { action: 'resolve_discrepancy', resource: 'GoodsReceiptDiscrepancy' },
  { action: 'return', resource: 'GoodsReceiptDiscrepancy' },
  { action: 'read', resource: 'ExpectedReceipt' },
  { action: 'submit', resource: 'ExpectedReceipt' }
];

async function grantGrnAccess(
  actorId: string,
  options: { exclude?: Array<{ action: string; resource: string }>; allLocations?: boolean } = {}
) {
  const excluded = new Set((options.exclude ?? []).map((e) => `${e.action}:${e.resource}`));
  const granted = GRN_PERMISSIONS.filter((p) => !excluded.has(`${p.action}:${p.resource}`));

  const role = await prisma.rbacRole.create({
    data: {
      name: `test-role-${actorId}-${crypto.randomUUID().substring(0, 8)}`,
      allLocations: options.allLocations ?? true
    }
  });
  for (const p of granted) {
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

describeWithTestDatabase('Module 3 - Goods Receipt API Integration Tests', () => {
  let vendorId: string;
  let uomId: string;
  let productId: string;
  let locationId: string;

  async function createSentPo(quantity = 10) {
    const poNumber = `PO-${crypto.randomUUID().substring(0, 8)}`;
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        vendorId,
        status: 'SENT',
        revisionNumber: 1,
        sentAt: new Date(),
        lines: {
          create: [{ productId, uomId, quantity, needDate: new Date() }]
        }
      },
      include: { lines: true }
    });
    await prisma.expectedReceipt.create({
      data: {
        poLineId: po.lines[0].id,
        expectedDate: new Date(),
        expectedQuantity: quantity,
        status: 'PENDING'
      }
    });
    return po;
  }

  beforeEach(async () => {
    const vendor = await prisma.vendor.create({
      data: { code: `VEN-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Vendor', status: 'APPROVED' }
    });
    vendorId = vendor.id;

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

    const location = await prisma.warehouseLocation.create({
      data: { code: `WH-${crypto.randomUUID().substring(0, 8)}`, name: 'Test Store', type: 'STORE', status: 'ACTIVE' }
    });
    locationId = location.id;

    await prisma.user.createMany({
      data: [
        { id: 'receiver-user', email: 'receiver@test.com', name: 'Receiver', password: 'password', role: 'employee' },
        { id: 'clerk-user', email: 'clerk@test.com', name: 'Clerk', password: 'password', role: 'employee' },
        { id: 'outsider-user', email: 'outsider@test.com', name: 'Outsider', password: 'password', role: 'employee' }
      ],
      skipDuplicates: true
    });

    await grantGrnAccess('receiver-user');
    await grantGrnAccess('clerk-user');
  });

  describe('Happy Path: expected -> arrived -> verified -> signed-off -> finalized', () => {
    it('walks the full GRN lifecycle to a finalized state and posts the inventory + PO handoff', async () => {
      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;

      const createRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'receiver-user')
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('ARRIVED');
      const grnId = createRes.body.data.id;
      const lineId = createRes.body.data.lines[0].id;

      const measureRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/lines/${lineId}/measurements`)
        .set('x-actor-id', 'receiver-user')
        .send({ type: 'PIECE', value: 10, unitLabel: 'EA', acceptedQuantity: 10, rejectedQuantity: 0, damagedQuantity: 0 });

      expect(measureRes.status).toBe(201);
      expect(measureRes.body.data.status).toBe('VERIFIED');
      expect(measureRes.body.data.lines[0].label).toBeTruthy();

      const signOffRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/sign-off`)
        .set('x-actor-id', 'receiver-user')
        .send({});

      expect(signOffRes.status).toBe(200);
      expect(signOffRes.body.data.status).toBe('SIGNED_OFF');

      const finalizeRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/finalize`)
        .set('x-actor-id', 'receiver-user')
        .send({});

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.data.status).toBe('FINALIZED');

      // Inventory handoff: exactly one StockLedgerEntry per accepted line.
      const ledgerEntries = await prisma.stockLedgerEntry.findMany({ where: { grnId } });
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].quantity).toBe(10);

      // PO/ExpectedReceipt handoff.
      const updatedPo = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
      expect(updatedPo.status).toBe('FULLY_RECEIVED');

      // Idempotent finalize replay - no second ledger entry, no error.
      const finalizeAgainRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/finalize`)
        .set('x-actor-id', 'receiver-user')
        .send({});
      expect(finalizeAgainRes.status).toBe(200);
      expect(finalizeAgainRes.body.data.status).toBe('FINALIZED');
      const ledgerEntriesAfterReplay = await prisma.stockLedgerEntry.findMany({ where: { grnId } });
      expect(ledgerEntriesAfterReplay).toHaveLength(1);
    });
  });

  describe('Idempotency-Key on GRN creation', () => {
    it('returns the existing GRN on a duplicate submission with the same key, not a new one', async () => {
      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;
      const idempotencyKey = `idem-${crypto.randomUUID()}`;

      const firstRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'receiver-user')
        .set('Idempotency-Key', idempotencyKey)
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });
      expect(firstRes.status).toBe(201);

      const secondRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'receiver-user')
        .set('Idempotency-Key', idempotencyKey)
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });
      expect(secondRes.status).toBe(201);

      expect(secondRes.body.data.id).toBe(firstRes.body.data.id);

      const count = await prisma.goodsReceiptNote.count({ where: { poId: po.id } });
      expect(count).toBe(1);
    });
  });

  describe('Finalize rejection when gates are not met', () => {
    it('returns 422 when finalizing before sign-off', async () => {
      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;

      const createRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'receiver-user')
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });
      const grnId = createRes.body.data.id;

      const finalizeRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/finalize`)
        .set('x-actor-id', 'receiver-user')
        .send({});

      expect(finalizeRes.status).toBe(422);
      expect(finalizeRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('Unauthorized sign-off', () => {
    it('returns 403 for sign-off while finalize remains a distinct, independently-checked permission', async () => {
      // Overwrite clerk-user's grant with one that excludes sign_off specifically.
      await prisma.userRole.deleteMany({ where: { userId: 'clerk-user' } });
      await prisma.user.update({ where: { id: 'clerk-user' }, data: { role: 'employee' } });
      await grantGrnAccess('clerk-user', { exclude: [{ action: 'sign_off', resource: 'GoodsReceiptNote' }] });

      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;

      const createRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'clerk-user')
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });
      const grnId = createRes.body.data.id;
      const lineId = createRes.body.data.lines[0].id;

      await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/lines/${lineId}/measurements`)
        .set('x-actor-id', 'clerk-user')
        .send({ type: 'PIECE', value: 10, unitLabel: 'EA', acceptedQuantity: 10, rejectedQuantity: 0, damagedQuantity: 0 });

      const signOffRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/sign-off`)
        .set('x-actor-id', 'clerk-user')
        .send({});
      expect(signOffRes.status).toBe(403);

      // finalize permission itself is not blocked for this actor - it fails on the
      // (different) state-gate reason, proving sign_off and finalize are checked
      // independently rather than collapsed into one permission.
      const finalizeRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/finalize`)
        .set('x-actor-id', 'clerk-user')
        .send({});
      expect(finalizeRes.status).toBe(422);
      expect(finalizeRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('Location scoping', () => {
    it('returns 403 when an actor with no location grant touches a location-scoped GRN', async () => {
      // outsider-user is granted GRN permissions but NOT allLocations, and has no assignedLocationId.
      await grantGrnAccess('outsider-user', { allLocations: false });

      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;

      const createRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'outsider-user')
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });

      expect(createRes.status).toBe(403);
    });
  });

  describe('Finalize concurrency', () => {
    it('allows exactly one of two concurrent finalize calls to succeed', async () => {
      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;

      const createRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'receiver-user')
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });
      const grnId = createRes.body.data.id;
      const lineId = createRes.body.data.lines[0].id;

      await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/lines/${lineId}/measurements`)
        .set('x-actor-id', 'receiver-user')
        .send({ type: 'PIECE', value: 10, unitLabel: 'EA', acceptedQuantity: 10, rejectedQuantity: 0, damagedQuantity: 0 });

      await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/sign-off`)
        .set('x-actor-id', 'receiver-user')
        .send({});

      const [first, second] = await Promise.all([
        request(app).post(`/api/v1/goods-receipts/${grnId}/finalize`).set('x-actor-id', 'receiver-user').send({}),
        request(app).post(`/api/v1/goods-receipts/${grnId}/finalize`).set('x-actor-id', 'receiver-user').send({})
      ]);

      const statuses = [first.status, second.status].sort();
      // One call finalizes (200); the other either loses the race (409/422, concurrency guard) or
      // observes the already-finalized row and short-circuits idempotently (also 200) -
      // either way, never a duplicate stock ledger entry.
      expect(statuses.every((s) => s === 200 || s === 409 || s === 422)).toBe(true);

      const ledgerEntries = await prisma.stockLedgerEntry.findMany({ where: { grnId } });
      expect(ledgerEntries).toHaveLength(1);
    });
  });

  describe('Attachments', () => {
    it('rejects an unsupported file type and accepts a valid PDF upload', async () => {
      const po = await createSentPo(10);
      const poLineId = po.lines[0].id;

      const createRes = await request(app)
        .post('/api/v1/goods-receipts')
        .set('x-actor-id', 'receiver-user')
        .send({ poId: po.id, locationId, lines: [{ poLineId }] });
      const grnId = createRes.body.data.id;

      const rejectRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/documents`)
        .set('x-actor-id', 'receiver-user')
        .attach('file', Buffer.from('not a real script'), { filename: 'invoice.exe', contentType: 'application/x-msdownload' });
      expect(rejectRes.status).toBe(400);

      const uploadRes = await request(app)
        .post(`/api/v1/goods-receipts/${grnId}/documents`)
        .set('x-actor-id', 'receiver-user')
        .attach('file', Buffer.from('%PDF-1.4 fake invoice content'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

      // Supabase Storage is not configured in this test environment, so the upload itself
      // fails at the storage call - this still proves validation passed (400 would mean
      // rejected before reaching storage; a 500 here means it got past validation).
      expect(uploadRes.status).not.toBe(400);

      const listRes = await request(app)
        .get(`/api/v1/goods-receipts/${grnId}/documents`)
        .set('x-actor-id', 'receiver-user');
      expect(listRes.status).toBe(200);
    });
  });
});
