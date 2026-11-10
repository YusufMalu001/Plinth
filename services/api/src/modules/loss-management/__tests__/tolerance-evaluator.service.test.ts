import { ToleranceEvaluatorService, MissingWastageRuleError } from '../services/tolerance-evaluator.service';
import { PrismaClient, WastageRule, LifecycleStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('Module 11 — ToleranceEvaluatorService Tests', () => {
  let evaluator: ToleranceEvaluatorService;
  let mockPrisma: any;

  const mockApprovedRule: WastageRule = {
    id: 'wrule-101',
    code: 'WR-RAW-WOOD-01',
    name: 'Teak Wood Cutting Wastage',
    materialId: 'mat-wood-1',
    workCenterId: 'wc-cutting-1',
    standardWastagePct: new Decimal(5.0),
    tolerancePct: new Decimal(2.0),
    version: 1,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: LifecycleStatus.APPROVED,
    deactivatedAt: null,
    supersededById: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  };

  beforeEach(() => {
    mockPrisma = {
      wastageRule: {
        findMany: jest.fn(),
        findFirst: jest.fn()
      }
    };
    evaluator = new ToleranceEvaluatorService(mockPrisma as unknown as PrismaClient);
  });

  describe('Rule Resolution', () => {
    it('resolves the effective approved WastageRule version for a material and work center', async () => {
      mockPrisma.wastageRule.findMany.mockResolvedValue([mockApprovedRule]);

      const resolved = await evaluator.resolveWastageRule({
        materialId: 'mat-wood-1',
        workCenterId: 'wc-cutting-1',
        asOfDate: new Date('2026-03-01')
      });

      expect(resolved.id).toBe('wrule-101');
      expect(mockPrisma.wastageRule.findMany).toHaveBeenCalled();
    });

    it('falls back to material-only approved rule if combined material+workcenter rule is not found', async () => {
      mockPrisma.wastageRule.findMany.mockResolvedValue([]);
      mockPrisma.wastageRule.findFirst.mockResolvedValue(mockApprovedRule);

      const resolved = await evaluator.resolveWastageRule({
        materialId: 'mat-wood-1',
        workCenterId: 'wc-other-1',
        asOfDate: new Date('2026-03-01')
      });

      expect(resolved.id).toBe('wrule-101');
    });

    it('strictly blocks classification with MissingWastageRuleError (no default tolerance assumption) when no approved rule exists', async () => {
      mockPrisma.wastageRule.findMany.mockResolvedValue([]);
      mockPrisma.wastageRule.findFirst.mockResolvedValue(null);

      await expect(
        evaluator.resolveWastageRule({
          materialId: 'mat-unknown-99',
          asOfDate: new Date('2026-03-01')
        })
      ).rejects.toThrow(MissingWastageRuleError);

      await expect(
        evaluator.resolveWastageRule({
          materialId: 'mat-unknown-99',
          asOfDate: new Date('2026-03-01')
        })
      ).rejects.toThrow(/No approved WastageRule version found for material \[mat-unknown-99\]/);
    });

    it('throws MissingWastageRuleError if neither materialId nor workCenterId is provided', async () => {
      await expect(
        evaluator.resolveWastageRule({ asOfDate: new Date() })
      ).rejects.toThrow(MissingWastageRuleError);
    });
  });

  describe('Tolerance Evaluation Calculation', () => {
    // Rule: standard = 5%, tolerance = 2% (threshold = 7%)
    // Basis quantity = 100
    it('classifies loss as WITHIN_TOLERANCE when loss is below or equal to allowed standard + tolerance', () => {
      // 6 units on 100 basis (standard 5 + tolerance 2 = 7 allowed) -> 6 <= 7 -> WITHIN_TOLERANCE
      const result = evaluator.evaluate(6.0, 100.0, mockApprovedRule);

      expect(result.classification).toBe('WITHIN_TOLERANCE');
      expect(result.allowedWastageQty).toBeCloseTo(7.0);
      expect(result.actualWastageQty).toBe(6.0);
      expect(result.varianceFromExpected).toBeCloseTo(1.0); // 6 - 5 = 1
    });

    it('classifies loss at the exact tolerance boundary as WITHIN_TOLERANCE', () => {
      // 7 units on 100 basis -> 7 <= 7 -> WITHIN_TOLERANCE
      const result = evaluator.evaluate(7.0, 100.0, mockApprovedRule);

      expect(result.classification).toBe('WITHIN_TOLERANCE');
      expect(result.varianceFromExpected).toBeCloseTo(2.0); // 7 - 5 = 2
    });

    it('classifies loss as ABNORMAL when loss strictly exceeds allowed threshold', () => {
      // 8 units on 100 basis -> 8 > 7 -> ABNORMAL
      const result = evaluator.evaluate(8.0, 100.0, mockApprovedRule);

      expect(result.classification).toBe('ABNORMAL');
      expect(result.varianceFromExpected).toBeCloseTo(3.0); // 8 - 5 = 3
    });

    it('handles zero basis quantity by falling back safely to actual loss quantity', () => {
      const result = evaluator.evaluate(10.0, 0, mockApprovedRule);

      // Basis becomes 10.0: expected = 0.5, allowed = 0.7 -> 10 > 0.7 -> ABNORMAL
      expect(result.classification).toBe('ABNORMAL');
      expect(result.actualWastageQty).toBe(10.0);
    });
  });
});
