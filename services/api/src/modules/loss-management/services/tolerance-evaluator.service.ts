import { PrismaClient, WastageRule } from '@prisma/client';
import { AppError } from '../../../common/errors/AppError';

export class MissingWastageRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'MISSING_WASTAGE_RULE', details);
  }
}

export interface ToleranceEvaluationResult {
  rule: WastageRule;
  standardWastagePct: number;
  tolerancePct: number;
  allowedWastageQty: number;
  actualWastageQty: number;
  varianceFromExpected: number;
  classification: 'WITHIN_TOLERANCE' | 'ABNORMAL';
}

export class ToleranceEvaluatorService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolves the effective, approved WastageRule version for a material / work center.
   * If no approved WastageRule exists for the material/work center as of the evaluation date,
   * this strictly throws MissingWastageRuleError. No default tolerance assumption is ever made.
   */
  async resolveWastageRule(params: {
    materialId?: string | null;
    workCenterId?: string | null;
    asOfDate?: Date;
  }): Promise<WastageRule> {
    const asOf = params.asOfDate ?? new Date();

    if (!params.materialId && !params.workCenterId) {
      throw new MissingWastageRuleError(
        'Cannot resolve WastageRule: neither materialId nor workCenterId was provided.'
      );
    }

    // Lookup approved WastageRule matching material and/or workCenter
    const candidates = await this.prisma.wastageRule.findMany({
      where: {
        status: 'APPROVED',
        effectiveFrom: { lte: asOf },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: asOf } }
        ],
        AND: [
          params.materialId ? { materialId: params.materialId } : {},
          params.workCenterId ? { workCenterId: params.workCenterId } : {}
        ]
      },
      orderBy: [
        { version: 'desc' },
        { effectiveFrom: 'desc' }
      ]
    });

    if (candidates.length === 0) {
      // If combined search returned none, check by material alone if workCenterId was also provided
      if (params.materialId && params.workCenterId) {
        const materialOnlyCandidate = await this.prisma.wastageRule.findFirst({
          where: {
            materialId: params.materialId,
            status: 'APPROVED',
            effectiveFrom: { lte: asOf },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: asOf } }
            ]
          },
          orderBy: [
            { version: 'desc' },
            { effectiveFrom: 'desc' }
          ]
        });
        if (materialOnlyCandidate) {
          return materialOnlyCandidate;
        }
      }

      const targetDesc = params.materialId
        ? `material [${params.materialId}]`
        : `work center [${params.workCenterId}]`;
      throw new MissingWastageRuleError(
        `No approved WastageRule version found for ${targetDesc} effective as of ${asOf.toISOString()}. V-001 violation: Classification blocked.`,
        { materialId: params.materialId, workCenterId: params.workCenterId, asOfDate: asOf }
      );
    }

    return candidates[0];
  }

  /**
   * Evaluates actual loss against the resolved WastageRule's standard wastage % and tolerance %.
   *
   * @param actualLossQty The actual lost/damaged/scrap quantity.
   * @param basisQuantity The basis (input / processed / batch) quantity. If not provided or 0, defaults to actualLossQty as basis.
   * @param rule The resolved approved WastageRule.
   */
  evaluate(
    actualLossQty: number,
    basisQuantity: number,
    rule: WastageRule
  ): ToleranceEvaluationResult {
    const stdPct = Number(rule.standardWastagePct);
    const tolPct = Number(rule.tolerancePct);

    const basis = basisQuantity > 0 ? basisQuantity : actualLossQty;
    // Expected standard wastage quantity = basis * (standardWastagePct / 100)
    const expectedWastageQty = basis * (stdPct / 100);
    // Allowed threshold quantity = basis * ((standardWastagePct + tolerancePct) / 100)
    const allowedWastageQty = basis * ((stdPct + tolPct) / 100);

    const varianceFromExpected = actualLossQty - expectedWastageQty;
    const isWithinTolerance = actualLossQty <= allowedWastageQty + 1e-6;

    return {
      rule,
      standardWastagePct: stdPct,
      tolerancePct: tolPct,
      allowedWastageQty,
      actualWastageQty: actualLossQty,
      varianceFromExpected,
      classification: isWithinTolerance ? 'WITHIN_TOLERANCE' : 'ABNORMAL'
    };
  }
}
