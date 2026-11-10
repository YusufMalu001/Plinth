import { FulfillmentService, isShipmentTransitionAllowed } from './fulfillment.service';

describe('FulfillmentService production gates', () => {
  let db: any;
  let permissions: any;
  let service: FulfillmentService;

  beforeEach(() => {
    db = {
      salesPickItem: { findFirst: jest.fn() },
      salesPickList: { findUnique: jest.fn() },
      salesShipment: { findUnique: jest.fn() },
      product: { findUnique: jest.fn() },
      domainEventOutbox: { upsert: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(undefined as never),
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work(db)),
    };
    permissions = { can: jest.fn().mockResolvedValue(true) };
    service = new FulfillmentService(
      db,
      permissions,
      { record: jest.fn().mockResolvedValue(undefined) } as any,
      { notifyRoles: jest.fn().mockResolvedValue([]) } as any,
    );
  });

  it('blocks a mismatched pick scan without a reason', async () => {
    db.salesPickItem.findFirst.mockResolvedValue({
      id: 'pick-item-1',
      expectedQuantity: 2,
      pickedQuantity: 0,
      salesOrderLine: { id: 'line-1', productId: 'product-1', sku: 'SKU-EXPECTED' },
      pickList: { id: 'pick-1' },
    });
    db.product.findUnique.mockResolvedValue({ sku: 'SKU-EXPECTED', metadata: { barcode: 'EAN-EXPECTED' } });

    await expect(service.scanPickItem('pick-1', { salesPickItemId: 'pick-item-1', scanValue: 'WRONG', quantity: 1 }, 'picker-1'))
      .rejects.toThrow(/supervisor override reason is required/i);
  });

  it('allows a retry to continue an already started pick list', async () => {
    db.salesPickList.findUnique.mockResolvedValue({ id: 'pick-1', status: 'IN_PROGRESS' });

    await expect(service.startPickList('pick-1', 'picker-1')).resolves.toEqual({
      id: 'pick-1',
      status: 'IN_PROGRESS',
    });
  });

  it('requires dispatch permission for a reasoned scan override', async () => {
    permissions.can.mockImplementation(async (_actor: string, action: string) => action !== 'dispatch');
    db.salesPickItem.findFirst.mockResolvedValue({
      id: 'pick-item-1', expectedQuantity: 2, pickedQuantity: 0,
      salesOrderLine: { id: 'line-1', productId: 'product-1', sku: 'SKU-EXPECTED' }, pickList: { id: 'pick-1' },
    });
    db.product.findUnique.mockResolvedValue({ sku: 'SKU-EXPECTED', metadata: {} });

    await expect(service.scanPickItem('pick-1', { salesPickItemId: 'pick-item-1', scanValue: 'WRONG', quantity: 1, overrideReason: 'Damaged label verified manually' }, 'picker-1'))
      .rejects.toThrow(/Lacks permission to dispatch SalesOrder/);
  });

  it('rejects empty and carrier-incomplete shipment requests before writes', async () => {
    await expect(service.createShipment('fulfillment-1', { packageIds: [], mode: 'COURIER' }, 'test-actor')).rejects.toThrow(/At least one sealed package/);
    await expect(service.createShipment('fulfillment-1', { packageIds: ['pkg-1'], mode: 'COURIER', awbNumber: 'AWB-1' }, 'test-actor')).rejects.toThrow(/carrier is required/i);
    await expect(service.createShipment('fulfillment-1', { packageIds: ['pkg-1'], mode: 'MARKETPLACE' }, 'test-actor')).rejects.toThrow(/AWB is required/i);
  });

  it('requires valid proof evidence for every POD method', async () => {
    await expect(service.deliver('shipment-1', { method: 'OTP', recipientName: 'Receiver' }, 'test-actor')).rejects.toThrow(/OTP reference/);
    await expect(service.deliver('shipment-1', { method: 'SIGNATURE', recipientName: 'Receiver' }, 'test-actor')).rejects.toThrow(/Signature evidence/);
    await expect(service.deliver('shipment-1', { method: 'PHOTO', recipientName: 'Receiver', photoUrls: [] }, 'test-actor')).rejects.toThrow(/POD photo/);
  });

  it('rejects shipment cancellation after handover', async () => {
    db.salesShipment.findUnique.mockResolvedValue({ id: 'shipment-1', status: 'HANDED_OVER', packages: [] });
    await expect(service.cancelShipment('shipment-1', 'Customer requested cancellation', 'test-actor')).rejects.toThrow(/cannot be cancelled after carrier handover/i);
  });

  it('deducts inventory and creates immutable ledger entry upon dispatch completion', async () => {
    const mockShipment = {
      id: 'shipment-1',
      status: 'STAGED',
      warehouseLocationId: 'wh-1',
      salesOrderId: 'so-1',
      fulfillmentId: 'ful-1',
      packages: [{ id: 'pkg-1', package: { status: 'SEALED' } }],
      documents: [
        { type: 'INVOICE' },
        { type: 'PACKING_SLIP' },
        { type: 'SHIPPING_LABEL' },
      ],
      salesOrder: {
        channel: 'B2B_DIRECT',
        paymentStatus: 'PAID',
        addresses: [{ kind: 'SHIPPING' }],
        exceptions: [],
        creditAuthorizations: [{ status: 'APPROVED' }],
      },
      lines: [
        {
          quantity: 2,
          salesOrderLine: {
            id: 'line-1',
            productId: 'prod-1',
            sku: 'SKU-001',
            uomId: 'uom-1',
            orderedQuantity: 2,
            cancelledQuantity: 0,
            shippedQuantity: 0,
          },
        },
      ],
    };

    db.salesShipment.findUnique.mockResolvedValue(mockShipment);
    db.salesShipment.findUniqueOrThrow = jest.fn().mockResolvedValue({ ...mockShipment, status: 'HANDED_OVER' });
    db.salesOrderAllocation = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'alloc-1',
          salesOrderLineId: 'line-1',
          quantity: 2,
          lotId: 'lot-1',
          reservationId: 'res-1',
          status: 'ACTIVE',
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: 'alloc-1', status: 'CONSUMED' }),
    };
    db.inventoryReservation = {
      update: jest.fn().mockResolvedValue({ id: 'res-1', status: 'CONSUMED' }),
    };
    db.inventoryBalance = {
      update: jest.fn().mockResolvedValue({ id: 'bal-1' }),
    };
    db.inventoryLedgerEntry = {
      create: jest.fn().mockResolvedValue({ id: 'ile-1', entryNumber: 'ILE-2026-000001' }),
    };
    db.salesOrderLine = {
      update: jest.fn().mockResolvedValue({ id: 'line-1', shippedQuantity: 2 }),
      findMany: jest.fn().mockResolvedValue([{ id: 'line-1', orderedQuantity: 2, shippedQuantity: 2, cancelledQuantity: 0 }]),
    };
    db.salesPackage = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    db.salesShipment.update = jest.fn().mockResolvedValue({ ...mockShipment, status: 'HANDED_OVER' });
    db.salesOrder = {
      update: jest.fn().mockResolvedValue({ id: 'so-1', status: 'DISPATCHED', currency: 'INR' }),
    };
    db.salesFulfillment = {
      update: jest.fn().mockResolvedValue({ id: 'ful-1', status: 'DISPATCHED' }),
    };

    db.$queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'bal-1',
        quantity: 10,
        reserved: 5,
        averageCost: 100,
        lotId: 'lot-1',
      },
    ]);

    const result = await service.dispatchShipment('shipment-1', 'dispatcher-1', 'req-123');

    expect(result.status).toBe('HANDED_OVER');
    expect(db.inventoryBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bal-1' },
        data: {
          quantity: { decrement: 2 },
          reserved: { decrement: 2 },
        },
      })
    );
    expect(db.inventoryLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemType: 'PRODUCT',
          itemId: 'prod-1',
          uomId: 'uom-1',
          locationId: 'wh-1',
          lotId: 'lot-1',
          movementType: 'ISSUE',
          quantityDelta: -2,
          sourceType: 'SALES_SHIPMENT',
          sourceId: 'shipment-1',
        }),
      })
    );
    expect(db.salesOrderAllocation.update).toHaveBeenCalledWith({
      where: { id: 'alloc-1' },
      data: { status: 'CONSUMED' },
    });
    expect(db.inventoryReservation.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data: { status: 'CONSUMED' },
    });
    expect(db.salesOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'so-1' },
        data: expect.objectContaining({ status: 'DISPATCHED' }),
      })
    );
  });
});

describe('Shipment lifecycle', () => {
  it('allows operational delivery transitions and rejects terminal regressions', () => {
    expect(isShipmentTransitionAllowed('HANDED_OVER', 'IN_TRANSIT')).toBe(true);
    expect(isShipmentTransitionAllowed('IN_TRANSIT', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(isShipmentTransitionAllowed('DELIVERY_FAILED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(isShipmentTransitionAllowed('RTO_INITIATED', 'RTO_RECEIVED')).toBe(true);
    expect(isShipmentTransitionAllowed('DELIVERED', 'IN_TRANSIT')).toBe(false);
    expect(isShipmentTransitionAllowed('HANDED_OVER', 'CANCELLED')).toBe(false);
  });
});
