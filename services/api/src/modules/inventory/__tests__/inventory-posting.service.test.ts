import { InventoryPostingService } from '../services/inventory-posting.service';

describe('InventoryPostingService', () => {
  it('uses locked average cost for a reserved outbound issue while intelligence triggers are disabled', async () => {
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'balance-1', quantity: 10, reserved: 4, averageCost: 12.5 }])
        .mockResolvedValueOnce([{ lock_status: '' }])
        .mockResolvedValueOnce([{ maxSequence: 0 }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new InventoryPostingService();
    const entry = await service.post(tx, {
      itemType: 'PRODUCT', itemId: 'product-1', uomId: 'uom-1', locationId: 'location-1', movementType: 'ISSUE',
      quantity: 4, consumeReserved: true, sourceType: 'SALES_ORDER', sourceId: 'order-1',
      idempotencyKey: 'sales-order:order-1:line-1:dispatch', actorId: 'actor-1', correlationId: 'request-1',
    });

    expect(entry.unitCost).toBe(12.5);
    expect(entry.totalCost).toBe(50);
    expect(entry.quantityAfter).toBe(6);
    expect(entry.entryNumber).toMatch(/^ISS-\d{4}-001$/);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects consumption that exceeds the reserved quantity', async () => {
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'balance-1', quantity: 10, reserved: 2, averageCost: 12.5 }]),
      $executeRaw: jest.fn(),
    };
    const service = new InventoryPostingService();
    await expect(service.post(tx, {
      itemType: 'PRODUCT', itemId: 'product-1', uomId: 'uom-1', locationId: 'location-1', movementType: 'ISSUE',
      quantity: 4, consumeReserved: true, sourceType: 'SALES_ORDER', sourceId: 'order-1',
      idempotencyKey: 'sales-order:order-1:line-1:dispatch', actorId: 'actor-1',
    })).rejects.toThrow('Insufficient reserved inventory');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('wraps root-client callers in a transaction before posting the ledger entry', async () => {
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'balance-1', quantity: 5, reserved: 0, averageCost: 3 }])
        .mockResolvedValueOnce([{ lock_status: '' }])
        .mockResolvedValueOnce([{ maxSequence: 0 }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const root: any = { $transaction: jest.fn((callback: (arg: unknown) => unknown) => callback(tx)) };
    const entry = await new InventoryPostingService().post(root, {
      itemType: 'PRODUCT', itemId: 'product-1', uomId: 'uom-1', locationId: 'location-1', movementType: 'ISSUE',
      quantity: 1, sourceType: 'PRODUCTION_MATERIAL_ISSUE', sourceId: 'issue-1', idempotencyKey: 'issue-1', actorId: 'actor-1',
    });
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(entry.unitCost).toBe(3);
  });
});
