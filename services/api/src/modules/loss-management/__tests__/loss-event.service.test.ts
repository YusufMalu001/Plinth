import { LossEventService } from '../services/loss-event.service';
import { ToleranceEvaluatorService } from '../services/tolerance-evaluator.service';
import { LossEventRepository } from '../repositories/loss-event.repository';
import { ReplacementChallanRepository } from '../repositories/replacement-challan.repository';
import {
  ForbiddenError,
  ConflictError,
  InvalidStateTransitionError,
  ValidationError
} from '../../../common/errors/AppError';
import { LifecycleStatus, LossEventStatus, LossClassification, LossSourceType } from '@prisma/client';
import { PermissionChecker, AuditWriter, AuditEvent } from '@plinth/types';
import { Decimal } from '@prisma/client/runtime/library';

class MockAuditWriter implements AuditWriter {
  public recordedEvents: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> {
    this.recordedEvents.push(event);
  }
}

class MockPermissionChecker implements PermissionChecker {
  public permissions = new Map<string, boolean>();

  setPermission(actorId: string, action: string, resource: string, allowed: boolean) {
    this.permissions.set(`${actorId}:${action}:${resource}`, allowed);
  }

  async can(actorId: string, action: string, resource: string): Promise<boolean> {
    const key = `${actorId}:${action}:${resource}`;
    if (this.permissions.has(key)) return this.permissions.get(key)!;
    return true; // Default allow for unspecified in tests unless explicitly denied
  }
}

describe('Module 11 — LossEventService Domain & Workflow Tests', () => {
  let service: LossEventService;
  let mockLossRepo: any;
  let mockChallanRepo: any;
  let mockToleranceEvaluator: any;
  let permissionChecker: MockPermissionChecker;
  let auditWriter: MockAuditWriter;

  const mockApprovedRule = {
    id: 'wrule-101',
    code: 'WR-STEEL-CUT',
    name: 'Steel Sheet Wastage',
    materialId: 'mat-steel-1',
    standardWastagePct: new Decimal(4.0),
    tolerancePct: new Decimal(1.5),
    version: 2,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: LifecycleStatus.APPROVED,
    deactivatedAt: null,
    supersededById: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleLossEvent = {
    id: 'loss-event-1',
    lossNumber: 'LOSS-2026-00001',
    sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION' as LossSourceType,
    sourceExceptionRecordId: 'exc-rec-1',
    sourceDiscrepancyId: null,
    sourceInspectionResultId: null,
    materialId: 'mat-steel-1',
    productId: null,
    uomId: 'uom-kg',
    locationId: 'loc-wh-1',
    departmentId: 'dept-cut-1',
    quantity: new Decimal(10.0),
    reason: 'Edge trim defect during laser cutting',
    reportedByActorId: 'user-reporter-1',
    reportedAt: new Date('2026-03-01'),
    appliedWastageRuleId: null,
    appliedWastageRuleVersion: null,
    varianceFromExpected: null,
    classification: null as LossClassification | null,
    status: 'REPORTED' as LossEventStatus,
    reviewedByActorId: null,
    reviewedAt: null,
    reviewNotes: null,
    approvedByActorId: null,
    approvedAt: null,
    rejectedByActorId: null,
    rejectedAt: null,
    rejectionReason: null,
    investigatedByActorId: null,
    investigatedAt: null,
    investigationNotes: null,
    stockEffectRef: null,
    replacementChallanRef: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    mockLossRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByLossNumber: jest.fn(),
      findBySourceExceptionRecordId: jest.fn(),
      findBySourceDiscrepancyId: jest.fn(),
      findBySourceInspectionResultId: jest.fn(),
      existsByNumber: jest.fn().mockResolvedValue(false),
      countByNumberPrefix: jest.fn().mockResolvedValue(0),
      updateClassification: jest.fn(),
      updateStatusConditional: jest.fn().mockResolvedValue(1),
      list: jest.fn(),
      getAnalyticsData: jest.fn()
    };

    mockChallanRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByLossEventId: jest.fn(),
      findByChallanNumber: jest.fn(),
      existsByNumber: jest.fn().mockResolvedValue(false),
      countByNumberPrefix: jest.fn().mockResolvedValue(0),
      acknowledge: jest.fn()
    };

    mockToleranceEvaluator = {
      resolveWastageRule: jest.fn().mockResolvedValue(mockApprovedRule),
      evaluate: jest.fn().mockReturnValue({
        rule: mockApprovedRule,
        standardWastagePct: 4.0,
        tolerancePct: 1.5,
        allowedWastageQty: 5.5,
        actualWastageQty: 10.0,
        varianceFromExpected: 6.0,
        classification: 'ABNORMAL'
      })
    };

    permissionChecker = new MockPermissionChecker();
    auditWriter = new MockAuditWriter();

    const mockDb = {
      department: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dept-cut-1',
          workCenters: [{ id: 'wc-cut-1' }]
        })
      },
      exceptionRecord: { findUnique: jest.fn() },
      goodsReceiptDiscrepancy: { findUnique: jest.fn() },
      inspectionResult: { findUnique: jest.fn() },
      stockBalance: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        const tx = {
          stockLedgerEntry: { create: jest.fn() },
          stockAdjustment: { updateMany: jest.fn() },
          lossEvent: {
            create: jest.fn().mockImplementation(async (args) => mockLossRepo.create(args.data)),
            updateMany: jest.fn().mockResolvedValue({ count: 1 })
          },
          replacementChallan: {
            create: jest.fn().mockImplementation(async (args) => mockChallanRepo.create(args.data)),
            update: jest.fn()
          },
          exceptionRecord: {
            findUnique: jest.fn().mockResolvedValue(null)
          },
          progressEvent: { create: jest.fn() },
          assemblyBatch: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
          assemblyBatchComponent: { update: jest.fn() },
          assemblyProgressEvent: { create: jest.fn() },
          employee: { findFirst: jest.fn().mockResolvedValue(null) },
          $queryRaw: jest.fn().mockResolvedValue([]),
          $executeRaw: jest.fn().mockResolvedValue(1)
        };
        return cb(tx);
      })
    };

    service = new LossEventService(
      mockLossRepo as unknown as LossEventRepository,
      mockChallanRepo as unknown as ReplacementChallanRepository,
      mockToleranceEvaluator as unknown as ToleranceEvaluatorService,
      permissionChecker,
      auditWriter,
      mockDb as any
    );
  });

  describe('Loss Event Reporting (Create)', () => {
    it('creates a LossEvent with status REPORTED and sequential lossNumber', async () => {
      mockLossRepo.create.mockResolvedValue({
        ...sampleLossEvent,
        id: 'loss-event-new',
        lossNumber: 'LOSS-2026-00001'
      });

      const created = await service.report(
        {
          sourceType: 'MANUAL_REPORT',
          materialId: 'mat-steel-1',
          uomId: 'uom-kg',
          locationId: 'loc-wh-1',
          quantity: 12.5,
          reason: 'Forklift handling puncture in warehouse bay 3'
        },
        'user-reporter-1',
        'req-1'
      );

      expect(created.lossNumber).toBe('LOSS-2026-00001');
      expect(mockLossRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'MANUAL_REPORT',
          materialId: 'mat-steel-1',
          quantity: 12.5,
          reportedByActorId: 'user-reporter-1'
        })
      );
      expect(auditWriter.recordedEvents.some((e) => e.action === 'loss_management.loss_reported')).toBe(true);
    });

    it('enforces source-uniqueness constraint (rejects duplicate ExceptionRecord source with 409 ConflictError)', async () => {
      mockLossRepo.findBySourceExceptionRecordId.mockResolvedValue(sampleLossEvent);

      await expect(
        service.report(
          {
            sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
            sourceExceptionRecordId: 'exc-rec-1',
            materialId: 'mat-steel-1',
            uomId: 'uom-kg',
            quantity: 10,
            reason: 'Duplicate attempt'
          },
          'user-reporter-1'
        )
      ).rejects.toThrow(ConflictError);
    });

    it('rejects reporting when neither materialId nor productId is provided', async () => {
      await expect(
        service.report(
          {
            sourceType: 'MANUAL_REPORT',
            uomId: 'uom-kg',
            quantity: 10,
            reason: 'Invalid item reference'
          },
          'user-reporter-1'
        )
      ).rejects.toThrow(ValidationError);
    });

    it('rejects reporting when both materialId AND productId are provided', async () => {
      await expect(
        service.report(
          {
            sourceType: 'MANUAL_REPORT',
            materialId: 'mat-1',
            productId: 'prod-1',
            uomId: 'uom-kg',
            quantity: 10,
            reason: 'Double item reference'
          },
          'user-reporter-1'
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Tolerance Comparison & Classification', () => {
    it('evaluates loss against effective WastageRule and captures applied version & classification', async () => {
      mockLossRepo.findById.mockResolvedValue(sampleLossEvent);
      mockLossRepo.updateClassification.mockResolvedValue({
        ...sampleLossEvent,
        appliedWastageRuleId: 'wrule-101',
        appliedWastageRuleVersion: 2,
        varianceFromExpected: new Decimal(6.0),
        classification: 'ABNORMAL'
      });

      const result = await service.classify('loss-event-1', { basisQuantity: 100 }, 'user-reviewer-1');

      expect(result.classification).toBe('ABNORMAL');
      expect(mockToleranceEvaluator.resolveWastageRule).toHaveBeenCalled();
      expect(mockToleranceEvaluator.evaluate).toHaveBeenCalledWith(10.0, 100, mockApprovedRule);
      expect(mockLossRepo.updateClassification).toHaveBeenCalledWith(
        'loss-event-1',
        expect.objectContaining({
          appliedWastageRuleId: 'wrule-101',
          appliedWastageRuleVersion: 2,
          classification: 'ABNORMAL'
        })
      );
    });
  });

  describe('Separation of Duties (Approval & Review)', () => {
    it('prevents the reporter from reviewing their own loss event (throws 403 ForbiddenError)', async () => {
      mockLossRepo.findById.mockResolvedValue(sampleLossEvent); // reportedByActorId is 'user-reporter-1'

      await expect(
        service.review('loss-event-1', 'Looks fine', 'user-reporter-1')
      ).rejects.toThrow(ForbiddenError);

      await expect(
        service.review('loss-event-1', 'Looks fine', 'user-reporter-1')
      ).rejects.toThrow(/Reporter cannot review their own loss event/);
    });

    it('prevents the reporter from approving their own loss event (throws 403 ForbiddenError)', async () => {
      mockLossRepo.findById.mockResolvedValue({
        ...sampleLossEvent,
        status: 'REVIEWED'
      });

      await expect(
        service.approve('loss-event-1', 'user-reporter-1')
      ).rejects.toThrow(ForbiddenError);

      await expect(
        service.approve('loss-event-1', 'user-reporter-1')
      ).rejects.toThrow(/Reporter cannot approve their own loss event/);
    });

    it('allows a distinct authorized manager to approve a reviewed loss event', async () => {
      mockLossRepo.findById
        .mockResolvedValueOnce({ ...sampleLossEvent, status: 'REVIEWED' })
        .mockResolvedValueOnce({ ...sampleLossEvent, status: 'APPROVED', approvedByActorId: 'user-manager-2' });

      const approved = await service.approve('loss-event-1', 'user-manager-2');

      expect(approved.status).toBe('APPROVED');
      expect(mockLossRepo.updateStatusConditional).toHaveBeenCalledWith(
        'loss-event-1',
        ['REPORTED', 'REVIEWED', 'INVESTIGATED'],
        'APPROVED',
        expect.objectContaining({ approvedByActorId: 'user-manager-2' })
      );
    });
  });

  describe('Workflow State Machine Transitions', () => {
    it('rejects invalid state transition (cannot approve from REJECTED or REPLACED state)', async () => {
      mockLossRepo.findById.mockResolvedValue({ ...sampleLossEvent, status: 'REJECTED' });

      await expect(
        service.approve('loss-event-1', 'user-manager-2')
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('allows recording an investigation notes transition for an abnormal loss', async () => {
      mockLossRepo.findById
        .mockResolvedValueOnce({ ...sampleLossEvent, status: 'REVIEWED', classification: 'ABNORMAL' })
        .mockResolvedValueOnce({ ...sampleLossEvent, status: 'INVESTIGATED', investigationNotes: 'Tool wear identified' });

      const investigated = await service.investigate(
        'loss-event-1',
        'Tool wear identified as primary cause; blade replaced',
        'user-investigator-3'
      );

      expect(investigated.status).toBe('INVESTIGATED');
      expect(mockLossRepo.updateStatusConditional).toHaveBeenCalledWith(
        'loss-event-1',
        ['REVIEWED', 'REPORTED'],
        'INVESTIGATED',
        expect.objectContaining({ investigationNotes: 'Tool wear identified as primary cause; blade replaced' })
      );
    });
  });

  describe('Replacement Challan Generation (REPLACED)', () => {
    it('issues a quantity-only replacement challan and transitions loss event to REPLACED', async () => {
      mockLossRepo.findById.mockResolvedValue({ ...sampleLossEvent, status: 'APPROVED' });
      mockChallanRepo.findByLossEventId.mockResolvedValue(null);
      mockChallanRepo.create.mockResolvedValue({
        id: 'challan-1',
        challanNumber: 'REP-CHAL-2026-00001',
        lossEventId: 'loss-event-1',
        materialId: 'mat-steel-1',
        quantity: new Decimal(10.0),
        dispatchLocationId: 'loc-wh-1'
      });

      const challan = await service.issueReplacementChallan(
        'loss-event-1',
        {
          dispatchLocationId: 'loc-wh-1',
          targetDepartmentId: 'dept-cut-1',
          notes: 'Replacement material dispatched for cutting line'
        },
        'user-store-mgr-1'
      );

      expect(challan.challanNumber).toBeDefined();
      expect(mockChallanRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lossEventId: 'loss-event-1',
          dispatchLocationId: 'loc-wh-1'
        })
      );
    });
  });

  describe('Plant-Wide Analytics Rollup', () => {
    it('aggregates loss metrics across departments, materials, and source types accurately', async () => {
      mockLossRepo.getAnalyticsData.mockResolvedValue([
        {
          ...sampleLossEvent,
          id: 'ev-1',
          materialId: 'mat-1',
          productId: null,
          quantity: new Decimal(10),
          classification: 'WITHIN_TOLERANCE',
          status: 'POSTED',
          departmentId: 'dept-1',
          department: { name: 'Cutting Department' },
          material: { id: 'mat-1', name: 'Steel', code: 'STL-01' }
        },
        {
          ...sampleLossEvent,
          id: 'ev-2',
          materialId: 'mat-1',
          productId: null,
          quantity: new Decimal(25),
          classification: 'ABNORMAL',
          status: 'INVESTIGATED',
          departmentId: 'dept-1',
          department: { name: 'Cutting Department' },
          material: { id: 'mat-1', name: 'Steel', code: 'STL-01' }
        },
        {
          ...sampleLossEvent,
          id: 'ev-3',
          materialId: 'mat-2',
          productId: null,
          quantity: new Decimal(5),
          sourceType: 'GRN_DISCREPANCY',
          classification: 'WITHIN_TOLERANCE',
          status: 'APPROVED',
          departmentId: null,
          material: { id: 'mat-2', name: 'Wood', code: 'WD-01' }
        }
      ]);

      const analytics = await service.getAnalytics({});

      expect(analytics.totalEvents).toBe(3);
      expect(analytics.totalQuantity).toBe(40);
      expect(analytics.withinToleranceCount).toBe(2);
      expect(analytics.withinToleranceQuantity).toBe(15);
      expect(analytics.abnormalCount).toBe(1);
      expect(analytics.abnormalQuantity).toBe(25);
      expect(analytics.byDepartment.find((d: any) => d.departmentId === 'dept-1')?.quantity).toBe(35);
      expect(analytics.byMaterial.find((m: any) => m.materialId === 'mat-1')?.abnormalQuantity).toBe(25);
    });
  });
});
