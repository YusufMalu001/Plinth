import { BomCalculatorService, ResolveFactorFn } from '../services/bom-calculator.service';
import { CircularDependencyError, MaxBomDepthExceededError } from '../../../common/errors/AppError';
import { BomVersionWithLines } from '../repositories';
import { Decimal } from '@prisma/client/runtime/library';

describe('BomCalculatorService', () => {
  let calculator: BomCalculatorService;
  const mockResolveFactor: ResolveFactorFn = jest.fn(async (fromUomId: string, toUomId: string) => {
    if (fromUomId === toUomId) return 1;
    // Example: 1 BOX = 10 PCS, 1 KG = 1000 G
    if (fromUomId === 'uom-box' && toUomId === 'uom-pcs') return 10;
    if (fromUomId === 'uom-kg' && toUomId === 'uom-g') return 1000;
    if (fromUomId === 'uom-g' && toUomId === 'uom-kg') return 0.001;
    return 1;
  });

  beforeEach(() => {
    calculator = new BomCalculatorService();
    jest.clearAllMocks();
  });

  describe('computeRequirements', () => {
    const mockVersion = {
      id: 'bom-v1',
      bomNumber: 'BOM-001',
      productId: 'prod-finished',
      productVariantId: null,
      variantScopeKey: 'BASE',
      version: 1,
      status: 'APPROVED',
      effectiveDate: new Date('2026-01-01'),
      supersededById: null,
      note: 'Standard formula',
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
        id: 'prod-finished',
        sku: 'FINISHED-01',
        name: 'Finished Product',
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
        status: 'ACTIVE',
        lifecycleStage: 'APPROVED',
        version: 1,
        supersededById: null,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        createdByActorId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      lines: [
        {
          id: 'line-1',
          bomVersionId: 'bom-v1',
          lineType: 'COMPONENT',
          materialId: 'mat-flour',
          componentProductId: null,
          uomId: 'uom-kg',
          quantityMode: 'SCALED',
          quantity: new Decimal(0.5), // 0.5 kg per finished unit
          roundingRule: 'NONE',
          roundingPrecision: null,
          departmentId: 'dept-mixing',
          sequence: 1,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'line-2',
          bomVersionId: 'bom-v1',
          lineType: 'PACKAGING',
          materialId: 'mat-box',
          componentProductId: null,
          uomId: 'uom-pcs',
          quantityMode: 'FIXED',
          quantity: new Decimal(1), // 1 setup carton fixed
          roundingRule: 'NONE',
          roundingPrecision: null,
          departmentId: 'dept-pack',
          sequence: 2,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'line-3',
          bomVersionId: 'bom-v1',
          lineType: 'COMPONENT',
          materialId: 'mat-oil',
          componentProductId: null,
          uomId: 'uom-kg',
          quantityMode: 'SCALED',
          quantity: new Decimal(0.12345),
          roundingRule: 'ROUND_UP',
          roundingPrecision: 2,
          departmentId: 'dept-mixing',
          sequence: 3,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      goldenExamples: [],
      simulationRuns: []
    } as unknown as BomVersionWithLines;

    it('calculates scaled and fixed requirements accurately for same UOM', async () => {
      const results = await calculator.computeRequirements(
        mockVersion,
        100, // 100 PCS requested
        'uom-pcs',
        new Date(),
        mockResolveFactor
      );

      expect(results).toHaveLength(3);

      // Line 1: Scaled 0.5 * 100 = 50 kg
      expect(results[0]).toEqual({
        bomLineId: 'line-1',
        requiredQuantity: 50,
        uomId: 'uom-kg',
        departmentId: 'dept-mixing',
        conversionFactorUsed: 1
      });

      // Line 2: Fixed 1
      expect(results[1]).toEqual({
        bomLineId: 'line-2',
        requiredQuantity: 1,
        uomId: 'uom-pcs',
        departmentId: 'dept-pack',
        conversionFactorUsed: 1
      });

      // Line 3: Scaled 0.12345 * 100 = 12.345 -> ROUND_UP to 2 decimals = 12.35
      expect(results[2]).toEqual({
        bomLineId: 'line-3',
        requiredQuantity: 12.35,
        uomId: 'uom-kg',
        departmentId: 'dept-mixing',
        conversionFactorUsed: 1
      });
    });

    it('normalizes requested quantity using UOM conversion factor', async () => {
      // Requested 5 BOX, where 1 BOX = 10 PCS (base UOM) -> 50 normalized PCS
      const results = await calculator.computeRequirements(
        mockVersion,
        5,
        'uom-box',
        new Date(),
        mockResolveFactor
      );

      expect(mockResolveFactor).toHaveBeenCalledWith('uom-box', 'uom-pcs', expect.any(Date));
      // Line 1: Scaled 0.5 * 50 = 25 kg
      expect(results[0].requiredQuantity).toBe(25);
      expect(results[0].conversionFactorUsed).toBe(10);
    });

    it('correctly applies rounding rules (ROUND_UP, ROUND_DOWN, ROUND_NEAREST, NONE)', async () => {
      const testCases = [
        { rule: 'ROUND_UP' as const, precision: 1, raw: 10.12, expected: 10.2 },
        { rule: 'ROUND_DOWN' as const, precision: 1, raw: 10.18, expected: 10.1 },
        { rule: 'ROUND_NEAREST' as const, precision: 1, raw: 10.15, expected: 10.2 },
        { rule: 'ROUND_NEAREST' as const, precision: 1, raw: 10.14, expected: 10.1 },
        { rule: 'NONE' as const, precision: null, raw: 10.123456, expected: 10.123456 }
      ];

      for (const tc of testCases) {
        const customVersion: BomVersionWithLines = {
          ...mockVersion,
          lines: [
            {
              ...mockVersion.lines[0],
              quantity: new Decimal(tc.raw),
              roundingRule: tc.rule,
              roundingPrecision: tc.precision
            }
          ]
        };

        const res = await calculator.computeRequirements(
          customVersion,
          1,
          'uom-pcs',
          new Date(),
          mockResolveFactor
        );

        expect(res[0].requiredQuantity).toBe(tc.expected);
      }
    });
  });

  describe('checkAgainstGoldenExample', () => {
    const mockVersion = {
      id: 'bom-v1',
      bomNumber: 'BOM-001',
      productId: 'prod-1',
      productVariantId: null,
      variantScopeKey: 'BASE',
      version: 1,
      status: 'APPROVED',
      effectiveDate: new Date('2026-01-01'),
      supersededById: null,
      note: 'Test formula',
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
        name: 'P1',
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
        status: 'ACTIVE',
        lifecycleStage: 'APPROVED',
        version: 1,
        supersededById: null,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        createdByActorId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      lines: [
        {
          id: 'line-1',
          bomVersionId: 'bom-v1',
          lineType: 'COMPONENT',
          materialId: 'mat-1',
          componentProductId: null,
          uomId: 'uom-kg',
          quantityMode: 'SCALED',
          quantity: new Decimal(2.5),
          roundingRule: 'NONE',
          roundingPrecision: null,
          departmentId: null,
          sequence: 1,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      goldenExamples: [],
      simulationRuns: []
    } as unknown as BomVersionWithLines;

    it('returns matches: true when computed requirements match exactly', async () => {
      const example = {
        inputQuantity: 10,
        inputUomId: 'uom-pcs',
        expectedResults: [
          { bomLineId: 'line-1', expectedQuantity: 25, uomId: 'uom-kg' }
        ]
      };

      const check = await calculator.checkAgainstGoldenExample(
        mockVersion,
        example,
        new Date(),
        mockResolveFactor
      );

      expect(check.matches).toBe(true);
      expect(check.mismatches).toHaveLength(0);
    });

    it('returns matches: false and lists mismatches when requirements deviate', async () => {
      const example = {
        inputQuantity: 10,
        inputUomId: 'uom-pcs',
        expectedResults: [
          { bomLineId: 'line-1', expectedQuantity: 30, uomId: 'uom-kg' } // Expected 30 but formula produces 25
        ]
      };

      const check = await calculator.checkAgainstGoldenExample(
        mockVersion,
        example,
        new Date(),
        mockResolveFactor
      );

      expect(check.matches).toBe(false);
      expect(check.mismatches).toEqual([
        { bomLineId: 'line-1', expected: 30, actual: 25 }
      ]);
    });
  });

  describe('detectCycle', () => {
    it('throws CircularDependencyError on immediate self-reference', () => {
      expect(() => {
        calculator.detectCycle('prod-A', 'prod-A', []);
      }).toThrow(CircularDependencyError);
    });

    it('throws CircularDependencyError on direct or indirect cycles', () => {
      // Graph: A -> B -> C -> A
      const edges = [
        { productId: 'prod-B', componentProductId: 'prod-C' },
        { productId: 'prod-C', componentProductId: 'prod-A' }
      ];

      expect(() => {
        calculator.detectCycle('prod-A', 'prod-B', edges);
      }).toThrow(CircularDependencyError);
    });

    it('allows valid acyclic tree and diamond dependencies without throwing', () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      const edges = [
        { productId: 'prod-B', componentProductId: 'prod-D' },
        { productId: 'prod-C', componentProductId: 'prod-D' }
      ];

      expect(() => {
        calculator.detectCycle('prod-A', 'prod-B', edges);
        calculator.detectCycle('prod-A', 'prod-C', edges);
      }).not.toThrow();
    });

    it('throws MaxBomDepthExceededError when recursion depth exceeds threshold', () => {
      // Create a deep chain A -> B -> C -> D -> ...
      const edges: Array<{ productId: string; componentProductId: string }> = [];
      for (let i = 1; i <= 25; i++) {
        edges.push({ productId: `p-${i}`, componentProductId: `p-${i + 1}` });
      }

      expect(() => {
        calculator.detectCycle('p-0', 'p-1', edges, 20);
      }).toThrow(MaxBomDepthExceededError);
    });
  });
});
