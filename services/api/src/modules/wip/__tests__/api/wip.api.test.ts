import request from 'supertest';
import express from 'express';
import { WipService } from '../../services/wip.service';
import { WipController } from '../../controllers/wip.controller';
import { validate } from '../../../../common/middleware/validation';
import {
  wipOverviewQuerySchema,
  wipBatchQuerySchema,
  wipDepartmentQueueQuerySchema,
  wipTimingQuerySchema,
  wipBatchParamSchema,
  runReconciliationSchema,
  wipExceptionQuerySchema,
  wipExceptionParamSchema,
  investigateExceptionSchema,
  resolveExceptionSchema,
  dismissExceptionSchema
} from '@synergy/validation';

describe('Module 9 WIP & Batch Tracking API Tests', () => {
  let app: express.Application;
  let mockService: Partial<WipService>;

  beforeEach(() => {
    mockService = {
      getWipOverview: jest.fn().mockResolvedValue({
        totalActiveBatches: 5,
        totalWipQuantity: 250,
        departmentBreakdown: [],
        statusBreakdown: { IN_PROGRESS: 5 },
        openExceptionsCount: 0
      }),
      listWipBatches: jest.fn().mockResolvedValue({
        items: [{ id: 'b-1', batchNumber: 'BATCH-001', status: 'IN_PROGRESS' }],
        total: 1,
        page: 1,
        limit: 20
      }),
      getBatchWipDetail: jest.fn().mockResolvedValue({
        batch: { id: 'b-1', batchNumber: 'BATCH-001' },
        timings: { queueDurationSeconds: 100, activeExecutionDurationSeconds: 200 },
        assignedWorkers: [],
        progressEvents: [],
        exceptionRecords: [],
        sourceHandover: null,
        outgoingHandovers: [],
        reworkCount: 0
      }),
      getBatchGenealogy: jest.fn().mockResolvedValue({
        rootBatchId: 'b-1',
        currentBatchId: 'b-1',
        stages: [],
        totalStages: 1,
        totalLeadTimeSeconds: 300,
        isComplete: false
      }),
      getDepartmentQueue: jest.fn().mockResolvedValue({
        items: [{ batchId: 'b-1', batchNumber: 'BATCH-001' }],
        total: 1,
        page: 1,
        limit: 20
      }),
      getTimingMetrics: jest.fn().mockResolvedValue({
        items: [{ batchId: 'b-1', totalStageDurationSeconds: 300 }],
        total: 1,
        page: 1,
        limit: 20
      }),
      runReconciliationCheck: jest.fn().mockResolvedValue({
        checkedBatchesCount: 10,
        anomaliesDetectedCount: 0,
        exceptionsCreatedCount: 0,
        exceptions: [],
        timestamp: new Date().toISOString()
      }),
      listExceptions: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20
      }),
      getExceptionById: jest.fn().mockResolvedValue({
        id: 'exc-1',
        batchId: 'b-1',
        exceptionType: 'CONSERVATION_MISMATCH',
        status: 'OPEN'
      }),
      investigateException: jest.fn().mockResolvedValue({
        id: 'exc-1',
        status: 'INVESTIGATING',
        investigationNotes: 'Investigating issue'
      }),
      resolveException: jest.fn().mockResolvedValue({
        id: 'exc-1',
        status: 'RESOLVED',
        resolutionNotes: 'Resolved scrap log'
      }),
      dismissException: jest.fn().mockResolvedValue({
        id: 'exc-1',
        status: 'DISMISSED',
        resolutionNotes: 'Dismissed non-issue'
      })
    };

    const controller = new WipController(mockService as any);

    app = express();
    app.use(express.json());

    // Inject mock user
    app.use((req: any, _res: any, next: any) => {
      req.user = {
        id: 'user-admin',
        email: 'admin@synergy.com',
        role: 'admin'
      };
      next();
    });

    const testRouter = express.Router();

    testRouter.get('/wip/overview', validate(wipOverviewQuerySchema), controller.getOverview);
    testRouter.get('/wip/batches', validate(wipBatchQuerySchema), controller.listBatches);
    testRouter.get('/wip/batches/:id', validate(wipBatchParamSchema), controller.getBatchById);
    testRouter.get('/wip/batches/:id/genealogy', validate(wipBatchParamSchema), controller.getBatchGenealogy);
    testRouter.get('/wip/departments/:departmentId/queue', validate(wipDepartmentQueueQuerySchema), controller.getDepartmentQueue);
    testRouter.get('/wip/timing-metrics', validate(wipTimingQuerySchema), controller.getTimingMetrics);
    testRouter.post('/wip/reconcile', validate(runReconciliationSchema), controller.runReconciliation);
    testRouter.get('/wip/exceptions', validate(wipExceptionQuerySchema), controller.listExceptions);
    testRouter.get('/wip/exceptions/:id', validate(wipExceptionParamSchema), controller.getExceptionById);
    testRouter.post('/wip/exceptions/:id/investigate', validate(investigateExceptionSchema), controller.investigateException);
    testRouter.post('/wip/exceptions/:id/resolve', validate(resolveExceptionSchema), controller.resolveException);
    testRouter.post('/wip/exceptions/:id/dismiss', validate(dismissExceptionSchema), controller.dismissException);

    app.use('/api/v1', testRouter);

    app.use((err: any, _req: any, res: any, _next: any) => {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: err.errorCode || 'ERROR' }
      });
    });
  });

  it('GET /api/v1/wip/overview returns overview metrics', async () => {
    const res = await request(app).get('/api/v1/wip/overview');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalActiveBatches).toBe(5);
  });

  it('GET /api/v1/wip/batches lists batches with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/wip/batches?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /api/v1/wip/batches/:id retrieves batch WIP detail', async () => {
    const res = await request(app).get('/api/v1/wip/batches/550e8400-e29b-41d4-a716-446655440000');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batch.id).toBe('b-1');
  });

  it('GET /api/v1/wip/batches/:id/genealogy returns genealogy trace', async () => {
    const res = await request(app).get('/api/v1/wip/batches/550e8400-e29b-41d4-a716-446655440000/genealogy');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalLeadTimeSeconds).toBe(300);
  });

  it('GET /api/v1/wip/departments/:departmentId/queue returns department queue', async () => {
    const res = await request(app).get('/api/v1/wip/departments/550e8400-e29b-41d4-a716-446655440001/queue');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it('POST /api/v1/wip/reconcile triggers reconciliation', async () => {
    const res = await request(app)
      .post('/api/v1/wip/reconcile')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.checkedBatchesCount).toBe(10);
  });

  it('POST /api/v1/wip/exceptions/:id/resolve resolves an exception with valid notes', async () => {
    const res = await request(app)
      .post('/api/v1/wip/exceptions/550e8400-e29b-41d4-a716-446655440002/resolve')
      .send({ resolutionNotes: 'Resolved scrap log discrepancy' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RESOLVED');
  });

  it('POST /api/v1/wip/exceptions/:id/resolve validates body and rejects empty resolution notes (400)', async () => {
    const res = await request(app)
      .post('/api/v1/wip/exceptions/550e8400-e29b-41d4-a716-446655440002/resolve')
      .send({ resolutionNotes: 'ab' }); // Less than 3 chars
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
