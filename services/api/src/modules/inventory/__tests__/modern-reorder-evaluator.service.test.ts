import { ModernReorderEvaluatorService } from '../services/modern-reorder-evaluator.service';
import { vendorScoringService } from '../../master-data/services/vendor-scoring.service';
import { notificationService } from '../../notifications/notification.service';
import { domainEventOutboxService } from '../../intelligence/services/domain-event-outbox.service';

describe('ModernReorderEvaluatorService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('falls back to scored active suppliers when an item has no explicit vendor capability', async () => {
    const service = new ModernReorderEvaluatorService({
      vendorCapability: { findMany: jest.fn().mockResolvedValue([]) },
      vendor: { findMany: jest.fn().mockResolvedValue([{
        id: 'vendor-top', name: 'Top Supplier', currency: 'INR', paymentTerms: 'NET30', leadTimeDays: 6,
      }]) },
    } as any);

    const candidates = await (service as any).getVendorCandidates('PRODUCT', { id: 'product-1', categoryId: null }, null);

    expect(candidates).toEqual([expect.objectContaining({
      vendorId: 'vendor-top',
      vendor: expect.objectContaining({ name: 'Top Supplier' }),
      unitPrice: null,
      leadTimeDays: 6,
    })]);
  });

  it('creates a scored-vendor PO draft at the threshold and notifies procurement owners', async () => {
    jest.spyOn(domainEventOutboxService, 'publish').mockResolvedValue({} as any);
    jest.spyOn(vendorScoringService, 'scoreVendors').mockResolvedValue({
      evaluations: [
        { vendorId: 'vendor-a', score: 84 },
        { vendorId: 'vendor-b', score: 93 },
      ],
    } as any);
    const notify = jest.spyOn(notificationService, 'notifyRoles').mockResolvedValue(undefined as any);

    const balance = {
      id: 'balance-1', itemType: 'PRODUCT', itemId: 'product-1', uomId: 'uom-1', locationId: 'warehouse-1',
      condition: 'AVAILABLE', ownership: 'COMPANY', quantity: 8, reserved: 0, averageCost: 4,
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([balance]) },
      replenishmentEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        updateMany: jest.fn(),
      },
      purchaseOrder: { create: jest.fn().mockResolvedValue({ id: 'po-1', poNumber: 'PO-AUTO-2026-12345678' }) },
    };
    const db: any = {
      inventoryBalance: { findUnique: jest.fn().mockResolvedValue(balance), findMany: jest.fn().mockResolvedValue([balance]) },
      replenishmentEvent: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      replenishmentPolicy: { findUnique: jest.fn().mockResolvedValue({
        id: 'policy-1', isActive: true, safetyStock: 10, orderUpToQuantity: 12, leadTimeDays: 5,
        currency: 'INR', mode: 'ALERT_ONLY', autoBuyLimit: null,
      }) },
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1', name: 'Steel Rod', sku: 'ROD-1', categoryId: 'category-1', metadata: { safetyStock: 10 } }) },
      vendorCapability: { findMany: jest.fn().mockResolvedValue([
        { vendorId: 'vendor-a', unitPrice: 5, moq: 1, leadTimeDays: 4, vendor: { id: 'vendor-a', name: 'Supplier A', currency: 'INR' } },
        { vendorId: 'vendor-b', unitPrice: 6, moq: 1, leadTimeDays: 5, vendor: { id: 'vendor-b', name: 'Supplier B', currency: 'INR' } },
      ]) },
      purchaseOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ consumed: 90 }]),
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    };

    const service = new ModernReorderEvaluatorService(db);
    await service.evaluate('balance-1');

    expect(db.vendorCapability.findMany).toHaveBeenCalled();
    expect(vendorScoringService.scoreVendors).toHaveBeenCalledWith('MATERIAL');
    const poData = tx.purchaseOrder.create.mock.calls[0][0].data;
    expect(poData).toMatchObject({ vendorId: 'vendor-b', status: 'DRAFT', currency: 'INR' });
    expect(poData.lines.create[0]).toMatchObject({ productId: 'product-1', uomId: 'uom-1', quantity: 4, unitPrice: 6, lineTotal: 24 });
    expect(tx.replenishmentEvent.create.mock.calls[0][0].data).toMatchObject({ status: 'PO_CREATED', purchaseOrderId: 'po-1' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      roles: ['admin', 'store-manager'],
      resource: 'PurchaseOrder',
      resourceId: 'po-1',
    }));
  });
});
