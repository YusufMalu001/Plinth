import request from 'supertest';
import express from 'express';
import { QcService } from '../../services/qc.service';
import { QcReleaseGateService } from '../../services/qc-release-gate.service';
import { QcController } from '../../controllers/qc.controller';
import { validate } from '../../../../common/middleware/validation';
import {
  qcQueueQuerySchema,
  resolveCheckpointsQuerySchema,
  recordInspectionSchema,
  reinspectInspectionSchema,
  createCorrectiveActionSchema,
  updateCorrectiveActionSchema,
  batchQualityHistoryParamSchema,
  grnLineQualityHistoryParamSchema,
  createQcRuleRequestSchema,
  approveQcRuleSchema,
  qcOverrideSchema,
  releaseGateCheckQuerySchema
} from '@plinth/validation';
import { errorHandler } from '../../../../common/middleware/error';

describe('Module 10 — Quality Management API & RBAC Tests', () => {
  let app: express.Application;
  let mockService: Partial<QcService>;
  let mockReleaseGateService: Partial<QcReleaseGateService>;

  beforeEach(() => {
    mockService = {
      getInspectionQueue: jest.fn().mockResolvedValue({
        items: [
          {
            targetType: 'BATCH',
            targetId: 'b-1',
            referenceNumber: 'BATCH-001',
            checkpointType: 'IN_PROCESS',
            itemDescription: 'Ceiling Dryer Part',
            quantity: 100,
            unitOfMeasure: 'PCS',
            hasApprovedCriteria: true,
            requiresInspection: true,
            canInspect: true,
            createdAt: new Date().toISOString()
          }
        ],
        total: 1
      }),
      resolveCheckpoints: jest.fn().mockResolvedValue({
        targetType: 'BATCH',
        targetId: 'b-1',
        referenceNumber: 'BATCH-001',
        checkpoints: []
      }),
      recordInspection: jest.fn().mockResolvedValue({
        id: 'insp-1',
        inspectionNumber: 'QC-INSP-2026-00001',
        checkpointType: 'IN_PROCESS',
        inspectorEmployeeId: '11111111-1111-1111-1111-111111111111',
        sampledQuantity: 10,
        defectiveQuantity: 0,
        status: 'PASS',
        isOverride: false,
        evidenceAttachmentUrls: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      recordReinspection: jest.fn().mockResolvedValue({
        id: 'insp-2',
        inspectionNumber: 'QC-INSP-2026-00002',
        checkpointType: 'IN_PROCESS',
        status: 'PASS',
        createdAt: new Date().toISOString()
      }),
      createCorrectiveAction: jest.fn().mockResolvedValue({
        id: 'ca-1',
        inspectionResultId: 'insp-1',
        actionDescription: 'Rework action',
        status: 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      updateCorrectiveAction: jest.fn().mockResolvedValue({
        id: 'ca-1',
        inspectionResultId: 'insp-1',
        actionDescription: 'Rework action',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      getBatchQualityHistory: jest.fn().mockResolvedValue([]),
      getGrnLineQualityHistory: jest.fn().mockResolvedValue([]),
      listQcRules: jest.fn().mockResolvedValue([]),
      createQcRule: jest.fn().mockResolvedValue({
        id: 'rule-1',
        code: 'QC-RULE-1',
        name: 'Rule 1',
        status: 'DRAFT'
      }),
      approveQcRule: jest.fn().mockResolvedValue({
        id: 'rule-1',
        code: 'QC-RULE-1',
        status: 'APPROVED'
      }),
      recordOverride: jest.fn().mockResolvedValue({
        id: 'insp-override-1',
        inspectionNumber: 'QC-INSP-2026-00099',
        checkpointType: 'IN_PROCESS',
        isOverride: true,
        overrideReason: 'Urgent authorization by Plant Manager',
        status: 'PASS',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    };

    mockReleaseGateService = {
      checkReleaseGate: jest.fn().mockResolvedValue({
        allowed: true,
        targetType: 'BATCH',
        targetId: 'b-1',
        referenceNumber: 'BATCH-001',
        requiredCheckpointsCount: 1,
        passedCheckpointsCount: 1,
        overriddenCheckpointsCount: 0,
        pendingCheckpoints: [],
        blockingFailures: []
      })
    };

    const controller = new QcController(
      mockService as QcService,
      mockReleaseGateService as QcReleaseGateService
    );

    app = express();
    app.use(express.json());

    // Mock authentication user
    app.use((req, _res, next) => {
      (req as any).user = { id: 'test-user-id', role: 'admin' };
      (req as any).id = 'req-test-123';
      next();
    });

    // Mount test routes
    app.get('/api/v1/qc/queue', validate(qcQueueQuerySchema), controller.getInspectionQueue);
    app.get('/api/v1/qc/checkpoints/resolve', validate(resolveCheckpointsQuerySchema), controller.resolveCheckpoints);
    app.post('/api/v1/qc/inspections', validate(recordInspectionSchema), controller.recordInspection);
    app.post('/api/v1/qc/inspections/:id/reinspect', validate(reinspectInspectionSchema), controller.recordReinspection);
    app.post('/api/v1/qc/inspections/:id/corrective-actions', validate(createCorrectiveActionSchema), controller.createCorrectiveAction);
    app.patch('/api/v1/qc/corrective-actions/:actionId', validate(updateCorrectiveActionSchema), controller.updateCorrectiveAction);
    app.get('/api/v1/qc/history/batch/:batchId', validate(batchQualityHistoryParamSchema), controller.getBatchQualityHistory);
    app.get('/api/v1/qc/history/grn-line/:grnLineId', validate(grnLineQualityHistoryParamSchema), controller.getGrnLineQualityHistory);
    app.get('/api/v1/qc/rules', controller.listQcRules);
    app.post('/api/v1/qc/rules', validate(createQcRuleRequestSchema), controller.createQcRule);
    app.post('/api/v1/qc/rules/:id/approve', validate(approveQcRuleSchema), controller.approveQcRule);
    app.post('/api/v1/qc/override', validate(qcOverrideSchema), controller.recordOverride);
    app.get('/api/v1/qc/release-gate/check', validate(releaseGateCheckQuerySchema), controller.checkReleaseGate);

    app.use(errorHandler);
  });

  describe('GET /api/v1/qc/queue', () => {
    it('returns paginated inspection queue wrapped in ApiResponse<T>', async () => {
      const res = await request(app).get('/api/v1/qc/queue');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].referenceNumber).toBe('BATCH-001');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('POST /api/v1/qc/inspections', () => {
    it('records valid inspection result with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/qc/inspections')
        .send({
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: '11111111-1111-1111-1111-111111111111',
          inspectorEmployeeId: '22222222-2222-2222-2222-222222222222',
          sampledQuantity: 10,
          defectiveQuantity: 0,
          status: 'PASS'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inspectionNumber).toBe('QC-INSP-2026-00001');
    });

    it('rejects non-PASS inspection without a reason at the validation layer with 400', async () => {
      const res = await request(app)
        .post('/api/v1/qc/inspections')
        .send({
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: '11111111-1111-1111-1111-111111111111',
          inspectorEmployeeId: '22222222-2222-2222-2222-222222222222',
          sampledQuantity: 10,
          defectiveQuantity: 2,
          status: 'FAIL',
          reason: ''
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.error)).toContain('Reason is strictly required for any non-PASS inspection result');
    });
  });

  describe('POST /api/v1/qc/override', () => {
    it('records mandatory gate override with valid reason', async () => {
      const res = await request(app)
        .post('/api/v1/qc/override')
        .send({
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: '11111111-1111-1111-1111-111111111111',
          overrideReason: 'Plant Head authorization for expedited order'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isOverride).toBe(true);
    });

    it('rejects override when reason is shorter than 5 characters', async () => {
      const res = await request(app)
        .post('/api/v1/qc/override')
        .send({
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: '11111111-1111-1111-1111-111111111111',
          overrideReason: 'skip'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/qc/release-gate/check', () => {
    it('returns release gate evaluation result', async () => {
      const res = await request(app)
        .get('/api/v1/qc/release-gate/check?targetType=BATCH&targetId=11111111-1111-1111-1111-111111111111');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.allowed).toBe(true);
    });
  });
});
