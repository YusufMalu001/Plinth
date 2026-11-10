import { BomSimulationService } from '../services/bom-simulation.service';
import { BomCalculatorService } from '../services/bom-calculator.service';
import { BomVersionRepository, BomSimulationRepository, BomVersionWithLines } from '../repositories';
import { UomService } from '../../master-data/services/uom.service';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { NotFoundError, ForbiddenError } from '../../../common/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';

describe('BomSimulationService', () => {
  let service: BomSimulationService;
  let mockBomVersionRepo: jest.Mocked<BomVersionRepository>;
  let mockSimulationRepo: jest.Mocked<BomSimulationRepository>;
  let mockCalculator: jest.Mocked<BomCalculatorService>;
  let mockUomService: jest.Mocked<UomService>;
  let mockPermissionChecker: jest.Mocked<PermissionChecker>;
  let mockAuditWriter: jest.Mocked<AuditWriter>;

  const mockVersion = {
    id: 'bom-123',
    bomNumber: 'BOM-001',
    productId: 'prod-1',
    productVariantId: null,
    variantScopeKey: 'BASE',
    version: 1,
    status: 'APPROVED',
    effectiveDate: new Date('2026-01-01'),
    supersededById: null,
    note: 'Simulation formula',
    createdByActorId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedByActorId: null,
    submittedAt: null,
    validatedByActorId: null,
    validatedAt: null,
    approvedByActorId: null,
    approvedAt: null,
    retiredByActorId: null,
    retiredAt: null,
    product: {
      id: 'prod-1',
      sku: 'P1',
      name: 'Product 1',
      uomId: 'uom-pcs',
      description: null,
      categoryId: 'cat-1',
      departmentId: 'dept-1',
      isBatchTracked: false,
      shelfLifeDays: null,
      storageCondition: null,
      safetyStock: new Decimal(0),
      reorderPoint: new Decimal(0),
      targetStock: new Decimal(0),
      standardCost: null,
      listPrice: null,
      status: 'ACTIVE' as const,
      lifecycleStage: 'APPROVED' as const,
      version: 1,
      supersededById: null,
      approvedById: null,
      approvedAt: null,
      rejectionReason: null,
      createdByActorId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    lines: [],
    goldenExamples: [],
    simulationRuns: []
  } as unknown as BomVersionWithLines;

  beforeEach(() => {
    mockBomVersionRepo = {
      findById: jest.fn(),
      findMaxVersion: jest.fn(),
      findApprovedComponentEdges: jest.fn(),
      findActiveApprovedForProduct: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      updateHeader: jest.fn(),
      replaceLines: jest.fn()
    } as unknown as jest.Mocked<BomVersionRepository>;

    mockSimulationRepo = {
      create: jest.fn(),
      listByVersion: jest.fn()
    } as unknown as jest.Mocked<BomSimulationRepository>;

    mockCalculator = {
      computeRequirements: jest.fn(),
      checkAgainstGoldenExample: jest.fn(),
      detectCycle: jest.fn()
    } as unknown as jest.Mocked<BomCalculatorService>;

    mockUomService = {
      resolveConversionFactor: jest.fn().mockResolvedValue(new Decimal(1))
    } as unknown as jest.Mocked<UomService>;

    mockPermissionChecker = {
      can: jest.fn().mockResolvedValue(true)
    };

    mockAuditWriter = {
      record: jest.fn().mockResolvedValue(undefined)
    };

    service = new BomSimulationService(
      mockBomVersionRepo,
      mockSimulationRepo,
      mockCalculator,
      mockUomService,
      mockPermissionChecker,
      mockAuditWriter
    );
  });

  describe('simulate', () => {
    it('throws ForbiddenError when user does not have simulate permission', async () => {
      mockPermissionChecker.can.mockResolvedValue(false);

      await expect(
        service.simulate('bom-123', { requestedQuantity: 10, requestedUomId: 'uom-pcs' }, 'user-unauth')
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when BOM version does not exist', async () => {
      mockBomVersionRepo.findById.mockResolvedValue(null);

      await expect(
        service.simulate('bom-nonexistent', { requestedQuantity: 10, requestedUomId: 'uom-pcs' }, 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('computes requirements, marks isAuthoritative correctly, persists run, and writes audit log', async () => {
      mockBomVersionRepo.findById.mockResolvedValue(mockVersion);
      const computedReqs = [
        {
          bomLineId: 'line-1',
          requiredQuantity: 20,
          uomId: 'uom-kg',
          departmentId: 'dept-1',
          conversionFactorUsed: 1
        }
      ];
      mockCalculator.computeRequirements.mockResolvedValue(computedReqs);

      const createdRun = {
        id: 'sim-1',
        bomVersionId: 'bom-123',
        bomVersionNumber: 1,
        requestedQuantity: new Decimal(10),
        requestedUomId: 'uom-pcs',
        isAuthoritative: true,
        resultBreakdown: computedReqs,
        matchesGolden: null,
        runByActorId: 'user-1',
        runAt: new Date()
      };
      mockSimulationRepo.create.mockResolvedValue(createdRun);

      const result = await service.simulate(
        'bom-123',
        { requestedQuantity: 10, requestedUomId: 'uom-pcs' },
        'user-1',
        'req-123'
      );

      expect(mockCalculator.computeRequirements).toHaveBeenCalledWith(
        mockVersion,
        10,
        'uom-pcs',
        expect.any(Date),
        expect.any(Function)
      );

      expect(mockSimulationRepo.create).toHaveBeenCalledWith({
        bomVersionId: 'bom-123',
        bomVersionNumber: 1,
        requestedQuantity: 10,
        requestedUomId: 'uom-pcs',
        isAuthoritative: true, // because mockVersion.status is APPROVED
        resultBreakdown: computedReqs,
        runByActorId: 'user-1'
      });

      expect(mockAuditWriter.record).toHaveBeenCalledWith({
        actorId: 'user-1',
        action: 'bom.simulate',
        entityType: 'BomVersion',
        entityId: 'bom-123',
        after: createdRun,
        metadata: { requestedQuantity: 10, requestedUomId: 'uom-pcs' },
        requestId: 'req-123'
      });

      expect(result.simulation).toEqual(createdRun);
      expect(result.requirements).toEqual(computedReqs);
    });

    it('sets isAuthoritative to false when simulating a DRAFT BOM version', async () => {
      const draftVersion = { ...mockVersion, status: 'DRAFT' as const };
      mockBomVersionRepo.findById.mockResolvedValue(draftVersion);
      mockCalculator.computeRequirements.mockResolvedValue([]);
      mockSimulationRepo.create.mockImplementation(async (data: any) => ({
        id: 'sim-2',
        ...data,
        requestedQuantity: new Decimal(data.requestedQuantity),
        matchesGolden: null,
        runAt: new Date()
      }));

      await service.simulate('bom-123', { requestedQuantity: 5, requestedUomId: 'uom-pcs' }, 'user-1');

      expect(mockSimulationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthoritative: false })
      );
    });
  });

  describe('listByVersion', () => {
    it('delegates to simulation repository', async () => {
      const runs = [
        {
          id: 'sim-1',
          bomVersionId: 'bom-123',
          bomVersionNumber: 1,
          requestedQuantity: new Decimal(10),
          requestedUomId: 'uom-pcs',
          isAuthoritative: true,
          resultBreakdown: [],
          matchesGolden: null,
          runByActorId: 'user-1',
          runAt: new Date(),
          requestedUom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces' } as any,
          runByActor: { id: 'user-1', name: 'Alice' } as any
        }
      ];
      mockSimulationRepo.listByVersion.mockResolvedValue(runs as any);

      const res = await service.listByVersion('bom-123');
      expect(res).toEqual(runs);
      expect(mockSimulationRepo.listByVersion).toHaveBeenCalledWith('bom-123');
    });
  });
});
