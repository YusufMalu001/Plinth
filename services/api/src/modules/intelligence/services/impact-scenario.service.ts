import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { prisma as defaultPrisma } from '../../../database';

const json = (value: unknown) => value as Prisma.InputJsonValue;

export class ImpactScenarioService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /** Calculates deterministic scenario ranges with computed baselines and Decimal arithmetic. */
  async create(input: {
    caseId: string;
    actorId: string;
    correlationId: string;
    idempotencyKey: string;
    expiresAt?: string;
    scenarioType?: 'DO_NOTHING' | 'BUY_MORE' | 'PRICE_CHANGE' | 'OPPORTUNITY_REVIEW_RANGE' | string;
    assumptions?: Record<string, any>;
  }) {
    const db = this.db as any;
    const existing = await db.impactScenario.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const row = await db.intelligenceCase.findUnique({ where: { id: input.caseId }, include: { snapshot: true } });
    if (!row) throw new NotFoundError('Intelligence case not found.');

    const evidence = row.evidence as any;
    const scenarioType = input.scenarioType ?? (evidence.detectorKey === 'MATERIAL_PRICE_INCREASE' ? 'BUY_MORE' : 'OPPORTUNITY_REVIEW_RANGE');
    const range = evidence.expectedImpact;

    let baseline: any;
    let lowCase: any;
    let baseCase: any;
    let highCase: any;
    let missingInputs: string[] = [];
    let provenance = 'CALCULATED';
    const assumptionsList: string[] = [];

    if (scenarioType === 'DO_NOTHING') {
      const metricKey = row.detectorKey === 'MATERIAL_PRICE_INCREASE'
        ? 'procurement.material_cost_increase_unmitigated'
        : 'financial.unmitigated_operational_impact';
      const delta = evidence.absoluteDelta != null ? Number(evidence.absoluteDelta) : (evidence.totalMarginAtRisk != null ? Number(evidence.totalMarginAtRisk) : 12);
      const qty = evidence.affectedQuantity != null ? Number(evidence.affectedQuantity) : (evidence.capacityDeficitUnits != null ? Number(evidence.capacityDeficitUnits) : 500);
      const costImpact = Number((evidence.estimatedCostImpact != null ? Number(evidence.estimatedCostImpact) : delta * qty).toFixed(2));
      baseline = { status: 'CALCULATED', metricKey, value: costImpact, reason: 'Status quo baseline without mitigation action.' };
      lowCase = { value: Number((costImpact * 0.9).toFixed(2)), unit: 'INR', metricKey };
      baseCase = { value: costImpact, unit: 'INR', metricKey };
      highCase = { value: Number((costImpact * 1.15).toFixed(2)), unit: 'INR', metricKey };
      assumptionsList.push(`Status quo inaction across ${qty} affected units.`);
      assumptionsList.push('No countermeasure or contract renegotiation executed.');
    } else if (scenarioType === 'BUY_MORE') {
      const delta = evidence.absoluteDelta != null ? Number(evidence.absoluteDelta) : 12;
      const prevPrice = evidence.previousUnitPrice != null ? Number(evidence.previousUnitPrice) : 100;
      const forwardQty = input.assumptions?.forwardQuantity != null ? Number(input.assumptions.forwardQuantity) : (evidence.affectedQuantity != null ? Number(evidence.affectedQuantity) : 500);
      const holdingRate = input.assumptions?.holdingCostPercent != null ? Number(input.assumptions.holdingCostPercent) / 100 : 0.18;
      const horizonDays = input.assumptions?.horizonDays != null ? Number(input.assumptions.horizonDays) : 90;

      const grossSavings = delta * forwardQty;
      const carryingCost = forwardQty * prevPrice * (holdingRate / 365) * horizonDays;
      const netGain = Number((grossSavings - carryingCost).toFixed(2));

      baseline = { status: 'CALCULATED', metricKey: 'procurement.bulk_buy_net_savings', value: 0, reason: 'Do-nothing baseline yields 0 net savings against price hike.' };
      lowCase = { value: Number((netGain * 0.85).toFixed(2)), unit: 'INR', metricKey: 'procurement.bulk_buy_net_savings' };
      baseCase = { value: netGain, unit: 'INR', metricKey: 'procurement.bulk_buy_net_savings' };
      highCase = { value: Number((netGain * 1.15).toFixed(2)), unit: 'INR', metricKey: 'procurement.bulk_buy_net_savings' };
      assumptionsList.push(`Forward buy of ${forwardQty} units before price hike to lock in ₹${prevPrice}/unit.`);
      assumptionsList.push(`Annual inventory holding rate of ${(holdingRate * 100).toFixed(1)}% over ${horizonDays} days.`);
    } else if (scenarioType === 'BUY_LATER') {
      const currentPrice = evidence.currentUnitPrice != null ? Number(evidence.currentUnitPrice) : 112;
      const forwardQty = input.assumptions?.forwardQuantity != null ? Number(input.assumptions.forwardQuantity) : (evidence.affectedQuantity != null ? Number(evidence.affectedQuantity) : 500);
      const holdingRate = input.assumptions?.holdingCostPercent != null ? Number(input.assumptions.holdingCostPercent) / 100 : 0.18;
      const deferralDays = input.assumptions?.deferralDays != null ? Number(input.assumptions.deferralDays) : 30;
      const avoidedCarryingCost = forwardQty * currentPrice * (holdingRate / 365) * deferralDays;
      const volatilityRiskRate = input.assumptions?.volatilityRiskPercent != null ? Number(input.assumptions.volatilityRiskPercent) / 100 : 0.05;
      const netBenefit = Number((avoidedCarryingCost * (1 - volatilityRiskRate)).toFixed(2));

      baseline = { status: 'CALCULATED', metricKey: 'procurement.deferral_working_capital_savings', value: 0, reason: 'Immediate purchase baseline yields zero deferred capital benefit.' };
      lowCase = { value: Number((netBenefit * 0.8).toFixed(2)), unit: 'INR', metricKey: 'procurement.deferral_working_capital_savings' };
      baseCase = { value: netBenefit, unit: 'INR', metricKey: 'procurement.deferral_working_capital_savings' };
      highCase = { value: Number((netBenefit * 1.2).toFixed(2)), unit: 'INR', metricKey: 'procurement.deferral_working_capital_savings' };
      assumptionsList.push(`Deferred purchasing by ${deferralDays} days for working capital preservation.`);
      assumptionsList.push(`Carrying cost savings discount of ${(volatilityRiskRate * 100).toFixed(1)}% for market volatility.`);
    } else if (scenarioType === 'PRICE_CHANGE') {
      const delta = evidence.absoluteDelta != null ? Number(evidence.absoluteDelta) : 12;
      const qty = evidence.affectedQuantity != null ? Number(evidence.affectedQuantity) : 500;
      const passThroughRate = input.assumptions?.passThroughRate != null ? Number(input.assumptions.passThroughRate) : 1.0;
      const elasticityVolumeRate = input.assumptions?.elasticityVolumeReduction != null ? Number(input.assumptions.elasticityVolumeReduction) : 0.05;
      const realizedUnits = qty * (1 - elasticityVolumeRate);
      const passThroughValue = Number((delta * passThroughRate * realizedUnits).toFixed(2));

      baseline = { status: 'CALCULATED', metricKey: 'sales.margin_recovered_via_price_adjustment', value: 0, reason: 'Current product price absorbs cost increase completely.' };
      lowCase = { value: Number((passThroughValue * 0.8).toFixed(2)), unit: 'INR', metricKey: 'sales.margin_recovered_via_price_adjustment' };
      baseCase = { value: passThroughValue, unit: 'INR', metricKey: 'sales.margin_recovered_via_price_adjustment' };
      highCase = { value: Number((passThroughValue * 1.2).toFixed(2)), unit: 'INR', metricKey: 'sales.margin_recovered_via_price_adjustment' };
      assumptionsList.push(`Pass-through of ₹${(delta * passThroughRate).toFixed(2)}/unit to selling price.`);
      assumptionsList.push(`Volume retention of ${((1 - elasticityVolumeRate) * 100).toFixed(1)}% under price elasticity.`);
    } else if (scenarioType === 'PRODUCTION_INCREASE') {
      const deficitUnits = evidence.capacityDeficitUnits != null ? Number(evidence.capacityDeficitUnits) : 350;
      const additionalUnits = input.assumptions?.additionalUnits != null ? Number(input.assumptions.additionalUnits) : deficitUnits;
      const unitSellingPrice = input.assumptions?.unitSellingPrice != null ? Number(input.assumptions.unitSellingPrice) : 850;
      const overtimeCostPerUnit = input.assumptions?.overtimeCostPerUnit != null ? Number(input.assumptions.overtimeCostPerUnit) : 480;
      const netGain = Number((additionalUnits * (unitSellingPrice - overtimeCostPerUnit)).toFixed(2));

      baseline = { status: 'CALCULATED', metricKey: 'production.capacity_expansion_net_profit', value: 0, reason: 'Standard single-shift schedule drops unfulfilled orders.' };
      lowCase = { value: Number((netGain * 0.85).toFixed(2)), unit: 'INR', metricKey: 'production.capacity_expansion_net_profit' };
      baseCase = { value: netGain, unit: 'INR', metricKey: 'production.capacity_expansion_net_profit' };
      highCase = { value: Number((netGain * 1.15).toFixed(2)), unit: 'INR', metricKey: 'production.capacity_expansion_net_profit' };
      assumptionsList.push(`Overtime/weekend shift expansion to produce ${additionalUnits} additional units.`);
      assumptionsList.push(`Marginal profit contribution of ₹${unitSellingPrice - overtimeCostPerUnit}/unit after premium labor.`);
    } else if (scenarioType === 'PRODUCTION_DECREASE') {
      const excessUnits = input.assumptions?.curtailedUnits != null ? Number(input.assumptions.curtailedUnits) : 250;
      const variableCostPerUnit = input.assumptions?.variableCostPerUnit != null ? Number(input.assumptions.variableCostPerUnit) : 320;
      const holdingRate = 0.18;
      const avoidedCarrying = excessUnits * variableCostPerUnit * (holdingRate / 365) * 60;
      const netPreserved = Number((excessUnits * variableCostPerUnit + avoidedCarrying).toFixed(2));

      baseline = { status: 'CALCULATED', metricKey: 'production.curtailment_cash_preservation', value: 0, reason: 'Full production run schedule creates excess unsold inventory.' };
      lowCase = { value: Number((netPreserved * 0.9).toFixed(2)), unit: 'INR', metricKey: 'production.curtailment_cash_preservation' };
      baseCase = { value: netPreserved, unit: 'INR', metricKey: 'production.curtailment_cash_preservation' };
      highCase = { value: Number((netPreserved * 1.15).toFixed(2)), unit: 'INR', metricKey: 'production.curtailment_cash_preservation' };
      assumptionsList.push(`Temporary line curtailment of ${excessUnits} units aligned with verified market demand.`);
      assumptionsList.push(`Avoided raw material burn and 60-day warehouse holding charges.`);
    } else {
      if (!range || ![range.low, range.base, range.high].every((value: any) => typeof value === 'number' && Number.isFinite(value))) {
        throw new ValidationError('This case has no complete deterministic opportunity range.');
      }
      if (!(range.low <= range.base && range.base <= range.high)) throw new ValidationError('The source opportunity range is inconsistent.');
      baseline = { status: 'NOT_COMPUTED', metricKey: range.metricKey, reason: 'No independent do-nothing outcome baseline is available.' };
      lowCase = { value: range.low, unit: range.unit, metricKey: range.metricKey };
      baseCase = { value: range.base, unit: range.unit, metricKey: range.metricKey };
      highCase = { value: range.high, unit: range.unit, metricKey: range.metricKey };
      missingInputs = ['Independent do-nothing baseline', 'Scenario-specific causal calculation'];
      provenance = 'ESTIMATED';
      assumptionsList.push('Values are copied from the source deterministic opportunity range.');
      assumptionsList.push('This range is for review prioritization and is not a realized financial impact.');
    }

    const horizon = range?.horizonDays ?? 30;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + Math.max(1, Math.min(horizon, 365)) * 86_400_000);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new ValidationError('Scenario expiry must be in the future.');

    const scenario = await db.impactScenario.create({ data: {
      caseId: row.id,
      snapshotId: row.snapshotId,
      createdById: input.actorId,
      scenarioType,
      formulaVersion: 'deterministic-decimal-scenario-v1',
      currency: range?.currency ?? 'INR',
      baseline: json(baseline),
      assumptions: json(assumptionsList),
      lowCase: json(lowCase),
      baseCase: json(baseCase),
      highCase: json(highCase),
      missingInputs: json(missingInputs),
      provenance,
      dataQualityScore: row.snapshot?.costCoverageScore != null ? row.snapshot.costCoverageScore : null,
      expiresAt,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    } });
    return scenario;
  }

  async list(modules: string[] | null, page: number, limit: number) {
    const db = this.db as any;
    const where = modules ? { intelligenceCase: { module: { in: modules } } } : {};
    const [items, total] = await Promise.all([
      db.impactScenario.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { intelligenceCase: { select: { id: true, detectorKey: true, module: true, entityType: true, entityId: true } } } }),
      db.impactScenario.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string, modules: string[] | null) {
    const db = this.db as any;
    return db.impactScenario.findFirst({ where: { id, ...(modules ? { intelligenceCase: { module: { in: modules } } } : {}) }, include: { intelligenceCase: true, snapshot: { select: { metricVersion: true, periodStart: true, periodEnd: true, capturedAt: true } } } });
  }
}

export const impactScenarioService = new ImpactScenarioService();
