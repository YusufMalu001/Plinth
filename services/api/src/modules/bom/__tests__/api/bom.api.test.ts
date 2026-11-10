import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
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

async function grantPermissions(actorId: string, permissions: Array<{ action: string; resource: string }>) {
  const role = await prisma.rbacRole.create({
    data: { name: `test-bom-role-${actorId}-${crypto.randomUUID().substring(0, 8)}`, allLocations: true }
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

const BOM_ALL_PERMISSIONS = [
  { action: 'view', resource: 'BomVersion' },
  { action: 'create', resource: 'BomVersion' },
  { action: 'update', resource: 'BomVersion' },
  { action: 'validate', resource: 'BomVersion' },
  { action: 'approve', resource: 'BomVersion' },
  { action: 'supersede', resource: 'BomVersion' },
  { action: 'simulate', resource: 'BomVersion' },
  { action: 'export', resource: 'BomVersion' }
];

const describeWithTestDatabase = (name: string, fn: () => void) => {
  if (process.env.TEST_DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

describeWithTestDatabase('BOM API Integration Tests', () => {
  let adminActorId: string;
  let testProductId: string;
  let testMaterialId: string;
  let testUomPcsId: string;
  let testUomKgId: string;

  beforeAll(async () => {
    adminActorId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: adminActorId,
        email: `bom-admin-${adminActorId.substring(0, 8)}@example.com`,
        name: 'BOM Admin',
        role: 'admin',
        password: 'dummy'
      }
    });
    await grantPermissions(adminActorId, BOM_ALL_PERMISSIONS);

    // Seed UOMs
    const uomPcs = await prisma.unitOfMeasure.create({
      data: {
        code: `PCS-${crypto.randomUUID().substring(0, 6)}`,
        name: 'Pieces',
        symbol: 'pcs',
        dimension: 'COUNT',
        status: 'ACTIVE'
      }
    });
    testUomPcsId = uomPcs.id;

    const uomKg = await prisma.unitOfMeasure.create({
      data: {
        code: `KG-${crypto.randomUUID().substring(0, 6)}`,
        name: 'Kilograms',
        symbol: 'kg',
        dimension: 'MASS',
        status: 'ACTIVE'
      }
    });
    testUomKgId = uomKg.id;

    // Seed Category
    const category = await prisma.category.create({
      data: {
        code: `CAT-${crypto.randomUUID().substring(0, 6)}`,
        name: 'Finished Goods',
        status: 'ACTIVE'
      }
    });

    // Seed Product Family
    const family = await prisma.productFamily.create({
      data: {
        code: `FAM-${crypto.randomUUID().substring(0, 6)}`,
        name: 'Beverages',
        categoryId: category.id,
        status: 'ACTIVE'
      }
    });

    // Seed Product
    const product = await prisma.product.create({
      data: {
        sku: `PROD-${crypto.randomUUID().substring(0, 6)}`,
        name: 'Synergy Energy Drink 250ml',
        productFamilyId: family.id,
        categoryId: category.id,
        uomId: testUomPcsId,
        status: 'ACTIVE'
      }
    });
    testProductId = product.id;

    // Seed Material
    const material = await prisma.material.create({
      data: {
        code: `MAT-${crypto.randomUUID().substring(0, 6)}`,
        name: 'Syrup Concentrate',
        materialType: 'RAW_MATERIAL',
        categoryId: category.id,
        uomId: testUomKgId,
        specs: {},
        status: 'ACTIVE'
      }
    });
    testMaterialId = material.id;
  });

  afterAll(async () => {
    // Cleanup BOM test records created during test
    if (testProductId) {
      const testBoms = await prisma.bomVersion.findMany({
        where: { productId: testProductId },
        select: { id: true }
      });
      const bomIds = testBoms.map((b) => b.id);
      if (bomIds.length > 0) {
        await prisma.bomSimulationRun.deleteMany({ where: { bomVersionId: { in: bomIds } } });
        await prisma.bomGoldenExample.deleteMany({ where: { bomVersionId: { in: bomIds } } });
        await prisma.bomLine.deleteMany({ where: { bomVersionId: { in: bomIds } } });
        await prisma.bomVersion.deleteMany({ where: { id: { in: bomIds } } });
      }
    }
  });

  it('runs complete lifecycle: draft -> lines -> golden example -> simulate -> validate -> approve -> calculate', async () => {
    // 1. Create DRAFT BOM
    const createRes = await request(app)
      .post('/api/v1/bom-versions')
      .set('x-actor-id', adminActorId)
      .send({
        productId: testProductId,
        note: 'Golden formula v1'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('DRAFT');
    expect(createRes.body.data.version).toBe(1);
    const bomVersionId = createRes.body.data.id;

    // 2. Update lines (add SCALED material component)
    const updateRes = await request(app)
      .patch(`/api/v1/bom-versions/${bomVersionId}`)
      .set('x-actor-id', adminActorId)
      .send({
        note: 'Formula v1 with components',
        lines: [
          {
            lineType: 'COMPONENT',
            materialId: testMaterialId,
            uomId: testUomKgId,
            quantityMode: 'SCALED',
            quantity: 0.25, // 0.25 kg per unit
            roundingRule: 'ROUND_UP',
            roundingPrecision: 3,
            sequence: 1
          }
        ]
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.lines).toHaveLength(1);
    const lineId = updateRes.body.data.lines[0].id;

    // 3. Add Golden Example Test Fixture
    const goldenRes = await request(app)
      .post(`/api/v1/bom-versions/${bomVersionId}/golden-examples`)
      .set('x-actor-id', adminActorId)
      .send({
        label: 'Batch 100 units test',
        inputQuantity: 100,
        inputUomId: testUomPcsId,
        expectedResults: [
          {
            bomLineId: lineId,
            expectedQuantity: 25.0, // 0.25 * 100
            uomId: testUomKgId
          }
        ],
        sourceReference: 'Formula Book Page 42'
      });

    expect(goldenRes.status).toBe(201);
    expect(goldenRes.body.data.label).toBe('Batch 100 units test');

    // 4. Run Simulation
    const simRes = await request(app)
      .post(`/api/v1/bom-versions/${bomVersionId}/simulate`)
      .set('x-actor-id', adminActorId)
      .send({
        requestedQuantity: 50,
        requestedUomId: testUomPcsId
      });

    expect(simRes.status).toBe(201);
    expect(simRes.body.data.requirements).toHaveLength(1);
    expect(simRes.body.data.requirements[0].requiredQuantity).toBe(12.5); // 0.25 * 50
    expect(simRes.body.data.simulation.isAuthoritative).toBe(false);

    // 5. Validate BOM
    const valRes = await request(app)
      .post(`/api/v1/bom-versions/${bomVersionId}/validate`)
      .set('x-actor-id', adminActorId)
      .send({});

    expect(valRes.status).toBe(200);
    expect(valRes.body.data.status).toBe('VALIDATION_PENDING');

    // 6. Approve BOM
    const approveRes = await request(app)
      .post(`/api/v1/bom-versions/${bomVersionId}/approve`)
      .set('x-actor-id', adminActorId)
      .send({});

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');
    expect(approveRes.body.data.approvedByActorId).toBe(adminActorId);

    // 7. Calculate authoritative requirements via /bom-versions/calculate
    const calcRes = await request(app)
      .get('/api/v1/bom-versions/calculate')
      .set('x-actor-id', adminActorId)
      .query({
        productId: testProductId,
        quantity: 200,
        uomId: testUomPcsId
      });

    expect(calcRes.status).toBe(200);
    expect(calcRes.body.data.requirements[0].requiredQuantity).toBe(50.0); // 0.25 * 200

    // 8. List BOM versions
    const listRes = await request(app)
      .get('/api/v1/bom-versions')
      .set('x-actor-id', adminActorId)
      .query({ productId: testProductId });

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data.total).toBeGreaterThanOrEqual(1);

    // 9. Get Version History / Audit logs
    const historyRes = await request(app)
      .get(`/api/v1/bom-versions/${bomVersionId}/history`)
      .set('x-actor-id', adminActorId);

    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body.data)).toBe(true);
  });
});
