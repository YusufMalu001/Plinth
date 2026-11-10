import { BomRoundingRule } from '@prisma/client';
import { CircularDependencyError, MaxBomDepthExceededError } from '../../../common/errors/AppError';
import { BomVersionWithLines, BomGoldenExampleExpectedResult } from '../repositories';
import { ValidationError } from '../../../common/errors/AppError';

export type ResolveFactorFn = (fromUomId: string, toUomId: string, date: Date) => Promise<number>;

export interface BomLineRequirement {
  bomLineId: string;
  requiredQuantity: number;
  uomId: string;
  departmentId: string | null;
  conversionFactorUsed: number;
}

export interface GoldenExampleCheckResult {
  matches: boolean;
  mismatches: Array<{ bomLineId: string; expected: number; actual: number | null }>;
}

function applyRounding(value: number, rule: BomRoundingRule, precision: number | null): number {
  if (rule === 'NONE') return value;
  const places = precision ?? 0;
  const scale = 10 ** places;
  switch (rule) {
    case 'ROUND_UP':
      return Math.ceil(value * scale) / scale;
    case 'ROUND_DOWN':
      return Math.floor(value * scale) / scale;
    case 'ROUND_NEAREST':
      return Math.round(value * scale) / scale;
    default:
      return value;
  }
}

/**
 * Pure, deterministic requirement calculator - the module's core. No DB writes; every dependency
 * (the UOM conversion resolver) is injected so this can be unit-tested against plain stubs
 * without touching Module 1 or a database at all.
 */
export class BomCalculatorService {
  /**
   * Converts `requestedQuantity`/`requestedUomId` into the BOM's own product base UOM once
   * (a BOM's ratios are always authored per-1-base-unit-of-output), then evaluates every line:
   * FIXED lines return a constant `line.quantity` regardless of the requested amount; SCALED
   * lines multiply `line.quantity` by the normalized requested quantity. Rounding is applied
   * last, after conversion and scaling, so a golden-example comparison is always against the
   * exact same fully-rounded number a caller sees.
   */
  async computeRequirements(
    version: BomVersionWithLines,
    requestedQuantity: number,
    requestedUomId: string,
    date: Date,
    resolveFactor: ResolveFactorFn
  ): Promise<BomLineRequirement[]> {
    const baseUomId = version.product?.uomId || version.material?.uomId;
    if (!baseUomId) throw new ValidationError(`BOM ${version.bomNumber} has no parent unit of measure.`);
    const normalizationFactor = await resolveFactor(requestedUomId, baseUomId, date);
    const normalizedQuantity = requestedQuantity * normalizationFactor;

    return version.lines.map((line) => {
      const rawQuantity = line.quantityMode === 'FIXED' ? Number(line.quantity) : Number(line.quantity) * normalizedQuantity;
      const requiredQuantity = applyRounding(rawQuantity, line.roundingRule, line.roundingPrecision);
      return {
        bomLineId: line.id,
        requiredQuantity,
        uomId: line.uomId,
        departmentId: line.departmentId,
        conversionFactorUsed: normalizationFactor
      };
    });
  }

  async checkAgainstGoldenExample(
    version: BomVersionWithLines,
    example: { inputQuantity: number; inputUomId: string; expectedResults: BomGoldenExampleExpectedResult[] },
    date: Date,
    resolveFactor: ResolveFactorFn
  ): Promise<GoldenExampleCheckResult> {
    const computed = await this.computeRequirements(version, example.inputQuantity, example.inputUomId, date, resolveFactor);
    const computedByLineId = new Map(computed.map((entry) => [entry.bomLineId, entry]));

    const mismatches: GoldenExampleCheckResult['mismatches'] = [];
    for (const expected of example.expectedResults) {
      const actual = computedByLineId.get(expected.bomLineId);
      const matches = actual !== undefined && actual.uomId === expected.uomId && actual.requiredQuantity === expected.expectedQuantity;
      if (!matches) {
        mismatches.push({ bomLineId: expected.bomLineId, expected: expected.expectedQuantity, actual: actual?.requiredQuantity ?? null });
      }
    }
    return { matches: mismatches.length === 0, mismatches };
  }

  /**
   * DFS cycle detection over the APPROVED component-product graph, using an explicit
   * recursion-stack (a node currently on the path, not a lifetime-visited set) so a legitimate
   * diamond dependency - the same sub-assembly used in two different branches of the same BOM -
   * is never a false positive. Throws as soon as the candidate component's own approved
   * component chain would loop back to the root product (or to any node already on the current
   * path); throws a distinct MaxBomDepthExceededError past `maxDepth`, purely as a defensive
   * bound, not a business rule.
   */
  detectCycle(
    rootProductId: string,
    candidateComponentProductId: string,
    approvedEdges: Array<{ productId: string; componentProductId: string }>,
    maxDepth = 20
  ): void {
    if (rootProductId === candidateComponentProductId) {
      throw new CircularDependencyError(`Product [${rootProductId}] cannot use itself as its own BOM component.`);
    }

    const adjacency = new Map<string, string[]>();
    for (const edge of approvedEdges) {
      if (!adjacency.has(edge.productId)) adjacency.set(edge.productId, []);
      adjacency.get(edge.productId)!.push(edge.componentProductId);
    }

    const path = new Set<string>([rootProductId, candidateComponentProductId]);

    const visit = (productId: string, depth: number): void => {
      if (depth > maxDepth) {
        throw new MaxBomDepthExceededError(`BOM component depth exceeds the maximum allowed depth of ${maxDepth}.`);
      }
      for (const child of adjacency.get(productId) ?? []) {
        if (child === rootProductId || path.has(child)) {
          throw new CircularDependencyError(
            `Adding component [${candidateComponentProductId}] to product [${rootProductId}]'s BOM would create a circular reference through [${child}].`
          );
        }
        path.add(child);
        visit(child, depth + 1);
        path.delete(child);
      }
    };

    visit(candidateComponentProductId, 1);
  }
}
