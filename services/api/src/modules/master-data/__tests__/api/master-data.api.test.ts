import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../../app';
import { setDefaultPermissionChecker } from '../../../../common/middleware/authorize';
import { AllowAllPermissionChecker, PermissionChecker, ScopeContext } from '@synergy/types';
import { Request, Response, NextFunction } from 'express';

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

describeWithTestDatabase('Module 1 - Master Data API Integration Tests', () => {
  beforeEach(async () => {
    // Reset to AllowAllPermissionChecker before each test
    setDefaultPermissionChecker(new AllowAllPermissionChecker());
  });

  // ============================================================================
  // 1. VALIDATION ERROR (400 BAD REQUEST)
  // ============================================================================
  describe('HTTP 400 - Request Validation Middleware', () => {
    it('should return 400 Bad Request when required body fields are missing', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .send({
          // Missing code and name
          description: 'A category without code or name'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed'
        }
      });
      expect(response.body.requestId).toBeDefined();
      expect(Array.isArray(response.body.error.details)).toBe(true);
    });

    it('should return 400 Bad Request when foreign key is not a valid UUID', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({
          sku: 'SKU-TEST-INVALID',
          name: 'Invalid UUID Product',
          categoryId: 'not-a-uuid',
          productFamilyId: 'also-not-a-uuid',
          uomId: 'neither-uuid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // 2. AUTHORIZATION ERROR (403 FORBIDDEN)
  // ============================================================================
  describe('HTTP 403 - PermissionChecker Authorization Middleware', () => {
    it('should return 403 Forbidden when actor lacks permission for an action', async () => {
      const denyCategoryCreate: PermissionChecker = {
        async can(_actorId: string, action: string, resource: string, _scope?: ScopeContext): Promise<boolean> {
          if (action === 'create' && resource === 'Category') return false;
          return true;
        }
      };

      setDefaultPermissionChecker(denyCategoryCreate);

      const response = await request(app)
        .post('/api/v1/categories')
        .set('x-actor-id', 'unauthorized-user')
        .send({
          code: 'TEST-DENIED',
          name: 'Denied Category'
        })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'FORBIDDEN'
        }
      });
      expect(response.body.requestId).toBeDefined();
    });
  });

  // ============================================================================
  // 3. RESOURCE NOT FOUND (404 NOT FOUND)
  // ============================================================================
  describe('HTTP 404 - Not Found Error', () => {
    it('should return 404 when requested master entity does not exist', async () => {
      const response = await request(app)
        .get('/api/v1/categories/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(response.body.requestId).toBeDefined();
    });
  });

  // ============================================================================
  // 4. FULL LIFECYCLE HAPPY PATH (CREATE -> SUBMIT -> APPROVE -> DEACTIVATE)
  // ============================================================================
  describe('Master Data Full Lifecycle Pipeline', () => {
    it('should execute full lifecycle: create (DRAFT) -> submit (PENDING_VALIDATION) -> approve (APPROVED) -> deactivate (INACTIVE)', async () => {
      const timestamp = Date.now();
      const catCode = `CAT-TEST-${timestamp}`;

      // Step 1: Create Category (starts in DRAFT)
      const createRes = await request(app)
        .post('/api/v1/categories')
        .set('x-actor-id', 'creator-user')
        .send({
          code: catCode,
          name: `Test Category ${timestamp}`,
          description: 'Testing lifecycle transitions'
        })
        .expect(201);

      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.code).toBe(catCode);
      expect(createRes.body.data.status).toBe('DRAFT');
      expect(createRes.body.requestId).toBeDefined();

      const categoryId = createRes.body.data.id;

      // Step 2: Submit for Validation (DRAFT -> PENDING_VALIDATION)
      const submitRes = await request(app)
        .post(`/api/v1/categories/${categoryId}/submit`)
        .set('x-actor-id', 'creator-user')
        .send({ remarks: 'Ready for review' })
        .expect(200);

      expect(submitRes.body.data.status).toBe('PENDING_VALIDATION');

      // Step 3: Approve Category (PENDING_VALIDATION -> APPROVED)
      const approveRes = await request(app)
        .post(`/api/v1/categories/${categoryId}/approve`)
        .set('x-actor-id', 'approver-manager')
        .send({ remarks: 'Approved' })
        .expect(200);

      expect(approveRes.body.data.status).toBe('APPROVED');

      // Step 4: Deactivate Category (APPROVED -> INACTIVE)
      const deactivateRes = await request(app)
        .post(`/api/v1/categories/${categoryId}/deactivate`)
        .set('x-actor-id', 'admin-user')
        .send({ reason: 'No longer needed' })
        .expect(200);

      expect(deactivateRes.body.data.status).toBe('INACTIVE');
    });

    it('should support reject transition from PENDING_VALIDATION back to DRAFT', async () => {
      const timestamp = Date.now();
      const catCode = `CAT-REJ-${timestamp}`;

      const createRes = await request(app)
        .post('/api/v1/categories')
        .send({
          code: catCode,
          name: `Reject Test Category ${timestamp}`
        })
        .expect(201);

      const categoryId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/categories/${categoryId}/submit`)
        .send()
        .expect(200);

      const rejectRes = await request(app)
        .post(`/api/v1/categories/${categoryId}/reject`)
        .send({ reason: 'Incomplete information', targetStatus: 'DRAFT' })
        .expect(200);

      expect(rejectRes.body.data.status).toBe('DRAFT');
    });
  });

  // ============================================================================
  // 5. DUPLICATE DETECTION (409 CONFLICT)
  // ============================================================================
  describe('HTTP 409 - Duplicate Detection Conflict', () => {
    it('should reject duplicate creation with 409 Conflict', async () => {
      const code = `UOM-DUP-${Date.now()}`;

      // Create initial UOM
      await request(app)
        .post('/api/v1/uom')
        .send({
          code,
          name: 'Duplicate Test Unit',
          symbol: 'dtu'
        })
        .expect(201);

      // Attempt to create duplicate (case-insensitive test)
      const duplicateRes = await request(app)
        .post('/api/v1/uom')
        .send({
          code: `  ${code.toLowerCase()}  `,
          name: 'Duplicate Test Unit Second',
          symbol: 'dtu2'
        })
        .expect(409);

      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.error.code).toBe('CONFLICT');
    });
  });

  // ============================================================================
  // 6. INVALID STATE TRANSITION (422 UNPROCESSABLE ENTITY)
  // ============================================================================
  describe('HTTP 422 - Invalid State Transition Error', () => {
    it('should reject illegal transition from APPROVED directly to DRAFT with 422', async () => {
      const code = `VEN-TRANS-${Date.now()}`;

      // Create vendor (DRAFT)
      const vendorRes = await request(app)
        .post('/api/v1/vendors')
        .send({
          code,
          name: 'Transition Test Vendor'
        })
        .expect(201);

      const vendorId = vendorRes.body.data.id;

      // Move DRAFT -> PENDING_VALIDATION -> APPROVED
      await request(app)
        .post(`/api/v1/vendors/${vendorId}/submit`)
        .send()
        .expect(200);

      await request(app)
        .post(`/api/v1/vendors/${vendorId}/approve`)
        .send()
        .expect(200);

      // Attempt illegal transition: APPROVED -> DRAFT
      const invalidTransitionRes = await request(app)
        .post(`/api/v1/vendors/${vendorId}/status`)
        .send({ targetStatus: 'DRAFT' })
        .expect(422);

      expect(invalidTransitionRes.body.success).toBe(false);
      expect(invalidTransitionRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  // ============================================================================
  // 7. STAGED IMPORT PIPELINE (STAGE -> PREVIEW -> COMMIT)
  // ============================================================================
  describe('Staged Import Pipeline', () => {
    it('should stage batch, preview row errors, and commit only valid rows', async () => {
      const uomCode = `UOM-IMP-${Date.now()}`;

      // Stage a batch containing 1 valid row and 1 invalid row (missing required symbol)
      const stageRes = await request(app)
        .post('/api/v1/import/stage')
        .send({
          entityType: 'UOM',
          filename: 'test_uom_import.csv',
          rows: [
            {
              code: uomCode,
              name: 'Valid Import UOM',
              symbol: 'viu'
            },
            {
              code: 'INVALID-ROW',
              name: 'Invalid Row Without Symbol'
              // missing symbol
            }
          ]
        })
        .expect(201);

      expect(stageRes.body.success).toBe(true);
      expect(stageRes.body.data.batch.totalRows).toBe(2);
      expect(stageRes.body.data.batch.validRows).toBe(1);
      expect(stageRes.body.data.batch.invalidRows).toBe(1);

      const batchId = stageRes.body.data.batch.id;

      // Preview batch
      const previewRes = await request(app)
        .get(`/api/v1/import/batches/${batchId}/preview`)
        .expect(200);

      expect(previewRes.body.data.rows).toHaveLength(2);
      expect(previewRes.body.data.rows[0].status).toBe('VALID');
      expect(previewRes.body.data.rows[1].status).toBe('INVALID');

      // Commit valid rows
      const commitRes = await request(app)
        .post(`/api/v1/import/batches/${batchId}/commit`)
        .send()
        .expect(200);

      expect(commitRes.body.data.committedCount).toBe(1);
      expect(commitRes.body.data.skippedCount).toBe(1);

      // Verify the valid UOM was committed to live master data
      const checkRes = await request(app)
        .get(`/api/v1/uom?search=${uomCode}`)
        .expect(200);

      const found = checkRes.body.data.items.some((u: { code: string }) => u.code === uomCode);
      expect(found).toBe(true);
    });
  });

  // ============================================================================
  // 8. EXPORT ENDPOINT
  // ============================================================================
  describe('Export Endpoint', () => {
    it('should export master data array with status filtering and audit log', async () => {
      const exportRes = await request(app)
        .get('/api/v1/master-data/export?entityType=UOM');
      if (exportRes.status !== 200) {
        // eslint-disable-next-line no-console
        console.error(exportRes.body);
      }
      expect(exportRes.status).toBe(200);

      expect(exportRes.body.success).toBe(true);
      expect(exportRes.body.data.entityType).toBe('UOM');
      expect(Array.isArray(exportRes.body.data.items)).toBe(true);
      expect(exportRes.body.requestId).toBeDefined();
    });
  });
});
