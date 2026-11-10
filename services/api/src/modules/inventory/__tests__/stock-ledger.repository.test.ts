import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StockLedgerRepository, computeItemKey } from '../repositories/stock-ledger.repository';
import { InsufficientStockError, ValidationError } from '../../../common/errors/AppError';

function makeClient() {
  return {
    stockBalance: {
      upsert: jest.fn(),
      updateMany: jest.fn()
    },
    stockLedgerEntry: {
      create: jest.fn()
    },
    $executeRaw: jest.fn()
  };
}

describe('computeItemKey', () => {
  it('returns PRODUCT:<id> for a product reference', () => {
    expect(computeItemKey('p-1', undefined)).toBe('PRODUCT:p-1');
  });

  it('returns MATERIAL:<id> for a material reference', () => {
    expect(computeItemKey(undefined, 'm-1')).toBe('MATERIAL:m-1');
  });

  it('throws when neither is set', () => {
    expect(() => computeItemKey(undefined, undefined)).toThrow(ValidationError);
  });

  it('throws when both are set', () => {
    expect(() => computeItemKey('p-1', 'm-1')).toThrow(ValidationError);
  });
});

describe('StockLedgerRepository', () => {
  let client: ReturnType<typeof makeClient>;
  let repository: StockLedgerRepository;

  beforeEach(() => {
    client = makeClient();
    repository = new StockLedgerRepository(client as never);
  });

  describe('postEntry', () => {
    it('upserts the balance and creates a ledger entry for an IN movement', async () => {
      client.stockBalance.upsert.mockResolvedValueOnce({} as never);
      client.stockLedgerEntry.create.mockResolvedValueOnce({ id: 'entry-1' } as never);

      const result = await repository.postEntry({
        productId: 'p-1',
        uomId: 'uom-1',
        locationId: 'loc-1',
        ownership: 'OWNED',
        direction: 'IN',
        quantity: 10,
        entryType: 'GRN_RECEIPT',
        postedByActorId: 'actor-1'
      });

      expect(client.stockBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { itemKey_uomId_locationId_ownership: { itemKey: 'PRODUCT:p-1', uomId: 'uom-1', locationId: 'loc-1', ownership: 'OWNED' } },
          update: { onHandQuantity: { increment: 10 } }
        })
      );
      expect(client.stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect((result as { id: string }).id).toBe('entry-1');
    });

    it('conditionally decrements for an OUT movement and creates a ledger entry when sufficient stock exists', async () => {
      client.stockBalance.updateMany.mockResolvedValueOnce({ count: 1 } as never);
      client.stockLedgerEntry.create.mockResolvedValueOnce({ id: 'entry-2' } as never);

      await repository.postEntry({
        materialId: 'm-1',
        uomId: 'uom-1',
        locationId: 'loc-1',
        ownership: 'OWNED',
        direction: 'OUT',
        quantity: 5,
        entryType: 'ISSUE',
        postedByActorId: 'actor-1'
      });

      expect(client.stockBalance.updateMany).toHaveBeenCalledWith({
        where: { itemKey: 'MATERIAL:m-1', uomId: 'uom-1', locationId: 'loc-1', ownership: 'OWNED', onHandQuantity: { gte: 5 } },
        data: { onHandQuantity: { decrement: 5 } }
      });
      expect(client.stockLedgerEntry.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an OUT movement with insufficient on-hand stock and never creates a ledger entry', async () => {
      client.stockBalance.updateMany.mockResolvedValueOnce({ count: 0 } as never);

      await expect(
        repository.postEntry({
          materialId: 'm-1',
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          direction: 'OUT',
          quantity: 500,
          entryType: 'ISSUE',
          postedByActorId: 'actor-1'
        })
      ).rejects.toBeInstanceOf(InsufficientStockError);

      expect(client.stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('rejects a non-positive quantity before touching the database', async () => {
      await expect(
        repository.postEntry({
          productId: 'p-1',
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          direction: 'IN',
          quantity: 0,
          entryType: 'GRN_RECEIPT',
          postedByActorId: 'actor-1'
        })
      ).rejects.toBeInstanceOf(ValidationError);

      expect(client.stockBalance.upsert).not.toHaveBeenCalled();
    });
  });

  describe('reserve', () => {
    it('resolves when the raw update affects a row (available stock was sufficient)', async () => {
      client.$executeRaw.mockResolvedValueOnce(1 as never);

      await expect(
        repository.reserve({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', ownership: 'OWNED', quantity: 3 })
      ).resolves.toBeUndefined();
    });

    it('throws InsufficientStockError when the raw update affects zero rows', async () => {
      client.$executeRaw.mockResolvedValueOnce(0 as never);

      await expect(
        repository.reserve({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', ownership: 'OWNED', quantity: 3 })
      ).rejects.toBeInstanceOf(InsufficientStockError);
    });
  });

  describe('release', () => {
    it('issues the raw release update without throwing', async () => {
      client.$executeRaw.mockResolvedValueOnce(1 as never);

      await expect(
        repository.release({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', ownership: 'OWNED', quantity: 3 })
      ).resolves.toBeUndefined();
      expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
