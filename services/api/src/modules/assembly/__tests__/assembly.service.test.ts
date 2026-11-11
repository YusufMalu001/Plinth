import { AssemblyService, MissingApprovedBomRatiosError, MissingAssemblyQcCriteriaError, QuantityConservationError, ComponentAllocationError } from '../services/assembly.service';
import { PermissionChecker, AuditWriter, AuditEvent } from '@plinth/types';
import { AssemblyBatchStatus } from '@prisma/client';

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

describe('Module 12 — Assembly Execution & Convergence Engine Tests', () => {
  let service: AssemblyService;
  let mockAssemblyRepo: any;
  let mockLossEventService: any;
  let mockToleranceEvaluator: any;
  let mockPrisma: any;
  let permissionChecker: MockPermissionChecker;
  let auditWriter: MockAuditWriter;

  const actorId = 'user-assembler-1';

  beforeEach(() => {
    permissionChecker = new MockPermissionChecker();
    auditWriter = new MockAuditWriter();

    mockAssemblyRepo = {
      createBatch: jest.fn(),
      findBatchById: jest.fn(),
      findBatchByIdempotencyKey: jest.fn(),
      listBatches: jest.fn(),
      allocateComponents: jest.fn(),
      startBatch: jest.fn(),
      assignWorker: jest.fn(),
      recordProgress: jest.fn(),
      completeBatch: jest.fn(),
      updateStatus: jest.fn()
    };

    mockLossEventService = {
      report: jest.fn()
    };

    mockToleranceEvaluator = {
      resolveWastageRule: jest.fn()
    };

    mockPrisma = {
      product: {
        findUnique: jest.fn()
      },
      bomVersion: {
        findUnique: jest.fn()
      },
      productRoute: {
        findUnique: jest.fn()
      },
      departmentExecutionBatch: {
        findUnique: jest.fn()
      },
      materialIssueLine: {
        findUnique: jest.fn()
      },
      unitOfMeasure: {
        findUnique: jest.fn()
      },
      employee: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' })
      },
      qcRule: {
        findUnique: jest.fn(),
        findFirst: jest.fn()
      },
      assemblyBatch: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0)
      },
      lossEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null)
      },
      inspectionResult: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'insp-1', ...args.data }))
      },
      fgReadyOutput: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'fg-out-1', ...args.data }))
      },
      fgPackagingRecord: {
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'pkg-1', ...args.data }))
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((cb) => cb(mockPrisma))
    };

    service = new AssemblyService(
      mockAssemblyRepo as any,
      mockLossEventService as any,
      mockToleranceEvaluator as any,
      permissionChecker,
      auditWriter,
      mockPrisma as any
    );
  });

  describe('1. V-002 Gate Enforcement & BOM Ratios (planBatch)', () => {
    it('throws MissingApprovedBomRatiosError when BOM version is not approved (V-002)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', name: 'Control Panel FG' });
      mockPrisma.bomVersion.findUnique.mockResolvedValue({
        id: 'bom-draft',
        productId: 'prod-1',
        bomNumber: 'BOM-001-DRAFT',
        status: 'DRAFT',
        lines: [{ id: 'line-1', quantity: 2 }]
      });

      await expect(
        service.planBatch(
          {
            productId: 'prod-1',
            bomVersionId: 'bom-draft',
            targetOutputQuantity: 10
          },
          actorId
        )
      ).rejects.toThrow(MissingApprovedBomRatiosError);
    });

    it('throws MissingApprovedBomRatiosError when BOM version has zero or missing lines (V-002)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', name: 'Control Panel FG' });
      mockPrisma.bomVersion.findUnique.mockResolvedValue({
        id: 'bom-empty',
        productId: 'prod-1',
        bomNumber: 'BOM-001',
        status: 'APPROVED',
        lines: []
      });

      await expect(
        service.planBatch(
          {
            productId: 'prod-1',
            bomVersionId: 'bom-empty',
            targetOutputQuantity: 10
          },
          actorId
        )
      ).rejects.toThrow(MissingApprovedBomRatiosError);
    });

    it('successfully plans assembly batch from BOM ratios without requiring a product route', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', name: 'Control Panel FG' });
      mockPrisma.bomVersion.findUnique.mockResolvedValue({
        id: 'bom-approved',
        productId: 'prod-1',
        bomNumber: 'BOM-001',
        status: 'APPROVED',
        lines: [{ id: 'line-1', quantity: 2 }]
      });

      mockAssemblyRepo.createBatch.mockResolvedValue({
        id: 'asy-batch-1',
        batchNumber: 'ASY-2026-0001',
        productId: 'prod-1',
        targetOutputQuantity: 10,
        status: AssemblyBatchStatus.PLANNED
      });

      const result = await service.planBatch(
        {
          productId: 'prod-1',
          bomVersionId: 'bom-approved',
          targetOutputQuantity: 10
        },
        actorId
      );

      expect(result.id).toBe('asy-batch-1');
      expect(mockAssemblyRepo.createBatch).toHaveBeenCalled();
      expect(auditWriter.recordedEvents.some((e) => e.action === 'PLAN_ASSEMBLY_BATCH')).toBe(true);
    });
  });

  describe('2. Component Allocation & Convergence Joins (allocateComponents)', () => {
    it('validates mixed discrete source batches and material issue lines in a single assembly kit', async () => {
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.PLANNED,
        components: []
      });

      // Discrete source batch from cutting/fabrication
      mockPrisma.departmentExecutionBatch.findUnique.mockResolvedValue({
        id: 'dept-batch-1',
        batchNumber: 'FAB-001',
        received_qty: 20,
        completed_qty: 20
      });

      // Bulk kit issue line from store
      mockPrisma.materialIssueLine.findUnique.mockResolvedValue({
        id: 'iss-line-1',
        issuedQuantity: 100
      });

      mockPrisma.unitOfMeasure.findUnique.mockResolvedValue({ id: 'uom-pcs', code: 'PCS' });

      mockAssemblyRepo.allocateComponents.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.ALLOCATED,
        components: [{ id: 'comp-1' }, { id: 'comp-2' }]
      });

      const allocations = [
        {
          componentType: 'BATCH_SOURCED' as const,
          sourceBatchId: 'dept-batch-1',
          uomId: 'uom-pcs',
          unitRatio: 2,
          requiredQuantity: 20
        },
        {
          componentType: 'ISSUE_LINE_SOURCED' as const,
          materialIssueLineId: 'iss-line-1',
          uomId: 'uom-pcs',
          unitRatio: 10,
          requiredQuantity: 100
        }
      ];

      const result = await service.allocateComponents('asy-batch-1', { allocations }, actorId);
      expect(result.status).toBe(AssemblyBatchStatus.ALLOCATED);
      expect(mockAssemblyRepo.allocateComponents).toHaveBeenCalled();
    });

    it('blocks allocation if discrete source batch has insufficient quantity', async () => {
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.PLANNED,
        components: []
      });

      mockPrisma.departmentExecutionBatch.findUnique.mockResolvedValue({
        id: 'dept-batch-1',
        batchNumber: 'FAB-001',
        completed_qty: 5 // Less than required 20
      });

      mockPrisma.unitOfMeasure.findUnique.mockResolvedValue({ id: 'uom-pcs', code: 'PCS' });

      await expect(
        service.allocateComponents(
          'asy-batch-1',
          {
            allocations: [
              {
                componentType: 'BATCH_SOURCED',
                sourceBatchId: 'dept-batch-1',
                uomId: 'uom-pcs',
                unitRatio: 2,
                requiredQuantity: 20
              }
            ]
          },
          actorId
        )
      ).rejects.toThrow(ComponentAllocationError);
    });
  });

  describe('3. Execution & Quantity Conservation Check (completeBatch)', () => {
    it('completes execution atomically when quantity conservation formula is balanced', async () => {
      mockAssemblyRepo.findBatchByIdempotencyKey.mockResolvedValue(null);
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.IN_ASSEMBLY,
        components: [
          {
            id: 'comp-1',
            unitRatio: 2, // 2 sub-components per 1 FG
            requiredQuantity: 20
          }
        ]
      });

      mockAssemblyRepo.completeBatch.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.QC_PENDING,
        actualOutputQuantity: 10,
        scrapQuantity: 0,
        idempotencyKey: 'key-123'
      });

      const result = await service.completeBatch(
        'asy-batch-1',
        {
          actualOutputQuantity: 10,
          scrapQuantity: 0,
          idempotencyKey: 'key-123',
          componentConsumptions: [
            {
              componentId: 'comp-1',
              consumedQuantity: 20, // 20 consumed / 2 unitRatio = 10 FG output -> Balanced!
              scrapQuantity: 0
            }
          ]
        },
        actorId
      );

      expect(result.status).toBe(AssemblyBatchStatus.QC_PENDING);
      expect(mockAssemblyRepo.completeBatch).toHaveBeenCalled();
    });

    it('throws QuantityConservationError when output quantity exceeds theoretical yield from consumed components', async () => {
      mockAssemblyRepo.findBatchByIdempotencyKey.mockResolvedValue(null);
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.IN_ASSEMBLY,
        components: [
          {
            id: 'comp-1',
            unitRatio: 2, // 2 sub-components per 1 FG
            requiredQuantity: 20
          }
        ]
      });

      // Trying to claim 15 FG output with only 20 consumed (which can yield at most 10 FG)
      await expect(
        service.completeBatch(
          'asy-batch-1',
          {
            actualOutputQuantity: 15,
            scrapQuantity: 0,
            idempotencyKey: 'key-broken-math',
            componentConsumptions: [
              {
                componentId: 'comp-1',
                consumedQuantity: 20,
                scrapQuantity: 0
              }
            ]
          },
          actorId
        )
      ).rejects.toThrow(QuantityConservationError);
    });

    it('returns existing batch if idempotency key was already posted for the same batch', async () => {
      const existingBatch = {
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.QC_PENDING,
        idempotencyKey: 'key-duplicate'
      };
      mockAssemblyRepo.findBatchByIdempotencyKey.mockResolvedValue(existingBatch);

      const result = await service.completeBatch(
        'asy-batch-1',
        {
          actualOutputQuantity: 10,
          idempotencyKey: 'key-duplicate',
          componentConsumptions: [{ componentId: 'comp-1', consumedQuantity: 20 }]
        },
        actorId
      );
      expect(result.id).toBe('asy-batch-1');
      expect(mockAssemblyRepo.completeBatch).not.toHaveBeenCalled();
    });
    it('blocks completion when a reported scrap proposal is still awaiting Store Manager approval', async () => {
      mockAssemblyRepo.findBatchByIdempotencyKey.mockResolvedValue(null);
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-scrap-pending',
        batchNumber: 'ASY-SCRAP-001',
        targetOutputQuantity: 10,
        status: AssemblyBatchStatus.IN_ASSEMBLY,
        components: [{ id: 'comp-1', unitRatio: 2 }]
      });
      mockPrisma.lossEvent.findMany.mockResolvedValue([
        {
          id: 'loss-1',
          lossNumber: 'LOSS-2026-00099',
          quantity: 2,
          status: 'REPORTED',
          reason: '[Scenario 3] [Assembly Batch: ASY-SCRAP-001] Operator found 2 damaged parts'
        }
      ]);

      await expect(
        service.completeBatch(
          'asy-batch-scrap-pending',
          {
            actualOutputQuantity: 8,
            scrapQuantity: 2,
            idempotencyKey: 'key-scrap-check-1',
            componentConsumptions: [{ componentId: 'comp-1', consumedQuantity: 20 }]
          },
          actorId
        )
      ).rejects.toThrow(/awaiting Store Manager approval/);
    });

    it('blocks completion when output quantity is less than supposed production quantity', async () => {
      mockAssemblyRepo.findBatchByIdempotencyKey.mockResolvedValue(null);
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-short',
        batchNumber: 'ASY-SHORT-001',
        targetOutputQuantity: 10,
        status: AssemblyBatchStatus.IN_ASSEMBLY,
        components: [{ id: 'comp-1', unitRatio: 2 }]
      });
      mockPrisma.lossEvent.findMany.mockResolvedValue([
        {
          id: 'loss-approved',
          lossNumber: 'LOSS-2026-00100',
          quantity: 2,
          status: 'APPROVED',
          replacementChallanRef: null,
          reason: '[Assembly Batch: ASY-SHORT-001] Approved scrap'
        }
      ]);

      await expect(
        service.completeBatch(
          'asy-batch-short',
          {
            actualOutputQuantity: 8,
            scrapQuantity: 2,
            idempotencyKey: 'key-scrap-check-2',
            componentConsumptions: [{ componentId: 'comp-1', consumedQuantity: 20 }]
          },
          actorId
        )
      ).rejects.toThrow(/awaiting Store Manager physical material replacement/);
    });
  });

  describe('4. QC Gate & LossEvent Rejection Routing (qcDisposition)', () => {
    it('throws MissingAssemblyQcCriteriaError when no approved QC criteria exist for ASSEMBLY checkpoint (V-009)', async () => {
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        productId: 'prod-1',
        product: { name: 'Control Panel FG' },
        productRoute: {
          id: 'route-1',
          steps: [{ id: 's2', stepName: 'Assembly Stage', qcRuleId: null }]
        },
        status: AssemblyBatchStatus.QC_PENDING
      });

      mockPrisma.qcRule.findFirst.mockResolvedValue(null);

      await expect(
        service.qcDisposition(
          'asy-batch-1',
          {
            disposition: 'PASSED_TO_FG'
          },
          actorId
        )
      ).rejects.toThrow(MissingAssemblyQcCriteriaError);
    });

    it('transitions to PASSED_TO_FG when approved criteria exist and disposition is PASS', async () => {
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        productId: 'prod-1',
        product: { name: 'Control Panel FG' },
        productRoute: {
          id: 'route-1',
          steps: [{ id: 's2', stepName: 'Assembly Stage', qcRuleId: 'qc-rule-1' }]
        },
        status: AssemblyBatchStatus.QC_PENDING
      });

      mockPrisma.qcRule.findUnique.mockResolvedValue({
        id: 'qc-rule-1',
        status: 'APPROVED'
      });

      mockAssemblyRepo.updateStatus.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.PASSED_TO_FG
      });

      const result = await service.qcDisposition(
        'asy-batch-1',
        {
          disposition: 'PASSED_TO_FG',
          inspectionNotes: 'All electrical tests passed'
        },
        actorId
      );

      expect(result.status).toBe(AssemblyBatchStatus.PASSED_TO_FG);
      expect(mockAssemblyRepo.updateStatus).toHaveBeenCalledWith(
        'asy-batch-1',
        AssemblyBatchStatus.PASSED_TO_FG,
        expect.objectContaining({ qcInspectionResultId: 'insp-1' })
      );
    });

    it('routes rejections to Module 11 LossEventService when disposition is REJECTED', async () => {
      mockAssemblyRepo.findBatchById.mockResolvedValue({
        id: 'asy-batch-1',
        batchNumber: 'ASY-001',
        productId: 'prod-1',
        actualOutputQuantity: 10,
        product: { name: 'Control Panel FG' },
        productRoute: {
          id: 'route-1',
          steps: [{ id: 's2', stepName: 'Assembly Stage', qcRuleId: 'qc-rule-1' }]
        },
        status: AssemblyBatchStatus.QC_PENDING
      });

      mockPrisma.qcRule.findUnique.mockResolvedValue({
        id: 'qc-rule-1',
        status: 'APPROVED'
      });

      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        uomId: 'uom-pcs'
      });

      mockAssemblyRepo.updateStatus.mockResolvedValue({
        id: 'asy-batch-1',
        status: AssemblyBatchStatus.REJECTED
      });

      const result = await service.qcDisposition(
        'asy-batch-1',
        {
          disposition: 'REJECTED',
          rejectionReason: 'Wiring short circuit observed during power-on'
        },
        actorId
      );

      expect(result.status).toBe(AssemblyBatchStatus.REJECTED);
      expect(mockLossEventService.report).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          quantity: 10,
          reason: expect.stringContaining('Wiring short circuit')
        }),
        actorId,
        undefined
      );
    });
  });
});
