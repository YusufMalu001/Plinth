import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { NotFoundError, ValidationError } from '../../../common/errors/AppError';

export type OutcomeStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'UNKNOWN';

export interface OutcomeClassificationPolicy {
  version: string;
  successMaxAbsolutePercentageError: string | number;
  partialMaxAbsolutePercentageError: string | number;
}

export interface OutcomeEvaluationInput {
  expectedValue?: Prisma.Decimal | string | number | null;
  actualValue?: Prisma.Decimal | string | number | null;
  attributionMethod: 'DIRECT_TRANSACTION_RECONCILIATION' | 'CONTROLLED_COMPARISON' | 'MANAGER_ESTIMATE';
  sourceRefs?: unknown[];
  policy?: OutcomeClassificationPolicy;
}

/** Decimal outcome arithmetic. Status remains UNKNOWN without verified attribution and an approved policy. */
export class OutcomeEvaluatorService {
  evaluate(input: OutcomeEvaluationInput) {
    const expected = input.expectedValue == null ? null : new Prisma.Decimal(String(input.expectedValue));
    const actual = input.actualValue == null ? null : new Prisma.Decimal(String(input.actualValue));
    const variance = expected === null || actual === null ? null : actual.minus(expected);
    const absolutePercentageError = expected === null || actual === null || expected.isZero()
      ? null
      : variance!.abs().div(expected.abs()).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    const verifiedAttribution = input.attributionMethod === 'DIRECT_TRANSACTION_RECONCILIATION' && (input.sourceRefs?.length ?? 0) > 0;
    let status: OutcomeStatus = 'UNKNOWN';
    if (verifiedAttribution && absolutePercentageError !== null && input.policy) {
      const successMax = new Prisma.Decimal(String(input.policy.successMaxAbsolutePercentageError));
      const partialMax = new Prisma.Decimal(String(input.policy.partialMaxAbsolutePercentageError));
      if (successMax.isNegative() || partialMax.lt(successMax)) throw new Error('Outcome classification policy thresholds are invalid.');
      status = absolutePercentageError.lte(successMax) ? 'SUCCESS'
        : absolutePercentageError.lte(partialMax) ? 'PARTIAL' : 'FAILED';
    }
    return {
      expectedValue: expected,
      actualValue: actual,
      variance,
      absolutePercentageError,
      status,
      quality: status === 'UNKNOWN' ? 'UNKNOWN' : 'CALCULATED',
      formulaVersion: 'decimal-outcome-error-v1',
      attributionVerified: verifiedAttribution,
      policyVersion: input.policy?.version ?? null,
    };
  }

  async reconcileTaskOutcome(taskId: string, actorId: string, db: PrismaClient = defaultPrisma) {
    const task = await (db as any).businessTask.findUnique({
      where: { id: taskId },
      include: {
        recommendation: {
          include: {
            impactScenario: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundError('Business task not found.');
    if (!task.actionResourceType || !task.actionResourceId) {
      throw new ValidationError('Task must have a linked ERP action before outcome reconciliation.');
    }

    let actualValue: Prisma.Decimal | null = null;
    let metricKey = 'cost.purchase_order_value';
    let unit = 'INR';
    let currency = 'INR';

    if (task.actionResourceType === 'PurchaseOrder') {
      const po = await (db as any).purchaseOrder.findUnique({
        where: { id: task.actionResourceId },
        include: { lines: true },
      });
      if (!po) throw new NotFoundError('Linked PurchaseOrder not found.');
      actualValue = po.totalAmount ? new Prisma.Decimal(String(po.totalAmount)) : new Prisma.Decimal(po.lines?.reduce((sum: number, line: any) => sum + Number(line.quantity) * Number(line.unitPrice), 0) ?? 0);
      currency = po.currency ?? 'INR';
    } else if (task.actionResourceType === 'SalesOrder') {
      const so = await (db as any).salesOrder.findUnique({ where: { id: task.actionResourceId } });
      if (!so) throw new NotFoundError('Linked SalesOrder not found.');
      actualValue = so.subtotal ? new Prisma.Decimal(String(so.subtotal)) : null;
      metricKey = 'sales.order_value';
      currency = so.currency ?? 'INR';
    } else if (task.actionResourceType === 'ProductionPlan') {
      const pp = await (db as any).productionPlan.findUnique({ where: { id: task.actionResourceId } });
      if (!pp) throw new NotFoundError('Linked ProductionPlan not found.');
      actualValue = pp.completedQuantity ? new Prisma.Decimal(String(pp.completedQuantity)) : new Prisma.Decimal(String(pp.quantity));
      metricKey = 'production.completed_units';
      unit = 'QUANTITY';
      currency = '';
    }

    const scenario = task.recommendation?.impactScenario;
    const baseCase = scenario?.baseCase as { value?: number; unit?: string; metricKey?: string } | null;
    const expectedValue = baseCase?.value != null ? new Prisma.Decimal(String(baseCase.value)) : new Prisma.Decimal(0);
    if (baseCase?.metricKey) metricKey = baseCase.metricKey;
    if (baseCase?.unit) unit = baseCase.unit;

    const evaluation = this.evaluate({
      expectedValue,
      actualValue,
      attributionMethod: 'DIRECT_TRANSACTION_RECONCILIATION',
      sourceRefs: [{ resource: task.actionResourceType, id: task.actionResourceId }],
      policy: {
        version: 'default-v1',
        successMaxAbsolutePercentageError: 0.15,
        partialMaxAbsolutePercentageError: 0.35,
      },
    });

    const outcome = await (db as any).recommendationOutcome.create({
      data: {
        recommendationId: task.recommendationId,
        taskId: task.id,
        metricKey,
        expectedValue: evaluation.expectedValue,
        realizedValue: evaluation.actualValue,
        unit,
        currency: currency || null,
        attributionMethod: 'DIRECT_TRANSACTION_RECONCILIATION',
        evidence: {
          actionResourceType: task.actionResourceType,
          actionResourceId: task.actionResourceId,
          outcomeStatus: evaluation.status,
          quality: evaluation.quality,
          provenance: 'ACTUAL',
        } as unknown as Prisma.InputJsonValue,
        observedAt: new Date(),
        recordedById: actorId,
        formulaVersion: evaluation.formulaVersion,
        sourceRefs: [{ resource: task.actionResourceType, id: task.actionResourceId }] as unknown as Prisma.InputJsonValue,
        variance: evaluation.variance,
        absolutePercentageError: evaluation.absolutePercentageError,
      },
    });

    return { outcome, evaluation };
  }
}

export const outcomeEvaluatorService = new OutcomeEvaluatorService();
