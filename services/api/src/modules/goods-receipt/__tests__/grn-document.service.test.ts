import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GrnDocumentService } from '../services/grn-document.service';
import { GrnDocumentRepository } from '../repositories/grn-document.repository';
import { GoodsReceiptRepository } from '../repositories/goods-receipt.repository';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { uploadGrnDocument } from '../../../common/storage/supabase-storage.client';

jest.mock('../../../common/storage/supabase-storage.client', () => ({
  uploadGrnDocument: jest.fn()
}));

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

function makeFile(overrides: Partial<{ buffer: Buffer; originalname: string; mimetype: string; size: number }> = {}) {
  return {
    buffer: Buffer.from('content'),
    originalname: 'invoice.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    ...overrides
  };
}

describe('GrnDocumentService', () => {
  let repository: jest.Mocked<GrnDocumentRepository>;
  let goodsReceiptRepository: jest.Mocked<GoodsReceiptRepository>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = { create: jest.fn(), listByGrnId: jest.fn() } as unknown as jest.Mocked<GrnDocumentRepository>;
    goodsReceiptRepository = { findById: jest.fn() } as unknown as jest.Mocked<GoodsReceiptRepository>;
    auditWriter = new MockAuditWriter();
    (uploadGrnDocument as jest.Mock).mockReset();
  });

  it('rejects when the actor lacks upload_document permission', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new DenyChecker(), auditWriter);

    await expect(service.upload('grn-1', makeFile(), 'actor-1')).rejects.toBeInstanceOf(ForbiddenError);
    expect(goodsReceiptRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects an unsupported mime type', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new AllowAllChecker(), auditWriter);

    await expect(
      service.upload('grn-1', makeFile({ mimetype: 'application/x-msdownload', originalname: 'invoice.exe' }), 'actor-1')
    ).rejects.toBeInstanceOf(ValidationError);
    expect(uploadGrnDocument).not.toHaveBeenCalled();
  });

  it('rejects a file over the 10MB limit', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new AllowAllChecker(), auditWriter);

    await expect(
      service.upload('grn-1', makeFile({ size: 11 * 1024 * 1024 }), 'actor-1')
    ).rejects.toBeInstanceOf(ValidationError);
    expect(uploadGrnDocument).not.toHaveBeenCalled();
  });

  it('rejects when no file was provided', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new AllowAllChecker(), auditWriter);

    await expect(service.upload('grn-1', undefined, 'actor-1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects uploading to a FINALIZED GRN', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new AllowAllChecker(), auditWriter);
    goodsReceiptRepository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'FINALIZED' } as never);

    await expect(service.upload('grn-1', makeFile(), 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(uploadGrnDocument).not.toHaveBeenCalled();
  });

  it('uploads a valid PDF and persists the returned URL', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new AllowAllChecker(), auditWriter);
    goodsReceiptRepository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED' } as never);
    (uploadGrnDocument as jest.Mock).mockResolvedValueOnce({ path: 'grn/grn-1/1-invoice.pdf', publicUrl: 'https://example.test/invoice.pdf' } as never);
    repository.create.mockResolvedValueOnce({ id: 'doc-1', grnId: 'grn-1', fileUrl: 'https://example.test/invoice.pdf', fileName: 'invoice.pdf', uploadedBy: 'actor-1' } as never);

    const result = await service.upload('grn-1', makeFile(), 'actor-1');

    expect(repository.create).toHaveBeenCalledWith({
      grnId: 'grn-1',
      fileUrl: 'https://example.test/invoice.pdf',
      fileName: 'invoice.pdf',
      uploadedBy: 'actor-1'
    });
    expect((result as { id: string }).id).toBe('doc-1');
    expect(auditWriter.events).toHaveLength(1);
  });

  it('lists documents and refreshes signed URLs', async () => {
    const service = new GrnDocumentService(repository, goodsReceiptRepository, new AllowAllChecker(), auditWriter);
    repository.listByGrnId.mockResolvedValueOnce([
      { id: 'doc-1', grnId: 'grn-1', fileUrl: 'https://example.test/invoice.pdf', fileName: 'invoice.pdf', uploadedBy: 'actor-1' } as never
    ]);

    const result = await service.list('grn-1');
    expect(repository.listByGrnId).toHaveBeenCalledWith('grn-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('doc-1');
  });
});
