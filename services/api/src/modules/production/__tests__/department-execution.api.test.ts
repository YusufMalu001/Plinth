import request from 'supertest';
import express from 'express';
import { DepartmentExecutionService } from '../services/department-execution.service';
import { DepartmentExecutionController } from '../controllers/department-execution.controller';
import {
  departmentQueueQuerySchema,
  proposeHandoverSchema,
  decideHandoverSchema,
  managerialOverrideSchema
} from '@synergy/validation';
import { validate } from '../../../common/middleware/validation';

// Mock auth middleware
jest.mock('../../../common/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'system',
      email: 'user@test.com',
      role: 'admin',
      assignedDepartmentId: 'dept-laser'
    };
    next();
  }
}));

describe('Module 8 API & Integration Tests', () => {
  let app: express.Application;
  let mockService: Partial<DepartmentExecutionService>;

  beforeEach(() => {
    mockService = {
      getDepartmentQueue: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
      initializeBatch: jest.fn().mockResolvedValue({ id: 'batch-1', batchNumber: 'BATCH-2026-0001' }),
      getBatchById: jest.fn().mockResolvedValue({ id: 'batch-1', batchNumber: 'BATCH-2026-0001' }),
      getBatchHistory: jest.fn().mockResolvedValue({ batch: { id: 'batch-1' }, timeline: [] }),
      receiveBatch: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'RECEIVED' }),
      assignWorker: jest.fn().mockResolvedValue({ batch: { id: 'batch-1', status: 'ASSIGNED' } }),
      startBatch: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'IN_PROGRESS' }),
      pauseBatch: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'PAUSED' }),
      resumeBatch: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'IN_PROGRESS' }),
      recordProgress: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'IN_PROGRESS' }),
      recordException: jest.fn().mockResolvedValue({ id: 'exc-1', type: 'SCRAP' }),
      completeBatch: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'COMPLETE' }),
      proposeHandover: jest.fn().mockResolvedValue({ id: 'handover-1', status: 'PROPOSED' }),
      decideHandover: jest.fn().mockResolvedValue({ handover: { id: 'handover-1', status: 'ACCEPTED' }, newBatch: { id: 'batch-2' } }),
      managerialOverride: jest.fn().mockResolvedValue({ id: 'batch-1', status: 'IN_PROGRESS' })
    };

    const deptExecutionController = new DepartmentExecutionController(mockService as any);

    app = express();
    app.use(express.json());
    // Mock user injection
    app.use((req: any, _res: any, next: any) => {
      req.user = {
        id: 'system',
        email: 'user@test.com',
        role: 'admin',
        assignedDepartmentId: 'dept-laser'
      };
      next();
    });

    const testRouter = express.Router();

    testRouter.get(
      '/production/departments/:departmentId/queue',
      validate(departmentQueueQuerySchema),
      deptExecutionController.getDepartmentQueue
    );
    testRouter.post(
      '/production/batches/:id/handovers',
      validate(proposeHandoverSchema),
      deptExecutionController.proposeHandover
    );
    testRouter.post(
      '/production/handovers/:handoverId/decide',
      validate(decideHandoverSchema),
      deptExecutionController.decideHandover
    );
    testRouter.post(
      '/production/batches/:id/override',
      validate(managerialOverrideSchema),
      deptExecutionController.managerialOverride
    );

    app.use('/api/v1', testRouter);
    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      const status = err.statusCode || 500;
      res.status(status).json({ success: false, error: { message: err.message, code: err.code || 'ERROR' } });
    });
  });

  it('GET /api/v1/production/departments/:departmentId/queue returns 200 with queue items', async () => {
    const res = await request(app).get('/api/v1/production/departments/dept-laser/queue');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/production/batches/:id/handovers validates payload schema and rejects invalid quantity (400)', async () => {
    const res = await request(app)
      .post('/api/v1/production/batches/batch-1/handovers')
      .send({
        quantity: -5, // Invalid negative quantity
        incomingDepartmentId: 'not-a-uuid',
        idempotencyKey: 'short'
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/production/handovers/:handoverId/decide rejects refusal without refusalReason (400)', async () => {
    const res = await request(app)
      .post('/api/v1/production/handovers/handover-1/decide')
      .send({
        status: 'REFUSED'
        // Missing required refusalReason
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/production/batches/:id/override maps managerial override successfully', async () => {
    const res = await request(app)
      .post('/api/v1/production/batches/batch-1/override')
      .send({
        action: 'OVERRIDE_STATUS',
        targetStatus: 'IN_PROGRESS',
        reason: 'Authorized managerial restart by Plant Manager'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
