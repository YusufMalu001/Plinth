import { IntelligenceModule, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

const METRIC_VERSION = '2026-10-01.2';
const DAY_MS = 86_400_000;

type MetricUnit = 'INR' | 'COUNT' | 'PERCENT' | 'DAYS' | 'HOURS' | 'QUANTITY';
type FinancialReturnRow = {
  id: string;
  salesOrderId: string;
  status: string;
  occurredAt: Date | null;
  requestedAt: Date;
  currency: string;
  creditedNetAmount: Prisma.Decimal | null;
  taxCreditAmount: Prisma.Decimal | null;
  salesOrder: { currency: string };
  lines: Array<{ salesOrderLineId: string; quantity: Prisma.Decimal }>;
};

export interface CertifiedMetric {
  key: string;
  value: number | null;
  unit: MetricUnit;
  currency?: string;
  provenance: 'ACTUAL' | 'CALCULATED' | 'ESTIMATED' | 'FORECAST' | 'ASSUMPTION' | 'UNKNOWN';
  freshnessStatus: 'FRESH' | 'STALE' | 'UNKNOWN';
  dataQualityScore: number | null;
  dimensions?: Record<string, string | number | boolean | null>;
  sourceRefs: Array<{ resource: string; filter: string }>;
}

export interface DeterministicOpportunity {
  id: string;
  category: string;
  actionCode: string;
  title: string;
  situation: string;
  metricKeys: string[];
  expectedImpact: {
    metricKey: string;
    unit: string;
    currency?: string;
    horizonDays: number;
    low: number;
    base: number;
    high: number;
    sourceMetricKeys: string[];
  };
  targetResource?: string;
  targetResourceId?: string;
}

export interface CertifiedSnapshotData {
  module: IntelligenceModule;
  metricVersion: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  /** Latest timestamp observed on the source records used by this snapshot. */
  sourceLatestAt: string | null;
  reportingCurrency: 'INR';
  metrics: CertifiedMetric[];
  opportunities: DeterministicOpportunity[];
  notices: string[];
}

const numberValue = (value: Prisma.Decimal | number | string | null | undefined) => Number(value ?? 0);
const decimalValue = (value: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(String(value ?? 0));
const round = (value: number, places = 2) => Number(value.toFixed(places));
const clampScore = (value: number) => new Prisma.Decimal(Math.max(0, Math.min(1, value)).toFixed(4));

function latestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => value && (!latest || value > latest) ? value : latest, null);
}

function period(days: number, now = new Date()) {
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - days * DAY_MS);
  return { periodStart, periodEnd };
}

function freshnessScore(latest: Date | null, now: Date) {
  if (!latest) return 0;
  const hours = Math.max(0, now.getTime() - latest.getTime()) / 3_600_000;
  if (hours <= 24) return 1;
  if (hours <= 48) return 0.9;
  if (hours <= 168) return 0.75;
  return 0.5;
}

function metric(key: string, value: number | null, unit: MetricUnit, resource: string, filter: string, extra: Partial<CertifiedMetric> = {}): CertifiedMetric {
  return { key, value: value === null ? null : round(value, unit === 'PERCENT' ? 4 : 2), unit, provenance: 'CALCULATED', freshnessStatus: 'UNKNOWN', dataQualityScore: null, sourceRefs: [{ resource, filter }], ...extra };
}

export class CertifiedMetricsService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async capture(module: IntelligenceModule, days = 30, periodStartOverride?: Date) {
    const now = new Date();
    const { periodStart: rollingPeriodStart, periodEnd } = period(days, now);
    const periodStart = periodStartOverride ?? rollingPeriodStart;
    const data = await this.calculate(module, periodStart, periodEnd);
    const latestDataAt = this.latestTimestamp(data);
    const freshness = freshnessScore(latestDataAt, now);
    // Snapshot freshness is calculated from the latest observed source timestamp.
    // We do not have a per-metric source timestamp, so metric freshness stays UNKNOWN.
    const coverageKeys = module === 'EXECUTIVE'
      ? ['sales.cost_coverage_score', 'inventory.cost_coverage_score']
      : module === 'SALES'
        ? ['sales.cost_coverage_score']
        : module === 'INVENTORY'
          ? ['inventory.cost_coverage_score']
          : [];
    const coverageValues = coverageKeys.map((key) => this.metricValue(data.metrics, key)).filter((value): value is number => value !== undefined && value !== null);
    const costCoverage = coverageValues.length ? Math.min(...coverageValues) : 0;

    return this.db.$transaction(async (tx) => {
      const snapshot = await tx.businessSnapshot.create({
        data: {
          module,
          scopeType: 'ENTERPRISE',
          periodStart,
          periodEnd,
          metricVersion: METRIC_VERSION,
          data: data as unknown as Prisma.InputJsonValue,
          sourceRefs: this.sourceRefs(data.metrics) as Prisma.InputJsonValue,
          freshnessScore: clampScore(freshness),
          costCoverageScore: clampScore(costCoverage),
        },
      });
      if (data.metrics.length) {
        await (tx.metricSnapshot as any).createMany({
          data: data.metrics.map((item) => ({
            businessSnapshotId: snapshot.id,
            key: item.key,
            value: item.value === null ? null : new Prisma.Decimal(item.value.toFixed(6)),
            unit: item.unit,
            currency: item.currency,
            provenance: item.provenance,
            freshnessStatus: item.freshnessStatus,
            dataQualityScore: item.dataQualityScore === null ? null : new Prisma.Decimal(item.dataQualityScore.toFixed(4)),
            dimensions: item.dimensions as Prisma.InputJsonValue | undefined,
            sourceRefs: item.sourceRefs as unknown as Prisma.InputJsonValue,
          })),
        });
      }
      return tx.businessSnapshot.findUniqueOrThrow({ where: { id: snapshot.id }, include: { metrics: true } });
    });
  }

  async calculate(module: IntelligenceModule, periodStart: Date, periodEnd: Date): Promise<CertifiedSnapshotData> {
    if (module === 'EXECUTIVE') return this.executive(periodStart, periodEnd);
    if (module === 'SALES') return this.sales(periodStart, periodEnd);
    if (module === 'INVENTORY') return this.inventory(periodStart, periodEnd);
    if (module === 'PROCUREMENT') return this.procurement(periodStart, periodEnd);
    if (module === 'PRODUCTION') return this.production(periodStart, periodEnd);
    if (module === 'FULFILLMENT') return this.fulfillment(periodStart, periodEnd);
    return this.empty(module, periodStart, periodEnd, 'This module is not certified for automated recommendations yet.');
  }

  private base(
    module: IntelligenceModule,
    periodStart: Date,
    periodEnd: Date,
    metrics: CertifiedMetric[],
    opportunities: DeterministicOpportunity[],
    notices: string[] = [],
    sourceLatestAt: Date | null = null,
  ): CertifiedSnapshotData {
    return {
      module,
      metricVersion: METRIC_VERSION,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generatedAt: new Date().toISOString(),
      sourceLatestAt: sourceLatestAt?.toISOString() ?? null,
      reportingCurrency: 'INR',
      metrics,
      opportunities,
      notices,
    };
  }

  private empty(module: IntelligenceModule, periodStart: Date, periodEnd: Date, notice: string) {
    return this.base(module, periodStart, periodEnd, [], [], [notice]);
  }

  private async sales(periodStart: Date, periodEnd: Date) {
    const [orders, shipments, returnCredits, cogsRows, activeCustomers, trailingCustomerOrders, legacyReturnedOrders] = await Promise.all([
      this.db.salesOrder.findMany({
        where: { orderedAt: { gte: periodStart, lte: periodEnd }, status: { notIn: ['CANCELLED'] } },
        select: {
          id: true, customerId: true, channel: true, currency: true, status: true, subtotal: true, discountTotal: true, chargeTotal: true,
          orderedAt: true, dispatchedAt: true, deliveredAt: true, updatedAt: true,
          lines: { select: { productId: true, orderedQuantity: true, shippedQuantity: true, returnedQuantity: true, unitPrice: true, discountAmount: true } },
          payments: { where: { status: { in: ['PAID', 'PARTIALLY_PAID'] } }, select: { amount: true, paidAt: true } },
          shipments: { where: { status: { not: 'CANCELLED' } }, select: { id: true, freightAmount: true } },
        },
      }),
      this.db.salesShipment.findMany({
        where: { status: { not: 'CANCELLED' }, handedOverAt: { gte: periodStart, lte: periodEnd } },
        select: {
          id: true, freightAmount: true, handedOverAt: true,
          salesOrder: { select: { id: true, currency: true } },
          lines: { select: { quantity: true, salesOrderLine: { select: { id: true, productId: true, returnedQuantity: true, cancelledQuantity: true, orderedQuantity: true, unitPrice: true, discountAmount: true, taxAmount: true } } } },
        },
      }),
      (this.db as any).salesFinancialReturn.findMany({
        where: { status: { in: ['REQUESTED', 'COMPLETED'] } },
        select: { id: true, salesOrderId: true, status: true, occurredAt: true, requestedAt: true, currency: true, creditedNetAmount: true, taxCreditAmount: true, salesOrder: { select: { currency: true } }, lines: { select: { salesOrderLineId: true, quantity: true } } },
      }) as Promise<FinancialReturnRow[]>,
      this.db.inventoryLedgerEntry.findMany({
        where: { sourceType: 'SALES_SHIPMENT', postedAt: { gte: periodStart, lte: periodEnd }, quantityDelta: { not: 0 } },
        select: { sourceType: true, sourceId: true, itemType: true, itemId: true, totalCost: true, quantityDelta: true, unitCost: true, averageCostBefore: true, postedAt: true },
      }),
      this.db.customer.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
      this.db.salesOrder.findMany({
        where: { orderedAt: { gte: new Date(periodEnd.getTime() - 365 * DAY_MS), lte: periodEnd }, status: { notIn: ['CANCELLED'] }, customerId: { not: null } },
        select: { customerId: true, orderedAt: true, subtotal: true, updatedAt: true },
      }),
      this.db.salesOrder.findMany({
        where: { status: { notIn: ['CANCELLED'] }, currency: 'INR', lines: { some: { returnedQuantity: { gt: 0 } } } },
        select: { id: true, lines: { where: { returnedQuantity: { gt: 0 } }, select: { id: true, returnedQuantity: true } } },
      }),
    ]);

    const inrOrders = orders.filter((order) => order.currency === 'INR');
    const bookedRevenue = inrOrders.reduce((sum, order) => sum.plus(decimalValue(order.subtotal).minus(decimalValue(order.discountTotal)).plus(decimalValue(order.chargeTotal))), new Prisma.Decimal(0));
    const inrShipments = shipments.filter((shipment) => shipment.salesOrder.currency === 'INR');
    let grossRevenue = new Prisma.Decimal(0);
    let discounts = new Prisma.Decimal(0);
    let recordedTax = new Prisma.Decimal(0);
    let shippedQuantity = new Prisma.Decimal(0);
    const shippedByShipmentProduct = new Map<string, Prisma.Decimal>();
    for (const shipment of inrShipments) {
      for (const line of shipment.lines) {
        const ordered = decimalValue(line.salesOrderLine.orderedQuantity);
        const uncancelled = Prisma.Decimal.max(new Prisma.Decimal(0), ordered.minus(decimalValue(line.salesOrderLine.cancelledQuantity)));
        const quantity = Prisma.Decimal.min(decimalValue(line.quantity), uncancelled);
        grossRevenue = grossRevenue.plus(quantity.mul(decimalValue(line.salesOrderLine.unitPrice)));
        if (ordered.gt(0)) {
          discounts = discounts.plus(quantity.mul(decimalValue(line.salesOrderLine.discountAmount)).div(ordered));
          recordedTax = recordedTax.plus(quantity.mul(decimalValue(line.salesOrderLine.taxAmount)).div(ordered));
        }
        shippedQuantity = shippedQuantity.plus(quantity);
        const key = `${shipment.id}:${line.salesOrderLine.productId}`;
        shippedByShipmentProduct.set(key, (shippedByShipmentProduct.get(key) ?? new Prisma.Decimal(0)).plus(quantity));
      }
    }
    const periodCredits = returnCredits.filter((credit) => credit.status === 'COMPLETED' && credit.occurredAt && credit.occurredAt >= periodStart && credit.occurredAt <= periodEnd && credit.currency === 'INR' && credit.salesOrder.currency === 'INR');
    const netCredits = periodCredits.reduce((sum, credit) => credit.creditedNetAmount === null ? sum : sum.plus(decimalValue(credit.creditedNetAmount)), new Prisma.Decimal(0));
    const taxCredits = periodCredits.reduce((sum, credit) => credit.taxCreditAmount === null ? sum : sum.plus(decimalValue(credit.taxCreditAmount)), new Prisma.Decimal(0));
    const unpricedReturnCredit = periodCredits.some((credit) => credit.creditedNetAmount === null);
    const unpricedTaxCredit = periodCredits.some((credit) => credit.taxCreditAmount === null);
    const recordedReturnQuantities = new Map<string, Prisma.Decimal>();
    for (const record of returnCredits) for (const line of record.lines) {
      const key = line.salesOrderLineId;
      recordedReturnQuantities.set(key, (recordedReturnQuantities.get(key) ?? new Prisma.Decimal(0)).plus(decimalValue(line.quantity)));
    }
    const legacyReturnQuantity = legacyReturnedOrders.some((order) => order.lines.some((line) => decimalValue(line.returnedQuantity).gt(recordedReturnQuantities.get(line.id) ?? new Prisma.Decimal(0))));
    const computedNetRevenue = grossRevenue.minus(discounts).minus(netCredits);
    const netRevenue = unpricedReturnCredit || legacyReturnQuantity ? null : computedNetRevenue;
    const deliveredRevenue = inrOrders.filter((order) => Boolean(order.deliveredAt)).reduce((sum, order) => sum.plus(decimalValue(order.subtotal).minus(decimalValue(order.discountTotal)).plus(decimalValue(order.chargeTotal))), new Prisma.Decimal(0));
    const collections = inrOrders.flatMap((order) => order.payments).filter((payment) => payment.paidAt && payment.paidAt >= periodStart && payment.paidAt <= periodEnd).reduce((sum, payment) => sum.plus(decimalValue(payment.amount)), new Prisma.Decimal(0));
    const shipmentIds = new Set(inrShipments.map((shipment) => shipment.id));
    const eligibleCogsRows = cogsRows.filter((row) => row.itemType === 'PRODUCT' && shipmentIds.has(row.sourceId) && shippedByShipmentProduct.has(`${row.sourceId}:${row.itemId}`));
    // Negative ledger quantity issues inventory to the shipment; positive entries
    // on the same source reverse that cost and must reduce net COGS.
    const cogs = eligibleCogsRows.reduce((sum, row) => sum.plus(decimalValue(row.totalCost).mul(decimalValue(row.quantityDelta).lt(0) ? 1 : -1)), new Prisma.Decimal(0));
    const costedByShipmentProduct = new Map<string, Prisma.Decimal>();
    for (const row of eligibleCogsRows) {
      const key = `${row.sourceId}:${row.itemId}`;
      costedByShipmentProduct.set(key, (costedByShipmentProduct.get(key) ?? new Prisma.Decimal(0)).minus(decimalValue(row.quantityDelta)));
    }
    const costedQuantity = [...costedByShipmentProduct].reduce((sum, [key, quantity]) => sum.plus(Prisma.Decimal.max(new Prisma.Decimal(0), Prisma.Decimal.min(quantity, shippedByShipmentProduct.get(key) ?? new Prisma.Decimal(0)))), new Prisma.Decimal(0));
    const costLedgerAnomaly = [...costedByShipmentProduct].some(([key, quantity]) => quantity.lt(0) || quantity.gt(shippedByShipmentProduct.get(key) ?? new Prisma.Decimal(0)));
    const freight = inrShipments.reduce((sum, shipment) => sum.plus(decimalValue(shipment.freightAmount)), new Prisma.Decimal(0));
    const costCoverage = shippedQuantity.gt(0) ? Prisma.Decimal.min(new Prisma.Decimal(1), costedQuantity.div(shippedQuantity)).toNumber() : 0;
    const completeCostCoverage = shippedQuantity.gt(0) && costCoverage >= 0.999999 && !costLedgerAnomaly;
    const grossProfit = completeCostCoverage && netRevenue !== null ? netRevenue.minus(cogs) : null;
    const grossMarginRate = grossProfit !== null && netRevenue !== null && netRevenue.gt(0) ? grossProfit.div(netRevenue) : null;
    const knownContributionMargin = completeCostCoverage && netRevenue !== null ? netRevenue.minus(cogs).minus(freight) : null;
    const contributionRate = knownContributionMargin !== null && netRevenue !== null && netRevenue.gt(0) ? knownContributionMargin.div(netRevenue) : null;
    const repeatCustomers = new Map<string, number>();
    orders.forEach((order) => { if (order.customerId) repeatCustomers.set(order.customerId, (repeatCustomers.get(order.customerId) ?? 0) + 1); });
    const customerHistory = new Map<string, Array<{ orderedAt: Date; subtotal: Prisma.Decimal }>>();
    trailingCustomerOrders.forEach((order) => {
      if (!order.customerId) return;
      customerHistory.set(order.customerId, [...(customerHistory.get(order.customerId) ?? []), { orderedAt: order.orderedAt, subtotal: order.subtotal }]);
    });
    const dormantCustomers = activeCustomers.filter((customer) => {
      const history = customerHistory.get(customer.id) ?? [];
      return !history.some((order) => order.orderedAt >= new Date(periodEnd.getTime() - 90 * DAY_MS));
    });
    const customerEngagementScores = activeCustomers.map((customer) => {
      const history = customerHistory.get(customer.id) ?? [];
      if (!history.length) return 0;
      const latestOrder = history.reduce((latest, order) => order.orderedAt > latest ? order.orderedAt : latest, history[0].orderedAt);
      const daysSinceOrder = (periodEnd.getTime() - latestOrder.getTime()) / DAY_MS;
      const recency = daysSinceOrder <= 30 ? 40 : daysSinceOrder <= 90 ? 25 : 10;
      const frequency = history.length >= 6 ? 30 : history.length >= 3 ? 22 : history.length >= 2 ? 15 : 8;
      const value = history.reduce((sum, order) => sum + numberValue(order.subtotal), 0);
      const valueScore = Math.min(30, Math.log10(Math.max(1, value)) * 5);
      return Math.round(recency + frequency + valueScore);
    });
    const averageCustomerEngagement = customerEngagementScores.length
      ? customerEngagementScores.reduce((sum, score) => sum + score, 0) / customerEngagementScores.length
      : 0;
    const marketplaceOrders = orders.filter((order) => order.status !== 'CANCELLED' && ['AMAZON', 'E_TRADE'].includes(order.channel));
    const marketplaceValidationFailures = marketplaceOrders.filter((order) => order.status === 'VALIDATION_FAILED');
    const amazonOrders = marketplaceOrders.filter((order) => order.channel === 'AMAZON');
    const eTradeOrders = marketplaceOrders.filter((order) => order.channel === 'E_TRADE');
    const marketplaceBookedRevenue = marketplaceOrders.filter((order) => order.currency === 'INR')
      .reduce((sum, order) => sum + numberValue(order.subtotal) - numberValue(order.discountTotal) + numberValue(order.chargeTotal), 0);

    const metrics = [
      metric('sales.booked_net_revenue', bookedRevenue.toNumber(), 'INR', 'SalesOrder', 'orderedAt in certified period; INR; subtotal - discount + charges; operational booked value, tax excluded', { currency: 'INR', provenance: 'CALCULATED' }),
      metric('sales.gross_shipped_revenue', grossRevenue.toDecimalPlaces(2).toNumber(), 'INR', 'SalesShipmentLine', 'handedOverAt in certified period; INR; shipped quantity * stored unit price; before discounts and tax', { currency: 'INR', provenance: 'CALCULATED' }),
      metric('sales.shipped_discounts', discounts.toDecimalPlaces(2).toNumber(), 'INR', 'SalesShipmentLine', 'line discount allocated by shipped quantity / ordered quantity; INR', { currency: 'INR', provenance: 'CALCULATED' }),
      metric('sales.credited_returns', unpricedReturnCredit || legacyReturnQuantity ? null : netCredits.toNumber(), 'INR', 'SalesFinancialReturn', 'completed dated returns with explicitly recorded credited net amount; INR', { currency: 'INR', provenance: unpricedReturnCredit || legacyReturnQuantity ? 'UNKNOWN' : 'ACTUAL', dimensions: { availability: unpricedReturnCredit || legacyReturnQuantity ? 'INCOMPLETE' : 'AVAILABLE' } }),
      metric('sales.tax_excluded_net_revenue', netRevenue?.toDecimalPlaces(2).toNumber() ?? null, 'INR', 'SalesShipmentLine', unpricedReturnCredit ? 'UNAVAILABLE: completed return has no credited net amount' : legacyReturnQuantity ? 'UNAVAILABLE: legacy returned quantity has no dated financial return record' : 'gross shipped revenue - shipped discount - dated credited returns; INR; tax and unallocated charges excluded', { currency: 'INR', provenance: netRevenue === null ? 'UNKNOWN' : 'CALCULATED' }),
      metric('sales.dispatched_net_revenue', netRevenue?.toDecimalPlaces(2).toNumber() ?? null, 'INR', 'SalesShipmentLine', 'compatibility key; same definition as tax_excluded_net_revenue', { currency: 'INR', provenance: netRevenue === null ? 'UNKNOWN' : 'CALCULATED' }),
      metric('sales.delivered_net_revenue', deliveredRevenue.toNumber(), 'INR', 'SalesOrder', 'INR order cohort with deliveredAt in period; order totals are operational booked values, not invoiced revenue', { currency: 'INR', provenance: 'CALCULATED' }),
      metric('sales.recorded_shipped_tax', unpricedTaxCredit ? null : recordedTax.minus(taxCredits).toDecimalPlaces(2).toNumber(), 'INR', 'SalesOrderLine', unpricedTaxCredit ? 'UNAVAILABLE: completed return has no recorded tax credit amount' : 'stored line tax allocated by shipped quantity less explicitly recorded return tax credits; operational only, not statutory payable', { currency: 'INR', provenance: unpricedTaxCredit ? 'UNKNOWN' : 'CALCULATED' }),
      metric('sales.collected_cash', collections.toNumber(), 'INR', 'SalesOrderPayment', 'paidAt in certified period; status PAID or PARTIALLY_PAID; INR orders', { currency: 'INR', provenance: 'ACTUAL' }),
      metric('sales.cogs_actual_inventory_cost', cogs.toDecimalPlaces(2).toNumber(), 'INR', 'InventoryLedgerEntry', 'eligible posted SALES_SHIPMENT cost rows net of positive quantity reversals; matched to shipments handed over in period; INR', { currency: 'INR', provenance: 'ACTUAL' }),
      metric('sales.gross_profit', grossProfit?.toDecimalPlaces(2).toNumber() ?? null, 'INR', 'CertifiedSalesMargin', completeCostCoverage ? 'tax-excluded net revenue - eligible posted shipment COGS; INR' : 'UNAVAILABLE: posted COGS quantity does not cover shipped quantity', { currency: 'INR', provenance: grossProfit === null ? 'UNKNOWN' : 'CALCULATED', dimensions: { availability: grossProfit === null ? 'UNAVAILABLE' : 'AVAILABLE' } }),
      metric('sales.gross_margin_rate', grossMarginRate?.toNumber() ?? null, 'PERCENT', 'CertifiedSalesMargin', grossProfit === null ? 'UNAVAILABLE: complete COGS coverage and positive net revenue required' : 'gross profit / tax-excluded net revenue', { provenance: grossMarginRate === null ? 'UNKNOWN' : 'CALCULATED' }),
      metric('sales.recorded_outbound_freight', freight.toDecimalPlaces(2).toNumber(), 'INR', 'SalesShipment', 'INR non-cancelled shipments handed over in certified period; freightAmount', { currency: 'INR', provenance: 'ACTUAL' }),
      metric('sales.known_contribution_margin', knownContributionMargin?.toDecimalPlaces(2).toNumber() ?? null, 'INR', 'CertifiedSalesMargin', completeCostCoverage ? 'tax-excluded net revenue - actual posted COGS - recorded outbound freight; excludes unrecorded variable costs' : 'UNAVAILABLE: complete COGS coverage required', { currency: 'INR', provenance: knownContributionMargin === null ? 'UNKNOWN' : 'CALCULATED' }),
      metric('sales.known_contribution_margin_rate', contributionRate?.toNumber() ?? null, 'PERCENT', 'CertifiedSalesMargin', contributionRate === null ? 'UNAVAILABLE: complete COGS coverage and positive net revenue required' : 'known contribution margin / tax-excluded net revenue; not net profit', { provenance: contributionRate === null ? 'UNKNOWN' : 'CALCULATED' }),
      metric('sales.cost_coverage_score', costCoverage, 'PERCENT', 'InventoryLedgerEntry', 'eligible outbound costed quantity / shipped quantity; matched by shipment source', { provenance: 'CALCULATED', dataQualityScore: costCoverage }),
      metric('sales.excluded_non_inr_shipment_count', shipments.filter((shipment) => shipment.salesOrder.currency !== 'INR').length, 'COUNT', 'SalesShipment', 'shipments in certified period excluded from INR aggregates because currency is not INR'),
      metric('sales.order_count', orders.length, 'COUNT', 'SalesOrder', 'orderedAt in certified period; cancelled excluded'),
      metric('sales.repeat_customer_count', [...repeatCustomers.values()].filter((count) => count > 1).length, 'COUNT', 'SalesOrder', 'customers with more than one order in certified period'),
      metric('sales.scored_active_customer_count', activeCustomers.length, 'COUNT', 'Customer', 'active customer accounts included in 365-day recency/frequency/value engagement scoring'),
      metric('sales.dormant_customer_count', dormantCustomers.length, 'COUNT', 'Customer', 'active customers with no non-cancelled sales order in trailing 90 days'),
      metric('sales.average_customer_engagement_score', averageCustomerEngagement, 'PERCENT', 'SalesOrder', '0-100 heuristic from recency (40), frequency (30), and log-scaled 365-day order value (up to 30); not creditworthiness'),
      metric('sales.amazon_order_count', amazonOrders.length, 'COUNT', 'SalesOrder', 'non-cancelled AMAZON orders booked in certified period'),
      metric('sales.etrade_order_count', eTradeOrders.length, 'COUNT', 'SalesOrder', 'non-cancelled E_TRADE orders booked in certified period'),
      metric('sales.marketplace_booked_revenue', marketplaceBookedRevenue, 'INR', 'SalesOrder', 'non-cancelled INR Amazon and E-Trade orders; subtotal - discount + charges; tax excluded', { currency: 'INR' }),
      metric('sales.marketplace_validation_failure_count', marketplaceValidationFailures.length, 'COUNT', 'SalesOrder', 'AMAZON or E_TRADE orders in VALIDATION_FAILED state'),
    ];

    const opportunities: DeterministicOpportunity[] = [];
    if (netRevenue !== null && netRevenue.gt(0) && knownContributionMargin !== null && contributionRate !== null && contributionRate.lt(0.15)) {
      const leakage = Math.max(0, netRevenue.toNumber() * (0.15 - contributionRate.toNumber()));
      opportunities.push({
        id: 'sales-margin-review:enterprise',
        category: 'MARGIN_LEAKAGE',
        actionCode: 'sales.margin_review',
        title: 'Review contribution-margin leakage before increasing sales volume',
        situation: `Known contribution margin is ${round(contributionRate.toNumber() * 100, 1)}% with ${round(costCoverage * 100, 1)}% cost coverage. This is not net profit.`,
        metricKeys: ['sales.known_contribution_margin_rate', 'sales.cost_coverage_score', 'sales.dispatched_net_revenue'],
        expectedImpact: { metricKey: 'sales.known_contribution_margin', unit: 'INR', currency: 'INR', horizonDays: 30, low: round(leakage * 0.2), base: round(leakage * 0.4), high: round(leakage * 0.65), sourceMetricKeys: ['sales.known_contribution_margin_rate', 'sales.dispatched_net_revenue'] },
      });
    }
    if (dormantCustomers.length) {
      opportunities.push({
        id: 'sales-dormant-customers:enterprise', category: 'DORMANT_CUSTOMER', actionCode: 'sales.dormant_customer_follow_up',
        title: 'Review active customer accounts with no order in 90 days',
        situation: `${dormantCustomers.length} active customer accounts have no non-cancelled sales order in the trailing 90 days. Engagement scores use order recency, frequency, and 365-day order value; they do not measure credit risk or dealer payment reliability.`,
        metricKeys: ['sales.dormant_customer_count', 'sales.average_customer_engagement_score'],
        expectedImpact: { metricKey: 'sales.customer_accounts_reviewed', unit: 'COUNT', horizonDays: 30, low: 0, base: Math.max(1, Math.ceil(dormantCustomers.length * 0.5)), high: dormantCustomers.length, sourceMetricKeys: ['sales.dormant_customer_count'] },
      });
    }
    if (marketplaceValidationFailures.length) {
      opportunities.push({
        id: 'sales-marketplace-validation:enterprise', category: 'MARKETPLACE_ORDER_EXCEPTION', actionCode: 'sales.marketplace_order_exception_review',
        title: 'Review marketplace order validation failures',
        situation: `${marketplaceValidationFailures.length} Amazon/E-Trade orders in the certified period failed validation and need a sales-operations review.`,
        metricKeys: ['sales.marketplace_validation_failure_count', 'sales.marketplace_booked_revenue'],
        expectedImpact: { metricKey: 'sales.marketplace_orders_reviewed', unit: 'COUNT', horizonDays: 7, low: 0, base: Math.ceil(marketplaceValidationFailures.length * 0.5), high: marketplaceValidationFailures.length, sourceMetricKeys: ['sales.marketplace_validation_failure_count'] },
      });
    }

    const sourceLatestAt = latestDate([
      ...orders.map((order) => order.updatedAt),
      ...inrOrders.flatMap((order) => order.payments.map((payment) => payment.paidAt)),
      ...shipments.map((shipment) => shipment.handedOverAt),
      ...periodCredits.map((credit) => credit.occurredAt),
      ...cogsRows.map((row) => row.postedAt),
    ]);
    return this.base('SALES', periodStart, periodEnd, metrics, opportunities, [
      'Operational shipped net revenue uses handed-over shipment lines, allocated discounts, and explicitly recorded completed return credits; it is not accounting-recognized revenue.',
      'Known contribution margin excludes unrecorded labour, overhead, marketplace fees, commissions, and other variable costs; it is not net profit.',
      'Non-INR shipments and orders are excluded from INR aggregate metrics; no FX conversion is applied.',
      ...(legacyReturnQuantity ? ['Net revenue is unavailable for shipment lines whose cumulative returned quantity is not reconciled to dated financial return records.'] : []),
      ...(unpricedReturnCredit ? ['Net revenue is unavailable because a completed return has no recorded credited net amount.'] : []),
      ...(unpricedTaxCredit ? ['Recorded shipped tax is unavailable because a completed return has no recorded tax credit amount.'] : []),
      ...(completeCostCoverage ? [] : ['Gross profit and contribution margin are unavailable because eligible shipment COGS does not fully cover shipped quantity.']),
    ], latestDate([sourceLatestAt, ...trailingCustomerOrders.map((order) => order.updatedAt)]));
  }

  private async inventory(periodStart: Date, periodEnd: Date) {
    const [balances, policies, openSignals, expiringLots] = await Promise.all([
      this.db.inventoryBalance.findMany({ select: { itemType: true, itemId: true, locationId: true, condition: true, quantity: true, reserved: true, averageCost: true, updatedAt: true } }),
      this.db.replenishmentPolicy.findMany({ where: { isActive: true }, select: { id: true, itemType: true, itemId: true, locationId: true, reorderPoint: true, safetyStock: true, orderUpToQuantity: true, approvedUnitCost: true, currency: true } }),
      this.db.replenishmentEvent.count({ where: { status: 'OPEN' } }),
      this.db.inventoryLot.count({ where: { expiresAt: { gte: new Date(), lte: new Date(Date.now() + 60 * DAY_MS) } } }),
    ]);
    const recentProductIssues = await this.db.inventoryLedgerEntry.findMany({
      where: { postedAt: { gte: new Date(periodEnd.getTime() - 90 * DAY_MS), lte: periodEnd }, movementType: 'ISSUE', quantityDelta: { lt: 0 }, itemType: 'PRODUCT' },
      select: { itemId: true, quantityDelta: true, postedAt: true },
    });
    let inventoryValue = new Prisma.Decimal(0);
    let availableQuantity = 0;
    let reservedQuantity = 0;
    let costedBalanceCount = 0;
    for (const balance of balances) {
      const quantity = numberValue(balance.quantity);
      const cost = numberValue(balance.averageCost);
      inventoryValue = inventoryValue.plus(decimalValue(balance.quantity).mul(decimalValue(balance.averageCost)));
      reservedQuantity += numberValue(balance.reserved);
      if (balance.condition === 'AVAILABLE') availableQuantity += quantity - numberValue(balance.reserved);
      if (quantity <= 0 || cost > 0) costedBalanceCount += 1;
    }
    const riskRows = policies.map((policy) => {
      const available = balances.filter((balance) => balance.itemType === policy.itemType && balance.itemId === policy.itemId && balance.locationId === policy.locationId && balance.condition === 'AVAILABLE').reduce((sum, balance) => sum + numberValue(balance.quantity) - numberValue(balance.reserved), 0);
      const required = Math.max(0, numberValue(policy.reorderPoint) - available);
      return { ...policy, available, required };
    }).filter((row) => row.required > 0);
    const issuedByProduct = new Map<string, number>();
    for (const entry of recentProductIssues) issuedByProduct.set(entry.itemId, (issuedByProduct.get(entry.itemId) ?? 0) + Math.abs(numberValue(entry.quantityDelta)));
    const productBalances = new Map<string, number>();
    for (const balance of balances) {
      if (balance.itemType !== 'PRODUCT' || balance.condition !== 'AVAILABLE') continue;
      productBalances.set(balance.itemId, (productBalances.get(balance.itemId) ?? 0) + Math.max(0, numberValue(balance.quantity) - numberValue(balance.reserved)));
    }
    const slowProductIds = [...productBalances].filter(([productId, available]) => available > 0 && !issuedByProduct.has(productId)).map(([productId]) => productId);
    const fastProductIds = [...productBalances].filter(([productId, available]) => {
      const dailyIssue = (issuedByProduct.get(productId) ?? 0) / 90;
      return dailyIssue > 0 && available / dailyIssue <= 14;
    }).map(([productId]) => productId);
    const slowStockValue = balances.filter((balance) => balance.itemType === 'PRODUCT' && slowProductIds.includes(balance.itemId) && balance.condition === 'AVAILABLE')
      .reduce((sum, balance) => sum.plus(decimalValue(Math.max(0, numberValue(balance.quantity) - numberValue(balance.reserved))).mul(decimalValue(balance.averageCost))), new Prisma.Decimal(0));
    const exposure = riskRows.filter((row) => row.currency === 'INR').reduce((sum, row) => sum.plus(decimalValue(row.required).mul(decimalValue(row.approvedUnitCost))), new Prisma.Decimal(0));
    const inventoryCostCoverage = balances.length ? costedBalanceCount / balances.length : 0;
    const metrics = [
      metric('inventory.value_at_average_cost', inventoryValue.toDecimalPlaces(2).toNumber(), 'INR', 'InventoryBalance', 'all balances; quantity * averageCost; as-of each balance.updatedAt', { currency: 'INR', provenance: 'CALCULATED', dataQualityScore: inventoryCostCoverage }),
      metric('inventory.available_quantity', availableQuantity, 'QUANTITY', 'InventoryBalance', 'AVAILABLE quantity - reserved'),
      metric('inventory.reserved_quantity', reservedQuantity, 'QUANTITY', 'InventoryBalance', 'all reserved quantity'),
      metric('inventory.replenishment_risk_count', riskRows.length, 'COUNT', 'ReplenishmentPolicy', 'available quantity below reorder point'),
      metric('inventory.slow_moving_product_count', slowProductIds.length, 'COUNT', 'InventoryLedgerEntry', 'positive available product stock with no ISSUE movement in trailing 90 days'),
      metric('inventory.slow_moving_stock_value', slowStockValue.toDecimalPlaces(2).toNumber(), 'INR', 'InventoryBalance', 'available product balances with no trailing 90-day ISSUE; net quantity * averageCost', { currency: 'INR', provenance: 'CALCULATED', dataQualityScore: inventoryCostCoverage }),
      metric('inventory.fast_moving_product_count', fastProductIds.length, 'COUNT', 'InventoryLedgerEntry', 'positive available product stock with at most 14 days cover at trailing 90-day ISSUE rate'),
      metric('inventory.replenishment_exposure', exposure.toDecimalPlaces(2).toNumber(), 'INR', 'ReplenishmentPolicy', 'INR policies only; required quantity * approved unit cost', { currency: 'INR', provenance: 'ESTIMATED' }),
      metric('inventory.open_replenishment_signal_count', openSignals, 'COUNT', 'ReplenishmentEvent', 'status OPEN'),
      metric('inventory.expiring_lot_count_60d', expiringLots, 'COUNT', 'InventoryLot', 'expiry within 60 days'),
      metric('inventory.cost_coverage_score', inventoryCostCoverage, 'PERCENT', 'InventoryBalance', 'positive-stock balances with non-zero average cost'),
    ];
    const opportunities = riskRows.slice(0, 10).map<DeterministicOpportunity>((row) => {
      const estimated = row.required * numberValue(row.approvedUnitCost);
      return {
        id: `inventory-replenishment:${row.id}`,
        category: 'STOCKOUT_RISK',
        actionCode: 'inventory.replenishment_review',
        title: `Review replenishment for ${row.itemType.toLowerCase()} ${row.itemId}`,
        situation: `Available quantity ${round(row.available, 4)} is below reorder point ${round(numberValue(row.reorderPoint), 4)} at location ${row.locationId}.`,
        metricKeys: ['inventory.replenishment_risk_count', 'inventory.replenishment_exposure'],
        expectedImpact: { metricKey: 'inventory.stockout_exposure_avoided', unit: 'INR', currency: row.currency, horizonDays: 30, low: round(estimated * 0.25), base: round(estimated * 0.5), high: round(estimated), sourceMetricKeys: ['inventory.replenishment_exposure'] },
        targetResource: 'ReplenishmentPolicy',
        targetResourceId: row.id,
      };
    });
    if (slowProductIds.length && slowStockValue.gt(0)) {
      opportunities.push({
        id: 'inventory-slow-moving:enterprise', category: 'EXCESS_STOCK', actionCode: 'inventory.excess_stock_action',
        title: 'Review product inventory with no issues in the last 90 days',
        situation: `${slowProductIds.length} stocked product${slowProductIds.length === 1 ? '' : 's'} had no recorded ISSUE movement in the trailing 90 days; available stock is valued at ₹${slowStockValue.toDecimalPlaces(2).toNumber().toLocaleString('en-IN')} using average cost.`,
        metricKeys: ['inventory.slow_moving_product_count', 'inventory.slow_moving_stock_value'],
        expectedImpact: { metricKey: 'inventory.slow_stock_value_reviewed', unit: 'INR', currency: 'INR', horizonDays: 30, low: 0, base: round(slowStockValue.mul('0.5').toNumber()), high: round(slowStockValue.toNumber()), sourceMetricKeys: ['inventory.slow_moving_stock_value'] },
      });
    }
    const latest = balances.reduce<Date | null>((value, row) => !value || row.updatedAt > value ? row.updatedAt : value, null);
    return this.base('INVENTORY', periodStart, periodEnd, metrics, opportunities, [
      'Slow-moving means no recorded product ISSUE in the trailing 90 days; this is an operational flag, not a demand forecast.',
      'Fast-moving means at most 14 days of available-stock cover at the trailing 90-day average ISSUE rate.',
      ...(latest ? [`Inventory balances last updated at ${latest.toISOString()}.`] : ['No inventory balances are available.']),
    ], latestDate([latest, ...recentProductIssues.map((entry) => entry.postedAt)]));
  }

  private async procurement(periodStart: Date, periodEnd: Date) {
    const now = new Date();
    const [orders, overdueReceipts, receipts] = await Promise.all([
      this.db.purchaseOrder.findMany({ where: { createdAt: { gte: periodStart, lte: periodEnd }, status: { notIn: ['CANCELLED', 'REJECTED', 'SUPERSEDED'] } }, select: { id: true, currency: true, totalAmount: true, status: true, vendorId: true, createdAt: true } }),
      this.db.expectedReceipt.count({ where: { expectedDate: { lt: now }, status: { not: 'FULLY_RECEIVED' } } }),
      this.db.goodsReceiptNote.findMany({ where: { receivedAt: { gte: periodStart, lte: periodEnd } }, select: { id: true, status: true, receivedAt: true, finalizedAt: true } }),
    ]);
    const inrOrders = orders.filter((order) => order.currency === 'INR');
    const inrSpend = inrOrders.reduce((sum, order) => sum.plus(decimalValue(order.totalAmount)), new Prisma.Decimal(0));
    const vendorSpend = new Map<string, Prisma.Decimal>();
    inrOrders.forEach((order) => vendorSpend.set(order.vendorId, (vendorSpend.get(order.vendorId) ?? new Prisma.Decimal(0)).plus(decimalValue(order.totalAmount))));
    const maxVendorSpend = [...vendorSpend.values()].reduce((max, value) => value.gt(max) ? value : max, new Prisma.Decimal(0));
    const concentration = inrSpend.gt(0) ? maxVendorSpend.div(inrSpend).toNumber() : 0;
    const finalized = receipts.filter((receipt) => receipt.status === 'FINALIZED').length;
    const metrics = [
      metric('procurement.ordered_value', inrSpend.toDecimalPlaces(2).toNumber(), 'INR', 'PurchaseOrder', 'created in certified period; INR; cancelled/rejected/superseded excluded; PO commitment, not actual spend', { currency: 'INR', provenance: 'CALCULATED' }),
      metric('procurement.purchase_order_count', orders.length, 'COUNT', 'PurchaseOrder', 'created in certified period; cancelled/rejected/superseded excluded'),
      metric('procurement.overdue_expected_receipt_count', overdueReceipts, 'COUNT', 'ExpectedReceipt', 'expectedDate before now and not fully received'),
      metric('procurement.receipt_count', receipts.length, 'COUNT', 'GoodsReceiptNote', 'receivedAt in certified period'),
      metric('procurement.finalized_receipt_rate', receipts.length ? finalized / receipts.length : 1, 'PERCENT', 'GoodsReceiptNote', 'FINALIZED receipts / receipts in certified period'),
      metric('procurement.top_vendor_spend_concentration', concentration, 'PERCENT', 'PurchaseOrder', 'largest INR vendor spend / total INR spend in certified period'),
    ];
    const opportunities: DeterministicOpportunity[] = [];
    if (overdueReceipts > 0) {
      opportunities.push({
        id: 'procurement-overdue:enterprise',
        category: 'VENDOR_DELIVERY_RISK',
        actionCode: 'procurement.vendor_follow_up',
        title: 'Resolve overdue expected receipts that may constrain supply',
        situation: `${overdueReceipts} expected receipt${overdueReceipts === 1 ? ' is' : 's are'} overdue and not fully received.`,
        metricKeys: ['procurement.overdue_expected_receipt_count', 'procurement.ordered_value'],
        expectedImpact: { metricKey: 'procurement.orders_de_risked', unit: 'COUNT', horizonDays: 14, low: 1, base: Math.max(1, Math.ceil(overdueReceipts * 0.5)), high: overdueReceipts, sourceMetricKeys: ['procurement.overdue_expected_receipt_count'] },
      });
    }
    if (concentration > 0.6 && vendorSpend.size > 1) {
      opportunities.push({
        id: 'procurement-concentration:enterprise',
        category: 'VENDOR_CONCENTRATION',
        actionCode: 'procurement.vendor_mix_review',
        title: 'Review high vendor-spend concentration',
        situation: `The largest vendor represents ${round(concentration * 100, 1)}% of certified-period INR purchase value.`,
        metricKeys: ['procurement.top_vendor_spend_concentration', 'procurement.ordered_value'],
        expectedImpact: { metricKey: 'procurement.exposure_reviewed', unit: 'INR', currency: 'INR', horizonDays: 90, low: round(maxVendorSpend.mul('0.1').toNumber()), base: round(maxVendorSpend.mul('0.25').toNumber()), high: round(maxVendorSpend.mul('0.4').toNumber()), sourceMetricKeys: ['procurement.ordered_value', 'procurement.top_vendor_spend_concentration'] },
      });
    }
    const sourceLatestAt = latestDate([
      ...orders.map((order) => order.createdAt),
      ...receipts.flatMap((receipt) => [receipt.receivedAt, receipt.finalizedAt]),
    ]);
    return this.base('PROCUREMENT', periodStart, periodEnd, metrics, opportunities, ['Vendor OTIF and lead-time variance require confirmed promised-date and receipt history; only overdue exposure is certified in this version.'], sourceLatestAt);
  }

  private async production(periodStart: Date, periodEnd: Date) {
    const forecastEnd = new Date(periodEnd.getTime() + 30 * DAY_MS);
    const [plans, outputs, shortagePlans, upcomingOrders, upcomingPlans, inspections, losses, openCorrectiveActions] = await Promise.all([
      this.db.productionPlan.findMany({ where: { scheduleDate: { gte: periodStart, lte: periodEnd }, status: { not: 'CANCELLED' } }, select: { id: true, status: true, quantity: true, completedQuantity: true, scheduleDate: true, plannedEndAt: true, updatedAt: true } }),
      this.db.productionOutput.findMany({ where: { recordedAt: { gte: periodStart, lte: periodEnd } }, select: { quantity: true, rejectedQuantity: true, damagedQuantity: true, recordedAt: true } }),
      this.db.productionPlan.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, requirements: { some: { shortageQuantity: { gt: 0 } } } } }),
      this.db.salesOrder.findMany({
        where: { promisedAt: { gte: periodEnd, lte: forecastEnd }, status: { notIn: ['CANCELLED', 'CLOSED', 'DELIVERED', 'RETURNED'] } },
        select: { id: true, orderNumber: true, promisedAt: true, updatedAt: true, lines: { select: { productId: true, sku: true, orderedQuantity: true, shippedQuantity: true, cancelledQuantity: true } } },
      }),
      this.db.productionPlan.findMany({ where: { scheduleDate: { gte: periodEnd, lte: forecastEnd }, status: { in: ['APPROVED', 'IN_PROGRESS'] } }, select: { productId: true, quantity: true, updatedAt: true } }),
      this.db.inspectionResult.findMany({ where: { createdAt: { gte: periodStart, lte: periodEnd } }, select: { sampledQuantity: true, defectiveQuantity: true, status: true, createdAt: true } }),
      this.db.lossEvent.findMany({ where: { reportedAt: { gte: periodStart, lte: periodEnd }, classification: 'ABNORMAL', status: { notIn: ['REJECTED'] } }, select: { quantity: true, reportedAt: true } }),
      this.db.correctiveAction.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, inspectionResult: { createdAt: { gte: periodStart, lte: periodEnd } } } }),
    ]);
    const planned = plans.reduce((sum, row) => sum + numberValue(row.quantity), 0);
    const completed = plans.reduce((sum, row) => sum + numberValue(row.completedQuantity), 0);
    const acceptedOutput = outputs.reduce((sum, row) => sum + numberValue(row.quantity), 0);
    const rejectedOutput = outputs.reduce((sum, row) => sum + numberValue(row.rejectedQuantity) + numberValue(row.damagedQuantity), 0);
    const yieldRate = acceptedOutput + rejectedOutput > 0 ? acceptedOutput / (acceptedOutput + rejectedOutput) : 1;
    const attainment = planned > 0 ? Math.min(1, completed / planned) : 1;
    const latePlans = plans.filter((plan) => plan.plannedEndAt && plan.plannedEndAt < new Date() && plan.status !== 'COMPLETED').length;
    const demandByProduct = new Map<string, { sku: string; demand: number; orderNumbers: Set<string> }>();
    for (const order of upcomingOrders) {
      for (const line of order.lines) {
        const remaining = Math.max(0, numberValue(line.orderedQuantity) - numberValue(line.shippedQuantity) - numberValue(line.cancelledQuantity));
        const entry = demandByProduct.get(line.productId) ?? { sku: line.sku, demand: 0, orderNumbers: new Set<string>() };
        entry.demand += remaining;
        entry.orderNumbers.add(order.orderNumber);
        demandByProduct.set(line.productId, entry);
      }
    }
    const plannedByProduct = new Map<string, number>();
    for (const plan of upcomingPlans) plannedByProduct.set(plan.productId, (plannedByProduct.get(plan.productId) ?? 0) + numberValue(plan.quantity));
    const demandGaps = [...demandByProduct].map(([productId, demand]) => ({
      productId,
      sku: demand.sku,
      demand: demand.demand,
      planned: plannedByProduct.get(productId) ?? 0,
      gap: Math.max(0, demand.demand - (plannedByProduct.get(productId) ?? 0)),
      orderCount: demand.orderNumbers.size,
    })).filter((row) => row.gap > 0);
    const upcomingDemand = [...demandByProduct.values()].reduce((sum, row) => sum + row.demand, 0);
    const unplannedDemand = demandGaps.reduce((sum, row) => sum + row.gap, 0);
    const sampledQuantity = inspections.reduce((sum, row) => sum + numberValue(row.sampledQuantity), 0);
    const defectiveQuantity = inspections.reduce((sum, row) => sum + numberValue(row.defectiveQuantity), 0);
    const defectRate = sampledQuantity > 0 ? defectiveQuantity / sampledQuantity : 0;
    const abnormalLossQuantity = losses.reduce((sum, row) => sum + numberValue(row.quantity), 0);
    const metrics = [
      metric('production.planned_quantity', planned, 'QUANTITY', 'ProductionPlan', 'scheduleDate in certified period; cancelled excluded'),
      metric('production.completed_quantity', completed, 'QUANTITY', 'ProductionPlan', 'completedQuantity for certified-period plans'),
      metric('production.schedule_attainment', attainment, 'PERCENT', 'ProductionPlan', 'completed quantity / planned quantity'),
      metric('production.accepted_output_quantity', acceptedOutput, 'QUANTITY', 'ProductionOutput', 'recordedAt in certified period'),
      metric('production.rejected_or_damaged_quantity', rejectedOutput, 'QUANTITY', 'ProductionOutput', 'rejected + damaged; recordedAt in certified period'),
      metric('production.first_pass_output_yield', yieldRate, 'PERCENT', 'ProductionOutput', 'accepted output / accepted + rejected + damaged output'),
      metric('production.shortage_blocked_plan_count', shortagePlans, 'COUNT', 'ProductionPlanRequirement', 'open plans with shortageQuantity > 0'),
      metric('production.late_plan_count', latePlans, 'COUNT', 'ProductionPlan', 'plannedEndAt elapsed and not completed'),
      metric('production.upcoming_order_demand_units', upcomingDemand, 'QUANTITY', 'SalesOrderLine', 'remaining unshipped, uncancelled quantity on active orders promised in the next 30 days'),
      metric('production.upcoming_unplanned_demand_units', unplannedDemand, 'QUANTITY', 'SalesOrderLine', 'next-30-day promised demand minus scheduled plan quantity by product'),
      metric('quality.inspection_count', inspections.length, 'COUNT', 'InspectionResult', 'inspections created in certified period'),
      metric('quality.sampled_quantity', sampledQuantity, 'QUANTITY', 'InspectionResult', 'sampled quantity for inspections created in certified period'),
      metric('quality.defective_quantity', defectiveQuantity, 'QUANTITY', 'InspectionResult', 'recorded defective quantity for inspections created in certified period'),
      metric('quality.defect_rate', defectRate, 'PERCENT', 'InspectionResult', 'defective quantity / sampled quantity; zero when no sample quantity is recorded'),
      metric('quality.abnormal_loss_count', losses.length, 'COUNT', 'LossEvent', 'ABNORMAL loss events reported in certified period, excluding REJECTED'),
      metric('quality.abnormal_loss_quantity', abnormalLossQuantity, 'QUANTITY', 'LossEvent', 'quantity on ABNORMAL loss events reported in certified period, excluding REJECTED'),
      metric('quality.open_corrective_action_count', openCorrectiveActions, 'COUNT', 'CorrectiveAction', 'OPEN or IN_PROGRESS corrective actions linked to period inspections'),
    ];
    const opportunities: DeterministicOpportunity[] = [];
    if (shortagePlans > 0) {
      opportunities.push({
        id: 'production-shortage:enterprise',
        category: 'MATERIAL_SHORTAGE',
        actionCode: 'production.shortage_resolution',
        title: 'Resolve material shortages blocking production plans',
        situation: `${shortagePlans} active production plan${shortagePlans === 1 ? ' has' : 's have'} at least one unmet material requirement.`,
        metricKeys: ['production.shortage_blocked_plan_count', 'production.schedule_attainment'],
        expectedImpact: { metricKey: 'production.plans_unblocked', unit: 'COUNT', horizonDays: 14, low: 1, base: Math.max(1, Math.ceil(shortagePlans * 0.5)), high: shortagePlans, sourceMetricKeys: ['production.shortage_blocked_plan_count'] },
      });
    }
    if (demandGaps.length) {
      const gap = round(unplannedDemand, 4);
      opportunities.push({
        id: 'production-upcoming-demand:enterprise',
        category: 'DEMAND_COVERAGE_GAP',
        actionCode: 'production.schedule_review',
        title: 'Review production coverage for orders due in the next 30 days',
        situation: `${demandGaps.length} product${demandGaps.length === 1 ? '' : 's'} have a combined ${gap} units of promised order demand not covered by scheduled plans. Product-level gaps: ${demandGaps.slice(0, 10).map((row) => `${row.sku} ${round(row.gap, 4)} units (${row.orderCount} order${row.orderCount === 1 ? '' : 's'})`).join('; ')}.`,
        metricKeys: ['production.upcoming_order_demand_units', 'production.upcoming_unplanned_demand_units'],
        expectedImpact: { metricKey: 'production.upcoming_order_demand_covered', unit: 'QUANTITY', horizonDays: 30, low: 0, base: round(gap * 0.5, 4), high: gap, sourceMetricKeys: ['production.upcoming_unplanned_demand_units'] },
      });
    }
    if ((sampledQuantity > 0 && defectRate >= 0.05) || losses.length > 0 || openCorrectiveActions > 0) {
      const issueCount = losses.length + openCorrectiveActions + (defectRate >= 0.05 ? inspections.filter((row) => numberValue(row.defectiveQuantity) > 0).length : 0);
      opportunities.push({
        id: 'production-quality-loss:enterprise', category: 'QUALITY_AND_ABNORMAL_LOSS', actionCode: 'production.quality_loss_review',
        title: 'Review production quality defects and abnormal loss',
        situation: `Certified period contains a ${(defectRate * 100).toFixed(1)}% inspection defect rate, ${losses.length} non-rejected abnormal loss event(s), and ${openCorrectiveActions} open corrective action(s).`,
        metricKeys: ['quality.defect_rate', 'quality.abnormal_loss_count', 'quality.open_corrective_action_count'],
        expectedImpact: { metricKey: 'quality.issues_reviewed', unit: 'COUNT', horizonDays: 14, low: 0, base: Math.ceil(issueCount * 0.5), high: Math.max(1, issueCount), sourceMetricKeys: ['quality.abnormal_loss_count', 'quality.open_corrective_action_count'] },
      });
    }
    const sourceLatestAt = latestDate([
      ...plans.map((plan) => plan.updatedAt),
      ...outputs.map((output) => output.recordedAt),
    ]);
    return this.base('PRODUCTION', periodStart, periodEnd, metrics, opportunities, [
      'Upcoming-order planning compares remaining quantities on orders with promised dates in the next 30 days against production plan quantities for those products and dates. It does not yet optimize work-centre capacity or bill-of-material material availability.',
      'Capacity utilization remains unavailable until machine or work-centre availability calendars are certified.',
      'Quality and abnormal-loss signals use inspections and loss events in the same certified date window; no root cause is inferred from counts alone.',
    ], latestDate([sourceLatestAt, ...upcomingOrders.map((order) => order.updatedAt), ...upcomingPlans.map((plan) => plan.updatedAt), ...inspections.map((inspection) => inspection.createdAt), ...losses.map((loss) => loss.reportedAt)]));
  }

  private async fulfillment(periodStart: Date, periodEnd: Date) {
    const now = new Date();
    const [fulfillments, shipments, failedAttempts] = await Promise.all([
      this.db.salesFulfillment.findMany({ where: { createdAt: { lte: periodEnd }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true, status: true, promisedShipAt: true, createdAt: true } }),
      this.db.salesShipment.findMany({ where: { createdAt: { gte: periodStart, lte: periodEnd }, status: { not: 'CANCELLED' } }, select: { id: true, status: true, handedOverAt: true, expectedDeliveryAt: true, deliveredAt: true, createdAt: true } }),
      this.db.salesDeliveryAttempt.count({ where: { attemptedAt: { gte: periodStart, lte: periodEnd }, outcome: { notIn: ['DELIVERED', 'SUCCESS'] } } }),
    ]);
    const lateFulfillments = fulfillments.filter((row) => row.promisedShipAt && row.promisedShipAt < now && !['DISPATCHED', 'COMPLETED'].includes(row.status)).length;
    const delivered = shipments.filter((row) => row.status === 'DELIVERED' && row.deliveredAt);
    const onTime = delivered.filter((row) => row.expectedDeliveryAt && row.deliveredAt! <= row.expectedDeliveryAt).length;
    const onTimeRate = delivered.length ? onTime / delivered.length : 1;
    const handoverHours = shipments.filter((row) => row.handedOverAt).map((row) => (row.handedOverAt!.getTime() - row.createdAt.getTime()) / 3_600_000);
    const averageHandoverHours = handoverHours.length ? handoverHours.reduce((sum, value) => sum + value, 0) / handoverHours.length : 0;
    const metrics = [
      metric('fulfillment.open_fulfillment_count', fulfillments.length, 'COUNT', 'SalesFulfillment', 'status not completed or cancelled'),
      metric('fulfillment.late_dispatch_risk_count', lateFulfillments, 'COUNT', 'SalesFulfillment', 'promisedShipAt elapsed and not dispatched/completed'),
      metric('fulfillment.shipment_count', shipments.length, 'COUNT', 'SalesShipment', 'createdAt in certified period; cancelled excluded'),
      metric('fulfillment.on_time_delivery_rate', onTimeRate, 'PERCENT', 'SalesShipment', 'deliveredAt <= expectedDeliveryAt among delivered shipments with expected date'),
      metric('fulfillment.average_create_to_handover_hours', averageHandoverHours, 'HOURS', 'SalesShipment', 'average hours from shipment creation to carrier handover'),
      metric('fulfillment.failed_delivery_attempt_count', failedAttempts, 'COUNT', 'SalesDeliveryAttempt', 'non-success delivery attempts in certified period'),
    ];
    const opportunities: DeterministicOpportunity[] = [];
    if (lateFulfillments > 0) {
      opportunities.push({
        id: 'fulfillment-late:enterprise',
        category: 'LATE_DISPATCH_RISK',
        actionCode: 'fulfillment.priority_review',
        title: 'Re-prioritize fulfillments already past promised ship time',
        situation: `${lateFulfillments} open fulfillment${lateFulfillments === 1 ? ' is' : 's are'} past the promised ship time.`,
        metricKeys: ['fulfillment.late_dispatch_risk_count', 'fulfillment.open_fulfillment_count'],
        expectedImpact: { metricKey: 'fulfillment.late_orders_recovered', unit: 'COUNT', horizonDays: 7, low: 1, base: Math.max(1, Math.ceil(lateFulfillments * 0.5)), high: lateFulfillments, sourceMetricKeys: ['fulfillment.late_dispatch_risk_count'] },
      });
    }
    const sourceLatestAt = latestDate([
      ...fulfillments.map((fulfillment) => fulfillment.createdAt),
      ...shipments.flatMap((shipment) => [shipment.createdAt, shipment.handedOverAt, shipment.deliveredAt]),
    ]);
    return this.base('FULFILLMENT', periodStart, periodEnd, metrics, opportunities, [], sourceLatestAt);
  }

  private async executive(periodStart: Date, periodEnd: Date) {
    const modules: IntelligenceModule[] = ['SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT'];
    const snapshots = await Promise.all(modules.map((module) => this.calculate(module, periodStart, periodEnd)));
    return this.base(
      'EXECUTIVE',
      periodStart,
      periodEnd,
      snapshots.flatMap((snapshot) => snapshot.metrics),
      snapshots.flatMap((snapshot) => snapshot.opportunities),
      snapshots.flatMap((snapshot) => snapshot.notices),
      latestDate(snapshots.map((snapshot) => snapshot.sourceLatestAt ? new Date(snapshot.sourceLatestAt) : null)),
    );
  }

  private metricValue(metrics: CertifiedMetric[], key: string) {
    return metrics.find((item) => item.key === key)?.value;
  }

  private sourceRefs(metrics: CertifiedMetric[]) {
    return [...new Map(metrics.flatMap((item) => item.sourceRefs).map((source) => [`${source.resource}:${source.filter}`, source])).values()];
  }

  private latestTimestamp(data: CertifiedSnapshotData) {
    const value = data.sourceLatestAt ? new Date(data.sourceLatestAt) : null;
    return value && Number.isFinite(value.getTime()) ? value : null;
  }
}

export const certifiedMetricsService = new CertifiedMetricsService();
