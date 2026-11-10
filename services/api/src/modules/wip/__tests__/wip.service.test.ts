import { WipService } from '../services/wip.service';
import { WipRepository } from '../repositories/wip.repository';
import { ValidationError, ForbiddenError } from '../../../common/errors/AppError';

describe('WipService (Module 9 WIP & Batch Tracking Domain Tests)', () => {
  let service: WipService;
  let mockRepo: jest.Mocked<WipRepository>;
  let mockPrisma: any;
  let mockAudit: any;
  let mockChecker: any;

  beforeEach(() => {
    mockRepo = {
      findBatchById: jest.fn(),
      findBatchByNumber: jest.fn(),
      listBatches: jest.fn(),
      getDepartmentQueue: jest.fn(),
      getAllBatchesForPlan: jest.fn(),
      getOverviewData: jest.fn(),
      findExistingException: jest.fn(),
      createException: jest.fn(),
      listExceptions: jest.fn(),
      findExceptionById: jest.fn(),
      updateException: jest.fn()
    } as any;

    mockPrisma = {
      user: { findUnique: jest.fn() },
      department: { findUnique: jest.fn(), findMany: jest.fn() },
      departmentExecutionBatch: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      wipReconciliationException: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() }
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined)
    };

    mockChecker = {
      can: jest.fn().mockResolvedValue(true),
      hasRoleFlag: jest.fn().mockResolvedValue(true)
    };

    service = new WipService(mockRepo, mockPrisma as any, mockAudit);
  });

  describe('1. Zero-Drift State Derivation & Quantity Conservation', () => {
    it('derives accurate WIP summary and verifies conservation across received and output quantities', async () => {
      const sampleBatch = {
        id: 'batch-1',
        batchNumber: 'BATCH-001',
        productionPlanId: 'plan-1',
        productionPlan: {
          planNumber: 'PLAN-100',
          productId: 'prod-1',
          product: { sku: 'PROD-SKU-1', name: 'Luxury Glider Frame' }
        },
        departmentId: 'dept-laser',
        department: { code: 'LASER', name: 'Laser Cutting' },
        workCenterId: 'wc-1',
        workCenter: { code: 'WC-LASER-1' },
        routeStepId: 'step-1',
        stageSequenceNumber: 1,
        status: 'IN_PROGRESS',
        received_qty: 100,
        completed_qty: 70,
        rejected_qty: 5,
        scrap_qty: 3,
        wastage_qty: 2,
        pending_qty: 20,
        sourceHandoverId: null,
        createdByActorId: 'user-admin',
        createdAt: new Date('2026-09-10T08:00:00Z'),
        updatedAt: new Date('2026-09-10T12:00:00Z'),
        workerAssignments: [
          {
            id: 'wa-1',
            employeeId: 'emp-1',
            employee: { firstName: 'Ashraf', lastName: 'Ansari' },
            subtaskDescription: 'Laser contouring',
            assignedByActorId: 'user-supervisor',
            assignedAt: new Date('2026-09-10T08:15:00Z')
          }
        ],
        progressEvents: [
          {
            id: 'pe-1',
            eventType: 'STARTED',
            quantityDelta: 0,
            notes: 'Batch initiated on laser 1',
            employeeId: 'emp-1',
            employee: { firstName: 'Ashraf', lastName: 'Ansari' },
            timestamp: new Date('2026-09-10T08:30:00Z')
          },
          {
            id: 'pe-2',
            eventType: 'PARTIAL_RECORDED',
            quantityDelta: 70,
            notes: 'Cut 70 units',
            employeeId: 'emp-1',
            employee: { firstName: 'Ashraf', lastName: 'Ansari' },
            timestamp: new Date('2026-09-10T11:00:00Z')
          }
        ],
        exceptionRecords: [
          {
            id: 'ex-1',
            type: 'REJECTION',
            quantity: 5,
            reason: 'Beam misalignment flaw',
            employeeId: 'emp-1',
            employee: { firstName: 'Ashraf', lastName: 'Ansari' },
            timestamp: new Date('2026-09-10T10:00:00Z')
          }
        ],
        sourceHandover: null,
        outgoingHandovers: []
      };

      mockRepo.findBatchById.mockResolvedValue(sampleBatch as any);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-admin', role: 'admin' });

      const detail = await service.getBatchWipDetail('batch-1', 'user-admin', mockChecker);

      expect(detail.batch.id).toBe('batch-1');
      expect(detail.batch.receivedQty).toBe(100);
      expect(detail.batch.completedQty).toBe(70);
      expect(detail.batch.rejectedQty).toBe(5);
      expect(detail.batch.scrapQty).toBe(3);
      expect(detail.batch.wastageQty).toBe(2);
      expect(detail.batch.pendingQty).toBe(20);
      // Conservation check: completed (70) + rejected (5) + scrap (3) + wastage (2) + pending (20) == received (100)
      expect(detail.batch.completedQty + detail.batch.rejectedQty + detail.batch.scrapQty + detail.batch.wastageQty + detail.batch.pendingQty).toBe(100);
      // Active WIP quantity at this stage = pending + completed = 90
      expect(detail.batch.wipQuantity).toBe(90);
      expect(detail.assignedWorkers.length).toBe(1);
      expect(detail.progressEvents.length).toBe(2);
      expect(detail.exceptionRecords.length).toBe(1);
    });
  });

  describe('2. Timing Metrics & Rework Loops', () => {
    it('calculates queue duration, active execution time, and pause time correctly from progress events', async () => {
      const createdAt = new Date('2026-09-10T08:00:00Z');
      const startAt = new Date('2026-09-10T08:30:00Z'); // Queue wait = 30 min (1800s)
      const pauseAt = new Date('2026-09-10T09:30:00Z'); // Active 1 hour (3600s)
      const resumeAt = new Date('2026-09-10T10:00:00Z'); // Paused 30 min (1800s)
      const completeAt = new Date('2026-09-10T11:00:00Z'); // Active 1 hour (3600s). Total active = 7200s

      const sampleBatch = {
        id: 'batch-2',
        batchNumber: 'BATCH-002',
        productionPlanId: 'plan-1',
        departmentId: 'dept-weld',
        status: 'COMPLETE',
        received_qty: 50,
        completed_qty: 50,
        rejected_qty: 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 0,
        createdAt,
        updatedAt: completeAt,
        workerAssignments: [],
        progressEvents: [
          { id: 'p1', eventType: 'STARTED', quantityDelta: 0, timestamp: startAt, employee: { firstName: 'A', lastName: 'B' } },
          { id: 'p2', eventType: 'PAUSED', quantityDelta: 0, timestamp: pauseAt, employee: { firstName: 'A', lastName: 'B' } },
          { id: 'p3', eventType: 'RESUMED', quantityDelta: 0, timestamp: resumeAt, employee: { firstName: 'A', lastName: 'B' } },
          { id: 'p4', eventType: 'COMPLETED', quantityDelta: 50, timestamp: completeAt, employee: { firstName: 'A', lastName: 'B' } }
        ],
        exceptionRecords: [],
        sourceHandover: null,
        outgoingHandovers: []
      };

      mockRepo.findBatchById.mockResolvedValue(sampleBatch as any);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-admin', role: 'admin' });

      const detail = await service.getBatchWipDetail('batch-2', 'user-admin', mockChecker);

      expect(detail.timings.queueDurationSeconds).toBe(1800);
      expect(detail.timings.activeExecutionDurationSeconds).toBe(7200);
      expect(detail.timings.pausedDurationSeconds).toBe(1800);
      expect(detail.timings.totalStageDurationSeconds).toBe(10800); // 3 hours from 8:00 to 11:00
      expect(detail.reworkCount).toBe(0);
    });

    it('identifies rework status and scrap exceptions as rework loops', async () => {
      const sampleBatch = {
        id: 'batch-rework',
        batchNumber: 'BATCH-RW-001',
        productionPlanId: 'plan-1',
        departmentId: 'dept-weld',
        status: 'REWORK',
        received_qty: 40,
        completed_qty: 0,
        rejected_qty: 5,
        scrap_qty: 5,
        wastage_qty: 0,
        pending_qty: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
        workerAssignments: [],
        progressEvents: [],
        exceptionRecords: [
          { id: 'e1', type: 'SCRAP', quantity: 5, reason: 'Weld penetration defect', timestamp: new Date(), employee: { firstName: 'X', lastName: 'Y' } }
        ],
        sourceHandover: null,
        outgoingHandovers: []
      };

      mockRepo.findBatchById.mockResolvedValue(sampleBatch as any);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-admin', role: 'admin' });

      const detail = await service.getBatchWipDetail('batch-rework', 'user-admin', mockChecker);
      expect(detail.reworkCount).toBe(1);
    });
  });

  describe('3. Genealogy Trace (Backward & Forward Walk)', () => {
    it('traverses the multi-department handover chain accurately in both directions', async () => {
      // Stage 1: Laser Cutting
      const stage1Batch = {
        id: 'batch-s1',
        batchNumber: 'BATCH-STAGE1',
        productionPlanId: 'plan-1',
        departmentId: 'dept-laser',
        department: { code: 'LASER', name: 'Laser Cutting' },
        stageSequenceNumber: 1,
        status: 'NEXT_STAGE_ACCEPTED',
        received_qty: 100,
        completed_qty: 95,
        rejected_qty: 5,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 0,
        sourceHandoverId: null,
        sourceHandover: null,
        outgoingHandovers: [
          {
            id: 'handover-1-2',
            status: 'ACCEPTED',
            quantity: 95,
            incomingDepartmentId: 'dept-weld',
            incomingDepartment: { name: 'Spot Welding' },
            createdBatch: { id: 'batch-s2', batchNumber: 'BATCH-STAGE2' },
            decidedAt: new Date('2026-09-10T10:00:00Z')
          }
        ],
        progressEvents: [
          { eventType: 'COMPLETED', timestamp: new Date('2026-09-10T09:55:00Z') }
        ],
        createdAt: new Date('2026-09-10T08:00:00Z'),
        updatedAt: new Date('2026-09-10T10:00:00Z')
      };

      // Stage 2: Spot Welding (Target batch in the middle)
      const stage2Batch = {
        id: 'batch-s2',
        batchNumber: 'BATCH-STAGE2',
        productionPlanId: 'plan-1',
        departmentId: 'dept-weld',
        department: { code: 'WELD', name: 'Spot Welding' },
        stageSequenceNumber: 2,
        status: 'NEXT_STAGE_ACCEPTED',
        received_qty: 95,
        completed_qty: 90,
        rejected_qty: 0,
        scrap_qty: 5,
        wastage_qty: 0,
        pending_qty: 0,
        sourceHandoverId: 'handover-1-2',
        sourceHandover: {
          id: 'handover-1-2',
          outgoingBatchId: 'batch-s1',
          outgoingBatch: { batchNumber: 'BATCH-STAGE1', department: { name: 'Laser Cutting' } },
          outgoingDepartmentId: 'dept-laser',
          outgoingDepartment: { name: 'Laser Cutting' },
          quantity: 95,
          status: 'ACCEPTED',
          decidedAt: new Date('2026-09-10T10:00:00Z')
        },
        outgoingHandovers: [
          {
            id: 'handover-2-3',
            status: 'ACCEPTED',
            quantity: 90,
            incomingDepartmentId: 'dept-pack',
            incomingDepartment: { name: 'Packaging' },
            createdBatch: { id: 'batch-s3', batchNumber: 'BATCH-STAGE3' },
            decidedAt: new Date('2026-09-10T13:00:00Z')
          }
        ],
        progressEvents: [
          { eventType: 'COMPLETED', timestamp: new Date('2026-09-10T12:50:00Z') }
        ],
        createdAt: new Date('2026-09-10T10:00:00Z'),
        updatedAt: new Date('2026-09-10T13:00:00Z')
      };

      // Stage 3: Packaging
      const stage3Batch = {
        id: 'batch-s3',
        batchNumber: 'BATCH-STAGE3',
        productionPlanId: 'plan-1',
        departmentId: 'dept-pack',
        department: { code: 'PACK', name: 'Packaging' },
        stageSequenceNumber: 3,
        status: 'COMPLETE',
        received_qty: 90,
        completed_qty: 90,
        rejected_qty: 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 0,
        sourceHandoverId: 'handover-2-3',
        sourceHandover: {
          id: 'handover-2-3',
          outgoingBatchId: 'batch-s2',
          outgoingBatch: { batchNumber: 'BATCH-STAGE2', department: { name: 'Spot Welding' } },
          outgoingDepartmentId: 'dept-weld',
          outgoingDepartment: { name: 'Spot Welding' },
          quantity: 90,
          status: 'ACCEPTED',
          decidedAt: new Date('2026-09-10T13:00:00Z')
        },
        outgoingHandovers: [],
        progressEvents: [
          { eventType: 'COMPLETED', timestamp: new Date('2026-09-10T15:00:00Z') }
        ],
        createdAt: new Date('2026-09-10T13:00:00Z'),
        updatedAt: new Date('2026-09-10T15:00:00Z')
      };

      // Querying genealogy starting from middle batch (Stage 2)
      mockRepo.findBatchById.mockResolvedValue(stage2Batch as any);
      mockRepo.getAllBatchesForPlan.mockResolvedValue([stage1Batch, stage2Batch, stage3Batch] as any);

      const trace = await service.getBatchGenealogy('batch-s2', 'user-admin', mockChecker);

      expect(trace.rootBatchId).toBe('batch-s1');
      expect(trace.currentBatchId).toBe('batch-s2');
      expect(trace.totalStages).toBe(3);
      expect(trace.stages.map(s => s.batchNumber)).toEqual(['BATCH-STAGE1', 'BATCH-STAGE2', 'BATCH-STAGE3']);
      expect(trace.stages[0].incomingHandover).toBeNull();
      expect(trace.stages[1].incomingHandover?.fromBatchNumber).toBe('BATCH-STAGE1');
      expect(trace.stages[2].incomingHandover?.fromBatchNumber).toBe('BATCH-STAGE2');
      expect(trace.isComplete).toBe(true);
    });
  });

  describe('4. Reconciliation Checks & Anomaly Detection', () => {
    it('detects NEGATIVE_QUANTITY anomalies and records critical exceptions', async () => {
      const corruptBatch = {
        id: 'batch-corrupt-neg',
        batchNumber: 'BATCH-NEG-001',
        productionPlanId: 'plan-1',
        departmentId: 'dept-laser',
        status: 'IN_PROGRESS',
        received_qty: -10,
        completed_qty: 0,
        rejected_qty: 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 0,
        sourceHandoverId: null,
        outgoingHandovers: []
      };

      mockRepo.listBatches.mockResolvedValue({ items: [corruptBatch], total: 1, page: 1, limit: 500 } as any);
      mockRepo.findBatchById.mockResolvedValue(corruptBatch as any);
      mockRepo.findExistingException.mockResolvedValue(null);
      mockRepo.createException.mockResolvedValue({
        id: 'exc-neg',
        batchId: 'batch-corrupt-neg',
        exceptionType: 'NEGATIVE_QUANTITY',
        severity: 'CRITICAL',
        description: 'Negative quantity detected',
        status: 'OPEN',
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      const report = await service.runReconciliationCheck({}, 'user-admin', mockChecker);

      expect(report.checkedBatchesCount).toBe(1);
      expect(report.anomaliesDetectedCount).toBeGreaterThanOrEqual(1);
      expect(report.exceptionsCreatedCount).toBeGreaterThanOrEqual(1);
      expect(mockRepo.createException).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-corrupt-neg',
          exceptionType: 'NEGATIVE_QUANTITY',
          severity: 'CRITICAL'
        })
      );
      expect(mockAudit.record).toHaveBeenCalled();
    });

    it('detects CONSERVATION_MISMATCH anomalies and records high severity exceptions', async () => {
      const mismatchBatch = {
        id: 'batch-mismatch',
        batchNumber: 'BATCH-MISMATCH-001',
        productionPlanId: 'plan-1',
        departmentId: 'dept-laser',
        status: 'IN_PROGRESS',
        received_qty: 100,
        completed_qty: 50,
        rejected_qty: 10,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 10, // Sum = 70 != 100 (30 units unaccounted for)
        sourceHandoverId: null,
        outgoingHandovers: []
      };

      mockRepo.listBatches.mockResolvedValue({ items: [mismatchBatch], total: 1, page: 1, limit: 500 } as any);
      mockRepo.findBatchById.mockResolvedValue(mismatchBatch as any);
      mockRepo.findExistingException.mockResolvedValue(null);
      mockRepo.createException.mockResolvedValue({
        id: 'exc-mismatch',
        batchId: 'batch-mismatch',
        exceptionType: 'CONSERVATION_MISMATCH',
        severity: 'HIGH',
        description: 'Conservation mismatch',
        status: 'OPEN',
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      const report = await service.runReconciliationCheck({}, 'user-admin', mockChecker);

      expect(report.anomaliesDetectedCount).toBe(1);
      expect(mockRepo.createException).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-mismatch',
          exceptionType: 'CONSERVATION_MISMATCH',
          severity: 'HIGH'
        })
      );
    });

    it('detects DOUBLE_PRESENCE when upstream stage is active while downstream child is active', async () => {
      const doublePresenceBatch = {
        id: 'batch-parent-active',
        batchNumber: 'BATCH-PARENT',
        productionPlanId: 'plan-1',
        departmentId: 'dept-laser',
        department: { name: 'Laser Cutting' },
        status: 'IN_PROGRESS', // Should be NEXT_STAGE_ACCEPTED
        received_qty: 50,
        completed_qty: 50,
        rejected_qty: 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 0,
        sourceHandoverId: null,
        outgoingHandovers: [
          {
            id: 'handover-active',
            status: 'ACCEPTED',
            incomingDepartment: { name: 'Spot Welding' },
            createdBatch: {
              id: 'batch-child-active',
              batchNumber: 'BATCH-CHILD',
              status: 'IN_PROGRESS'
            }
          }
        ]
      };

      mockRepo.listBatches.mockResolvedValue({ items: [doublePresenceBatch], total: 1, page: 1, limit: 500 } as any);
      mockRepo.findBatchById.mockResolvedValue(doublePresenceBatch as any);
      mockRepo.findExistingException.mockResolvedValue(null);
      mockRepo.createException.mockResolvedValue({
        id: 'exc-double',
        batchId: 'batch-parent-active',
        exceptionType: 'DOUBLE_PRESENCE',
        severity: 'CRITICAL',
        description: 'Double presence detected',
        status: 'OPEN',
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      const report = await service.runReconciliationCheck({}, 'user-admin', mockChecker);

      expect(report.anomaliesDetectedCount).toBe(1);
      expect(mockRepo.createException).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-parent-active',
          exceptionType: 'DOUBLE_PRESENCE',
          severity: 'CRITICAL'
        })
      );
    });

    it('detects BROKEN_GENEALOGY_CHAIN when source handover is missing or not accepted', async () => {
      const brokenBatch = {
        id: 'batch-broken',
        batchNumber: 'BATCH-BROKEN-001',
        productionPlanId: 'plan-1',
        departmentId: 'dept-weld',
        status: 'RECEIVED',
        received_qty: 50,
        completed_qty: 0,
        rejected_qty: 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 50,
        sourceHandoverId: 'handover-unaccepted',
        sourceHandover: {
          id: 'handover-unaccepted',
          status: 'PROPOSED' // Not ACCEPTED!
        },
        outgoingHandovers: []
      };

      mockRepo.listBatches.mockResolvedValue({ items: [brokenBatch], total: 1, page: 1, limit: 500 } as any);
      mockRepo.findBatchById.mockResolvedValue(brokenBatch as any);
      mockRepo.findExistingException.mockResolvedValue(null);
      mockRepo.createException.mockResolvedValue({
        id: 'exc-broken',
        batchId: 'batch-broken',
        exceptionType: 'BROKEN_GENEALOGY_CHAIN',
        severity: 'HIGH',
        description: 'Broken chain',
        status: 'OPEN',
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      const report = await service.runReconciliationCheck({}, 'user-admin', mockChecker);

      expect(report.anomaliesDetectedCount).toBe(1);
      expect(mockRepo.createException).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'batch-broken',
          exceptionType: 'BROKEN_GENEALOGY_CHAIN'
        })
      );
    });
  });

  describe('5. Reconciliation Exception Lifecycle & Audit Trail', () => {
    it('allows investigating an open exception', async () => {
      const existingEx = {
        id: 'exc-1',
        batchId: 'batch-1',
        exceptionType: 'CONSERVATION_MISMATCH',
        status: 'OPEN',
        investigationNotes: null,
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockRepo.findExceptionById.mockResolvedValue(existingEx as any);
      mockRepo.updateException.mockResolvedValue({
        ...existingEx,
        status: 'INVESTIGATING',
        investigatedByActorId: 'user-supervisor',
        investigatedAt: new Date(),
        investigationNotes: 'Checking shop floor logs'
      } as any);

      const result = await service.investigateException('exc-1', 'Checking shop floor logs', 'user-supervisor', mockChecker);

      expect(result.status).toBe('INVESTIGATING');
      expect(result.investigationNotes).toBe('Checking shop floor logs');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVESTIGATE_EXCEPTION',
          entityId: 'exc-1',
          actorId: 'user-supervisor'
        })
      );
    });

    it('allows resolving an exception with resolution notes', async () => {
      const existingEx = {
        id: 'exc-1',
        batchId: 'batch-1',
        status: 'INVESTIGATING',
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockRepo.findExceptionById.mockResolvedValue(existingEx as any);
      mockRepo.updateException.mockResolvedValue({
        ...existingEx,
        status: 'RESOLVED',
        resolvedByActorId: 'user-manager',
        resolvedAt: new Date(),
        resolutionNotes: 'Material scrap was re-entered in shop-floor log'
      } as any);

      const result = await service.resolveException('exc-1', 'Material scrap was re-entered in shop-floor log', 'user-manager', mockChecker);

      expect(result.status).toBe('RESOLVED');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESOLVE_EXCEPTION',
          entityId: 'exc-1',
          actorId: 'user-manager'
        })
      );
    });

    it('rejects resolving an exception if resolution notes are missing', async () => {
      await expect(
        service.resolveException('exc-1', '', 'user-manager', mockChecker)
      ).rejects.toThrow(ValidationError);
    });

    it('allows dismissing an exception with notes', async () => {
      const existingEx = {
        id: 'exc-1',
        batchId: 'batch-1',
        status: 'OPEN',
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockRepo.findExceptionById.mockResolvedValue(existingEx as any);
      mockRepo.updateException.mockResolvedValue({
        ...existingEx,
        status: 'DISMISSED',
        resolvedByActorId: 'user-manager',
        resolvedAt: new Date(),
        resolutionNotes: 'False positive due to timing gap'
      } as any);

      const result = await service.dismissException('exc-1', 'False positive due to timing gap', 'user-manager', mockChecker);

      expect(result.status).toBe('DISMISSED');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DISMISS_EXCEPTION',
          entityId: 'exc-1'
        })
      );
    });
  });

  describe('6. Department Scoping & Permission Enforcement', () => {
    it('blocks operators from viewing other department batches', async () => {
      mockChecker.can.mockImplementation(async (_actorId: string, action: string, resource: string) => {
        if ((action === 'manage' || action === 'override_manage') && resource === 'DepartmentExecution') return false;
        return true;
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-operator',
        role: 'operator',
        assignedDepartmentId: 'dept-laser'
      });

      const batchAtWeld = {
        id: 'batch-weld',
        departmentId: 'dept-weld',
        createdAt: new Date(),
        updatedAt: new Date(),
        workerAssignments: [],
        progressEvents: [],
        exceptionRecords: [],
        outgoingHandovers: []
      };
      mockRepo.findBatchById.mockResolvedValue(batchAtWeld as any);

      await expect(
        service.getBatchWipDetail('batch-weld', 'user-operator', mockChecker)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows admin / global managers to view all department batches', async () => {
      mockChecker.can.mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-admin',
        role: 'admin',
        assignedDepartmentId: null
      });

      const batchAtWeld = {
        id: 'batch-weld',
        batchNumber: 'BATCH-WELD-01',
        departmentId: 'dept-weld',
        createdAt: new Date(),
        updatedAt: new Date(),
        workerAssignments: [],
        progressEvents: [],
        exceptionRecords: [],
        outgoingHandovers: []
      };
      mockRepo.findBatchById.mockResolvedValue(batchAtWeld as any);

      const detail = await service.getBatchWipDetail('batch-weld', 'user-admin', mockChecker);
      expect(detail.batch.id).toBe('batch-weld');
    });
  });

  describe('7. Performance: Deep Multi-Stage Genealogy Walk', () => {
    it('handles a 20-stage production chain under 50ms', async () => {
      const stagesCount = 20;
      const batches: any[] = [];

      for (let i = 1; i <= stagesCount; i++) {
        const prevHandoverId = i > 1 ? `handover-${i - 1}-${i}` : null;
        const nextHandoverId = i < stagesCount ? `handover-${i}-${i + 1}` : null;

        batches.push({
          id: `batch-${i}`,
          batchNumber: `BATCH-STAGE-${i}`,
          productionPlanId: 'plan-long',
          departmentId: `dept-${i}`,
          department: { code: `DEPT-${i}`, name: `Department ${i}` },
          stageSequenceNumber: i,
          status: i === stagesCount ? 'COMPLETE' : 'NEXT_STAGE_ACCEPTED',
          received_qty: 100,
          completed_qty: 100,
          rejected_qty: 0,
          scrap_qty: 0,
          wastage_qty: 0,
          pending_qty: 0,
          sourceHandoverId: prevHandoverId,
          sourceHandover: prevHandoverId ? {
            id: prevHandoverId,
            outgoingBatchId: `batch-${i - 1}`,
            outgoingBatch: { batchNumber: `BATCH-STAGE-${i - 1}`, department: { name: `Department ${i - 1}` } },
            outgoingDepartmentId: `dept-${i - 1}`,
            outgoingDepartment: { name: `Department ${i - 1}` },
            quantity: 100,
            status: 'ACCEPTED',
            decidedAt: new Date()
          } : null,
          outgoingHandovers: nextHandoverId ? [
            {
              id: nextHandoverId,
              status: 'ACCEPTED',
              quantity: 100,
              incomingDepartmentId: `dept-${i + 1}`,
              incomingDepartment: { name: `Department ${i + 1}` },
              createdBatch: { id: `batch-${i + 1}`, batchNumber: `BATCH-STAGE-${i + 1}` },
              decidedAt: new Date()
            }
          ] : [],
          progressEvents: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      mockRepo.findBatchById.mockResolvedValue(batches[10]); // Middle batch
      mockRepo.getAllBatchesForPlan.mockResolvedValue(batches);

      const startTime = performance.now();
      const trace = await service.getBatchGenealogy('batch-11', 'user-admin', mockChecker);
      const durationMs = performance.now() - startTime;

      expect(trace.totalStages).toBe(20);
      expect(trace.rootBatchId).toBe('batch-1');
      expect(trace.stages[0].batchNumber).toBe('BATCH-STAGE-1');
      expect(trace.stages[19].batchNumber).toBe('BATCH-STAGE-20');
      expect(durationMs).toBeLessThan(50);
    });
  });
});
