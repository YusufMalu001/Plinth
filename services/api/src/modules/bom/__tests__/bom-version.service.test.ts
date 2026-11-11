import { BomVersionService } from '../services/bom-version.service';
import { BomCalculatorService } from '../services/bom-calculator.service';
import { BomVersionRepository, BomGoldenExampleRepository, BomVersionWithLines } from '../repositories';
import { UomService } from '../../master-data/services/uom.service';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';
import { Decimal } from '@prisma/client/runtime/library';

jest.mock('../../../database', () => ({
  prisma: {
    bomVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn()
    },
    product: {
      findUnique: jest.fn()
    },
    productVariant: {
      findUnique: jest.fn()
    },
    material: {
      findUnique: jest.fn()
    },
    unitOfMeasure: {
      findUnique: jest.fn()
    },
    department: {
      findUnique: jest.fn()
    },
     auditLog: {
       findMany: jest.fn()
     },
     user: {
       findMany: jest.fn().mockResolvedValue([]),
       findUnique: jest.fn().mockResolvedValue(null)
     },
     notification: {
       create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
       createMany: jest.fn().mockResolvedValue({ count: 1 })
     },
    $transaction: jest.fn(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    })
  }
}));

describe('BomVersionService', () => {
  let service: BomVersionService;
  let mockBomVersionRepo: jest.Mocked<BomVersionRepository>;
  let mockGoldenExampleRepo: jest.Mocked<BomGoldenExampleRepository>;
  let mockCalculator: jest.Mocked<BomCalculatorService>;
  let mockUomService: jest.Mocked<UomService>;
  let mockPermissionChecker: jest.Mocked<PermissionChecker>;
  let mockAuditWriter: jest.Mocked<AuditWriter>;

  const mockProduct = {
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
  };

  const createMockBomVersion = (overrides: Record<string, any> = {}): BomVersionWithLines => ({
    id: 'bom-v1',
    bomNumber: 'BOM-001',
    productId: 'prod-1',
    productVariantId: null,
    variantScopeKey: 'BASE',
    version: 1,
    status: 'DRAFT',
    effectiveDate: null,
    supersededById: null,
    note: 'Initial draft',
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
    product: mockProduct,
    lines: [
      {
        id: 'line-1',
        bomVersionId: 'bom-v1',
        lineType: 'COMPONENT',
        materialId: 'mat-1',
        componentProductId: null,
        uomId: 'uom-kg',
        quantityMode: 'SCALED',
        quantity: new Decimal(2),
        roundingRule: 'NONE',
        roundingPrecision: null,
        departmentId: 'dept-1',
        sequence: 1,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    goldenExamples: [],
    simulationRuns: [],
    ...overrides
  } as unknown as BomVersionWithLines);

  beforeEach(() => {
    jest.clearAllMocks();

    mockBomVersionRepo = {
      findById: jest.fn(),
      findMaxVersion: jest.fn().mockResolvedValue(0),
      findApprovedComponentEdges: jest.fn().mockResolvedValue([]),
      findCurrentApproved: jest.fn(),
      findLiveApprovedVersion: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      updateHeader: jest.fn(),
      replaceLines: jest.fn(),
      updateStatusConditional: jest.fn().mockResolvedValue(1),
      countByNumberPrefix: jest.fn().mockResolvedValue(0),
      existsByBomNumber: jest.fn().mockResolvedValue(false),
      existsByBomNumberForParent: jest.fn().mockResolvedValue(false)
    } as unknown as jest.Mocked<BomVersionRepository>;

    mockGoldenExampleRepo = {
      create: jest.fn(),
      listByVersion: jest.fn()
    } as unknown as jest.Mocked<BomGoldenExampleRepository>;

    mockCalculator = {
      computeRequirements: jest.fn().mockResolvedValue([]),
      checkAgainstGoldenExample: jest.fn().mockResolvedValue({ matches: true, mismatches: [] }),
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

    service = new BomVersionService(
      mockBomVersionRepo,
      mockGoldenExampleRepo,
      mockCalculator,
      mockUomService,
      mockPermissionChecker,
      mockAuditWriter
    );

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
    (prisma.material.findUnique as jest.Mock).mockResolvedValue({ id: 'mat-1', status: 'ACTIVE', lifecycleStage: 'APPROVED' });
    (prisma.unitOfMeasure.findUnique as jest.Mock).mockResolvedValue({ id: 'uom-kg', status: 'ACTIVE', lifecycleStage: 'APPROVED' });
    (prisma.department.findUnique as jest.Mock).mockResolvedValue({ id: 'dept-1', status: 'ACTIVE' });
  });

  describe('createDraft', () => {
    it('rejects a name already used by another BOM', async () => {
      mockBomVersionRepo.existsByBomNumber.mockResolvedValue(true);
      await expect(service.createDraft({ productId: 'prod-1', bomNumber: 'Taken Name', lines: [] }, 'user-1'))
        .rejects.toThrow(ValidationError);
      expect(mockBomVersionRepo.existsByBomNumber).toHaveBeenCalledWith('Taken Name');
      expect(mockBomVersionRepo.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError if actor lacks create permission', async () => {
      mockPermissionChecker.can.mockResolvedValue(false);

      await expect(
        service.createDraft({ productId: 'prod-1' }, 'user-unauth')
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError if product does not exist', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createDraft({ productId: 'prod-none' }, 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('creates a new draft and records audit log', async () => {
      const mockCreated = createMockBomVersion({ version: 1 });
      mockBomVersionRepo.create.mockResolvedValue(mockCreated);

      const result = await service.createDraft({ productId: 'prod-1', note: 'New formula' }, 'user-1');

      expect(mockBomVersionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          version: 1,
          note: 'New formula',
          createdByActorId: 'user-1',
          lines: []
        })
      );
      expect(mockAuditWriter.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bom.create_draft',
          entityType: 'BomVersion',
          entityId: mockCreated.id
        })
      );
      expect(result).toEqual(mockCreated);
    });

    it('clones lines from existing version when copyFromVersionId is provided', async () => {
      const sourceVersion = createMockBomVersion({ id: 'bom-source' });
      mockBomVersionRepo.findById.mockResolvedValue(sourceVersion);
      mockBomVersionRepo.findMaxVersion.mockResolvedValue(1);

      const newVersion = createMockBomVersion({ id: 'bom-v2', version: 2 });
      mockBomVersionRepo.create.mockResolvedValue(newVersion);

      await service.createDraft({ productId: 'prod-1', copyFromVersionId: 'bom-source' }, 'user-1');

      expect(mockBomVersionRepo.findById).toHaveBeenCalledWith('bom-source');
      expect(mockBomVersionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          lines: [
            expect.objectContaining({
              lineType: 'COMPONENT',
              materialId: 'mat-1',
              quantity: 2
            })
          ]
        })
      );
    });

    it('inherits productVariantId when updateVersionId targets a variant-scoped BOM without explicit variantId', async () => {
      const sourceVersion = createMockBomVersion({
        id: 'bom-variant-1',
        productId: 'prod-1',
        productVariantId: 'var-123',
        bomNumber: 'CUSTOM-BOM-1'
      });
      mockBomVersionRepo.findById.mockResolvedValue(sourceVersion);
      mockBomVersionRepo.findMaxVersion.mockResolvedValue(1);
      mockBomVersionRepo.existsByBomNumber.mockResolvedValue(false);

      const newVersion = createMockBomVersion({
        id: 'bom-v2',
        productId: 'prod-1',
        productVariantId: 'var-123',
        version: 2
      });
      mockBomVersionRepo.create.mockResolvedValue(newVersion);

      const result = await service.createDraft(
        {
          productId: 'prod-1',
          updateVersionId: 'bom-variant-1',
          bomNumber: 'CUSTOM-BOM-2',
          lines: []
        },
        'user-1'
      );

      expect(mockBomVersionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          productVariantId: 'var-123',
          version: 2
        })
      );
      expect(result).toEqual(newVersion);
    });
  });

  describe('updateDraft', () => {
    it('rejects a name belonging to another BOM, even when editing an existing record', async () => {
      mockBomVersionRepo.findById.mockResolvedValue(createMockBomVersion());
      mockBomVersionRepo.existsByBomNumber.mockResolvedValue(true);

      await expect(service.updateDraft('bom-v1', { bomNumber: 'Taken Name' }, 'user-1'))
        .rejects.toThrow(ValidationError);
      expect(mockBomVersionRepo.existsByBomNumber).toHaveBeenCalledWith('Taken Name', 'bom-v1');
      expect(mockBomVersionRepo.updateHeader).not.toHaveBeenCalled();
    });

    it('throws InvalidStateTransitionError if BOM is in RETIRED status', async () => {
      const retiredVersion = createMockBomVersion({ status: 'RETIRED' });
      mockBomVersionRepo.findById.mockResolvedValue(retiredVersion);

      await expect(
        service.updateDraft('bom-v1', { note: 'Edit' }, 'user-1')
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('validates lines for cycle and material/product reference exclusivity', async () => {
      const draftVersion = createMockBomVersion();
      mockBomVersionRepo.findById.mockResolvedValue(draftVersion);

      // Invalid line: both materialId and componentProductId provided
      await expect(
        service.updateDraft(
          'bom-v1',
          {
            lines: [
              {
                lineType: 'COMPONENT',
                materialId: 'mat-1',
                componentProductId: 'prod-2',
                uomId: 'uom-kg',
                quantityMode: 'SCALED',
                quantity: 1
              }
            ]
          },
          'user-1'
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('validate', () => {
    it('throws ValidationError if BOM has no COMPONENT lines', async () => {
      const versionWithoutComponents = createMockBomVersion({
        lines: [
          {
            id: 'line-pkg',
            bomVersionId: 'bom-v1',
            lineType: 'PACKAGING',
            materialId: 'mat-box',
            componentProductId: null,
            uomId: 'uom-pcs',
            quantityMode: 'FIXED',
            quantity: new Decimal(1),
            roundingRule: 'NONE',
            roundingPrecision: null,
            departmentId: null,
            sequence: 1,
            note: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });
      mockBomVersionRepo.findById.mockResolvedValue(versionWithoutComponents);

      await expect(service.validate('bom-v1', 'user-1')).rejects.toThrow(
        /at least one COMPONENT line/
      );
    });

    it('allows validation when a BOM has no optional golden examples', async () => {
      const version = createMockBomVersion({ goldenExamples: [] });
      mockBomVersionRepo.findById.mockResolvedValue(version);

      await expect(service.validate('bom-v1', 'user-1')).resolves.toBeDefined();
    });

    it('throws ValidationError if golden example calculations fail to reproduce', async () => {
      const version = createMockBomVersion({
        goldenExamples: [
          {
            id: 'ge-1',
            bomVersionId: 'bom-v1',
            label: 'Test 10 units',
            inputQuantity: new Decimal(10),
            inputUomId: 'uom-pcs',
            expectedResults: [{ bomLineId: 'line-1', expectedQuantity: 20, uomId: 'uom-kg' }] as any,
            sourceReference: null,
            createdByActorId: 'user-1',
            createdAt: new Date()
          }
        ]
      });
      mockBomVersionRepo.findById.mockResolvedValue(version);
      mockCalculator.checkAgainstGoldenExample.mockResolvedValue({
        matches: false,
        mismatches: [{ bomLineId: 'line-1', expected: 20, actual: 15 }]
      });

      await expect(service.validate('bom-v1', 'user-1')).rejects.toThrow(
        /does not reproduce every linked golden example/
      );
    });

    it('transitions status from DRAFT to VALIDATION_PENDING when valid', async () => {
      const version = createMockBomVersion({
        goldenExamples: [
          {
            id: 'ge-1',
            bomVersionId: 'bom-v1',
            label: 'Test 10 units',
            inputQuantity: new Decimal(10),
            inputUomId: 'uom-pcs',
            expectedResults: [{ bomLineId: 'line-1', expectedQuantity: 20, uomId: 'uom-kg' }] as any,
            sourceReference: null,
            createdByActorId: 'user-1',
            createdAt: new Date()
          }
        ]
      });
      const pendingVersion = { ...version, status: 'VALIDATION_PENDING' as const };
      mockBomVersionRepo.findById
        .mockResolvedValueOnce(version)
        .mockResolvedValueOnce(pendingVersion);
      mockCalculator.checkAgainstGoldenExample.mockResolvedValue({ matches: true, mismatches: [] });

      const res = await service.validate('bom-v1', 'user-1');

      expect(mockBomVersionRepo.updateStatusConditional).toHaveBeenCalledWith(
        'bom-v1',
        ['DRAFT'],
        'VALIDATION_PENDING',
        expect.any(Object)
      );
      expect(res.status).toBe('VALIDATION_PENDING');
    });
  });

  describe('approve', () => {
    it('throws InvalidStateTransitionError if BOM is not in VALIDATION_PENDING status', async () => {
      const draftVersion = createMockBomVersion({ status: 'DRAFT' });
      mockBomVersionRepo.findById.mockResolvedValue(draftVersion);

      await expect(service.approve('bom-v1', 'user-1')).rejects.toThrow(
        InvalidStateTransitionError
      );
    });

    it('approves version and supersedes prior approved version', async () => {
      const validPendingVersion = createMockBomVersion({
        status: 'VALIDATION_PENDING',
        goldenExamples: [
          {
            id: 'ge-1',
            bomVersionId: 'bom-v1',
            label: 'Golden test',
            inputQuantity: new Decimal(1),
            inputUomId: 'uom-pcs',
            expectedResults: [{ bomLineId: 'line-1', expectedQuantity: 2, uomId: 'uom-kg' }] as any,
            sourceReference: null,
            createdByActorId: 'user-1',
            createdAt: new Date()
          }
        ]
      });

      const approvedVersion = { ...validPendingVersion, status: 'APPROVED' as const };
      mockBomVersionRepo.findById
        .mockResolvedValueOnce(validPendingVersion)
        .mockResolvedValue(approvedVersion);

      (prisma.bomVersion.findUnique as jest.Mock).mockResolvedValue(approvedVersion);

      const priorApproved = createMockBomVersion({ id: 'bom-v0', status: 'APPROVED' });
      mockBomVersionRepo.findCurrentApproved.mockResolvedValue(priorApproved);

      const res = await service.approve('bom-v1', 'user-1');
      expect(res.status).toBe('APPROVED');
    });
  });

  describe('supersede', () => {
    it('marks version as SUPERSEDED when replacementVersionId is provided', async () => {
      const approved = createMockBomVersion({ status: 'APPROVED' });
      const replacement = createMockBomVersion({ id: 'bom-v2', version: 2, status: 'APPROVED' });
      const superseded = { ...approved, status: 'SUPERSEDED' as const, supersededById: 'bom-v2' };

      mockBomVersionRepo.findById
        .mockResolvedValueOnce(approved)
        .mockResolvedValueOnce(replacement)
        .mockResolvedValueOnce(superseded);

      const res = await service.supersede('bom-v1', { replacementVersionId: 'bom-v2' }, 'user-1');

      expect(mockBomVersionRepo.updateStatusConditional).toHaveBeenCalledWith(
        'bom-v1',
        ['APPROVED'],
        'SUPERSEDED',
        { supersededById: 'bom-v2' }
      );
      expect(res.status).toBe('SUPERSEDED');
    });

    it('marks version as RETIRED when no replacementVersionId is provided', async () => {
      const approved = createMockBomVersion({ status: 'APPROVED' });
      const retired = { ...approved, status: 'RETIRED' as const };

      mockBomVersionRepo.findById
        .mockResolvedValueOnce(approved)
        .mockResolvedValueOnce(retired);

      const res = await service.supersede('bom-v1', {}, 'user-1');

      expect(mockBomVersionRepo.updateStatusConditional).toHaveBeenCalledWith(
        'bom-v1',
        ['APPROVED'],
        'RETIRED',
        expect.objectContaining({ retiredByActorId: 'user-1' })
      );
      expect(res.status).toBe('RETIRED');
    });
  });

  describe('compareVersions', () => {
    it('calculates added, removed, and changed lines between two versions', async () => {
      const v1 = createMockBomVersion({
        id: 'v1',
        lines: [
          {
            id: 'l1',
            bomVersionId: 'v1',
            lineType: 'COMPONENT',
            materialId: 'mat-1',
            componentProductId: null,
            uomId: 'uom-kg',
            quantityMode: 'SCALED',
            quantity: new Decimal(2),
            roundingRule: 'NONE',
            roundingPrecision: null,
            departmentId: null,
            sequence: 1,
            note: null,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: 'l2',
            bomVersionId: 'v1',
            lineType: 'COMPONENT',
            materialId: 'mat-removed',
            componentProductId: null,
            uomId: 'uom-kg',
            quantityMode: 'SCALED',
            quantity: new Decimal(1),
            roundingRule: 'NONE',
            roundingPrecision: null,
            departmentId: null,
            sequence: 2,
            note: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const v2 = createMockBomVersion({
        id: 'v2',
        version: 2,
        lines: [
          {
            id: 'l1-new',
            bomVersionId: 'v2',
            lineType: 'COMPONENT',
            materialId: 'mat-1',
            componentProductId: null,
            uomId: 'uom-kg',
            quantityMode: 'SCALED',
            quantity: new Decimal(3), // Changed quantity 2 -> 3
            roundingRule: 'NONE',
            roundingPrecision: null,
            departmentId: null,
            sequence: 1,
            note: null,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: 'l3',
            bomVersionId: 'v2',
            lineType: 'COMPONENT',
            materialId: 'mat-added',
            componentProductId: null,
            uomId: 'uom-kg',
            quantityMode: 'SCALED',
            quantity: new Decimal(0.5),
            roundingRule: 'NONE',
            roundingPrecision: null,
            departmentId: null,
            sequence: 3,
            note: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      mockBomVersionRepo.findById
        .mockResolvedValueOnce(v1)
        .mockResolvedValueOnce(v2);

      const diff = await service.compareVersions('v1', 'v2');

      expect(diff.added).toHaveLength(1);
      expect((diff.added[0] as any).materialId).toBe('mat-added');

      expect(diff.removed).toHaveLength(1);
      expect((diff.removed[0] as any).materialId).toBe('mat-removed');

      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0].componentKey).toBe('MATERIAL:mat-1');
    });
  });

  describe('calculateRequirements', () => {
    it('throws InvalidStateTransitionError if no approved BOM is effective as of given date', async () => {
      mockBomVersionRepo.findLiveApprovedVersion.mockResolvedValue(null);

      await expect(
        service.calculateRequirements({ productId: 'prod-1', requestedQuantity: 10, requestedUomId: 'uom-pcs' }, 'user-1')
      ).rejects.toThrow(/No approved BOM is effective/);
    });

    it('computes requirements on the live approved version', async () => {
      const approvedVersion = createMockBomVersion({ status: 'APPROVED' });
      mockBomVersionRepo.findLiveApprovedVersion.mockResolvedValue(approvedVersion);
      mockCalculator.computeRequirements.mockResolvedValue([
        {
          bomLineId: 'line-1',
          requiredQuantity: 20,
          uomId: 'uom-kg',
          departmentId: 'dept-1',
          conversionFactorUsed: 1
        }
      ]);

      const res = await service.calculateRequirements(
        { productId: 'prod-1', requestedQuantity: 10, requestedUomId: 'uom-pcs' },
        'user-1'
      );

      expect(res.bomVersion).toEqual(approvedVersion);
      expect(res.requirements).toHaveLength(1);
      expect(res.requirements[0].requiredQuantity).toBe(20);
    });
  });
});
