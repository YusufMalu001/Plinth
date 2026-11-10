import { DepartmentExecutionService } from '../services/department-execution.service';
import { DepartmentExecutionRepository } from '../repositories/department-execution.repository';
import { ForbiddenError } from '../../../common/errors/AppError';

jest.mock('../../notifications/notification.service', () => ({
  notificationService: { notifyDepartment: jest.fn().mockResolvedValue([]), notifyRoles: jest.fn().mockResolvedValue([]) }
}));

describe('DepartmentExecutionService (Module 8 Domain Tests)', () => {
  let service: DepartmentExecutionService;
  let mockRepo: jest.Mocked<DepartmentExecutionRepository>;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockRepo = {
      createBatch: jest.fn(),
      findBatchById: jest.fn(),
      findBatchByNumber: jest.fn(),
      findBatchesByPlanId: jest.fn(),
      listBatches: jest.fn(),
      listDepartmentQueue: jest.fn(),
      updateBatch: jest.fn(),
      createWorkerAssignment: jest.fn(),
      createProgressEvent: jest.fn(),
      createExceptionRecord: jest.fn(),
      createHandover: jest.fn(),
      findHandoverByIdempotencyKey: jest.fn(),
      findHandoverById: jest.fn(),
      updateHandover: jest.fn()
    } as any;

    mockPrisma = {
      productionPlan: { findUnique: jest.fn(), update: jest.fn() },
      productionPlanEvent: { create: jest.fn() },
      productRoute: { findFirst: jest.fn(), findUnique: jest.fn() },
      productionMaterialIssue: { findFirst: jest.fn(), findUnique: jest.fn() },
      department: { findUnique: jest.fn() },
      employee: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      departmentExecutionBatch: { count: jest.fn() },
      handover: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback) => callback(mockPrisma))
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined)
    };

    service = new DepartmentExecutionService(mockRepo, mockPrisma as any, mockAudit);
  });

  describe('1. V-003 Gate & Plan Trigger Verification', () => {
    it('blocks batch initialization if ProductionPlan is in DRAFT/CHECKED/APPROVED status', async () => {
      mockPrisma.productionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        planNumber: 'PLAN-001',
        status: 'APPROVED',
        productId: 'prod-1',
        product: { name: 'CS8 Frame', sku: 'PROD-001' }
      });

      await expect(
        service.initializeBatch({ productionPlanId: 'plan-1' }, 'user-1')
      ).rejects.toThrow(/Batches can only be produced when plan is RELEASED or IN_PROGRESS/);
    });

    it('blocks execution when a product has no approved route in Master Data (V-003 Gate)', async () => {
      mockPrisma.productionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        planNumber: 'PLAN-001',
        status: 'RELEASED',
        productId: 'prod-1',
        product: { name: 'CS8 Frame', sku: 'PROD-001' },
        route: null
      });
      mockPrisma.productRoute.findFirst.mockResolvedValue(null);

      await expect(
        service.initializeBatch({ productionPlanId: 'plan-1' }, 'user-1')
      ).rejects.toThrow('Routing sequence for product "CS8 Frame" (PROD-001) is not defined or not approved in Master Data.');
    });

    it('successfully initializes batch when ProductionPlan is RELEASED and route is approved', async () => {
      mockPrisma.productionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        planNumber: 'PLAN-001',
        status: 'RELEASED',
        productId: 'prod-1',
        quantity: 100,
        product: { name: 'CS8 Frame', sku: 'PROD-001' },
        route: {
          id: 'route-1',
          status: 'APPROVED',
          steps: [
            { id: 'step-1', sequenceNumber: 1, departmentId: 'dept-laser', workCenterId: 'wc-laser' },
            { id: 'step-2', sequenceNumber: 2, departmentId: 'dept-buff', workCenterId: 'wc-buff' }
          ]
        }
      });
      mockPrisma.departmentExecutionBatch.count.mockResolvedValue(0);
      mockRepo.findBatchByNumber.mockResolvedValue(null);
      mockRepo.createBatch.mockResolvedValue({
        id: 'batch-1',
        batchNumber: 'BATCH-2026-0001',
        status: 'AWAITING_RECEIPT',
        received_qty: 100,
        pending_qty: 100
      } as any);

      const result = await service.initializeBatch({ productionPlanId: 'plan-1' }, 'user-1');
      expect(result.id).toBe('batch-1');
      expect(result.status).toBe('AWAITING_RECEIPT');
      expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'BATCH_INITIALIZED' }));
    });
  });

  describe('2. Material Issue Gate at First Stage', () => {
    it('rejects receiving first stage batch if no confirmed MaterialIssue exists', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        productionPlanId: 'plan-1',
        departmentId: 'dept-laser',
        stageSequenceNumber: 1,
        status: 'AWAITING_RECEIPT',
        productionPlan: { planNumber: 'PLAN-001' }
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockPrisma.productionMaterialIssue.findFirst.mockResolvedValue(null);

      await expect(
        service.receiveBatch('batch-1', 'user-1', {})
      ).rejects.toThrow(/First department stage requires a confirmed Material Issue/);
    });

    it('successfully receives first stage batch when valid MaterialIssue exists', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        productionPlanId: 'plan-1',
        departmentId: 'dept-laser',
        stageSequenceNumber: 1,
        status: 'AWAITING_RECEIPT',
        productionPlan: { planNumber: 'PLAN-001' }
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockPrisma.productionMaterialIssue.findFirst.mockResolvedValue({
        id: 'issue-1',
        productionPlanId: 'plan-1',
        reversedAt: null
      });
      mockRepo.updateBatch.mockResolvedValue({
        id: 'batch-1',
        status: 'RECEIVED',
        materialIssueId: 'issue-1'
      } as any);

      const result = await service.receiveBatch('batch-1', 'user-1', {});
      expect(result.status).toBe('RECEIVED');
    });
  });

  describe('3. Worker Attribution & Assignment', () => {
    it('fails worker assignment if employee does not exist', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        departmentId: 'dept-laser',
        status: 'RECEIVED'
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.assignWorker('batch-1', 'user-1', { employeeId: 'emp-unknown' })
      ).rejects.toThrow(/Active Employee with ID \[emp-unknown\] not found/);
    });

    it('successfully assigns employee and transitions batch to ASSIGNED', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        departmentId: 'dept-laser',
        status: 'RECEIVED'
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' });
      mockRepo.createWorkerAssignment.mockResolvedValue({ id: 'assign-1', employeeId: 'emp-1' } as any);
      mockRepo.updateBatch.mockResolvedValue({ id: 'batch-1', status: 'ASSIGNED' } as any);

      const result = await service.assignWorker('batch-1', 'user-1', {
        employeeId: 'emp-1',
        subtaskDescription: 'Cut pipe to 827mm'
      });
      expect(result.batch.status).toBe('ASSIGNED');
      expect(mockRepo.createWorkerAssignment).toHaveBeenCalledWith(expect.objectContaining({
        employeeId: 'emp-1',
        subtaskDescription: 'Cut pipe to 827mm'
      }));
    });
  });

  describe('4. Quantity Conservation Invariant & Stage Completion', () => {
    it('rejects recording progress if quantities violate conservation invariant', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        departmentId: 'dept-laser',
        status: 'IN_PROGRESS',
        received_qty: 100,
        completed_qty: 0,
        rejected_qty: 0,
        scrap_qty: 0,
        wastage_qty: 0,
        pending_qty: 100
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });

      // sum = 60 + 10 + 5 + 5 + 30 = 110 != 100
      await expect(
        service.recordProgress('batch-1', 'user-1', {
          employeeId: 'emp-1',
          completed_qty: 60,
          rejected_qty: 10,
          scrap_qty: 5,
          wastage_qty: 5,
          pending_qty: 30
        })
      ).rejects.toThrow(/Quantity conservation invariant violated/);
    });

    it('completes a department stage without posting finished output or completing the schedule', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        productionPlanId: 'plan-1',
        departmentId: 'dept-buff',
        stageSequenceNumber: 2,
        status: 'IN_PROGRESS',
        received_qty: 100,
        completed_qty: 0
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.productionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        quantity: 100,
        status: 'IN_PROGRESS',
        route: {
          steps: [
            { sequenceNumber: 1, departmentId: 'dept-laser' },
            { sequenceNumber: 2, departmentId: 'dept-buff' } // Final stage
          ]
        }
      });
      mockRepo.updateBatch.mockResolvedValue({
        id: 'batch-1',
        status: 'COMPLETE',
        completed_qty: 95,
        rejected_qty: 3,
        scrap_qty: 2,
        wastage_qty: 0,
        pending_qty: 0
      } as any);

      const result = await service.completeBatch('batch-1', 'user-1', {
        employeeId: 'emp-1',
        completed_qty: 95,
        rejected_qty: 3,
        scrap_qty: 2,
        wastage_qty: 0,
        pending_qty: 0
      });

      expect(result.status).toBe('COMPLETE');
      expect(mockPrisma.productionPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('5. Handover Workflow & Traceable Chain of Custody', () => {
    it('handles idempotent replay on duplicate handover propose', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        departmentId: 'dept-laser',
        status: 'COMPLETE',
        completed_qty: 100
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockRepo.findHandoverByIdempotencyKey.mockResolvedValue({
        id: 'handover-existing',
        idempotencyKey: 'IDEMP-12345',
        status: 'PROPOSED'
      } as any);

      const result = await service.proposeHandover('batch-1', 'user-1', {
        quantity: 100,
        incomingDepartmentId: 'dept-buff',
        idempotencyKey: 'IDEMP-12345'
      });
      expect(result.id).toBe('handover-existing');
    });

    it('refuses handover with mandatory reason and leaves batch in HANDOVER_PENDING', async () => {
      mockRepo.findHandoverById.mockResolvedValue({
        id: 'handover-1',
        incomingDepartmentId: 'dept-buff',
        outgoingBatchId: 'batch-1',
        status: 'PROPOSED'
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockRepo.updateHandover.mockResolvedValue({
        id: 'handover-1',
        status: 'REFUSED',
        refusalReason: 'Burr defects on edges'
      } as any);

      const result = await service.decideHandover('handover-1', 'user-1', {
        status: 'REFUSED',
        refusalReason: 'Burr defects on edges'
      });

      expect(result.status).toBe('REFUSED');
      expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HANDOVER_REFUSED' }));
    });

    it('accepts handover, marks outgoing NEXT_STAGE_ACCEPTED, and creates next batch with traceable link', async () => {
      mockRepo.findHandoverById.mockResolvedValue({
        id: 'handover-1',
        incomingDepartmentId: 'dept-buff',
        outgoingBatchId: 'batch-1',
        quantity: 95,
        status: 'PROPOSED',
        outgoingDepartment: { name: 'Laser Department' }
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        batchNumber: 'BATCH-2026-0001',
        productionPlanId: 'plan-1',
        materialIssueId: 'issue-1',
        stageSequenceNumber: 1
      } as any);
      mockRepo.updateHandover.mockResolvedValue({ id: 'handover-1', status: 'ACCEPTED' } as any);
      mockRepo.createBatch.mockResolvedValue({
        id: 'batch-2',
        batchNumber: 'BATCH-2026-0001-S2',
        status: 'RECEIVED',
        received_qty: 95,
        sourceHandoverId: 'handover-1'
      } as any);

      const result: any = await service.decideHandover('handover-1', 'user-1', {
        status: 'ACCEPTED'
      });

      expect(result.handover.status).toBe('ACCEPTED');
      expect(result.newBatch.id).toBe('batch-2');
      expect(result.newBatch.received_qty).toBe(95);
      expect(result.newBatch.sourceHandoverId).toBe('handover-1');
    });
  });

  describe('6. Department-Scoped RBAC & Managerial Override', () => {
    it('denies operator from modifying batch of another department', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        departmentId: 'dept-laser',
        status: 'RECEIVED'
      } as any);
      // Operator assigned to dept-pipe
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'employee',
        assignedDepartmentId: 'dept-pipe'
      });

      await expect(
        service.receiveBatch('batch-1', 'operator-1', {})
      ).rejects.toThrow(ForbiddenError);
    });

    it('executes managerial override with distinct audit logging', async () => {
      mockRepo.findBatchById.mockResolvedValue({
        id: 'batch-1',
        departmentId: 'dept-laser',
        status: 'PAUSED'
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
      mockRepo.updateBatch.mockResolvedValue({
        id: 'batch-1',
        status: 'IN_PROGRESS'
      } as any);

      const result = await service.managerialOverride('batch-1', 'admin-1', {
        action: 'OVERRIDE_STATUS',
        targetStatus: 'IN_PROGRESS',
        reason: 'Authorized emergency restart by Plant Manager'
      });

      expect(result.status).toBe('IN_PROGRESS');
      expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'MANAGERIAL_OVERRIDE_OVERRIDE_STATUS',
        metadata: expect.objectContaining({ reason: 'Authorized emergency restart by Plant Manager' })
      }));
    });
  });
});
