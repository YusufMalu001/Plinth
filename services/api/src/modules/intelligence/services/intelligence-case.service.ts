import { BusinessSnapshot, IntelligenceModule, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { ConflictError } from '../../../common/errors/AppError';
import { CertifiedSnapshotData, DeterministicOpportunity } from './certified-metrics.service';

type SupportedDetector = {
  key: string;
  module: IntelligenceModule;
  match: (opportunity: DeterministicOpportunity) => boolean;
  severity: 'NOTICE' | 'WARNING';
  unavailableReason?: string;
};

const detectorRules: SupportedDetector[] = [
  { key: 'LOW_INVENTORY_COVER', module: 'INVENTORY', match: (item) => item.category === 'STOCKOUT_RISK' || item.category === 'LOW_INVENTORY_COVER', severity: 'WARNING' },
  { key: 'SLOW_MOVING_INVENTORY', module: 'INVENTORY', match: (item) => item.id.startsWith('inventory-slow-moving:') || item.category === 'SLOW_MOVING_INVENTORY', severity: 'NOTICE' },
  { key: 'DEAD_STOCK', module: 'INVENTORY', match: (item) => item.category === 'DEAD_STOCK' || item.id.startsWith('inventory-dead-stock:'), severity: 'WARNING', unavailableReason: 'No certified 180-day zero-movement inventory ledger history is available in the current snapshot.' },
  { key: 'MARGIN_COMPRESSION', module: 'SALES', match: (item) => item.id.startsWith('sales-margin-review:') || item.category === 'MARGIN_LEAKAGE' || item.category === 'MARGIN_COMPRESSION', severity: 'WARNING' },
  { key: 'UNPLANNED_PRODUCTION_DEMAND', module: 'PRODUCTION', match: (item) => item.id.startsWith('production-upcoming-demand:') || item.category === 'UNPLANNED_DEMAND' || item.category === 'UNPLANNED_PRODUCTION_DEMAND', severity: 'WARNING' },
  { key: 'DELAYED_FULFILLMENT', module: 'FULFILLMENT', match: (item) => item.id.startsWith('fulfillment-late:') || item.category === 'DELAYED_FULFILLMENT', severity: 'WARNING' },
  { key: 'MATERIAL_PRICE_INCREASE', module: 'PROCUREMENT', match: (item) => item.category === 'MATERIAL_PRICE_INCREASE' || item.id.startsWith('procurement-price-increase:'), severity: 'WARNING', unavailableReason: 'No certified comparable approved material-price series is available in the current snapshot.' },
  { key: 'VENDOR_DETERIORATION', module: 'PROCUREMENT', match: (item) => item.category === 'VENDOR_DELIVERY_RISK' || item.category === 'VENDOR_DETERIORATION', severity: 'WARNING', unavailableReason: 'No certified vendor delivery, lead-time, or quality trend is available in the current snapshot.' },
  { key: 'REPLENISHMENT_RISK', module: 'INVENTORY', match: (item) => item.category === 'REPLENISHMENT_RISK', severity: 'WARNING', unavailableReason: 'No certified demand-rate, lead-time, and safety-stock combination is available to calculate replenishment risk.' },
];

export function caseDedupeKeyForOpportunity(snapshot: BusinessSnapshot, data: CertifiedSnapshotData, opportunity: DeterministicOpportunity) {
  const detector = detectorRules.find((item) => item.module === snapshot.module && item.match(opportunity));
  if (!detector) return null;
  const entityType = opportunity.targetResource ?? 'ENTERPRISE';
  const entityId = opportunity.targetResourceId ?? opportunity.id;
  return `${detector.key}:${entityType}:${entityId}:${data.periodEnd.slice(0, 7)}:${snapshot.metricVersion}`;
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

export function calculateDetectorEvidence(detectorKey: string, opportunity: DeterministicOpportunity): Record<string, unknown> {
  const source = opportunity as unknown as Record<string, unknown>;
  const fields: Record<string, string[]> = {
    MATERIAL_PRICE_INCREASE: ['previousUnitPrice', 'currentUnitPrice', 'affectedQuantity', 'estimatedCostImpact'],
    LOW_INVENTORY_COVER: ['currentStock', 'availableQuantity', 'burnRateDaily', 'dailyDemandRate', 'leadTimeDays', 'unitCost'],
    SLOW_MOVING_INVENTORY: ['inventoryAgeDays', 'daysSinceLastMovement', 'quantity', 'unitCost', 'holdingCostPercent', 'turnoverRate'],
    DEAD_STOCK: ['zeroMovementDays', 'deadStockQuantity', 'unitCost', 'scrapRecoveryRate'],
    VENDOR_DETERIORATION: ['onTimeDeliveryRate', 'targetOtdRate', 'leadTimeVarianceDays', 'qualityRejectionRate', 'affectedPurchaseValue'],
    MARGIN_COMPRESSION: ['historicalGrossMarginPercent', 'realizedGrossMarginPercent', 'salesVolume', 'freightLeakageAmount', 'discountLeakageAmount'],
    UNPLANNED_PRODUCTION_DEMAND: ['plannedCapacityUnits', 'confirmedDemandUnits', 'scheduleDelayHours'],
    DELAYED_FULFILLMENT: ['delayedShipmentCount', 'averageDelayDays', 'customerImpactCount', 'slaBreachExposure'],
    REPLENISHMENT_RISK: ['reorderPoint', 'availableStock', 'availableQuantity', 'safetyStock'],
  };
  const evidence: Record<string, unknown> = {};
  const number = (key: string): number | undefined => {
    const raw = source[key];
    if (raw === null || raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const put = (key: string, value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value)) evidence[key] = Number(value.toFixed(2));
  };
  for (const key of fields[detectorKey] ?? []) put(key, number(key));
  const textFields: Record<string, string[]> = {
    UNPLANNED_PRODUCTION_DEMAND: ['bottleneckWorkstation'],
    DELAYED_FULFILLMENT: ['carrierBacklog'],
  };
  for (const key of textFields[detectorKey] ?? []) {
    if (typeof source[key] === 'string' && source[key]) evidence[key] = source[key];
  }

  if (detectorKey === 'MATERIAL_PRICE_INCREASE') {
    const previous = number('previousUnitPrice');
    const current = number('currentUnitPrice');
    if (previous !== undefined && current !== undefined) {
      put('absoluteDelta', current - previous);
      if (previous > 0) put('percentageDelta', (current - previous) / previous * 100);
      const quantity = number('affectedQuantity');
      if (quantity !== undefined && number('estimatedCostImpact') === undefined) put('estimatedCostImpact', (current - previous) * quantity);
    }
  }
  if (detectorKey === 'LOW_INVENTORY_COVER') {
    const stock = number('currentStock') ?? number('availableQuantity');
    const rate = number('burnRateDaily') ?? number('dailyDemandRate');
    const lead = number('leadTimeDays');
    put('currentStock', stock);
    put('burnRateDaily', rate);
    if (stock !== undefined && rate !== undefined && rate > 0) {
      const cover = stock / rate;
      put('daysOfCover', cover);
      if (lead !== undefined) {
        const gap = Math.max(0, lead - cover);
        put('stockoutGapDays', gap);
        const unitCost = number('unitCost');
        if (unitCost !== undefined) put('stockoutRiskValue', gap * rate * unitCost);
      }
    }
  }
  if (detectorKey === 'SLOW_MOVING_INVENTORY') {
    put('inventoryAgeDays', number('inventoryAgeDays') ?? number('daysSinceLastMovement'));
    const quantity = number('quantity');
    const unitCost = number('unitCost');
    if (quantity !== undefined && unitCost !== undefined) {
      const carrying = quantity * unitCost;
      put('carryingValue', carrying);
      const holdingRate = number('holdingCostPercent');
      const age = number('inventoryAgeDays') ?? number('daysSinceLastMovement');
      if (holdingRate !== undefined && age !== undefined) put('holdingCostAccumulated', carrying * holdingRate / 100 / 365 * age);
    }
  }
  if (detectorKey === 'DEAD_STOCK') {
    const quantity = number('deadStockQuantity');
    const unitCost = number('unitCost');
    if (quantity !== undefined && unitCost !== undefined) {
      const value = quantity * unitCost;
      put('deadStockValue', value);
      const recovery = number('scrapRecoveryRate');
      if (recovery !== undefined) {
        put('recoverableScrapValue', value * recovery);
        put('writeOffExposure', value * (1 - recovery));
      }
    }
  }
  if (detectorKey === 'MARGIN_COMPRESSION') {
    const prior = number('historicalGrossMarginPercent');
    const current = number('realizedGrossMarginPercent');
    if (prior !== undefined && current !== undefined) {
      const delta = current - prior;
      put('marginDeltaPercent', delta);
      const volume = number('salesVolume');
      if (volume !== undefined) put('totalMarginAtRisk', volume * Math.abs(delta) / 100);
    }
  }
  if (detectorKey === 'UNPLANNED_PRODUCTION_DEMAND') {
    const capacity = number('plannedCapacityUnits');
    const demand = number('confirmedDemandUnits');
    if (capacity !== undefined && demand !== undefined) {
      put('capacityDeficitUnits', Math.max(0, demand - capacity));
      if (capacity > 0) put('utilizationPercent', demand / capacity * 100);
    }
  }
  if (detectorKey === 'REPLENISHMENT_RISK') {
    const point = number('reorderPoint');
    const stock = number('availableStock') ?? number('availableQuantity');
    put('availableStock', stock);
    if (point !== undefined && stock !== undefined) put('reorderDeficit', Math.max(0, point - stock));
    const safety = number('safetyStock');
    if (stock !== undefined && safety !== undefined) evidence.replenishmentUrgency = stock <= safety ? 'CRITICAL' : 'HIGH';
  }
  return evidence;
}

export class IntelligenceCaseService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async detect(snapshot: BusinessSnapshot) {
    const db = this.db as any;
    const data = snapshot.data as unknown as CertifiedSnapshotData;
    const results: Array<{ detectorKey: string; createdOrUpdated: number; status: string; reason?: string }> = [];
    for (const detector of detectorRules.filter((item) => item.module === snapshot.module)) {
      const opportunities = (data.opportunities ?? []).filter(detector.match);
      if (!opportunities.length && detector.unavailableReason) {
        results.push({ detectorKey: detector.key, createdOrUpdated: 0, status: 'INSUFFICIENT_EVIDENCE', reason: detector.unavailableReason });
        continue;
      }
      let count = 0;
      for (const opportunity of opportunities) {
        const windowStart = data.periodEnd.slice(0, 7);
        const entityType = opportunity.targetResource ?? 'ENTERPRISE';
        const entityId = opportunity.targetResourceId ?? opportunity.id;
        const dedupeKey = `${detector.key}:${entityType}:${entityId}:${windowStart}:${snapshot.metricVersion}`;
        const sourceMetrics = (data.metrics ?? []).filter((metric) => opportunity.metricKeys.includes(metric.key));
        const calculatedMetrics = calculateDetectorEvidence(detector.key, opportunity);
        if (!sourceMetrics.some((metric) => metric.value !== null) && !Object.values(calculatedMetrics).some((value) => typeof value === 'number')) {
          results.push({ detectorKey: detector.key, createdOrUpdated: 0, status: 'INSUFFICIENT_EVIDENCE', reason: 'The opportunity has no certified numeric evidence.' });
          continue;
        }

        const evidence = {
          opportunityId: opportunity.id,
          detectorKey: detector.key,
          title: opportunity.title,
          situation: opportunity.situation,
          ...calculatedMetrics,
          evidenceStatus: 'SOURCE_BACKED',
          expectedImpact: opportunity.expectedImpact,
          metricVersion: snapshot.metricVersion,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          provenance: sourceMetrics.map((metric) => ({ key: metric.key, provenance: metric.provenance, freshness: metric.freshnessStatus, quality: metric.dataQualityScore, sourceRefs: metric.sourceRefs })),
          limitations: data.notices,
        };
        const row = await db.intelligenceCase.upsert({
          where: { dedupeKey },
          create: {
            detectorKey: detector.key, detectorVersion: snapshot.metricVersion, module: snapshot.module,
            entityType, entityId, severity: detector.severity, priority: detector.severity === 'WARNING' ? 'MEDIUM' : 'LOW',
            correlationId: `snapshot:${snapshot.id}`, snapshotId: snapshot.id, evidence: json(evidence), dedupeKey,
            observations: { create: { snapshotId: snapshot.id, detectorVersion: snapshot.metricVersion, result: 'DETECTED', evidence: json(evidence) } },
          },
          update: {
            lastDetectedAt: new Date(), snapshotId: snapshot.id, evidence: json(evidence),
            status: 'OPEN', resolvedAt: null, resolvedById: null, resolutionReason: null,
            observations: { create: { snapshotId: snapshot.id, detectorVersion: snapshot.metricVersion, result: 'DETECTED', evidence: json(evidence) } },
          },
          select: { id: true },
        });
        if (row.id) count += 1;
      }
      results.push({ detectorKey: detector.key, createdOrUpdated: count, status: 'EVALUATED' });
    }
    return results;
  }

  async list(modules: IntelligenceModule[] | null, input: { page: number; limit: number; status?: string }) {
    const db = this.db as any;
    const where = {
      ...(modules ? { module: { in: modules } } : {}),
      ...(input.status ? { status: input.status } : {}),
    };
    const [items, total] = await Promise.all([
      db.intelligenceCase.findMany({ where, orderBy: [{ severity: 'desc' }, { lastDetectedAt: 'desc' }], skip: (input.page - 1) * input.limit, take: input.limit, include: { observations: { orderBy: { observedAt: 'desc' }, take: 5 }, scenarios: { select: { id: true, scenarioType: true, createdAt: true } }, recommendations: { select: { id: true, status: true } } } }),
      db.intelligenceCase.count({ where }),
    ]);
    return { items, total, page: input.page, limit: input.limit };
  }

  async get(id: string, modules: IntelligenceModule[] | null) {
    const db = this.db as any;
    const row = await db.intelligenceCase.findFirst({ where: { id, ...(modules ? { module: { in: modules } } : {}) }, include: { observations: { orderBy: { observedAt: 'desc' } }, scenarios: { orderBy: { createdAt: 'desc' } }, recommendations: { select: { id: true, status: true, title: true } } } });
    return row;
  }

  async transition(id: string, modules: IntelligenceModule[] | null, actorId: string, action: 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED', reason: string) {
    const db = this.db as any;
    const row = await db.intelligenceCase.findFirst({ where: { id, ...(modules ? { module: { in: modules } } : {}) }, select: { id: true, status: true, snapshotId: true, detectorVersion: true } });
    if (!row) return null;
    const allowed = action === 'ACKNOWLEDGED' ? ['OPEN'] : ['OPEN', 'ACKNOWLEDGED'];
    if (!allowed.includes(row.status)) throw new ConflictError(`Cannot transition an intelligence case from ${row.status} to ${action}.`);
    const now = new Date();
    return db.$transaction(async (tx: any) => {
      const updated = await tx.intelligenceCase.update({ where: { id }, data: action === 'ACKNOWLEDGED'
        ? { status: action, acknowledgedAt: now, acknowledgedById: actorId, acknowledgmentReason: reason }
        : action === 'RESOLVED'
          ? { status: action, resolvedAt: now, resolvedById: actorId, resolutionReason: reason }
          : { status: action, suppressedAt: now, suppressedById: actorId, suppressionReason: reason } });
      await tx.caseObservation.create({ data: {
        caseId: id, snapshotId: row.snapshotId, detectorVersion: row.detectorVersion, result: action,
        evidence: json({ actorId, reason, previousStatus: row.status, occurredAt: now.toISOString() }),
      } });
      return updated;
    });
  }
}

export const intelligenceCaseService = new IntelligenceCaseService();
