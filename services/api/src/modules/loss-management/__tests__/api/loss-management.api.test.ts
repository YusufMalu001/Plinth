import request from 'supertest';
import express from 'express';
import { LossEventService } from '../../services/loss-event.service';
import { LossEventController } from '../../controllers/loss-event.controller';
import { validate } from '../../../../common/middleware/validation';
import {
  createLossEventSchema,
  classifyLossEventSchema,
  reviewLossEventSchema,
  approveLossEventSchema,
  rejectLossEventSchema,
  investigateLossEventSchema,
  postLossEventStockEffectSchema,
  createReplacementChallanSchema,
  acknowledgeReplacementChallanSchema,
  lossEventQuerySchema,
  lossAnalyticsQuerySchema,
  lossEventParamSchema
} from '@synergy/validation';
import { errorHandler } from '../../../../common/middleware/error';
import { ConflictError, ForbiddenError, InvalidStateTransitionError } from '../../../../common/errors/AppError';

describe('Module 11 — Loss Management API & RBAC Integration Tests', () => {
  let app: express.Application;
  let mockService: Partial<LossEventService>;

  const validLossEvent = {
    id: '11111111-1111-1111-1111-111111111111',
    lossNumber: 'LOSS-2026-00001',
    sourceType: 'MANUAL_REPORT',
    materialId: '22222222-2222-2222-2222-222222222222',
    productId: null,
    uomId: '33333333-3333-3333-3333-333333333333',
    quantity: 15.5,
    reason: 'Warehouse water leak damaged lower rack items',
    status: 'REPORTED',
    reportedByActorId: 'user-reporter-1',
    reportedAt: new Date().toISOString()
  };

  beforeEach(() => {
    mockService = {
      report: jest.fn().mockResolvedValue(validLossEvent),
      classify: jest.fn().mockResolvedValue({
        ...validLossEvent,
        appliedWastageRuleId: '44444444-4444-4444-4444-444444444444',
        appliedWastageRuleVersion: 1,
        classification: 'WITHIN_TOLERANCE'
      }),
      review: jest.fn().mockResolvedValue({ ...validLossEvent, status: 'REVIEWED' }),
      approve: jest.fn().mockResolvedValue({ ...validLossEvent, status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ ...validLossEvent, status: 'REJECTED' }),
      investigate: jest.fn().mockResolvedValue({ ...validLossEvent, status: 'INVESTIGATED' }),
      postStockEffect: jest.fn().mockResolvedValue({ ...validLossEvent, status: 'POSTED', stockEffectRef: 'ledger-1' }),
      issueReplacementChallan: jest.fn().mockResolvedValue({
        id: '55555555-5555-5555-5555-555555555555',
        challanNumber: 'REP-CHAL-2026-00001',
        lossEventId: validLossEvent.id,
        quantity: 15.5,
        dispatchLocationId: '66666666-6666-6666-6666-666666666666'
      }),
      acknowledgeReplacementChallan: jest.fn().mockResolvedValue({
        id: '55555555-5555-5555-5555-555555555555',
        challanNumber: 'REP-CHAL-2026-00001',
        acknowledgedByActorId: 'user-ack-1'
      }),
      getById: jest.fn().mockResolvedValue(validLossEvent),
      list: jest.fn().mockResolvedValue({ items: [validLossEvent], total: 1 }),
      getAnalytics: jest.fn().mockResolvedValue({
        totalEvents: 1,
        totalQuantity: 15.5,
        withinToleranceCount: 1,
        withinToleranceQuantity: 15.5,
        abnormalCount: 0,
        abnormalQuantity: 0,
        byDepartment: [],
        byMaterial: []
      })
    };

    const controller = new LossEventController(
      mockService as LossEventService
    );

    app = express();
    app.use(express.json());

    // Mock authentication middleware injecting user
    app.use((req, _res, next) => {
      req.user = {
        id: 'test-user-id',
        email: 'tester@synergy.com',
        role: 'manager'
      };
      next();
    });

    // Mount test routes with validation
    app.get('/api/v1/loss-events/analytics', validate(lossAnalyticsQuerySchema), controller.getAnalytics);
    app.get('/api/v1/loss-events/abnormal-queue', validate(lossEventQuerySchema), controller.getAbnormalQueue);
    app.get('/api/v1/loss-events', validate(lossEventQuerySchema), controller.list);
    app.post('/api/v1/loss-events', validate(createLossEventSchema), controller.report);
    app.get('/api/v1/loss-events/:id', validate(lossEventParamSchema), controller.getById);
    app.post('/api/v1/loss-events/:id/classify', validate(classifyLossEventSchema), controller.classify);
    app.post('/api/v1/loss-events/:id/review', validate(reviewLossEventSchema), controller.review);
    app.post('/api/v1/loss-events/:id/approve', validate(approveLossEventSchema), controller.approve);
    app.post('/api/v1/loss-events/:id/reject', validate(rejectLossEventSchema), controller.reject);
    app.post('/api/v1/loss-events/:id/investigate', validate(investigateLossEventSchema), controller.investigate);
    app.post('/api/v1/loss-events/:id/post', validate(postLossEventStockEffectSchema), controller.postStockEffect);
    app.post('/api/v1/loss-events/:id/replacement-challan', validate(createReplacementChallanSchema), controller.issueReplacementChallan);
    app.post('/api/v1/replacement-challans/:id/acknowledge', validate(acknowledgeReplacementChallanSchema), controller.acknowledgeReplacementChallan);

    app.use(errorHandler);
  });

  describe('POST /api/v1/loss-events (Report Loss)', () => {
    it('returns 201 Created for a valid loss event payload', async () => {
      const res = await request(app)
        .post('/api/v1/loss-events')
        .send({
          sourceType: 'MANUAL_REPORT',
          materialId: '22222222-2222-2222-2222-222222222222',
          uomId: '33333333-3333-3333-3333-333333333333',
          quantity: 15.5,
          reason: 'Warehouse water leak damaged lower rack items'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lossNumber).toBe('LOSS-2026-00001');
    });

    it('returns 400 Bad Request when validation fails (missing reason/uomId)', async () => {
      const res = await request(app)
        .post('/api/v1/loss-events')
        .send({
          sourceType: 'MANUAL_REPORT',
          materialId: '22222222-2222-2222-2222-222222222222',
          quantity: 15.5
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 Conflict when service throws ConflictError (duplicate source reference)', async () => {
      mockService.report = jest.fn().mockRejectedValue(
        new ConflictError('A LossEvent already exists for this ExceptionRecord')
      );

      const res = await request(app)
        .post('/api/v1/loss-events')
        .send({
          sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
          sourceExceptionRecordId: '77777777-7777-7777-7777-777777777777',
          materialId: '22222222-2222-2222-2222-222222222222',
          uomId: '33333333-3333-3333-3333-333333333333',
          quantity: 5,
          reason: 'Laser cut defect'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Workflow Lifecycle Endpoints', () => {
    it('POST /api/v1/loss-events/:id/review - returns 200 on successful review', async () => {
      const res = await request(app)
        .post(`/api/v1/loss-events/${validLossEvent.id}/review`)
        .send({ reviewNotes: 'Verified with supervisor' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REVIEWED');
    });

    it('POST /api/v1/loss-events/:id/approve - returns 403 when creator attempts approval', async () => {
      mockService.approve = jest.fn().mockRejectedValue(
        new ForbiddenError('Separation of duties violation: Reporter cannot approve their own loss event.')
      );

      const res = await request(app)
        .post(`/api/v1/loss-events/${validLossEvent.id}/approve`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/v1/loss-events/:id/approve - returns 422 on invalid state transition', async () => {
      mockService.approve = jest.fn().mockRejectedValue(
        new InvalidStateTransitionError('Cannot approve LossEvent in state [REPORTED].')
      );

      const res = await request(app)
        .post(`/api/v1/loss-events/${validLossEvent.id}/approve`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('POST /api/v1/loss-events/:id/post - returns 200 on atomic inventory post', async () => {
      const res = await request(app)
        .post(`/api/v1/loss-events/${validLossEvent.id}/post`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('POSTED');
      expect(res.body.data.stockEffectRef).toBe('ledger-1');
    });

    it('POST /api/v1/loss-events/:id/replacement-challan - returns 201 on replacement challan creation', async () => {
      const res = await request(app)
        .post(`/api/v1/loss-events/${validLossEvent.id}/replacement-challan`)
        .send({
          dispatchLocationId: '66666666-6666-6666-6666-666666666666',
          notes: 'Standard stock replacement'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.challanNumber).toBe('REP-CHAL-2026-00001');
    });
  });

  describe('GET /api/v1/loss-events/analytics', () => {
    it('returns plant-wide loss analytics rollup', async () => {
      const res = await request(app).get('/api/v1/loss-events/analytics');

      expect(res.status).toBe(200);
      expect(res.body.data.totalEvents).toBe(1);
      expect(res.body.data.totalQuantity).toBe(15.5);
    });
  });
});
