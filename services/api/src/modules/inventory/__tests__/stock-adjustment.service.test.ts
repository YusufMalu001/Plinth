import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StockAdjustmentService } from '../services/stock-adjustment.service';
import { StockAdjustmentRepository } from '../repositories/stock-adjustment.repository';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ForbiddenError, InvalidStateTransitionError, InsufficientStockError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => {
  const fakeTx = {
    stockAdjustment: { updateMany: jest.fn() },
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
      stockAdjustment: { updateMany: jest.Mock };
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


function makeRepository(): jest.Mocked<StockAdjustmentRepository> {
  return {
    findById: jest.fn(),
    countByNumberPrefix: jest.fn<(prefix: string) => Promise<number>>().mockResolvedValue(0),
    existsByAdjustmentNumber: jest.fn<(candidate: string) => Promise<boolean>>().mockResolvedValue(false),
    create: jest.fn(),
    review: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    postConditional: jest.fn(),
    list: jest.fn()
  } as unknown as jest.Mocked<StockAdjustmentRepository>;
}

function makeAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    adjustmentNumber: 'ADJ-2026-001',
    status: 'PROPOSED',
    productId: 'p-1',
    materialId: null,
    uomId: 'uom-1',
    locationId: 'loc-1',
    ownership: 'OWNED',
    direction: 'DECREASE',
    quantity: 5,
    reason: 'Physical count variance',
    ...overrides
  };
}

describe('StockAdjustmentService', () => {
  let repository: jest.Mocked<StockAdjustmentRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = makeRepository();
    auditWriter = new MockAuditWriter();
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-1' } as never);
    getFakeTx().stockAdjustment.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.upsert.mockResolvedValue({} as never);
    getFakeTx().stockLedgerEntry.create.mockResolvedValue({ id: 'entry-1' } as never);
  });

  it('propose creates a PROPOSED adjustment', async () => {
    repository.create.mockResolvedValueOnce(makeAdjustment() as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    const result = await service.propose(
      { productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', direction: 'DECREASE', quantity: 5, reason: 'Physical count variance' },
      'actor-1'
    );

    expect((result as { status: string }).status).toBe('PROPOSED');
  });

  it('a proposer cannot approve their own proposal without adjustment_override permission', async () => {
    repository.findById.mockResolvedValueOnce(makeAdjustment({ proposedByActorId: 'actor-1' }) as never);
    // Allow ordinary approve, but deny adjustment_override
    class DenyOverrideChecker implements PermissionChecker {
      async can(_actorId: string, action: string): Promise<boolean> {
        return action === 'approve';
      }
    }
    const service = new StockAdjustmentService(repository, new DenyOverrideChecker(), auditWriter);

    await expect(service.approve('adj-1', 'actor-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('an actor with adjustment_override can approve their own proposal and emits an override audit event', async () => {
    repository.findById.mockResolvedValueOnce(makeAdjustment({ proposedByActorId: 'actor-admin' }) as never);
    repository.approve.mockResolvedValueOnce(makeAdjustment({ status: 'APPROVED', approvedByActorId: 'actor-admin' }) as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    const result = await service.approve('adj-1', 'actor-admin');
    expect((result as { status: string }).status).toBe('APPROVED');
    expect(auditWriter.events[0]).toEqual(
      expect.objectContaining({
        action: 'inventory.adjustment_override_approve',
        metadata: expect.objectContaining({ override: true, sameActor: true })
      })
    );
  });

  it('rejects approving an adjustment that is already POSTED', async () => {
    repository.findById.mockResolvedValueOnce(makeAdjustment({ status: 'POSTED' }) as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    await expect(service.approve('adj-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('rejects posting an adjustment that has not been approved', async () => {
    repository.findById.mockResolvedValueOnce(makeAdjustment({ status: 'PROPOSED' }) as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    await expect(service.post('adj-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('posts a DECREASE adjustment as an OUT/ADJUSTMENT_DECREASE ledger entry', async () => {
    const approved = makeAdjustment({ status: 'APPROVED' });
    repository.findById.mockResolvedValueOnce(approved as never);
    repository.findById.mockResolvedValueOnce({ ...approved, status: 'POSTED' } as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    await service.post('adj-1', 'actor-1');

    expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'OUT', entryType: 'ADJUSTMENT_DECREASE', adjustmentId: 'adj-1' }) })
    );
  });

  it('posts an INCREASE adjustment as an IN/ADJUSTMENT_INCREASE ledger entry', async () => {
    const approved = makeAdjustment({ status: 'APPROVED', direction: 'INCREASE' });
    repository.findById.mockResolvedValueOnce(approved as never);
    repository.findById.mockResolvedValueOnce({ ...approved, status: 'POSTED' } as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    await service.post('adj-1', 'actor-1');

    expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'IN', entryType: 'ADJUSTMENT_INCREASE' }) })
    );
  });

  it('a posted DECREASE that has become impossible (insufficient stock) fails loudly rather than going negative', async () => {
    const approved = makeAdjustment({ status: 'APPROVED' });
    repository.findById.mockResolvedValueOnce(approved as never);
    getFakeTx().stockBalance.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    await expect(service.post('adj-1', 'actor-1')).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('throws when the post concurrency guard finds the adjustment no longer APPROVED', async () => {
    repository.findById.mockResolvedValueOnce(makeAdjustment({ status: 'APPROVED' }) as never);
    getFakeTx().stockAdjustment.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    await expect(service.post('adj-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('reject stores the rejection reason and moves to REJECTED', async () => {
    repository.findById.mockResolvedValueOnce(makeAdjustment() as never);
    repository.reject.mockResolvedValueOnce(makeAdjustment({ status: 'REJECTED' }) as never);
    const service = new StockAdjustmentService(repository, new AllowAllChecker(), auditWriter);

    const result = await service.reject('adj-1', 'Count looks wrong, re-verify', 'actor-1');

    expect(repository.reject).toHaveBeenCalledWith('adj-1', { rejectedByActorId: 'actor-1', rejectionReason: 'Count looks wrong, re-verify' });
    expect((result as { status: string }).status).toBe('REJECTED');
  });
});
