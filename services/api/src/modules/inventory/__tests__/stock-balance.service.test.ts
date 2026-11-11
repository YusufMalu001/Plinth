import { describe, it, expect, jest } from '@jest/globals';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockBalanceRepository } from '../repositories/stock-balance.repository';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ForbiddenError } from '../../../common/errors/AppError';

class MockAuditWriter implements AuditWriter {
  events: unknown[] = [];
  async record(event: unknown): Promise<void> {
    this.events.push(event);
  }
}

class AllowAllChecker implements PermissionChecker {
  async can(): Promise<boolean> {
    return true;
  }
}

class DenyChecker implements PermissionChecker {
  async can(): Promise<boolean> {
    return false;
  }
}

function makeRepository(): jest.Mocked<StockBalanceRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    listAll: jest.fn(),
    listLedger: jest.fn(),
    getLedgerEntryById: jest.fn(),
    getMovementHistory: jest.fn(),
    getLastMovementAt: jest.fn(),
    sumIssuedQuantitySince: jest.fn(),
    createSnapshotRows: jest.fn(),
    listSnapshots: jest.fn()
  } as unknown as jest.Mocked<StockBalanceRepository>;
}

describe('StockBalanceService', () => {
  it('rejects viewing balances without the view permission', async () => {
    const repository = makeRepository();
    const service = new StockBalanceService(repository, new DenyChecker(), new MockAuditWriter());

    await expect(service.list('actor-1', {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  describe('getReorderSignals', () => {
    it('computes average daily consumption and days-of-cover from actual ISSUE history, separate from any configured reorder point', async () => {
      const repository = makeRepository();
      repository.listAll.mockResolvedValueOnce([
        {
          id: 'bal-1',
          itemKey: 'PRODUCT:p-1',
          productId: 'p-1',
          materialId: null,
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          onHandQuantity: 60,
          reservedQuantity: 10,
          product: { metadata: { safetyStock: 20 } },
          material: null
        }
      ] as never);
      repository.sumIssuedQuantitySince.mockResolvedValueOnce([{ productId: 'p-1', materialId: null, locationId: 'loc-1', total: 30 }] as never);

      const service = new StockBalanceService(repository, new AllowAllChecker(), new MockAuditWriter());
      const signals = await service.getReorderSignals('actor-1');

      expect(signals).toHaveLength(1);
      const signal = signals[0];
      expect(signal.avgDailyConsumption).toBeCloseTo(1); // 30 units / 30-day window
      expect(signal.daysOfCover).toBeCloseTo(60); // 60 on-hand / 1 per day
      expect(signal.availableQuantity).toBe(50); // 60 onHand - 10 reserved
      expect(signal.configuredSafetyBuffer).toBe(20);
      expect(signal.belowSafetyBuffer).toBe(false); // 50 available > 20
    });

    it('reports daysOfCover as null (not Infinity or 0) when there has been no consumption at all', async () => {
      const repository = makeRepository();
      repository.listAll.mockResolvedValueOnce([
        {
          id: 'bal-1',
          itemKey: 'MATERIAL:m-1',
          productId: null,
          materialId: 'm-1',
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          onHandQuantity: 100,
          reservedQuantity: 0,
          product: null,
          material: { specs: {} }
        }
      ] as never);
      repository.sumIssuedQuantitySince.mockResolvedValueOnce([] as never);

      const service = new StockBalanceService(repository, new AllowAllChecker(), new MockAuditWriter());
      const signals = await service.getReorderSignals('actor-1');

      expect(signals[0].avgDailyConsumption).toBe(0);
      expect(signals[0].daysOfCover).toBeNull();
      expect(signals[0].configuredSafetyBuffer).toBeNull();
      expect(signals[0].belowSafetyBuffer).toBeNull();
    });

    it('flags stock below the safety buffer independently of the consumption signal', async () => {
      const repository = makeRepository();
      repository.listAll.mockResolvedValueOnce([
        {
          id: 'bal-1',
          itemKey: 'MATERIAL:m-1',
          productId: null,
          materialId: 'm-1',
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          onHandQuantity: 5,
          reservedQuantity: 0,
          product: null,
          material: { specs: { safetyStock: 10 } }
        }
      ] as never);
      repository.sumIssuedQuantitySince.mockResolvedValueOnce([] as never);

      const service = new StockBalanceService(repository, new AllowAllChecker(), new MockAuditWriter());
      const signals = await service.getReorderSignals('actor-1');

      expect(signals[0].belowSafetyBuffer).toBe(true); // 5 <= 10
    });
  });

  describe('createSnapshot', () => {
    it('requires the export permission, not just view', async () => {
      const repository = makeRepository();
      class ViewOnlyChecker implements PermissionChecker {
        async can(_actorId: string, action: string): Promise<boolean> {
          return action === 'view';
        }
      }
      const service = new StockBalanceService(repository, new ViewOnlyChecker(), new MockAuditWriter());

      await expect(service.createSnapshot('actor-1')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('writes one snapshot row per current balance and records an audit event', async () => {
      const repository = makeRepository();
      repository.listAll.mockResolvedValueOnce([
        { id: 'bal-1', itemKey: 'PRODUCT:p-1', productId: 'p-1', materialId: null, uomId: 'uom-1', locationId: 'loc-1', ownership: 'OWNED', onHandQuantity: 10, reservedQuantity: 2 }
      ] as never);
      repository.createSnapshotRows.mockResolvedValueOnce(1);
      const auditWriter = new MockAuditWriter();
      const service = new StockBalanceService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.createSnapshot('actor-1');

      expect(repository.createSnapshotRows).toHaveBeenCalledWith([
        expect.objectContaining({ itemKey: 'PRODUCT:p-1', quantityOnHand: 10, quantityReserved: 2 })
      ]);
      expect(result.count).toBe(1);
      expect(auditWriter.events).toHaveLength(1);
    });
  });
});
