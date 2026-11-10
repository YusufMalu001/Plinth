import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StockTransferService } from '../services/stock-transfer.service';
import { StockTransferRepository } from '../repositories/stock-transfer.repository';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => {
  const fakeTx = {
    stockTransfer: { updateMany: jest.fn() },
    stockBalance: { upsert: jest.fn(), updateMany: jest.fn() },
    stockLedgerEntry: { create: jest.fn() }
  };
  return {
    prisma: {
      user: { findUnique: jest.fn(), findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
      notification: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'mock-notif' }), update: jest.fn(), updateMany: jest.fn() },
      userRole: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)),
      __fakeTx: fakeTx
    }
  };
});

function getFakeTx() {
  return (prisma as unknown as {
    __fakeTx: {
      stockTransfer: { updateMany: jest.Mock };
      stockBalance: { upsert: jest.Mock; updateMany: jest.Mock };
      stockLedgerEntry: { create: jest.Mock };
    };
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

function makeRepository(): jest.Mocked<StockTransferRepository> {
  return {
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    countByNumberPrefix: jest.fn<(prefix: string) => Promise<number>>().mockResolvedValue(0),
    existsByTransferNumber: jest.fn<(candidate: string) => Promise<boolean>>().mockResolvedValue(false),
    create: jest.fn(),
    updateStatusConditional: jest.fn(),
    list: jest.fn()
  } as unknown as jest.Mocked<StockTransferRepository>;
}

function makeTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transfer-1',
    transferNumber: 'TRF-2026-001',
    status: 'REQUESTED',
    productId: 'p-1',
    materialId: null,
    uomId: 'uom-1',
    fromLocationId: 'loc-1',
    toLocationId: 'loc-2',
    ownership: 'OWNED',
    requestedQuantity: 10,
    issuedQuantity: null,
    receivedQuantity: null,
    requestedByActorId: 'actor-requester',
    ...overrides
  };
}

describe('StockTransferService', () => {
  let repository: jest.Mocked<StockTransferRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = makeRepository();
    auditWriter = new MockAuditWriter();
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-1' } as never);
    getFakeTx().stockTransfer.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.upsert.mockResolvedValue({} as never);
    getFakeTx().stockLedgerEntry.create.mockResolvedValue({ id: 'entry-1' } as never);
  });

  describe('request', () => {
    it('rejects when fromLocationId equals toLocationId', async () => {
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await expect(
        service.request(
          { productId: 'p-1', uomId: 'uom-1', fromLocationId: 'loc-1', toLocationId: 'loc-1', requestedQuantity: 5 },
          'actor-1'
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('creates a transfer in REQUESTED status with no ledger effect', async () => {
      repository.create.mockResolvedValueOnce(makeTransfer() as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.request(
        { productId: 'p-1', uomId: 'uom-1', fromLocationId: 'loc-1', toLocationId: 'loc-2', requestedQuantity: 10 },
        'actor-1'
      );

      expect((result as { status: string }).status).toBe('REQUESTED');
      expect(getFakeTx().stockLedgerEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('issue', () => {
    it('rejects issuing more than requested', async () => {
      repository.findById.mockResolvedValueOnce(makeTransfer() as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.issue('transfer-1', 20, 'actor-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('posts a TRANSFER_OUT entry at the source location', async () => {
      repository.findById.mockResolvedValueOnce(makeTransfer() as never);
      repository.findById.mockResolvedValueOnce(makeTransfer({ status: 'ISSUED', issuedQuantity: 10 }) as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await service.issue('transfer-1', 10, 'actor-1');

      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ direction: 'OUT', entryType: 'TRANSFER_OUT', locationId: 'loc-1' }) })
      );
    });

    it('a requester cannot issue their own transfer without transfer_override permission', async () => {
      repository.findById.mockResolvedValueOnce(makeTransfer({ requestedByActorId: 'actor-1' }) as never);
      class DenyOverrideChecker implements PermissionChecker {
        async can(_actorId: string, action: string): Promise<boolean> {
          return action === 'transfer';
        }
      }
      const service = new StockTransferService(repository, new DenyOverrideChecker(), auditWriter);

      await expect(service.issue('transfer-1', 10, 'actor-1')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('an actor with transfer_override can issue their own transfer and emits an override audit event', async () => {
      const requested = makeTransfer({ requestedByActorId: 'actor-admin' });
      repository.findById.mockResolvedValueOnce(requested as never);
      repository.findById.mockResolvedValueOnce(makeTransfer({ status: 'ISSUED', issuedQuantity: 10 }) as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.issue('transfer-1', 10, 'actor-admin');
      expect((result as { status: string }).status).toBe('ISSUED');
      expect(auditWriter.events[0]).toEqual(
        expect.objectContaining({
          action: 'inventory.transfer_override_issue',
          metadata: expect.objectContaining({ override: true, sameActor: true })
        })
      );
    });

    it('rejects issuing a transfer that is not REQUESTED', async () => {
      repository.findById.mockResolvedValueOnce(makeTransfer({ status: 'ISSUED', requestedByActorId: 'other-actor' }) as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.issue('transfer-1', 5, 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });

  describe('receive', () => {
    it('supports a partial receipt (received < issued) and records the shortfall in metadata', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-2' } as never);
      const issued = makeTransfer({ status: 'ISSUED', issuedQuantity: 10 });
      repository.findById.mockResolvedValueOnce(issued as never);
      repository.findById.mockResolvedValueOnce({ ...issued, status: 'RECEIVED', receivedQuantity: 7 } as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await service.receive('transfer-1', 7, 'actor-1');

      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ direction: 'IN', entryType: 'TRANSFER_IN', locationId: 'loc-2', quantity: 7 }) })
      );
      expect(auditWriter.events[0]).toEqual(expect.objectContaining({ metadata: { shortfall: 3 } }));
    });

    it('rejects receiving more than was issued', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-2' } as never);
      repository.findById.mockResolvedValueOnce(makeTransfer({ status: 'ISSUED', issuedQuantity: 10 }) as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.receive('transfer-1', 15, 'actor-1')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('cancel', () => {
    it('cancels a REQUESTED transfer with no compensating ledger entry', async () => {
      repository.findById.mockResolvedValueOnce(makeTransfer() as never);
      repository.findById.mockResolvedValueOnce(makeTransfer({ status: 'CANCELLED' }) as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await service.cancel('transfer-1', 'actor-1');

      expect(getFakeTx().stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('cancelling an ISSUED transfer posts a compensating reversal at the source location', async () => {
      const issued = makeTransfer({ status: 'ISSUED', issuedQuantity: 10 });
      repository.findById.mockResolvedValueOnce(issued as never);
      repository.findById.mockResolvedValueOnce({ ...issued, status: 'CANCELLED' } as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await service.cancel('transfer-1', 'actor-1');

      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ direction: 'IN', entryType: 'REVERSAL', locationId: 'loc-1', quantity: 10 }) })
      );
    });

    it('rejects cancelling an already-RECEIVED transfer', async () => {
      repository.findById.mockResolvedValueOnce(makeTransfer({ status: 'RECEIVED' }) as never);
      const service = new StockTransferService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.cancel('transfer-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });
});
