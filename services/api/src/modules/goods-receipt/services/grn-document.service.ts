/* eslint-disable @typescript-eslint/no-explicit-any */
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { createHash } from 'crypto';
import { GrnDocumentRepository } from '../repositories/grn-document.repository';
import { GoodsReceiptRepository } from '../repositories/goods-receipt.repository';
import { uploadGrnDocument, createSignedUrlForPath, UploadableFile } from '../../../common/storage/supabase-storage.client';
import { ForbiddenError, NotFoundError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export class GrnDocumentService {
  constructor(
    private readonly repository: GrnDocumentRepository,
    private readonly goodsReceiptRepository: GoodsReceiptRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async upload(grnId: string, file: UploadableFile | undefined, actorId: string, requestId?: string) {
    const canUpload = await this.permissionChecker.can(actorId, 'upload_document', 'GoodsReceiptNote');
    if (!canUpload) throw new ForbiddenError('Lacks permission to upload GRN documents.');

    if (!file) throw new ValidationError('No file was provided.');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new ValidationError(`Unsupported file type [${file.mimetype}]. Allowed: PDF, PNG, JPEG.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError('File exceeds the 10MB size limit.');
    }

    const grn = await this.goodsReceiptRepository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);
    if (grn.status === 'FINALIZED' && !grn.jobWorkReceiptReturn) {
      throw new InvalidStateTransitionError('Cannot upload documents to a finalized GRN.');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const repositoryClient = (this.repository as any).prisma;
    const existing = repositoryClient?.grnDocument?.findFirst ? await repositoryClient.grnDocument.findFirst({ where: { grnId, sha256 } }).catch(() => null) : null;
    if (existing) return existing;
    const { publicUrl, path } = await uploadGrnDocument(grnId, file);

    const document = await this.repository.create({
      grnId,
      fileUrl: publicUrl,
      fileName: file.originalname,
      uploadedBy: actorId,
      ...(repositoryClient?.grnDocument ? { storageKey: path, documentType: 'SUPPLIER_INVOICE', sha256 } : {})
    });

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.document_upload',
      entityType: 'GrnDocument',
      entityId: document.id,
      after: document,
      requestId
    });

    return document;
  }

  async list(grnId: string) {
    const documents = await this.repository.listByGrnId(grnId);
    return Promise.all(
      documents.map(async (doc) => {
        try {
          const freshUrl = await createSignedUrlForPath((doc as any).storageKey || doc.fileUrl);
          return { ...doc, fileUrl: freshUrl };
        } catch {
          return doc;
        }
      })
    );
  }
}
