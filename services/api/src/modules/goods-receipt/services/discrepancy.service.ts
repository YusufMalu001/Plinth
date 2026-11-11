import { PermissionChecker, AuditWriter } from '@plinth/types';
import { DiscrepancyRepository } from '../repositories/discrepancy.repository';
import { GoodsReceiptRepository } from '../repositories/goods-receipt.repository';
import { ForbiddenError, NotFoundError, InvalidStateTransitionError } from '../../../common/errors/AppError';

export class DiscrepancyService {
  constructor(
    private readonly repository: DiscrepancyRepository,
    private readonly goodsReceiptRepository: GoodsReceiptRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async list(grnId: string) {
    return this.repository.listByGrnId(grnId);
  }

  async createForLine(params: {
    grnLineId: string;
    type: 'SHORTAGE' | 'EXCESS' | 'DAMAGE';
    quantity: number;
    actorId: string;
    requestId?: string;
  }) {
    const created = await this.repository.create({
      grnLineId: params.grnLineId,
      type: params.type,
      quantity: params.quantity
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'goods_receipt.discrepancy_create',
      entityType: 'GoodsReceiptDiscrepancy',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  /**
   * Resolves a discrepancy. ACCEPT_EXCESS and RETURN_TO_VENDOR are different authority
   * levels: every actor reaching this endpoint must hold 'resolve_discrepancy', but
   * authorizing a physical return to the vendor additionally requires 'return' - the
   * same lesson as generatePO ('create') vs sendPO ('issue') not being collapsed.
   */
  async resolve(params: {
    grnId?: string;
    discrepancyId: string;
    resolutionType: 'ACCEPT_EXCESS' | 'RETURN_TO_VENDOR';
    acceptanceJustification?: string;
    returnReference?: string;
    actorId: string;
    requestId?: string;
  }) {
    const canResolve = await this.permissionChecker.can(params.actorId, 'resolve_discrepancy', 'GoodsReceiptDiscrepancy');
    if (!canResolve) throw new ForbiddenError('Lacks permission to resolve GRN discrepancies.');

    if (params.resolutionType === 'RETURN_TO_VENDOR') {
      const canReturn = await this.permissionChecker.can(params.actorId, 'return', 'GoodsReceiptDiscrepancy');
      if (!canReturn) throw new ForbiddenError('Lacks permission to authorize a return-to-vendor.');
    }

    const discrepancy = await this.repository.findById(params.discrepancyId);
    if (!discrepancy) throw new NotFoundError(`Discrepancy [${params.discrepancyId}] not found.`);
    if (params.grnId && discrepancy.grnLine.grnId !== params.grnId) {
      throw new NotFoundError(`Discrepancy [${params.discrepancyId}] does not belong to GoodsReceiptNote [${params.grnId}].`);
    }
    if (discrepancy.status === 'RESOLVED') {
      // API retries/double-clicks are safe: the first committed resolution is
      // authoritative and can be returned to the caller without another write.
      if (params.grnId) return discrepancy;
      throw new InvalidStateTransitionError(`Discrepancy [${params.discrepancyId}] is already resolved.`);
    }

    // Debit-note is only proposed when the discrepancy means the vendor owes us back
    // (shortage/damage). V-008 (TO BE VALIDATED): never compute or guess an amount here -
    // finance must review; this only raises the flag.
    const needsDebitNoteReview = discrepancy.type === 'SHORTAGE' || discrepancy.type === 'DAMAGE';

    // "Accept into Stock (override)": accepting a DAMAGE discrepancy moves the damaged
    // quantity into acceptedQuantity so it becomes real, postable inventory at finalize -
    // otherwise the UI's override button had no actual effect on the line. The move keeps
    // received = accepted + rejected + damaged balanced (damaged goes down by exactly what
    // accepted goes up by), so no separate equation re-check is needed.
    if (params.resolutionType === 'ACCEPT_EXCESS' && discrepancy.type === 'DAMAGE') {
      const line = discrepancy.grnLine;
      const moveQty = Math.min(discrepancy.quantity, line.damagedQuantity);
      if (moveQty > 0) {
        await this.goodsReceiptRepository.updateLineQuantities(line.id, {
          acceptedQuantity: line.acceptedQuantity + moveQty,
          damagedQuantity: line.damagedQuantity - moveQty
        });
      }
    }

    const resolved = await this.repository.resolve(params.discrepancyId, {
      resolutionType: params.resolutionType,
      acceptanceJustification: params.acceptanceJustification,
      returnReference: params.returnReference,
      resolvedByActorId: params.actorId,
      debitNoteStatus: needsDebitNoteReview ? 'PENDING_VALIDATION' : undefined,
      debitNoteNotes: needsDebitNoteReview
        ? 'Debit-note accounting treatment is unresolved (V-008) - flagged for Finance review, no amount computed.'
        : undefined
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'goods_receipt.resolve_discrepancy',
      entityType: 'GoodsReceiptDiscrepancy',
      entityId: resolved.id,
      before: discrepancy,
      after: resolved,
      requestId: params.requestId
    });

    return resolved;
  }
}
