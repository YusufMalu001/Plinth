import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { LabelService } from '../services/label.service';
import { LabelRepository } from '../repositories/label.repository';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { DuplicateError, NotFoundError } from '../../../common/errors/AppError';

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

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`labelCode`)', {
    code: 'P2002',
    clientVersion: '5.22.0'
  });
}

describe('LabelService', () => {
  let repository: jest.Mocked<LabelRepository>;
  let service: LabelService;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = {
      findByLineId: jest.fn(),
      findById: jest.fn(),
      countByCodePrefix: jest.fn(),
      create: jest.fn(),
      addPrintEvent: jest.fn()
    } as unknown as jest.Mocked<LabelRepository>;
    auditWriter = new MockAuditWriter();
    service = new LabelService(repository, new AllowAllChecker(), auditWriter);
  });

  describe('generateForLine', () => {
    it('returns the existing label if one was already generated for the line', async () => {
      const existing = { id: 'label-1', grnLineId: 'line-1', labelCode: 'SGL-2026-00001' };
      repository.findByLineId.mockResolvedValueOnce(existing as never);

      const result = await service.generateForLine('line-1', 'actor-1');

      expect(result).toBe(existing);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws a 409 DuplicateError when every generation attempt collides on a unique label code', async () => {
      repository.findByLineId.mockResolvedValueOnce(null);
      repository.countByCodePrefix.mockResolvedValueOnce(0);
      repository.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.generateForLine('line-1', 'actor-1')).rejects.toBeInstanceOf(DuplicateError);
    });

    it('generates a unique label code on the first successful attempt', async () => {
      repository.findByLineId.mockResolvedValueOnce(null);
      repository.countByCodePrefix.mockResolvedValueOnce(4);
      const created = { id: 'label-2', grnLineId: 'line-1', labelCode: 'SGL-2026-00005' };
      repository.create.mockResolvedValueOnce(created as never);

      const result = await service.generateForLine('line-1', 'actor-1');

      expect(result).toBe(created);
      expect(auditWriter.events).toHaveLength(1);
    });
  });

  describe('reprint', () => {
    it('throws NotFoundError when the line has no label yet', async () => {
      repository.findByLineId.mockResolvedValueOnce(null);

      await expect(service.reprint('line-1', 'actor-1', 'smudged')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('adds a new print event without changing the label identity', async () => {
      const label = { id: 'label-1', grnLineId: 'line-1', labelCode: 'SGL-2026-00001' };
      repository.findByLineId.mockResolvedValueOnce(label as never);
      repository.addPrintEvent.mockResolvedValueOnce({ id: 'evt-1', labelId: 'label-1' } as never);
      repository.findById.mockResolvedValueOnce({ ...label, printEvents: [{ id: 'evt-1' }] } as never);

      const result = await service.reprint('line-1', 'actor-1', 'smudged');

      expect(repository.addPrintEvent).toHaveBeenCalledWith('label-1', 'actor-1', 'smudged');
      expect((result as { labelCode: string }).labelCode).toBe('SGL-2026-00001');
    });
  });
});
