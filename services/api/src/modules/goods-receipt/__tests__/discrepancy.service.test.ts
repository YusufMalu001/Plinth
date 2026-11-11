import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DiscrepancyService } from '../services/discrepancy.service';
import { DiscrepancyRepository } from '../repositories/discrepancy.repository';
import { GoodsReceiptRepository } from '../repositories/goods-receipt.repository';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ForbiddenError, InvalidStateTransitionError } from '../../../common/errors/AppError';

class MockAuditWriter implements AuditWriter {
  events: unknown[] = [];
  async record(event: unknown): Promise<void> {
    this.events.push(event);
  }
}

class ConfigurableChecker implements PermissionChecker {
  constructor(private readonly denied: Set<string> = new Set()) {}
  async can(_actorId: string, action: string, resource: string): Promise<boolean> {
    return !this.denied.has(`${action}:${resource}`);
  }
}

function makeDiscrepancyRepository(): jest.Mocked<DiscrepancyRepository> {
  return {
    findById: jest.fn(),
    listByGrnId: jest.fn(),
    countUnresolvedByGrnId: jest.fn(),
    create: jest.fn(),
    resolve: jest.fn(),
    updateStatus: jest.fn()
  } as unknown as jest.Mocked<DiscrepancyRepository>;
}

function makeGoodsReceiptRepository(): jest.Mocked<GoodsReceiptRepository> {
  return {
    updateLineQuantities: jest.fn()
  } as unknown as jest.Mocked<GoodsReceiptRepository>;
}

describe('DiscrepancyService', () => {
  let repository: jest.Mocked<DiscrepancyRepository>;
  let goodsReceiptRepository: jest.Mocked<GoodsReceiptRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = makeDiscrepancyRepository();
    goodsReceiptRepository = makeGoodsReceiptRepository();
    auditWriter = new MockAuditWriter();
  });

  describe('resolve - permission gates', () => {
    it('rejects when the actor lacks resolve_discrepancy', async () => {
      const service = new DiscrepancyService(
        repository,
        goodsReceiptRepository,
        new ConfigurableChecker(new Set(['resolve_discrepancy:GoodsReceiptDiscrepancy'])),
        auditWriter
      );

      await expect(
        service.resolve({ discrepancyId: 'd-1', resolutionType: 'ACCEPT_EXCESS', actorId: 'actor-1' })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('requires the distinct return permission on top of resolve_discrepancy for RETURN_TO_VENDOR', async () => {
      const service = new DiscrepancyService(
        repository,
        goodsReceiptRepository,
        new ConfigurableChecker(new Set(['return:GoodsReceiptDiscrepancy'])),
        auditWriter
      );

      await expect(
        service.resolve({ discrepancyId: 'd-1', resolutionType: 'RETURN_TO_VENDOR', returnReference: 'RMA-1', actorId: 'actor-1' })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows RETURN_TO_VENDOR when the actor holds both resolve_discrepancy and return', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({
        id: 'd-1',
        status: 'PENDING',
        type: 'EXCESS',
        quantity: 2,
        grnLine: { id: 'line-1', acceptedQuantity: 8, damagedQuantity: 0 }
      } as never);
      repository.resolve.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' } as never);

      const result = await service.resolve({
        discrepancyId: 'd-1',
        resolutionType: 'RETURN_TO_VENDOR',
        returnReference: 'RMA-1',
        actorId: 'actor-1'
      });

      expect((result as { status: string }).status).toBe('RESOLVED');
    });
  });

  describe('resolve - already resolved', () => {
    it('rejects resolving a discrepancy that is already RESOLVED', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED', type: 'EXCESS' } as never);

      await expect(
        service.resolve({ discrepancyId: 'd-1', resolutionType: 'ACCEPT_EXCESS', actorId: 'actor-1' })
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });

  describe('resolve - ACCEPT_EXCESS on a DAMAGE discrepancy moves quantity into accepted stock', () => {
    it('increments acceptedQuantity and decrements damagedQuantity by the discrepancy amount', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({
        id: 'd-1',
        status: 'PENDING',
        type: 'DAMAGE',
        quantity: 3,
        grnLine: { id: 'line-1', acceptedQuantity: 7, damagedQuantity: 3 }
      } as never);
      repository.resolve.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' } as never);

      await service.resolve({
        discrepancyId: 'd-1',
        resolutionType: 'ACCEPT_EXCESS',
        acceptanceJustification: 'Supervisor override - cosmetic damage only',
        actorId: 'actor-1'
      });

      expect(goodsReceiptRepository.updateLineQuantities).toHaveBeenCalledWith('line-1', {
        acceptedQuantity: 10,
        damagedQuantity: 0
      });
    });

    it('clamps the move to the available damaged quantity rather than going negative', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({
        id: 'd-1',
        status: 'PENDING',
        type: 'DAMAGE',
        quantity: 5, // discrepancy recorded 5, but only 2 remain classified as damaged on the line
        grnLine: { id: 'line-1', acceptedQuantity: 8, damagedQuantity: 2 }
      } as never);
      repository.resolve.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' } as never);

      await service.resolve({ discrepancyId: 'd-1', resolutionType: 'ACCEPT_EXCESS', actorId: 'actor-1' });

      expect(goodsReceiptRepository.updateLineQuantities).toHaveBeenCalledWith('line-1', {
        acceptedQuantity: 10,
        damagedQuantity: 0
      });
    });

    it('does not touch line quantities when the discrepancy type is EXCESS, not DAMAGE', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({
        id: 'd-1',
        status: 'PENDING',
        type: 'EXCESS',
        quantity: 2,
        grnLine: { id: 'line-1', acceptedQuantity: 12, damagedQuantity: 0 }
      } as never);
      repository.resolve.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' } as never);

      await service.resolve({ discrepancyId: 'd-1', resolutionType: 'ACCEPT_EXCESS', actorId: 'actor-1' });

      expect(goodsReceiptRepository.updateLineQuantities).not.toHaveBeenCalled();
    });
  });

  describe('resolve - debit-note flag (V-008)', () => {
    it('flags PENDING_VALIDATION for SHORTAGE and DAMAGE but never computes an amount', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({
        id: 'd-1',
        status: 'PENDING',
        type: 'SHORTAGE',
        quantity: 4,
        grnLine: { id: 'line-1', acceptedQuantity: 6, damagedQuantity: 0 }
      } as never);
      repository.resolve.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' } as never);

      await service.resolve({ discrepancyId: 'd-1', resolutionType: 'RETURN_TO_VENDOR', returnReference: 'RMA-1', actorId: 'actor-1' });

      const resolveCallArg = repository.resolve.mock.calls[0][1] as { debitNoteStatus?: string };
      expect(resolveCallArg.debitNoteStatus).toBe('PENDING_VALIDATION');
      expect(resolveCallArg).not.toHaveProperty('debitNoteAmount');
    });

    it('does not flag a debit note for EXCESS', async () => {
      const service = new DiscrepancyService(repository, goodsReceiptRepository, new ConfigurableChecker(), auditWriter);
      repository.findById.mockResolvedValueOnce({
        id: 'd-1',
        status: 'PENDING',
        type: 'EXCESS',
        quantity: 2,
        grnLine: { id: 'line-1', acceptedQuantity: 12, damagedQuantity: 0 }
      } as never);
      repository.resolve.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' } as never);

      await service.resolve({ discrepancyId: 'd-1', resolutionType: 'ACCEPT_EXCESS', actorId: 'actor-1' });

      const resolveCallArg = repository.resolve.mock.calls[0][1] as { debitNoteStatus?: string };
      expect(resolveCallArg.debitNoteStatus).toBeUndefined();
    });
  });
});
