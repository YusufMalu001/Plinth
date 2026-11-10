import { CertifiedMetricsService } from '../services/certified-metrics.service';

const start = new Date('2026-01-01T00:00:00.000Z');
const end = new Date('2026-01-31T00:00:00.000Z');

function financialDb(costQuantity = -3) {
  const shipment = {
    id: 'shipment-inr', freightAmount: '15.00', handedOverAt: end,
    salesOrder: { id: 'order-1', currency: 'INR' },
    lines: [{ quantity: '3.000000', salesOrderLine: { id: 'line-1', productId: 'product-1', returnedQuantity: '1.000000', cancelledQuantity: '0.000000', orderedQuantity: '4.000000', unitPrice: '100.00', discountAmount: '10.00', taxAmount: '40.00' } }],
  };
  const foreignShipment = {
    ...shipment, id: 'shipment-usd', salesOrder: { id: 'order-usd', currency: 'USD' },
  };
  return {
    salesOrder: { findMany: jest.fn().mockResolvedValue([]) },
    salesShipment: { findMany: jest.fn().mockResolvedValue([shipment, foreignShipment]) },
    salesFinancialReturn: { findMany: jest.fn().mockResolvedValue([
      { id: 'return-1', salesOrderId: 'order-1', status: 'COMPLETED', currency: 'INR', occurredAt: end, creditedNetAmount: '20.00', taxCreditAmount: '3.00', salesOrder: { currency: 'INR' }, lines: [{ salesOrderLineId: 'line-1', quantity: '1.000000' }] },
    ]) },
    inventoryLedgerEntry: { findMany: jest.fn().mockResolvedValue([
      { sourceType: 'SALES_SHIPMENT', sourceId: 'shipment-inr', itemType: 'PRODUCT', itemId: 'product-1', quantityDelta: String(costQuantity), totalCost: '120.00', postedAt: end },
    ]) },
    customer: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('financial snapshot calculations', () => {
  test('uses Decimal arithmetic for shipped revenue, allocated discounts, dated credits, tax, COGS and freight', async () => {
    const snapshot = await new CertifiedMetricsService(financialDb() as never).calculate('SALES', start, end);
    const get = (key: string) => snapshot.metrics.find((metric) => metric.key === key);

    expect(get('sales.gross_shipped_revenue')?.value).toBe(300);
    expect(get('sales.shipped_discounts')?.value).toBe(7.5);
    expect(get('sales.credited_returns')?.value).toBe(20);
    expect(get('sales.tax_excluded_net_revenue')?.value).toBe(272.5);
    expect(get('sales.recorded_shipped_tax')?.value).toBe(27);
    expect(get('sales.cogs_actual_inventory_cost')?.value).toBe(120);
    expect(get('sales.gross_profit')?.value).toBe(152.5);
    expect(get('sales.known_contribution_margin')?.value).toBe(137.5);
    expect(get('sales.excluded_non_inr_shipment_count')?.value).toBe(1);
    expect(get('sales.gross_profit')?.provenance).toBe('CALCULATED');
  });

  test('does not turn incomplete shipment cost coverage into zero cost or a certified profit value', async () => {
    const snapshot = await new CertifiedMetricsService(financialDb(-2) as never).calculate('SALES', start, end);

    expect(snapshot.metrics.find((metric) => metric.key === 'sales.cost_coverage_score')?.value).toBe(0.6667);
    expect(snapshot.metrics.find((metric) => metric.key === 'sales.gross_profit')?.value).toBeNull();
    expect(snapshot.metrics.find((metric) => metric.key === 'sales.gross_margin_rate')?.value).toBeNull();
    expect(snapshot.metrics.find((metric) => metric.key === 'sales.known_contribution_margin')?.value).toBeNull();
    expect(snapshot.notices.join(' ')).toContain('unavailable');
  });

  test('nets posted positive reversal rows against shipment COGS', async () => {
    const db = financialDb(-4);
    db.inventoryLedgerEntry.findMany.mockResolvedValue([
      { sourceType: 'SALES_SHIPMENT', sourceId: 'shipment-inr', itemType: 'PRODUCT', itemId: 'product-1', quantityDelta: '-4', totalCost: '160.00', postedAt: end },
      { sourceType: 'SALES_SHIPMENT', sourceId: 'shipment-inr', itemType: 'PRODUCT', itemId: 'product-1', quantityDelta: '1', totalCost: '40.00', postedAt: end },
    ]);
    const snapshot = await new CertifiedMetricsService(db as never).calculate('SALES', start, end);

    expect(snapshot.metrics.find((metric) => metric.key === 'sales.cogs_actual_inventory_cost')?.value).toBe(120);
    expect(snapshot.metrics.find((metric) => metric.key === 'sales.cost_coverage_score')?.value).toBe(1);
  });

  test('excludes cancelled quantity from shipped revenue and allocated discounts', async () => {
    const db = financialDb();
    const [inrShipment, foreignShipment] = await db.salesShipment.findMany();
    inrShipment.lines[0].salesOrderLine.cancelledQuantity = '2.000000';
    db.salesShipment.findMany.mockResolvedValue([inrShipment, foreignShipment]);
    const snapshot = await new CertifiedMetricsService(db as never).calculate('SALES', start, end);

    expect(snapshot.metrics.find((metric) => metric.key === 'sales.gross_shipped_revenue')?.value).toBe(200);
    expect(snapshot.metrics.find((metric) => metric.key === 'sales.shipped_discounts')?.value).toBe(5);
  });

  test('marks net revenue unknown when legacy returned quantities have no dated return ledger record', async () => {
    const db = financialDb();
    db.salesFinancialReturn.findMany.mockResolvedValue([]);
    db.salesOrder.findMany.mockImplementation((args: any) => args?.where?.lines
      ? Promise.resolve([{ id: 'order-1', lines: [{ id: 'line-1', returnedQuantity: '1.000000' }] }])
      : Promise.resolve([]));
    const snapshot = await new CertifiedMetricsService(db as never).calculate('SALES', start, end);

    expect(snapshot.metrics.find((metric) => metric.key === 'sales.tax_excluded_net_revenue')?.value).toBeNull();
    expect(snapshot.notices.join(' ')).toContain('not reconciled to dated financial return records');
  });
});
