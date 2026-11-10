import { Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { LabelRepository } from '../repositories/label.repository';
import { ForbiddenError, NotFoundError, DuplicateError } from '../../../common/errors/AppError';

const MAX_LABEL_GENERATION_ATTEMPTS = 5;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class LabelService {
  constructor(
    private readonly repository: LabelRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  /**
   * Auto-generates a unique Synergy label for a line the first time it reaches VERIFIED.
   * One label per line (tracker does not specify per-unit granularity).
   */
  async generateForLine(grnLineId: string, actorId: string, requestId?: string) {
    const existing = await this.repository.findByLineId(grnLineId);
    if (existing) return existing;

    const year = new Date().getFullYear();
    const prefix = `SGL-${year}-`;
    let attempt = await this.repository.countByCodePrefix(prefix);

    for (let i = 0; i < MAX_LABEL_GENERATION_ATTEMPTS; i++) {
      attempt++;
      const labelCode = `${prefix}${String(attempt).padStart(5, '0')}`;
      try {
        const label = await this.repository.create(grnLineId, labelCode);
        await this.auditWriter.record({
          actorId,
          action: 'goods_receipt.label_generate',
          entityType: 'GoodsReceiptLabel',
          entityId: label.id,
          after: label,
          requestId
        });
        return label;
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    throw new DuplicateError(`Unable to generate a unique label code after ${MAX_LABEL_GENERATION_ATTEMPTS} attempts.`);
  }

  async reprint(grnLineId: string, actorId: string, reason: string | undefined, requestId?: string) {
    const canUpdate = await this.permissionChecker.can(actorId, 'update', 'GoodsReceiptLabel');
    if (!canUpdate) throw new ForbiddenError('Lacks permission to reprint GRN labels.');

    const label = await this.repository.findByLineId(grnLineId);
    if (!label) throw new NotFoundError(`No label has been generated yet for GRN line [${grnLineId}].`);

    const printEvent = await this.repository.addPrintEvent(label.id, actorId, reason);

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.reprint_label',
      entityType: 'GoodsReceiptLabel',
      entityId: label.id,
      after: printEvent,
      metadata: { reason },
      requestId
    });

    return this.repository.findById(label.id);
  }
}
