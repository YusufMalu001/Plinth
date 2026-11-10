import { CertifiedMetricsService } from '../services/certified-metrics.service';
import { IntelligenceToolsService } from '../services/intelligence-tools.service';

const start = new Date('2026-01-01T00:00:00.000Z');
const end = new Date('2026-01-31T00:00:00.000Z');

describe('operational intelligence uses Synergy records', () => {
  test('inventory movement history creates slow and fast mover metrics and a slow stock review opportunity', async () => {
    const db = {
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([
        { itemType: 'PRODUCT', itemId: 'slow', locationId: 'A', condition: 'AVAILABLE', quantity: 8, reserved: 1, averageCost: 100, updatedAt: end },
        { itemType: 'PRODUCT', itemId: 'fast', locationId: 'A', condition: 'AVAILABLE', quantity: 2, reserved: 0, averageCost: 50, updatedAt: end },
      ]) },
      replenishmentPolicy: { findMany: jest.fn().mockResolvedValue([]) },
      replenishmentEvent: { count: jest.fn().mockResolvedValue(0) },
      inventoryLot: { count: jest.fn().mockResolvedValue(0) },
      inventoryLedgerEntry: { findMany: jest.fn().mockResolvedValue([
        { itemId: 'fast', quantityDelta: -20, postedAt: end },
      ]) },
    };
    const service = new CertifiedMetricsService(db as never);

    const snapshot = await service.calculate('INVENTORY', start, end);
    const metric = (key: string) => snapshot.metrics.find((entry) => entry.key === key)?.value;

    expect(metric('inventory.slow_moving_product_count')).toBe(1);
    expect(metric('inventory.slow_moving_stock_value')).toBe(700);
    expect(metric('inventory.fast_moving_product_count')).toBe(1);
    expect(snapshot.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'inventory-slow-moving:enterprise', actionCode: 'inventory.excess_stock_action' }),
    ]));
  });

  test('vendor scorecard derives delivery, fill, quality, and grade from finalized receipts', async () => {
    const db = {
      purchaseOrder: { findMany: jest.fn().mockResolvedValue([{
        id: 'po-1', vendorId: 'v1', status: 'FULLY_RECEIVED', currency: 'INR', createdAt: end,
        lines: [{ id: 'line-1', quantity: 10, unitPrice: 100, needDate: end,
          goodsReceiptLines: [{ receivedQuantity: 10, acceptedQuantity: 8, rejectedQuantity: 2, grn: { status: 'FINALIZED', receivedAt: end } }],
        }],
      }]) },
      vendorScorecard: { findFirst: jest.fn().mockResolvedValue({
        id: 'scorecard-1', name: 'Receipt Performance', version: 1,
        weights: { quality: 25, delivery: 25, fillRate: 50, price: 0, responsiveness: 0, compliance: 0 },
        thresholds: { A: 90, B: 75 },
      }) },
      vendorComplianceDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new IntelligenceToolsService(db as never);

    const response = await service.execute('get_vendor_reliability_scorecard', { vendorId: 'v1' }, 'PROCUREMENT');
    const summary = (response as { scorecardSummary: Record<string, unknown> }).scorecardSummary;

    expect(summary.fillRatePercent).toBe(100);
    expect(summary.qualityAcceptanceRatePercent).toBe(80);
    expect(summary.onTimeRatePercent).toBe(100);
    expect(summary.overallVendorGrade).toBe('A');
    expect(summary.activeScorecard).toMatchObject({ name: 'Receipt Performance', version: 1 });
    expect(summary.overallScore).toBe(95);
    expect(summary.leadTimeDriftDaysAverage).toBeUndefined();
  });

  test('bulk purchase comparison refuses to invent a spend baseline', async () => {
    const db = { replenishmentPolicy: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new IntelligenceToolsService(db as never);

    const result = await service.execute('simulate_bulk_purchase_tradeoff', {}, 'PROCUREMENT');

    expect(result).toMatchObject({ status: 'not_available', policyCount: 0 });
    expect(JSON.stringify(result)).not.toContain('500000');
  });

  test('production bottleneck tool returns actual plans and does not fabricate work-centre utilization', async () => {
    const db = {
      productionPlan: { findMany: jest.fn().mockResolvedValue([{
        id: 'plan-1', planNumber: 'PP-1', quantity: 10, completedQuantity: 4, status: 'IN_PROGRESS', scheduleDate: end,
      }]) },
    };
    const service = new IntelligenceToolsService(db as never);

    const result = await service.execute('get_production_bottleneck_matrix', {}, 'PRODUCTION') as { productionOverview: Record<string, unknown> };

    expect(result.productionOverview.activeProductionPlans).toBe(1);
    expect(result.productionOverview.plans).toEqual([expect.objectContaining({ planNumber: 'PP-1', remainingQuantity: 6, progressPercent: 40 })]);
    expect(result.productionOverview.bottleneckWorkCenters).toBeUndefined();
  });

  test('production snapshot flags upcoming promised orders without scheduled plan coverage', async () => {
    const db = {
      productionPlan: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productionOutput: { findMany: jest.fn().mockResolvedValue([]) },
      inspectionResult: { findMany: jest.fn().mockResolvedValue([]) },
      lossEvent: { findMany: jest.fn().mockResolvedValue([]) },
      correctiveAction: { count: jest.fn().mockResolvedValue(0) },
      salesOrder: { findMany: jest.fn().mockResolvedValue([{
        id: 'order-1', orderNumber: 'SO-1', promisedAt: new Date(end.getTime() + 5 * 86_400_000),
        lines: [{ productId: 'product-1', sku: 'SKU-1', orderedQuantity: 12, shippedQuantity: 2, cancelledQuantity: 0 }],
      }]) },
    };
    const service = new CertifiedMetricsService(db as never);

    const snapshot = await service.calculate('PRODUCTION', start, end);

    expect(snapshot.metrics.find((entry) => entry.key === 'production.upcoming_order_demand_units')?.value).toBe(10);
    expect(snapshot.metrics.find((entry) => entry.key === 'production.upcoming_unplanned_demand_units')?.value).toBe(10);
    expect(snapshot.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'production-upcoming-demand:enterprise', actionCode: 'production.schedule_review' }),
    ]));
  });

  test('production analysis turns quality and abnormal-loss records into a governed recommendation opportunity', async () => {
    const db = {
      productionPlan: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productionOutput: { findMany: jest.fn().mockResolvedValue([]) },
      inspectionResult: { findMany: jest.fn().mockResolvedValue([
        { sampledQuantity: 100, defectiveQuantity: 8, status: 'FAIL', createdAt: end },
      ]) },
      lossEvent: { findMany: jest.fn().mockResolvedValue([{ quantity: 3, reportedAt: end }]) },
      correctiveAction: { count: jest.fn().mockResolvedValue(1) },
      salesOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CertifiedMetricsService(db as never);

    const snapshot = await service.calculate('PRODUCTION', start, end);

    expect(snapshot.metrics.find((entry) => entry.key === 'quality.defect_rate')?.value).toBe(0.08);
    expect(snapshot.metrics.find((entry) => entry.key === 'quality.abnormal_loss_count')?.value).toBe(1);
    expect(snapshot.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'production-quality-loss:enterprise', actionCode: 'production.quality_loss_review' }),
    ]));
  });
});
