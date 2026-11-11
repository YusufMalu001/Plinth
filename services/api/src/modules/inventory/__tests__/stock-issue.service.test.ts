import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StockIssueService } from '../services/stock-issue.service';
import { StockIssueRepository } from '../repositories/stock-issue.repository';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => {
  const fakeTx = {
    stockIssue: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    stockBalance: { upsert: jest.fn(), updateMany: jest.fn() },
    stockLedgerEntry: { create: jest.fn() }
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
    __fakeTx: {
      stockIssue: { create: jest.Mock; updateMany: jest.Mock };
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

class DenyChecker implements PermissionChecker {
  async can(): Promise<boolean> {
    return false;
  }
}

function makeRepository(): jest.Mocked<StockIssueRepository> {
  return {
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    countByNumberPrefix: jest.fn<(prefix: string) => Promise<number>>().mockResolvedValue(0),
    existsByIssueNumber: jest.fn<(candidate: string) => Promise<boolean>>().mockResolvedValue(false),
    create: jest.fn(),
    markReversedConditional: jest.fn(),
    list: jest.fn()
  } as unknown as jest.Mocked<StockIssueRepository>;
}

describe('StockIssueService', () => {
  let repository: jest.Mocked<StockIssueRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = makeRepository();
    auditWriter = new MockAuditWriter();
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-1' } as never);
    getFakeTx().stockIssue.create.mockResolvedValue({ id: 'issue-1', issueNumber: 'ISS-2026-001' } as never);
    getFakeTx().stockIssue.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.upsert.mockResolvedValue({} as never);
    getFakeTx().stockLedgerEntry.create.mockResolvedValue({ id: 'entry-1' } as never);
  });

  describe('create', () => {
    it('rejects when the actor lacks the issue permission', async () => {
      const service = new StockIssueService(repository, new DenyChecker(), auditWriter);

      await expect(
        service.create({ productId: 'p-1', uomId: 'uom-1', quantity: 5, reason: 'Consumed on the floor' }, 'actor-1')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects when both productId and materialId are given', async () => {
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      await expect(
        service.create({ productId: 'p-1', materialId: 'm-1', uomId: 'uom-1', quantity: 5, reason: 'x' }, 'actor-1')
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('replays an existing issue on idempotency-key match without creating a new one', async () => {
      const existing = { id: 'issue-existing' };
      repository.findByIdempotencyKey.mockResolvedValueOnce(existing as never);
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.create(
        { productId: 'p-1', uomId: 'uom-1', quantity: 5, reason: 'x' },
        'actor-1',
        'idem-1'
      );

      expect(result).toBe(existing);
      expect(getFakeTx().stockIssue.create).not.toHaveBeenCalled();
    });

    it('posts an OUT ledger entry and creates the issue inside one transaction', async () => {
      repository.findById.mockResolvedValueOnce({ id: 'issue-1', issueNumber: 'ISS-2026-001' } as never);
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      await service.create({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', quantity: 5, reason: 'Floor use' }, 'actor-1');

      expect(getFakeTx().stockIssue.create).toHaveBeenCalledTimes(1);
      expect(getFakeTx().stockBalance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { onHandQuantity: { decrement: 5 } } })
      );
      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(auditWriter.events).toHaveLength(1);
    });

    it('rejects when the actor is not assigned to the target location', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ assignedLocationId: 'loc-2' } as never);
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      await expect(
        service.create({ productId: 'p-1', uomId: 'uom-1', locationId: 'loc-1', quantity: 5, reason: 'x' }, 'actor-1')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('reverse', () => {
    it('rejects reversing an issue that is not currently ISSUED', async () => {
      repository.findById.mockResolvedValueOnce({ id: 'issue-1', status: 'REVERSED', locationId: 'loc-1' } as never);
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.reverse('issue-1', 'mistake', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('posts a compensating IN ledger entry and marks the issue REVERSED', async () => {
      const issue = {
        id: 'issue-1',
        status: 'ISSUED',
        locationId: 'loc-1',
        productId: 'p-1',
        materialId: null,
        uomId: 'uom-1',
        ownership: 'OWNED',
        quantity: 5,
        issueNumber: 'ISS-2026-001'
      };
      repository.findById.mockResolvedValueOnce(issue as never);
      repository.findById.mockResolvedValueOnce({ ...issue, status: 'REVERSED' } as never);
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      const result = await service.reverse('issue-1', 'mistaken issue', 'actor-1');

      expect(getFakeTx().stockIssue.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'issue-1', status: 'ISSUED' } })
      );
      expect(getFakeTx().stockBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { onHandQuantity: { increment: 5 } } })
      );
      expect((result as { status: string }).status).toBe('REVERSED');
    });

    it('throws when the reversal concurrency guard finds the issue already reversed', async () => {
      repository.findById.mockResolvedValueOnce({
        id: 'issue-1',
        status: 'ISSUED',
        locationId: 'loc-1',
        productId: 'p-1',
        uomId: 'uom-1',
        ownership: 'OWNED',
        quantity: 5,
        issueNumber: 'ISS-2026-001'
      } as never);
      getFakeTx().stockIssue.updateMany.mockResolvedValueOnce({ count: 0 } as never);
      const service = new StockIssueService(repository, new AllowAllChecker(), auditWriter);

      await expect(service.reverse('issue-1', 'mistake', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });
});
