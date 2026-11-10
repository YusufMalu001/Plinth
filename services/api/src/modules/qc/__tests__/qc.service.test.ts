import { QcService } from '../services/qc.service';
import { QcReleaseGateService } from '../services/qc-release-gate.service';
import { QcCheckpointResolver } from '../services/qc-checkpoint-resolver';
import { QcRepository } from '../repositories/qc.repository';
import {
  QcReasonRequiredError,
  QcValidationError,
  QcGateBlockedError,
  NotFoundError
} from '../qc.types';
import { LifecycleStatus } from '@prisma/client';
import { AuditWriter, AuditEvent } from '@synergy/types';

class MockAuditWriter implements AuditWriter {
  public recordedEvents: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> {
    this.recordedEvents.push(event);
  }
}

describe('Module 10 — QcService Domain & Service Tests', () => {
  let service: QcService;
  let releaseGateService: QcReleaseGateService;
  let mockRepo: jest.Mocked<QcRepository>;
  let mockResolver: QcCheckpointResolver;
  let mockAudit: MockAuditWriter;

  const validEmployee = {
    id: 'emp-101',
    employeeCode: 'EMP-001',
    firstName: 'Yusuf',
    lastName: 'Khan',
    email: 'yusuf@synergy.com',
    role: 'quality_inspector',
    departmentId: 'dept-1'
  };

  const validApprovedQcRule = {
    id: 'rule-app-1',
    code: 'QC-CS12-STD',
    name: 'CS12 Standard Inspection Criteria',
    targetType: 'PRODUCT',
    targetId: 'prod-1',
    parameters: {
      tensionKg: { min: 20, max: 25 },
      visualDefectsAllowed: 0
    },
    version: 1,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: LifecycleStatus.APPROVED,
    deactivatedAt: null,
    supersededById: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const validBatch = {
    id: 'batch-101',
    batchNumber: 'BATCH-2026-0001',
    productionPlanId: 'plan-1',
    departmentId: 'dept-1',
    stageSequenceNumber: 1,
    status: 'IN_PROGRESS' as any,
    received_qty: 100 as any,
    completed_qty: 0 as any,
    rejected_qty: 0 as any,
    scrap_qty: 0 as any,
    wastage_qty: 0 as any,
    pending_qty: 100 as any,
    notes: null,
    sourceHandoverId: null,
    createdByActorId: 'usr-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    department: { id: 'dept-1', name: 'Cutting Department' },
    workCenter: null,
    routeStep: {
      id: 'step-1',
      sequenceNumber: 1,
      stepName: 'Cutting Stage',
      departmentId: 'dept-1',
      workCenterId: 'wc-1',
      qcRule: validApprovedQcRule
    },
    productionPlan: {
      id: 'plan-1',
      productId: 'prod-1',
      product: { id: 'prod-1', name: 'CS12 Ceiling Dryer' }
    },
    inspectionResults: [],
    exceptionRecords: []
  };

  beforeEach(() => {
    mockRepo = {
      findEmployeeById: jest.fn().mockResolvedValue(validEmployee),
      findBatchById: jest.fn().mockResolvedValue(validBatch),
      findGrnLineById: jest.fn().mockResolvedValue(null),
      findQcRuleById: jest.fn().mockResolvedValue(validApprovedQcRule),
      findApprovedQcRuleForTarget: jest.fn().mockResolvedValue(validApprovedQcRule),
      findRouteStepById: jest.fn().mockResolvedValue({ id: 'step-1', stepName: 'Stage 1' }),
      generateNextInspectionNumber: jest.fn().mockResolvedValue('QC-INSP-2026-00001'),
      createInspectionWithDisposition: jest.fn().mockImplementation(async (params) => ({
        inspection: {
          id: 'insp-001',
          inspectionNumber: params.inspectionNumber,
          checkpointType: params.checkpointType,
          qcRuleId: params.qcRuleId,
          batchId: params.batchId,
          grnLineId: params.grnLineId,
          inspectorEmployeeId: params.inspectorEmployeeId,
          sampledQuantity: params.sampledQuantity,
          defectiveQuantity: params.defectiveQuantity,
          status: params.status,
          reason: params.reason,
          findings: params.findings,
          evidenceAttachmentUrls: params.evidenceAttachmentUrls,
          isOverride: params.isOverride || false,
          overrideReason: params.overrideReason,
          overrideByActorId: params.overrideByActorId,
          reinspectionOfId: params.reinspectionOfId,
          createdAt: new Date(),
          updatedAt: new Date(),
          inspector: validEmployee,
          qcRule: validApprovedQcRule
        },
        correctiveAction: params.status === 'REWORK' && params.correctiveActionDescription
          ? {
              id: 'ca-001',
              inspectionResultId: 'insp-001',
              actionDescription: params.correctiveActionDescription,
              assignedEmployeeId: params.assignedEmployeeId,
              targetReworkStageId: params.targetReworkStageId,
              status: 'OPEN',
              resolutionNotes: null,
              resolvedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              assignedEmployee: validEmployee
            }
          : null
      })),
      findInspectionById: jest.fn().mockResolvedValue({
        id: 'insp-001',
        inspectionNumber: 'QC-INSP-2026-00001',
        checkpointType: 'IN_PROCESS',
        qcRuleId: 'rule-app-1',
        batchId: 'batch-101',
        grnLineId: null,
        inspectorEmployeeId: 'emp-101',
        status: 'FAIL',
        reason: 'Dimensional variation observed',
        createdAt: new Date(),
        updatedAt: new Date(),
        inspector: validEmployee,
        qcRule: validApprovedQcRule
      }),
      createCorrectiveAction: jest.fn().mockResolvedValue({
        id: 'ca-002',
        inspectionResultId: 'insp-001',
        actionDescription: 'Re-align blade',
        assignedEmployeeId: 'emp-101',
        targetReworkStageId: 'step-1',
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
        assignedEmployee: validEmployee
      }),
      updateCorrectiveAction: jest.fn().mockResolvedValue({
        id: 'ca-001',
        inspectionResultId: 'insp-001',
        actionDescription: 'Rework action',
        status: 'COMPLETED',
        resolutionNotes: 'Completed realignment',
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        assignedEmployee: validEmployee
      }),
      findCorrectiveActionById: jest.fn().mockResolvedValue({
        id: 'ca-001',
        inspectionResultId: 'insp-001',
        actionDescription: 'Rework action',
        status: 'OPEN',
        assignedEmployee: validEmployee
      }),
      getBatchQualityHistory: jest.fn().mockResolvedValue([]),
      getGrnLineQualityHistory: jest.fn().mockResolvedValue([]),
      listActiveBatchesForInspection: jest.fn().mockResolvedValue([validBatch]),
      listPendingGrnLinesForInspection: jest.fn().mockResolvedValue([]),
      listQcRules: jest.fn().mockResolvedValue([validApprovedQcRule]),
      createQcRule: jest.fn().mockImplementation(async (data) => ({
        id: 'rule-new-1',
        ...data,
        version: 1,
        status: LifecycleStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      approveQcRule: jest.fn().mockImplementation(async (id) => ({
        ...validApprovedQcRule,
        id,
        status: LifecycleStatus.APPROVED
      })),
      findQcRuleByCode: jest.fn().mockResolvedValue(null)
    } as any;

    mockResolver = new QcCheckpointResolver();
    mockAudit = new MockAuditWriter();
    service = new QcService(mockRepo, mockResolver, mockAudit);
    releaseGateService = new QcReleaseGateService(mockRepo, mockResolver);
  });

  describe('1. Human Inspector Validation', () => {
    it('throws NotFoundError when inspector Employee foreign key does not exist', async () => {
      mockRepo.findEmployeeById.mockResolvedValueOnce(null);

      await expect(
        service.recordInspection(
          {
            checkpointType: 'IN_PROCESS',
            targetType: 'BATCH',
            targetId: 'batch-101',
            inspectorEmployeeId: 'non-existent-emp-id',
            sampledQuantity: 10,
            defectiveQuantity: 0,
            status: 'PASS'
          },
          'user-1'
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('2. Required Reason Enforcement on Non-PASS Results', () => {
    it('allows PASS inspection with no reason', async () => {
      const result = await service.recordInspection(
        {
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: 'batch-101',
          inspectorEmployeeId: 'emp-101',
          sampledQuantity: 10,
          defectiveQuantity: 0,
          status: 'PASS',
          reason: null
        },
        'user-1'
      );

      expect(result.status).toBe('PASS');
      expect(mockRepo.createInspectionWithDisposition).toHaveBeenCalled();
    });

    it('throws QcReasonRequiredError when FAIL result lacks a reason', async () => {
      await expect(
        service.recordInspection(
          {
            checkpointType: 'IN_PROCESS',
            targetType: 'BATCH',
            targetId: 'batch-101',
            inspectorEmployeeId: 'emp-101',
            sampledQuantity: 10,
            defectiveQuantity: 2,
            status: 'FAIL',
            reason: ''
          },
          'user-1'
        )
      ).rejects.toThrow(QcReasonRequiredError);
    });

    it('throws QcReasonRequiredError when REWORK result lacks a reason', async () => {
      await expect(
        service.recordInspection(
          {
            checkpointType: 'IN_PROCESS',
            targetType: 'BATCH',
            targetId: 'batch-101',
            inspectorEmployeeId: 'emp-101',
            sampledQuantity: 10,
            defectiveQuantity: 2,
            status: 'REWORK',
            reason: '   '
          },
          'user-1'
        )
      ).rejects.toThrow(QcReasonRequiredError);
    });

    it('throws QcReasonRequiredError when REJECT_SCRAP result lacks a reason', async () => {
      await expect(
        service.recordInspection(
          {
            checkpointType: 'IN_PROCESS',
            targetType: 'BATCH',
            targetId: 'batch-101',
            inspectorEmployeeId: 'emp-101',
            sampledQuantity: 10,
            defectiveQuantity: 10,
            status: 'REJECT_SCRAP',
            reason: null
          },
          'user-1'
        )
      ).rejects.toThrow(QcReasonRequiredError);
    });
  });

  describe('3. Disposition Paths', () => {
    it('REWORK disposition creates CorrectiveAction linked to rework stage and emits audit event', async () => {
      const result = await service.recordInspection(
        {
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: 'batch-101',
          inspectorEmployeeId: 'emp-101',
          sampledQuantity: 10,
          defectiveQuantity: 2,
          status: 'REWORK',
          reason: 'Burr detected on edges',
          correctiveActionDescription: 'Deburr and re-align in cutting work center',
          targetReworkStageId: 'step-1',
          assignedEmployeeId: 'emp-101'
        },
        'user-1'
      );

      expect(result.status).toBe('REWORK');
      expect(result.correctiveActions).toHaveLength(1);
      expect(result.correctiveActions![0].actionDescription).toBe('Deburr and re-align in cutting work center');

      // Check Audit
      expect(mockAudit.recordedEvents).toHaveLength(1);
      expect(mockAudit.recordedEvents[0].action).toBe('RECORD_INSPECTION');
    });

    it('REJECT_SCRAP disposition triggers ExceptionRecord creation in Module 8 and records audit event', async () => {
      const result = await service.recordInspection(
        {
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: 'batch-101',
          inspectorEmployeeId: 'emp-101',
          sampledQuantity: 10,
          defectiveQuantity: 10,
          status: 'REJECT_SCRAP',
          reason: 'Severe material crack during stamping',
          exceptionType: 'SCRAP'
        },
        'user-1'
      );

      expect(result.status).toBe('REJECT_SCRAP');
      expect(mockRepo.createInspectionWithDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REJECT_SCRAP',
          exceptionType: 'SCRAP'
        })
      );
    });
  });

  describe('4. Re-Inspection Traceability Loop', () => {
    it('records re-inspection linked to prior failed inspection', async () => {
      const result = await service.recordReinspection(
        {
          inspectionResultId: 'insp-001',
          inspectorEmployeeId: 'emp-101',
          sampledQuantity: 10,
          defectiveQuantity: 0,
          status: 'PASS',
          reason: 'Defects cleared after rework'
        },
        'user-1'
      );

      expect(result.status).toBe('PASS');
      expect(mockRepo.createInspectionWithDisposition).toHaveBeenCalledWith(
        expect.objectContaining({
          reinspectionOfId: 'insp-001',
          status: 'PASS'
        })
      );
      expect(mockAudit.recordedEvents.some(e => e.action === 'RECORD_REINSPECTION')).toBe(true);
    });
  });

  describe('5. Release Gate Evaluation & Blocking', () => {
    it('blocks release gate when mandatory checkpoint has not been inspected', async () => {
      const gateResult = await releaseGateService.checkReleaseGate('BATCH', 'batch-101');
      expect(gateResult.allowed).toBe(false);
      expect(gateResult.pendingCheckpoints.length).toBeGreaterThan(0);

      await expect(
        releaseGateService.assertCanRelease('BATCH', 'batch-101')
      ).rejects.toThrow(QcGateBlockedError);
    });

    it('allows release gate when all checkpoints have PASS status', async () => {
      mockRepo.findBatchById.mockResolvedValueOnce({
        ...validBatch,
        inspectionResults: [
          {
            id: 'insp-pass',
            inspectionNumber: 'QC-INSP-2026-0001',
            checkpointType: 'IN_PROCESS',
            status: 'PASS',
            isOverride: false,
            sampledQuantity: 10,
            defectiveQuantity: 0,
            createdAt: new Date()
          }
        ]
      } as any);

      const gateResult = await releaseGateService.checkReleaseGate('BATCH', 'batch-101');
      expect(gateResult.allowed).toBe(true);
      expect(gateResult.blockingFailures).toHaveLength(0);
      expect(gateResult.pendingCheckpoints).toHaveLength(0);
    });
  });

  describe('6. Mandatory Gate Override (Distinct Audited Action)', () => {
    it('records an override with detailed reason and emits high-priority audit event', async () => {
      const overrideResult = await service.recordOverride({
        checkpointType: 'IN_PROCESS',
        targetType: 'BATCH',
        targetId: 'batch-101',
        overrideReason: 'Urgent customer expedited batch authorized by Plant Head',
        actorId: 'user-manager-1'
      });

      expect(overrideResult.isOverride).toBe(true);
      expect(overrideResult.overrideReason).toBe('Urgent customer expedited batch authorized by Plant Head');

      // Check dedicated audit event
      const overrideEvent = mockAudit.recordedEvents.find(e => e.action === 'MANDATORY_GATE_OVERRIDE');
      expect(overrideEvent).toBeDefined();
      expect(overrideEvent?.entityType).toBe('QualityInspection');
    });

    it('rejects override with short or missing reason', async () => {
      await expect(
        service.recordOverride({
          checkpointType: 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: 'batch-101',
          overrideReason: 'skip',
          actorId: 'user-manager-1'
        })
      ).rejects.toThrow(QcValidationError);
    });
  });
});
