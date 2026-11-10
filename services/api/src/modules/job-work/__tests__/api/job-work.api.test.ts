import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
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

const describeWithTestDatabase = (name: string, fn: () => void) => {
  if (process.env.TEST_DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

describeWithTestDatabase('Job Work Module API Integration Tests', () => {
  let adminUserId: string;
  let vendorId: string;
  let productId: string;
  let materialId: string;
  let uomId: string;
  let locationId: string;

  beforeAll(async () => {
    const uom = await prisma.unitOfMeasure.create({
      data: { code: `UOM-${crypto.randomUUID().substring(0, 6)}`, name: 'Ton', symbol: 'TON' }
    });
    uomId = uom.id;

    const vendor = await prisma.vendor.create({
      data: { code: `VEN-JW-${crypto.randomUUID().substring(0, 6)}`, name: 'Outsource Specialist Corp', status: 'APPROVED' }
    });
    vendorId = vendor.id;

    const category = await prisma.category.create({
      data: { code: `CAT-JW-${crypto.randomUUID().substring(0, 6)}`, name: 'Outsource Cat' }
    });
    const family = await prisma.productFamily.create({
      data: { code: `FAM-JW-${crypto.randomUUID().substring(0, 6)}`, name: 'Outsource Family', categoryId: category.id }
    });

    const material = await prisma.material.create({
      data: { code: `MAT-RAW-${crypto.randomUUID().substring(0, 6)}`, name: 'Raw Material Ore', uomId, status: 'APPROVED', materialType: 'RAW_MATERIAL', specs: {} }
    });
    materialId = material.id;

    const product = await prisma.product.create({
      data: { sku: `PRD-OUT-${crypto.randomUUID().substring(0, 6)}`, name: 'Machined Parts Assembly', uomId, status: 'APPROVED', categoryId: category.id, productFamilyId: family.id }
    });
    productId = product.id;

    const factory = await prisma.factory.create({
      data: { code: `FAC-JW-${crypto.randomUUID().substring(0, 6)}`, name: 'Central Plant' }
    });

    const location = await prisma.warehouseLocation.create({
      data: { code: `LOC-JW-${crypto.randomUUID().substring(0, 6)}`, name: 'Main Depot', factoryId: factory.id, type: 'STORAGE' }
    });
    locationId = location.id;
    const adminRole = (await prisma.rbacRole.findUnique({ where: { name: 'admin' } })) ||
      (await prisma.rbacRole.create({ data: { name: 'admin', allLocations: true } }));

    const admin = await prisma.user.create({
      data: { email: `admin-${crypto.randomUUID()}@test.com`, name: 'Admin', password: 'password', role: 'admin' }
    });
    adminUserId = admin.id;
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

    await prisma.stockBalance.create({
      data: {
        itemKey: `MATERIAL:${materialId}`,
        materialId,
        uomId,
        locationId,
        onHandQuantity: 100,
        ownership: 'OWNED'
      }
    });
  });

  it('Step 1: Store manager issues 8 tons of raw material (Delivery Challan to Vendor)', async () => {
    const res = await request(app)
      .post('/api/v1/job-work/challans')
      .set('x-actor-id', adminUserId)
      .send({
        vendorId,
        dispatchLocationId: locationId,
        materialId,
        uomId,
        quantity: 8,
        vehicleNumber: 'KA-01-EXP-9999',
        transporterName: 'Synergy Logistics'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quantity).toBe(8);

    const custody = await request(app)
      .get('/api/v1/job-work/custody/balances')
      .set('x-actor-id', adminUserId)
      .query({ vendorId });

    expect(custody.status).toBe(200);
    const balance = custody.body.data.find((b: { vendorId: string; materialId: string }) => b.vendorId === vendorId && b.materialId === materialId);
    expect(balance).toBeDefined();
    expect(balance.currentBalance).toBe(8);
  });

  it('Step 2: Raises Job Work Order for 4 tons deposit deduction', async () => {
    const res = await request(app)
      .post('/api/v1/job-work/orders')
      .set('x-actor-id', adminUserId)
      .send({
        vendorId,
        productId,
        targetQuantity: 400,
        targetUomId: uomId,
        rawMaterialInputQty: 4,
        deliveryLocationId: locationId,
        natureOfProcessing: 'Precision Die Casting',
        lines: [
          {
            materialId,
            uomId,
            requiredQuantity: 4,
            allocatedQuantity: 4
          }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const orderId = res.body.data.id;

    const appRes = await request(app)
      .post(`/api/v1/job-work/orders/${orderId}/approve`)
      .set('x-actor-id', adminUserId)
      .send({ remarks: 'Order verified by Admin' });

    expect(appRes.status).toBe(200);
    expect(appRes.body.data.status).toBe('APPROVED');

    const custody = await request(app)
      .get('/api/v1/job-work/custody/balances')
      .set('x-actor-id', adminUserId)
      .query({ vendorId });

    const balance = custody.body.data.find((b: { vendorId: string; materialId: string }) => b.vendorId === vendorId && b.materialId === materialId);
    expect(balance.currentBalance).toBe(4);
  });

  it('Step 3: Receive return with shortage -> normal GRN and automatic debit note generated', async () => {
    const res = await request(app)
      .post('/api/v1/job-work/returns')
      .set('x-actor-id', adminUserId)
      .send({
        vendorId,
        locationId,
        productId,
        uomId,
        expectedQuantity: 400,
        receivedQuantity: 350,
        acceptedQuantity: 350,
        consumedRawMaterial: 4,
        generateDebitNoteForShortage: true,
        debitNoteReason: 'Received 350 vs expected 400. 50 units short.'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grn).toBeDefined();
    expect(res.body.data.debitNote).toBeDefined();
    expect(res.body.data.debitNote.debitNoteNumber).toMatch(/^DN-JW-/);
  });

  it('Step 4: View analytics summary', async () => {
    const res = await request(app)
      .get('/api/v1/job-work/analytics')
      .set('x-actor-id', adminUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.totalOrders).toBeGreaterThanOrEqual(1);
    expect(res.body.data.vendorPerformance).toBeInstanceOf(Array);
  });
});
