import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StockReservationService } from '../services/stock-reservation.service';
import { StockReservationRepository } from '../repositories/stock-reservation.repository';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { ForbiddenError, InvalidStateTransitionError, InsufficientStockError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => {
  const fakeTx = {
    stockReservation: { create: jest.fn(), updateMany: jest.fn() },
    $executeRaw: jest.fn()
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)),
      __fakeTx: fakeTx
    }
  };
});

function getFakeTx() {
  return (prisma as unknown as {
    __fakeTx: { stockReservation: { create: jest.Mock; updateMany: jest.Mock }; $executeRaw: jest.Mock };
  }).__fakeTx;
}

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

function makeRepository(): jest.Mocked<StockReservationRepository> {
  return {
    findById: jest.fn(),
    create: jest.fn(),
    updateStatusConditional: jest.fn(),
    list: jest.fn()
  } as unknown as jest.Mocked<StockReservationRepository>;
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    status: 'ACTIVE',
    productId: 'p-1',
    materialId: null,
    uomId: 'uom-1',
    locationId: 'loc-1',
    ownership: 'OWNED',
    quantity: 5,
    reason: 'Held for VIP order',
    ...overrides
  };
}

describe('StockReservationService', () => {
  let repository: jest.Mocked<StockReservationRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = makeRepository();
    auditWriter = new MockAuditWriter();
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-1' } as never);
    getFakeTx().stockReservation.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().$executeRaw.mockResolvedValue(1 as never);
  });

  describe('create', () => {
    it('rejects when the actor lacks the reserve permission', async () => {
      const service = new StockReservationService(repository, new DenyChecker(), auditWriter);

      await expect(
        service.create({ productId: 'p-1', uomId: 'uom-1', quantity: 5, reason: 'x' }, 'actor-1')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects when neither productId nor materialId is given', async () => {
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.create({ uomId: 'uom-1', quantity: 5, reason: 'x' }, 'actor-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('holds availability via the raw reserve statement before creating the reservation row', async () => {
      getFakeTx().stockReservation.create.mockResolvedValueOnce(makeReservation() as never);
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.create({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', quantity: 5, reason: 'x' }, 'actor-1');

      expect(getFakeTx().$executeRaw).toHaveBeenCalledTimes(1);
      expect(getFakeTx().stockReservation.create).toHaveBeenCalledTimes(1);
      expect((result as { status: string }).status).toBe('ACTIVE');
    });

    it('propagates InsufficientStockError without creating a reservation row when availability is too low', async () => {
      getFakeTx().$executeRaw.mockResolvedValueOnce(0 as never);
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      await expect(
        service.create({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', quantity: 500, reason: 'x' }, 'actor-1')
      ).rejects.toBeInstanceOf(InsufficientStockError);

      expect(getFakeTx().stockReservation.create).not.toHaveBeenCalled();
    });
  });

  describe('release / consume / cancel', () => {
    it('release moves ACTIVE -> RELEASED and releases the ledger hold', async () => {
      repository.findById.mockResolvedValueOnce(makeReservation() as never);
      repository.findById.mockResolvedValueOnce(makeReservation({ status: 'RELEASED' }) as never);
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.release('res-1', 'actor-1');

      expect(getFakeTx().stockReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'res-1', status: { in: ['ACTIVE'] } }, data: expect.objectContaining({ status: 'RELEASED' }) })
      );
      expect((result as { status: string }).status).toBe('RELEASED');
    });

    it('consume moves ACTIVE -> CONSUMED', async () => {
      repository.findById.mockResolvedValueOnce(makeReservation() as never);
      repository.findById.mockResolvedValueOnce(makeReservation({ status: 'CONSUMED' }) as never);
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.consume('res-1', 'actor-1');

      expect((result as { status: string }).status).toBe('CONSUMED');
    });

    it('rejects releasing a reservation that is not ACTIVE', async () => {
      repository.findById.mockResolvedValueOnce(makeReservation({ status: 'RELEASED' }) as never);
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.release('res-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('throws when the release concurrency guard finds the reservation already transitioned', async () => {
      repository.findById.mockResolvedValueOnce(makeReservation() as never);
      getFakeTx().stockReservation.updateMany.mockResolvedValueOnce({ count: 0 } as never);
      const service = new StockReservationService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.release('res-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });
});
