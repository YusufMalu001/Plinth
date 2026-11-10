import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MaterialIssueReturnService } from '../services/material-issue-return.service';
import { MaterialIssueReturnRepository } from '../repositories/material-issue-return.repository';
import { MaterialIssueRepository } from '../repositories/material-issue.repository';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => {
  const fakeTx = {
    materialIssueReturn: { updateMany: jest.fn() },
    stockLedgerEntry: { create: jest.fn() },
    stockBalance: { upsert: jest.fn(), updateMany: jest.fn() }
  };
  return {
    prisma: {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)),
      __fakeTx: fakeTx
    }
  };
});

function getFakeTx() {
  return (prisma as unknown as {
    __fakeTx: {
      materialIssueReturn: { updateMany: jest.Mock };
      stockLedgerEntry: { create: jest.Mock };
      stockBalance: { upsert: jest.Mock; updateMany: jest.Mock };
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

function makeReturnRepository(): jest.Mocked<MaterialIssueReturnRepository> {
  return {
    findById: jest.fn(),
    sumSettledByLineId: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    create: jest.fn(),
    updateStatusConditional: jest.fn(),
    listByMaterialIssueId: jest.fn()
  } as unknown as jest.Mocked<MaterialIssueReturnRepository>;
}

function makeIssueRepository(): jest.Mocked<MaterialIssueRepository> {
  return {
    findById: jest.fn()
  } as unknown as jest.Mocked<MaterialIssueRepository>;
}

const POSTED_ISSUE = {
  id: 'mi-1',
  issueNumber: 'MI-000001',
  status: 'POSTED',
  locationId: 'loc-1',
  lines: [{ id: 'l1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg', issuedQuantity: 10 }]
};

describe('MaterialIssueReturnService (outstanding / return-replacement rules)', () => {
  let returnRepository: jest.Mocked<MaterialIssueReturnRepository>;
  let issueRepository: jest.Mocked<MaterialIssueRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    returnRepository = makeReturnRepository();
    issueRepository = makeIssueRepository();
    auditWriter = new MockAuditWriter();
    jest.clearAllMocks();
    issueRepository.findById.mockResolvedValue(POSTED_ISSUE as never);
    getFakeTx().materialIssueReturn.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.upsert.mockResolvedValue({} as never);
    getFakeTx().stockLedgerEntry.create.mockResolvedValue({ id: 'ledger-return-1' } as never);
  });

  function makeService(permissionChecker: PermissionChecker = new AllowAllChecker()) {
    return new MaterialIssueReturnService(returnRepository, issueRepository, permissionChecker, auditWriter);
  }

  describe('request', () => {
    it('rejects when the actor lacks the return permission', async () => {
      const service = makeService(new DenyChecker());
      await expect(
        service.request('mi-1', 'l1', { returnType: 'UNUSED_RETURN', quantity: 2 }, 'actor-1')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects a return against a MaterialIssue that is not yet POSTED', async () => {
      issueRepository.findById.mockResolvedValueOnce({ ...POSTED_ISSUE, status: 'HANDED_OVER' } as never);
      const service = makeService();
      await expect(
        service.request('mi-1', 'l1', { returnType: 'UNUSED_RETURN', quantity: 2 }, 'actor-1')
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('rejects a return quantity exceeding the outstanding issued quantity', async () => {
      returnRepository.sumSettledByLineId.mockResolvedValueOnce(4);
      const service = makeService();
      // issued 10, already settled 4 -> outstanding 6; requesting 7 must fail
      await expect(
        service.request('mi-1', 'l1', { returnType: 'UNUSED_RETURN', quantity: 7 }, 'actor-1')
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('allows a return exactly at the outstanding boundary', async () => {
      returnRepository.sumSettledByLineId.mockResolvedValueOnce(4);
      returnRepository.create.mockResolvedValueOnce({ id: 'ret-1' } as never);
      const service = makeService();

      const result = await service.request('mi-1', 'l1', { returnType: 'DAMAGED_REPLACEMENT', quantity: 6 }, 'actor-1');

      expect(result).toEqual({ id: 'ret-1' });
      expect(returnRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ materialIssueId: 'mi-1', materialIssueLineId: 'l1', returnType: 'DAMAGED_REPLACEMENT', quantity: 6 })
      );
    });
  });

  describe('acknowledge', () => {
    it('rejects acknowledging a return that is not REQUESTED (no duplicate acknowledgement)', async () => {
      returnRepository.findById.mockResolvedValueOnce({ id: 'ret-1', status: 'POSTED', returnType: 'UNUSED_RETURN' } as never);
      const service = makeService();
      await expect(service.acknowledge('ret-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('posts a compensating IN ledger entry and flips ACKNOWLEDGED -> POSTED atomically', async () => {
      returnRepository.findById.mockResolvedValueOnce({
        id: 'ret-1',
        materialIssueId: 'mi-1',
        materialIssueLineId: 'l1',
        returnType: 'UNUSED_RETURN',
        quantity: 3,
        status: 'REQUESTED'
      } as never);
      returnRepository.findById.mockResolvedValueOnce({ id: 'ret-1', status: 'POSTED' } as never);
      const service = makeService();

      await service.acknowledge('ret-1', 'actor-1');

      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ direction: 'IN', entryType: 'PRODUCTION_RETURN', quantity: 3 }) })
      );
      expect(getFakeTx().materialIssueReturn.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ret-1', status: { in: ['ACKNOWLEDGED'] } } })
      );
    });
  });
});
