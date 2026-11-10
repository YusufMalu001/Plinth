import { IntelligenceModule, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { CertifiedSnapshotData } from './certified-metrics.service';

const definitions: Record<string, { name: string; definition: string; version: string; unit: string }> = {
  'sales.booked_net_revenue': { name: 'Booked net revenue', definition: 'Operational order value: subtotal less discount plus recorded charges, excluding tax, for non-cancelled INR orders ordered in the period. Not accounting-recognized revenue.', version: '2026-10-01.2', unit: 'INR' },
  'sales.gross_shipped_revenue': { name: 'Gross shipped revenue', definition: 'INR shipped quantity times stored unit price for shipments handed over in period, before discounts and tax.', version: '2026-10-01.2', unit: 'INR' },
  'sales.shipped_discounts': { name: 'Shipped discounts', definition: 'Line discount allocated by shipped quantity divided by ordered quantity.', version: '2026-10-01.2', unit: 'INR' },
  'sales.credited_returns': { name: 'Credited returns', definition: 'Completed dated return records with explicitly recorded credited net amount. Returns without a recorded amount are excluded.', version: '2026-10-01.2', unit: 'INR' },
  'sales.tax_excluded_net_revenue': { name: 'Tax-excluded shipped net revenue', definition: 'Gross shipped revenue less allocated discounts and explicitly recorded dated return credits; excludes tax and unallocated charges. Operational, not accounting-recognized revenue.', version: '2026-10-01.2', unit: 'INR' },
  'sales.dispatched_net_revenue': { name: 'Tax-excluded shipped net revenue', definition: 'Compatibility key with the same definition as sales.tax_excluded_net_revenue.', version: '2026-10-01.2', unit: 'INR' },
  'sales.recorded_shipped_tax': { name: 'Recorded shipped tax', definition: 'Stored line tax allocated to shipped quantities less explicit tax credits. Operational only; not statutory tax payable.', version: '2026-10-01.2', unit: 'INR' },
  'sales.cogs_actual_inventory_cost': { name: 'Posted shipment COGS', definition: 'Eligible posted outbound inventory cost matched to shipments handed over in the period. Gross profit is withheld unless cost quantity coverage is complete.', version: '2026-10-01.2', unit: 'INR' },
  'sales.gross_profit': { name: 'Gross profit', definition: 'Tax-excluded shipped net revenue less eligible posted shipment COGS; unavailable when COGS coverage is incomplete.', version: '2026-10-01.2', unit: 'INR' },
  'sales.gross_margin_rate': { name: 'Gross margin rate', definition: 'Gross profit divided by tax-excluded shipped net revenue; unavailable without complete COGS coverage and positive revenue.', version: '2026-10-01.2', unit: 'PERCENT' },
  'sales.known_contribution_margin': { name: 'Known contribution margin', definition: 'Tax-excluded shipped net revenue less eligible posted shipment COGS and recorded outbound freight. Excludes unrecorded labor, overhead, marketplace fees, commissions, and other variable costs. Not net profit.', version: '2026-10-01.2', unit: 'INR' },
  'sales.known_contribution_margin_rate': { name: 'Known contribution margin rate', definition: 'Known contribution margin divided by tax-excluded shipped net revenue; unavailable without complete COGS coverage and positive revenue.', version: '2026-10-01.2', unit: 'PERCENT' },
  'sales.cost_coverage_score': { name: 'Sales cost coverage', definition: 'Eligible posted outbound cost quantity divided by quantity handed over in the period, capped at one.', version: '2026-10-01.2', unit: 'PERCENT' },
  'sales.dormant_customer_count': { name: 'Dormant active customers', definition: 'Active customer accounts with no non-cancelled order in the trailing 90 days.', version: '2026-10-01.2', unit: 'COUNT' },
  'sales.average_customer_engagement_score': { name: 'Average customer engagement', definition: 'A 0-100 heuristic from order recency, frequency, and log-scaled 365-day order value; not creditworthiness.', version: '2026-10-01.2', unit: 'PERCENT' },
  'sales.amazon_order_count': { name: 'Amazon order count', definition: 'Non-cancelled AMAZON orders booked in the certified sales period.', version: '2026-10-01.2', unit: 'COUNT' },
  'sales.etrade_order_count': { name: 'E-Trade order count', definition: 'Non-cancelled E_TRADE orders booked in the certified sales period.', version: '2026-10-01.2', unit: 'COUNT' },
  'sales.marketplace_validation_failure_count': { name: 'Marketplace validation failures', definition: 'Amazon or E-Trade orders in VALIDATION_FAILED state in the certified period.', version: '2026-10-01.2', unit: 'COUNT' },
  'inventory.value_at_average_cost': { name: 'Inventory value at average cost', definition: 'Calculated balance quantity multiplied by stored inventory average cost; source balance timestamps and cost coverage apply.', version: '2026-10-01.2', unit: 'INR' },
  'inventory.replenishment_risk_count': { name: 'Replenishment risks', definition: 'Active policies where available stock is at or below the reorder point.', version: '2026-10-01.2', unit: 'COUNT' },
  'inventory.slow_moving_product_count': { name: 'Slow-moving products', definition: 'Stocked products with no inventory ISSUE movement in trailing 90 days.', version: '2026-10-01.2', unit: 'COUNT' },
  'inventory.fast_moving_product_count': { name: 'Fast-moving products', definition: 'Stocked products with at most 14 days cover at trailing 90-day ISSUE rate.', version: '2026-10-01.2', unit: 'COUNT' },
  'production.schedule_attainment': { name: 'Production schedule attainment', definition: 'Completed quantity divided by planned quantity for non-cancelled plans scheduled in the period.', version: '2026-10-01.2', unit: 'PERCENT' },
  'production.upcoming_unplanned_demand_units': { name: 'Upcoming unplanned demand', definition: 'Remaining order quantity promised in the next 30 days not matched by approved/released/in-progress product plans.', version: '2026-10-01.2', unit: 'QUANTITY' },
  'quality.defect_rate': { name: 'Inspection defect rate', definition: 'Recorded defective quantity divided by sampled quantity for period inspections.', version: '2026-10-01.2', unit: 'PERCENT' },
  'quality.abnormal_loss_count': { name: 'Abnormal loss events', definition: 'Non-rejected abnormal loss events reported in the certified period.', version: '2026-10-01.2', unit: 'COUNT' },
  'quality.open_corrective_action_count': { name: 'Open corrective actions', definition: 'Open or in-progress corrective actions linked to period inspections.', version: '2026-10-01.2', unit: 'COUNT' },
  'fulfillment.on_time_delivery_rate': { name: 'On-time delivery rate', definition: 'Delivered shipments with delivered time at or before expected delivery time divided by delivered shipments with an expected time.', version: '2026-10-01.2', unit: 'PERCENT' },
};

export class IntelligenceToolsService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async getModuleSnapshot(module: IntelligenceModule, snapshotId?: string) {
    const snapshot = snapshotId
      ? await this.db.businessSnapshot.findUnique({ where: { id: snapshotId } })
      : await this.db.businessSnapshot.findFirst({ where: { module }, orderBy: { capturedAt: 'desc' } });
    if (!snapshot) return { status: 'not_available', module, message: 'No certified snapshot is available for this module.' };
    if (snapshot.module !== module && module !== 'EXECUTIVE') throw new ValidationError('Snapshot is outside the requested module.');
    return {
      status: 'available',
      snapshotId: snapshot.id,
      module: snapshot.module,
      metricVersion: snapshot.metricVersion,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      capturedAt: snapshot.capturedAt,
      freshnessScore: Number(snapshot.freshnessScore),
      costCoverageScore: Number(snapshot.costCoverageScore),
      data: snapshot.data as unknown as CertifiedSnapshotData,
    };
  }

  async execute(
    toolName: string,
    args: {
      snapshotId?: string;
      metricKey?: string;
      metricVersion?: string;
      resourceType?: string;
      resourceId?: string;
      categoryId?: string;
      productId?: string;
      vendorId?: string;
      workCenterId?: string;
      bulkDiscountPercent?: number;
      holdingCostPercent?: number;
      volumeMultiplier?: number;
      horizonDays?: number;
      minMarginRate?: number;
      periodDays?: number;
    },
    callerModule: IntelligenceModule,
  ) {
    if (toolName === 'get_sales_performance') return this.getModuleSnapshot('SALES', args.snapshotId);
    if (toolName === 'get_customer_opportunities') return this.opportunities('SALES', args.snapshotId, ['repeat', 'dormant', 'campaign', 'margin']);
    if (toolName === 'get_inventory_risk') return this.getModuleSnapshot('INVENTORY', args.snapshotId);
    if (toolName === 'get_replenishment_options') return this.opportunities('INVENTORY', args.snapshotId, ['replenishment', 'stock']);
    if (toolName === 'get_vendor_performance') return this.getModuleSnapshot('PROCUREMENT', args.snapshotId);
    if (toolName === 'get_production_capacity') return this.getModuleSnapshot('PRODUCTION', args.snapshotId);
    if (toolName === 'get_quality_and_loss') return this.qualityAndLoss(args.snapshotId);
    if (toolName === 'get_fulfillment_sla_risk') return this.getModuleSnapshot('FULFILLMENT', args.snapshotId);
    if (toolName === 'get_financial_summary') return this.financialSummary(args.snapshotId);
    if (toolName === 'get_metric_definition') return this.metricDefinitions(callerModule, args.metricKey, args.metricVersion);
    if (toolName === 'get_resource_evidence') return this.resourceEvidence(args.resourceType, args.resourceId, callerModule);
    if (toolName === 'get_seasonal_demand_forecast') return this.seasonalDemandForecast(args);
    if (toolName === 'simulate_bulk_purchase_tradeoff') return this.simulateBulkPurchaseTradeoff(args);
    if (toolName === 'get_vendor_reliability_scorecard') return this.vendorReliabilityScorecard(args);
    if (toolName === 'get_production_bottleneck_matrix') return this.productionBottleneckMatrix(args);
    if (toolName === 'get_margin_leakage_audit') return this.marginLeakageAudit(args);
    if (toolName === 'get_dispatch_consolidation_options') return this.dispatchConsolidationOptions(args);
    if (toolName === 'get_comprehensive_enterprise_pulse') return this.comprehensiveEnterprisePulse();
    throw new NotFoundError(`Read tool '${toolName}' is not registered.`);
  }

  private async seasonalDemandForecast(args: { categoryId?: string; horizonDays?: number; volumeMultiplier?: number }) {
    const horizon = args.horizonDays ?? 60;
    const multiplier = args.volumeMultiplier ?? 1.25;
    const since = new Date(Date.now() - 90 * 86_400_000);
    const orders = await this.db.salesOrder.findMany({
      where: { orderedAt: { gte: since }, status: { notIn: ['CANCELLED'] } },
      select: {
        id: true, orderedAt: true, subtotal: true,
        lines: { select: { productId: true, orderedQuantity: true, unitPrice: true } },
      },
    });
    const totalRecentRevenue = orders.reduce((sum, o) => sum + Number(o.subtotal ?? 0), 0);
    const monthlyRunRate = (totalRecentRevenue / 90) * 30;
    const projectedFestiveRevenue = monthlyRunRate * (horizon / 30) * multiplier;
    return {
      analysis: 'Seasonal & Festive Demand Projection',
      horizonDays: horizon,
      assumedSurgeMultiplier: multiplier,
      recentQuarterRevenue: Number(totalRecentRevenue.toFixed(2)),
      monthlyRunRate: Number(monthlyRunRate.toFixed(2)),
      projectedPeriodRevenue: Number(projectedFestiveRevenue.toFixed(2)),
      recommendedSafetyStockBufferPercent: multiplier > 1.2 ? 25 : 15,
      insights: [
        `Historical velocity indicates monthly run rate of ₹${monthlyRunRate.toLocaleString('en-IN')}.`,
        `With a ${(multiplier * 100 - 100).toFixed(0)}% seasonal uplift, projected demand is ₹${projectedFestiveRevenue.toLocaleString('en-IN')}.`,
        'Recommend placing bulk raw material purchase orders 4-6 weeks prior to lead time constraints.',
      ],
    };
  }

  private async simulateBulkPurchaseTradeoff(args: { bulkDiscountPercent?: number; holdingCostPercent?: number; horizonDays?: number }) {
    const discount = (args.bulkDiscountPercent ?? 8) / 100;
    const annualHoldingRate = (args.holdingCostPercent ?? 18) / 100;
    const horizonDays = args.horizonDays ?? 90;
    const holdingRateForPeriod = (annualHoldingRate / 365) * horizonDays;

    const policies = await this.db.replenishmentPolicy.findMany({
      where: { isActive: true },
      select: { id: true, itemId: true, approvedUnitCost: true, orderUpToQuantity: true },
    });

    const estimatedSpend = policies.reduce((sum, p) => sum + Number(p.approvedUnitCost ?? 0) * Number(p.orderUpToQuantity ?? 0), 0);
    if (estimatedSpend <= 0) {
      return {
        status: 'not_available',
        reason: 'No active replenishment policies have both an approved unit cost and an order-up-to quantity. Configure those values before running this comparison.',
        policyCount: policies.length,
      };
    }
    const grossDiscountSavings = estimatedSpend * discount;
    const incrementalCarryingCost = estimatedSpend * holdingRateForPeriod;
    const netTradeoffGain = grossDiscountSavings - incrementalCarryingCost;

    return {
      simulation: 'Bulk Purchase vs Inventory Carrying Cost Tradeoff',
      parameters: {
        bulkDiscountPercent: discount * 100,
        annualHoldingCostPercent: annualHoldingRate * 100,
        timeHorizonDays: horizonDays,
        simulatedPurchaseVolumeSpend: Number(estimatedSpend.toFixed(2)),
      },
      results: {
        grossDiscountSavings: Number(grossDiscountSavings.toFixed(2)),
        incrementalCarryingCost: Number(incrementalCarryingCost.toFixed(2)),
        netEconomicGain: Number(netTradeoffGain.toFixed(2)),
        isFinanciallyViable: netTradeoffGain > 0,
        recommendation: netTradeoffGain > 0
          ? `Bulk procurement generates a net financial surplus of ₹${netTradeoffGain.toLocaleString('en-IN')} after factoring inventory carrying costs.`
          : 'High inventory holding cost outweighs supplier volume discount. Stick to JIT reorder policy.',
      },
    };
  }

  private async vendorReliabilityScorecard(args: { vendorId?: string }) {
    const [pos, activeScorecard, complianceDocuments] = await Promise.all([
      this.db.purchaseOrder.findMany({
        where: {
          ...(args.vendorId ? { vendorId: args.vendorId } : {}),
          status: { in: ['SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'] },
        },
        select: {
          id: true, vendorId: true, status: true, currency: true, createdAt: true,
          lines: { select: { id: true, quantity: true, unitPrice: true, needDate: true, goodsReceiptLines: { select: { receivedQuantity: true, acceptedQuantity: true, rejectedQuantity: true, grn: { select: { status: true, receivedAt: true } } } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.db.vendorScorecard.findFirst({ where: { status: 'ACTIVE' }, orderBy: { activatedAt: 'desc' }, select: { id: true, name: true, version: true, weights: true, thresholds: true } }),
      args.vendorId ? this.db.vendorComplianceDocument.findMany({ where: { vendorId: args.vendorId }, select: { expiresAt: true } }) : Promise.resolve([]),
    ]);
    const receiptRows = pos.flatMap((po) => po.lines.flatMap((line) => line.goodsReceiptLines
      .filter((receipt) => receipt.grn.status === 'FINALIZED')
      .map((receipt) => ({ po, line, receipt }))));
    const orderedQuantity = pos.reduce((sum, po) => sum + po.lines.reduce((lineSum, line) => lineSum + Number(line.quantity), 0), 0);
    const receivedQuantity = receiptRows.reduce((sum, row) => sum + Number(row.receipt.receivedQuantity), 0);
    const acceptedQuantity = receiptRows.reduce((sum, row) => sum + Number(row.receipt.acceptedQuantity), 0);
    const fillRate = orderedQuantity > 0 ? Math.min(100, receivedQuantity / orderedQuantity * 100) : null;
    const qualityRate = receivedQuantity > 0 ? Math.min(100, acceptedQuantity / receivedQuantity * 100) : null;
    const deliveredLines = receiptRows.filter((row) => Number(row.receipt.receivedQuantity) > 0);
    const onTimeRate = deliveredLines.length
      ? deliveredLines.filter((row) => row.receipt.grn.receivedAt <= row.line.needDate).length / deliveredLines.length * 100
      : null;
    const priceLines = pos.filter((po) => po.currency === 'INR').flatMap((po) => po.lines.map((line) => Number(line.unitPrice))).filter((price) => Number.isFinite(price) && price > 0);
    const averagePrice = priceLines.length ? priceLines.reduce((sum, price) => sum + price, 0) / priceLines.length : null;
    const pricingVariancePercent = averagePrice && priceLines.length > 1
      ? Math.sqrt(priceLines.reduce((sum, price) => sum + (price - averagePrice) ** 2, 0) / priceLines.length) / averagePrice * 100
      : null;
    const complianceRate = complianceDocuments.length
      ? complianceDocuments.filter((document) => !document.expiresAt || document.expiresAt >= new Date()).length / complianceDocuments.length * 100
      : null;
    const weights = activeScorecard?.weights && typeof activeScorecard.weights === 'object' && !Array.isArray(activeScorecard.weights)
      ? activeScorecard.weights as Record<string, number>
      : {};
    const scoreInputs: Record<string, number | null> = {
      quality: qualityRate,
      delivery: onTimeRate,
      fillRate,
      // The current ERP has no certified response-time or cross-vendor price benchmark.
      price: null,
      responsiveness: null,
      compliance: complianceRate,
    };
    const weightedKeys = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
    const missingWeightedInputs = weightedKeys.filter(([key]) => scoreInputs[key] === null || scoreInputs[key] === undefined).map(([key]) => key);
    const totalWeight = weightedKeys.reduce((sum, [, weight]) => sum + Number(weight), 0);
    const overallScore = activeScorecard && totalWeight > 0 && !missingWeightedInputs.length
      ? weightedKeys.reduce((sum, [key, weight]) => sum + Number(scoreInputs[key]) * Number(weight), 0) / totalWeight
      : null;
    const thresholds = activeScorecard?.thresholds && typeof activeScorecard.thresholds === 'object' && !Array.isArray(activeScorecard.thresholds)
      ? activeScorecard.thresholds as Record<string, number>
      : {};
    const gradeThresholds = Object.entries(thresholds).filter(([, value]) => Number.isFinite(Number(value))).sort((a, b) => Number(b[1]) - Number(a[1]));
    const grade = !activeScorecard
      ? 'SCORECARD_NOT_CONFIGURED'
      : overallScore === null
        ? `INSUFFICIENT_CONFIGURED_METRICS${missingWeightedInputs.length ? `:${missingWeightedInputs.join(',')}` : ''}`
        : gradeThresholds.length
          ? gradeThresholds.find(([, threshold]) => overallScore >= Number(threshold))?.[0] ?? `BELOW_${gradeThresholds.at(-1)?.[0]}`
          : 'THRESHOLDS_NOT_CONFIGURED';

    return {
      status: pos.length ? 'available' : 'not_available',
      scorecardSummary: {
        activeScorecard: activeScorecard ? { id: activeScorecard.id, name: activeScorecard.name, version: activeScorecard.version } : null,
        totalEvaluatedOrders: pos.length,
        finalizedReceiptLines: deliveredLines.length,
        orderedQuantity,
        receivedQuantity,
        acceptedQuantity,
        onTimeRatePercent: onTimeRate === null ? null : Number(onTimeRate.toFixed(1)),
        fillRatePercent: fillRate === null ? null : Number(fillRate.toFixed(1)),
        qualityAcceptanceRatePercent: qualityRate === null ? null : Number(qualityRate.toFixed(1)),
        observedInrPriceVariancePercent: pricingVariancePercent === null ? null : Number(pricingVariancePercent.toFixed(2)),
        complianceRatePercent: complianceRate === null ? null : Number(complianceRate.toFixed(1)),
        overallScore: overallScore === null ? null : Number(overallScore.toFixed(1)),
        overallVendorGrade: grade,
        missingWeightedInputs,
        methodology: 'Receipt metrics are recalculated from the latest 100 sent/received POs and finalized receipt lines. Score and grade use the active VendorScorecard weights and thresholds. Price competitiveness and responsiveness are unavailable without certified benchmarks; a scorecard that assigns them non-zero weights will report an incomplete score rather than invent values.',
      },
    };
  }

  private async productionBottleneckMatrix(_args: { workCenterId?: string }) {
    const plans = await this.db.productionPlan.findMany({
      where: { status: { in: ['APPROVED', 'IN_PROGRESS'] } },
      select: { id: true, planNumber: true, quantity: true, completedQuantity: true, status: true, scheduleDate: true },
      take: 20,
    });
    return {
      productionOverview: {
        activeProductionPlans: plans.length,
        plans: plans.map((plan) => ({
          planId: plan.id,
          planNumber: plan.planNumber,
          status: plan.status,
          scheduledQuantity: Number(plan.quantity),
          completedQuantity: Number(plan.completedQuantity ?? 0),
          remainingQuantity: Math.max(0, Number(plan.quantity) - Number(plan.completedQuantity ?? 0)),
          scheduleDate: plan.scheduleDate,
          progressPercent: Number(plan.quantity) > 0 ? Number((Number(plan.completedQuantity ?? 0) / Number(plan.quantity) * 100).toFixed(1)) : null,
        })),
        note: 'Work-centre utilization and bottleneck dates are not reported because certified work-centre capacity calendars are not available.',
      },
    };
  }

  private async marginLeakageAudit(args: { minMarginRate?: number }) {
    const threshold = args.minMarginRate ?? 0.15;
    const snapshot = await this.getModuleSnapshot('SALES');
    if (snapshot.status !== 'available' || !('data' in snapshot)) return snapshot;
    const data = snapshot.data as CertifiedSnapshotData;
    const contributionRate = data.metrics.find((item) => item.key === 'sales.known_contribution_margin_rate');
    if (!contributionRate || contributionRate.value === null) return { status: 'not_available', reason: 'Certified sales contribution-margin evidence is missing or unavailable because source coverage is incomplete.' };
    return {
      marginAudit: {
        targetContributionMarginRate: threshold * 100,
        certifiedKnownContributionMarginRatePercent: Number(contributionRate.value) * 100,
        belowTarget: contributionRate.value < threshold,
        evidence: data.metrics.filter((item) => ['sales.known_contribution_margin_rate', 'sales.known_contribution_margin', 'sales.cost_coverage_score'].includes(item.key)),
        limitations: 'This is an aggregate certified metric, not order-level attribution. Known contribution margin excludes unrecorded labour, overhead, marketplace fees, commissions, and other variable costs.',
      },
    };
  }

  private async dispatchConsolidationOptions(args: { periodDays?: number }) {
    const since = new Date(Date.now() - (args.periodDays ?? 7) * 86_400_000);
    const shipments = await this.db.salesShipment.findMany({
      where: { createdAt: { gte: since }, status: { in: ['CREATED', 'STAGED', 'READY'] } },
      select: { id: true, shipmentNumber: true, warehouseLocationId: true, mode: true, status: true, freightAmount: true },
      take: 500,
    });
    const groups = new Map<string, typeof shipments>();
    shipments.forEach((shipment) => {
      const group = groups.get(shipment.warehouseLocationId) ?? [];
      group.push(shipment);
      groups.set(shipment.warehouseLocationId, group);
    });
    return {
      status: shipments.length ? 'available' : 'no_open_shipments',
      consolidationSummary: {
        pendingShipments: shipments.length,
        consolidationOpportunities: [...groups].filter(([, rows]) => rows.length > 1).map(([warehouseLocationId, rows]) => ({
          warehouseLocationId,
          eligibleShipments: rows.length,
          shipmentModes: [...new Set(rows.map((row) => row.mode))],
          shipmentNumbers: rows.map((row) => row.shipmentNumber),
          recordedFreightINR: rows.reduce((sum, row) => sum + Number(row.freightAmount), 0),
        })),
        estimatedFreightSavingsINR: null,
        limitation: 'Grouping is by source warehouse only. Route, destination, capacity, and carrier-rate data are not certified, so savings are not estimated.',
      },
    };
  }

  private async comprehensiveEnterprisePulse() {
    const [salesSnapshot, inventorySnapshot, procurementSnapshot, productionSnapshot, fulfillmentSnapshot] = await Promise.all([
      this.getModuleSnapshot('SALES'),
      this.getModuleSnapshot('INVENTORY'),
      this.getModuleSnapshot('PROCUREMENT'),
      this.getModuleSnapshot('PRODUCTION'),
      this.getModuleSnapshot('FULFILLMENT'),
    ]);

    return {
      executivePulse: {
        generatedAt: new Date().toISOString(),
        modules: Object.fromEntries([
          ['sales', salesSnapshot], ['inventory', inventorySnapshot], ['procurement', procurementSnapshot],
          ['production', productionSnapshot], ['fulfillment', fulfillmentSnapshot],
        ].map(([key, snapshot]) => {
          const value = snapshot as typeof salesSnapshot;
          if (value.status !== 'available' || !('data' in value)) return [key, { status: 'NEEDS_DATA' }];
          const data = value.data as CertifiedSnapshotData;
          return [key, {
            status: data.opportunities.length ? 'ATTENTION_REQUIRED' : 'NO_CERTIFIED_RISK_FOUND',
            snapshotId: value.snapshotId,
            capturedAt: value.capturedAt,
            opportunityCount: data.opportunities.length,
            metricCount: data.metrics.length,
            notices: data.notices,
          }];
        })),
        limitation: 'This pulse summarizes the latest certified snapshots; it is not an independently calculated health score.',
      },
    };
  }

  private async opportunities(module: IntelligenceModule, snapshotId: string | undefined, keywords: string[]) {
    const snapshot = await this.getModuleSnapshot(module, snapshotId);
    if (snapshot.status !== 'available' || !('data' in snapshot)) return snapshot;
    const data = snapshot.data as CertifiedSnapshotData;
    return { ...snapshot, data: { ...data, opportunities: data.opportunities.filter((opportunity) => keywords.some((keyword) => `${opportunity.category} ${opportunity.actionCode}`.toLowerCase().includes(keyword))) } };
  }

  private async qualityAndLoss(snapshotId?: string) {
    const snapshot = await this.getModuleSnapshot('PRODUCTION', snapshotId);
    if (snapshot.status !== 'available' || !('data' in snapshot)) return snapshot;
    const data = snapshot.data as CertifiedSnapshotData;
    return {
      ...snapshot,
      module: 'QUALITY',
      sourceModule: 'PRODUCTION',
      data: {
        ...data,
        metrics: data.metrics.filter((item) => item.key.startsWith('quality.')),
        opportunities: data.opportunities.filter((item) => item.category === 'QUALITY_AND_ABNORMAL_LOSS'),
      },
      limitation: 'Quality evidence is certified as part of the Production snapshot; it does not have an independent runtime profile in this release.',
    };
  }

  private async financialSummary(snapshotId?: string) {
    const snapshot = await this.getModuleSnapshot('SALES', snapshotId);
    if (snapshot.status !== 'available' || !('data' in snapshot)) return snapshot;
    const data = snapshot.data as CertifiedSnapshotData;
    const allowed = new Set(['sales.booked_net_revenue', 'sales.gross_shipped_revenue', 'sales.shipped_discounts', 'sales.credited_returns', 'sales.tax_excluded_net_revenue', 'sales.dispatched_net_revenue', 'sales.delivered_net_revenue', 'sales.recorded_shipped_tax', 'sales.collected_cash', 'sales.cogs_actual_inventory_cost', 'sales.gross_profit', 'sales.gross_margin_rate', 'sales.recorded_outbound_freight', 'sales.known_contribution_margin', 'sales.known_contribution_margin_rate', 'sales.cost_coverage_score']);
    return { ...snapshot, statement: 'Operational shipped revenue is not accounting-recognized revenue. Known contribution margin is not net profit. Every metric includes provenance and may be unavailable when source coverage is incomplete.', data: { ...data, metrics: data.metrics.filter((metric) => allowed.has(metric.key)), opportunities: [] } };
  }

  private metricDefinitions(module: IntelligenceModule, metricKey?: string, metricVersion?: string) {
    const prefix = module.toLowerCase() === 'fulfillment' ? 'fulfillment.' : `${module.toLowerCase()}.`;
    return { definitions: Object.fromEntries(Object.entries(definitions).filter(([key, value]) =>
      (module === 'EXECUTIVE' || key.startsWith(prefix) || (module === 'PRODUCTION' && key.startsWith('quality.'))) &&
      (!metricKey || key === metricKey) &&
      (!metricVersion || value.version === metricVersion))) };
  }

  private async resourceEvidence(resourceType: string | undefined, resourceId: string | undefined, callerModule: IntelligenceModule) {
    if (!resourceType || !resourceId) throw new ValidationError('resourceType and resourceId are required.');
    const grants: Record<string, IntelligenceModule[]> = {
      ReplenishmentPolicy: ['EXECUTIVE', 'INVENTORY', 'PROCUREMENT'],
      SalesOrder: ['EXECUTIVE', 'SALES', 'FULFILLMENT'],
      PurchaseOrder: ['EXECUTIVE', 'PROCUREMENT'],
      ProductionPlan: ['EXECUTIVE', 'PRODUCTION'],
    };
    if (!grants[resourceType]?.includes(callerModule)) {
      throw new ValidationError(`Resource type '${resourceType}' is outside the '${callerModule}' evidence scope.`);
    }
    if (resourceType === 'ReplenishmentPolicy') {
      const policy = await this.db.replenishmentPolicy.findUnique({ where: { id: resourceId }, select: { id: true, itemType: true, itemId: true, locationId: true, reorderPoint: true, safetyStock: true, orderUpToQuantity: true, minimumOrderQty: true, orderMultiple: true, leadTimeDays: true, currency: true, mode: true, isActive: true, updatedAt: true } });
      if (!policy) throw new NotFoundError('Replenishment policy not found.');
      return policy;
    }
    if (resourceType === 'SalesOrder') {
      const order = await this.db.salesOrder.findUnique({ where: { id: resourceId }, select: { id: true, orderNumber: true, channel: true, status: true, paymentStatus: true, allocationStatus: true, currency: true, subtotal: true, discountTotal: true, taxTotal: true, chargeTotal: true, orderedAt: true, promisedAt: true, dispatchedAt: true, deliveredAt: true, updatedAt: true } });
      if (!order) throw new NotFoundError('Sales order not found.');
      return order;
    }
    if (resourceType === 'PurchaseOrder') {
      const order = await this.db.purchaseOrder.findUnique({ where: { id: resourceId }, select: { id: true, poNumber: true, status: true, currency: true, subtotal: true, taxAmount: true, totalAmount: true, createdAt: true, approvedAt: true, sentAt: true, updatedAt: true } });
      if (!order) throw new NotFoundError('Purchase order not found.');
      return order;
    }
    if (resourceType === 'ProductionPlan') {
      const plan = await this.db.productionPlan.findUnique({ where: { id: resourceId }, select: { id: true, planNumber: true, scheduleDate: true, quantity: true, completedQuantity: true, status: true, plannedStartAt: true, plannedEndAt: true, completedAt: true, targetLocationId: true, updatedAt: true } });
      if (!plan) throw new NotFoundError('Production plan not found.');
      return plan;
    }
    throw new ValidationError(`Resource type '${resourceType}' is not available through the evidence boundary.`);
  }
}

export const intelligenceToolsService = new IntelligenceToolsService();
