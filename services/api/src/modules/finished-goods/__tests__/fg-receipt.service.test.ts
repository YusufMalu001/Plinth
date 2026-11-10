import { FgReceiptService, MissingFinalFgQcCriteriaError } from '../services/fg-receipt.service';
import { PermissionChecker, AuditWriter, AuditEvent } from '@synergy/types';
import { ConflictError } from '../../../common/errors/AppError';

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
    return true; // Default allow in tests unless explicitly denied
  }
}

describe('Module 13 — Finished Goods (FG) Receiving & Gate Unit Tests', () => {
  let service: FgReceiptService;
  let mockRepo: any;
  let mockPrisma: any;
  let permissionChecker: MockPermissionChecker;
  let auditWriter: MockAuditWriter;

  const actorId = 'user-store-mgr-1';
  const readyOutputId = 'ready-out-123';
  const productId = 'prod-cs11-ironing-board';

  beforeEach(() => {
    permissionChecker = new MockPermissionChecker();
    auditWriter = new MockAuditWriter();

    mockRepo = {
      createReadyOutput: jest.fn(),
      findReadyOutputById: jest.fn(),
      listReadyOutputs: jest.fn(),
      updatePackagingRecord: jest.fn(),
      findReceiptById: jest.fn(),
      findReceiptByReadyOutputId: jest.fn(),
      listReceipts: jest.fn(),
      executeFgReceiptTransaction: jest.fn(),
      updateReceiptStatus: jest.fn(),
      countActiveReservationsForProduct: jest.fn()
    };

    mockPrisma = {
      qcRule: {
        findFirst: jest.fn()
      },
      fgReadyOutput: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      },
      fgReceipt: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      }
    };

    service = new FgReceiptService(mockRepo, permissionChecker, auditWriter, mockPrisma);
  });

  describe('1. FG Receipt Gate Evaluation (V-009 & Packaging Readiness)', () => {
    it('blocks gate if no approved V-009 criteria exists for FINAL_FG', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        qcInspectionResult: { status: 'PASS' },
        packagingRecord: { status: 'READY_FOR_DISPATCH' }
      });
      // No active QC rule in database
      mockPrisma.qcRule.findFirst.mockResolvedValue(null);

      const evaluation = await service.evaluateGate(readyOutputId);

      expect(evaluation.isReadyToReceive).toBe(false);
      expect(evaluation.hasApprovedQcCriteria).toBe(false);
      expect(evaluation.blockReason).toContain('BLOCKED_NO_APPROVED_QC_CRITERIA');
    });

    it('blocks gate if FINAL_FG Inspection result is not PASS', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        qcInspectionResult: { status: 'FAIL' },
        packagingRecord: { status: 'READY_FOR_DISPATCH' }
      });
      mockPrisma.qcRule.findFirst.mockResolvedValue({ id: 'qc-rule-final-fg', status: 'ACTIVE' });

      const evaluation = await service.evaluateGate(readyOutputId);

      expect(evaluation.isReadyToReceive).toBe(false);
      expect(evaluation.isQcPassed).toBe(false);
      expect(evaluation.blockReason).toContain('BLOCKED_QC_NOT_PASSED');
    });

    it('blocks gate if Packaging readiness is not READY_FOR_DISPATCH', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        qcInspectionResult: { status: 'PASS' },
        packagingRecord: { status: 'NOT_PACKED' }
      });
      mockPrisma.qcRule.findFirst.mockResolvedValue({ id: 'qc-rule-final-fg', status: 'ACTIVE' });

      const evaluation = await service.evaluateGate(readyOutputId);

      expect(evaluation.isReadyToReceive).toBe(false);
      expect(evaluation.isPackagingReady).toBe(false);
      expect(evaluation.blockReason).toContain('BLOCKED_PACKAGING_NOT_READY');
    });

    it('passes gate when FINAL_FG is PASS, approved V-009 criteria exists, and packaging is READY_FOR_DISPATCH', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        qcInspectionResult: { status: 'PASS' },
        packagingRecord: { status: 'READY_FOR_DISPATCH' }
      });
      mockPrisma.qcRule.findFirst.mockResolvedValue({ id: 'qc-rule-final-fg', status: 'ACTIVE' });

      const evaluation = await service.evaluateGate(readyOutputId);

      expect(evaluation.isReadyToReceive).toBe(true);
      expect(evaluation.hasApprovedQcCriteria).toBe(true);
      expect(evaluation.isQcPassed).toBe(true);
      expect(evaluation.isPackagingReady).toBe(true);
      expect(evaluation.blockReason).toBeNull();
    });
  });

  describe('2. FG Receipt Creation & Duplicate Prevention', () => {
    it('throws MissingFinalFgQcCriteriaError when receiving without approved criteria', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        qcInspectionResult: { status: 'PASS' },
        packagingRecord: { status: 'READY_FOR_DISPATCH' }
      });
      mockPrisma.qcRule.findFirst.mockResolvedValue(null);

      await expect(
        service.receiveThroughGate(
          { fgReadyOutputId: readyOutputId, locationId: 'loc-fg-wh-1' },
          actorId
        )
      ).rejects.toThrow(MissingFinalFgQcCriteriaError);
    });

    it('prevents duplicate FG receipt for the same ready output', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        quantity: 50,
        uomId: 'uom-pcs',
        qcInspectionResult: { status: 'PASS' },
        packagingRecord: { status: 'READY_FOR_DISPATCH' }
      });
      mockPrisma.qcRule.findFirst.mockResolvedValue({ id: 'qc-rule-1', status: 'ACTIVE' });
      mockRepo.findReceiptByReadyOutputId.mockResolvedValue({ id: 'fgr-existing-1' });

      await expect(
        service.receiveThroughGate(
          { fgReadyOutputId: readyOutputId, locationId: 'loc-fg-wh-1' },
          actorId
        )
      ).rejects.toThrow(ConflictError);
    });

    it('successfully receives FG and records audit event', async () => {
      mockRepo.findReadyOutputById.mockResolvedValue({
        id: readyOutputId,
        productId,
        quantity: 100,
        uomId: 'uom-pcs',
        qcInspectionResult: { status: 'PASS' },
        packagingRecord: { status: 'READY_FOR_DISPATCH' }
      });
      mockPrisma.qcRule.findFirst.mockResolvedValue({ id: 'qc-rule-1', status: 'ACTIVE' });
      mockRepo.findReceiptByReadyOutputId.mockResolvedValue(null);
      mockRepo.executeFgReceiptTransaction.mockResolvedValue({
        id: 'fgr-new-1',
        receiptNumber: 'FGR-2026-0001',
        productId,
        quantity: 100,
        locationId: 'loc-fg-wh-1'
      });

      const receipt = await service.receiveThroughGate(
        { fgReadyOutputId: readyOutputId, locationId: 'loc-fg-wh-1', notes: 'Batch 1 receipt' },
        actorId,
        'req-test-1'
      );

      expect(receipt.id).toBe('fgr-new-1');
      expect(mockRepo.executeFgReceiptTransaction).toHaveBeenCalled();
      expect(auditWriter.recordedEvents).toHaveLength(1);
      expect(auditWriter.recordedEvents[0].action).toBe('RECEIVE_FINISHED_GOODS');
    });
  });

  describe('3. Hold & Reservation Conflict Edge Case', () => {
    it('places receipt on hold and flags active reservation conflicts visibly', async () => {
      mockRepo.findReceiptById.mockResolvedValue({
        id: 'fgr-1',
        productId,
        locationId: 'loc-fg-wh-1',
        status: 'RECEIVED'
      });
      mockRepo.countActiveReservationsForProduct.mockResolvedValue(3);
      mockRepo.updateReceiptStatus.mockResolvedValue({
        id: 'fgr-1',
        status: 'HELD',
        holdReason: 'Suspected carton labeling defect'
      });

      const result = await service.holdReceipt('fgr-1', 'Suspected carton labeling defect', actorId);

      expect(result.status).toBe('HELD');
      expect(result.activeReservationConflictsCount).toBe(3);
      expect(mockRepo.updateReceiptStatus).toHaveBeenCalledWith('fgr-1', expect.objectContaining({
        status: 'HELD',
        holdReason: 'Suspected carton labeling defect'
      }));
    });

    it('releases receipt from hold to available stock', async () => {
      mockRepo.findReceiptById.mockResolvedValue({
        id: 'fgr-1',
        productId,
        locationId: 'loc-fg-wh-1',
        status: 'HELD'
      });
      mockRepo.updateReceiptStatus.mockResolvedValue({
        id: 'fgr-1',
        status: 'RELEASED'
      });

      const result = await service.releaseReceipt('fgr-1', actorId);

      expect(result.status).toBe('RELEASED');
      expect(mockRepo.updateReceiptStatus).toHaveBeenCalledWith('fgr-1', expect.objectContaining({
        status: 'RELEASED'
      }));
    });
  });

  describe('4. Genealogy Trace Chain', () => {
    it('returns full real genealogy chain from Module 12 assembly and components', async () => {
      mockRepo.findReceiptById.mockResolvedValue({
        id: 'fgr-1',
        receiptNumber: 'FGR-2026-0001',
        productId,
        fgReadyOutput: {
          id: readyOutputId,
          assemblyBatch: {
            id: 'batch-assm-1',
            batchNumber: 'ASSM-2026-0001',
            components: [
              {
                componentType: 'BATCH_SOURCED',
                consumedQuantity: 50,
                uom: { symbol: 'pcs' },
                sourceBatch: {
                  id: 'batch-pipe-1',
                  batchNumber: 'DEPT-BATCH-001',
                  department: { name: 'SS Stands Department' }
                },
                materialIssueLine: null
              },
              {
                componentType: 'ISSUE_LINE_SOURCED',
                consumedQuantity: 100,
                uom: { symbol: 'pcs' },
                sourceBatch: null,
                materialIssueLine: {
                  id: 'mil-1',
                  material: { code: 'RAW-CAP-16', name: 'Square Top Cap' },
                  quantity: 100
                }
              }
            ]
          }
        }
      });

      const trace = await service.traceGenealogy('fgr-1', actorId);

      expect(trace.assemblyBatch?.batchNumber).toBe('ASSM-2026-0001');
      expect(trace.componentsTrace).toHaveLength(2);
      expect(trace.componentsTrace[0].sourceBatch?.departmentName).toBe('SS Stands Department');
      expect(trace.componentsTrace[1].materialIssueLine?.materialCode).toBe('RAW-CAP-16');
    });
  });
});
