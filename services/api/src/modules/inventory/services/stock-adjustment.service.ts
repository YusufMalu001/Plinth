import { StockAdjustment, StockOwnership, StockAdjustmentDirection } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { StockAdjustmentRepository } from '../repositories/stock-adjustment.repository';
import { StockLedgerRepository, computeItemKey } from '../repositories/stock-ledger.repository';
import { reorderEvaluatorService } from './reorder-evaluator.service';
import { assertLocationScope, resolveRequiredLocation } from '../../../common/rbac/location-scope';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';
import { inventoryPostingService } from './inventory-posting.service';

export class StockAdjustmentService {
  constructor(
    private readonly repository: StockAdjustmentRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async propose(
    data: {
      productId?: string;
      materialId?: string;
      uomId: string;
      locationId?: string;
      ownership?: StockOwnership;
      direction: StockAdjustmentDirection;
      quantity: number;
      reason: string;
    },
    actorId: string,
    requestId?: string
  ): Promise<StockAdjustment> {
    const canAdjust = await this.permissionChecker.can(actorId, 'adjust', 'StockAdjustment');
    if (!canAdjust) throw new ForbiddenError('Lacks permission to propose a stock adjustment.');

    if (Boolean(data.productId) === Boolean(data.materialId)) {
      throw new ValidationError('An adjustment must reference exactly one of productId or materialId.');
    }
    if (data.quantity <= 0) throw new ValidationError('Quantity must be positive.');

    const locationId = await resolveRequiredLocation(actorId, data.locationId);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId });

    const year = new Date().getFullYear();
    const adjustmentNumber = await generateSequentialNumber({
      prefix: `ADJ-${year}-`,
      countByPrefix: (prefix) => this.repository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.repository.existsByAdjustmentNumber(candidate)
    });

    const created = await this.repository.create({
      adjustmentNumber,
      productId: data.productId,
      materialId: data.materialId,
      uomId: data.uomId,
      locationId,
      ownership: data.ownership ?? 'OWNED',
      direction: data.direction,
      quantity: data.quantity,
      reason: data.reason,
      proposedByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'inventory.adjustment_propose',
      entityType: 'StockAdjustment',
      entityId: created.id,
      after: created,
      requestId
    });

    await notificationService.handleAdjustmentEvent({
      type: 'PROPOSED',
      adjustmentId: created.id,
      adjustmentNumber: created.adjustmentNumber,
      proposedByActorId: created.proposedByActorId,
      locationId: created.locationId
    });

    return created;
  }

  async review(id: string, note: string | undefined, actorId: string, requestId?: string): Promise<StockAdjustment> {
    const canAdjust = await this.permissionChecker.can(actorId, 'adjust', 'StockAdjustment');
    if (!canAdjust) throw new ForbiddenError('Lacks permission to review a stock adjustment.');

    const adjustment = await this.repository.findById(id);
    if (!adjustment) throw new NotFoundError(`StockAdjustment [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: adjustment.locationId });
    if (adjustment.status !== 'PROPOSED') {
      throw new InvalidStateTransitionError(`Cannot review adjustment in state [${adjustment.status}]. Must be PROPOSED.`);
    }

    const updated = await this.repository.review(id, { reviewedByActorId: actorId, reviewNote: note });

    await this.auditWriter.record({
      actorId,
      action: 'inventory.adjustment_review',
      entityType: 'StockAdjustment',
      entityId: id,
      before: adjustment,
      after: updated,
      requestId
    });

    return updated;
  }

  async approve(id: string, actorId: string, requestId?: string): Promise<StockAdjustment> {
    const adjustment = await this.repository.findById(id);
    if (!adjustment) throw new NotFoundError(`StockAdjustment [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: adjustment.locationId });
    if (adjustment.status !== 'PROPOSED' && adjustment.status !== 'UNDER_REVIEW') {
      throw new InvalidStateTransitionError(`Cannot approve adjustment in state [${adjustment.status}].`);
    }

    let isOverride = false;
    if (adjustment.proposedByActorId === actorId) {
      const canOverride = await this.permissionChecker.can(actorId, 'adjustment_override', 'StockAdjustment');
      if (!canOverride) {
        throw new ForbiddenError('Separation of duties violation: Proposer cannot approve their own stock adjustment.');
      }
      isOverride = true;
    } else {
      const canApprove = await this.permissionChecker.can(actorId, 'approve', 'StockAdjustment');
      if (!canApprove) {
        const canOverride = await this.permissionChecker.can(actorId, 'adjustment_override', 'StockAdjustment');
        if (!canOverride) throw new ForbiddenError('Lacks permission to approve a stock adjustment.');
        isOverride = true;
      }
    }

    const updated = await this.repository.approve(id, actorId);

    await this.auditWriter.record({
      actorId,
      action: isOverride ? 'inventory.adjustment_override_approve' : 'inventory.adjustment_approve',
      entityType: 'StockAdjustment',
      entityId: id,
      before: adjustment,
      after: updated,
      metadata: isOverride ? { override: true, sameActor: adjustment.proposedByActorId === actorId } : undefined,
      requestId
    });

    await notificationService.handleAdjustmentEvent({
      type: isOverride ? 'OVERRIDDEN' : 'APPROVED',
      adjustmentId: updated.id,
      adjustmentNumber: updated.adjustmentNumber,
      proposedByActorId: updated.proposedByActorId,
      locationId: updated.locationId,
      overrideActorId: isOverride ? actorId : undefined
    });

    return updated;
  }

  async reject(id: string, reason: string, actorId: string, requestId?: string): Promise<StockAdjustment> {
    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'StockAdjustment');
    if (!canApprove) throw new ForbiddenError('Lacks permission to reject a stock adjustment.');

    const adjustment = await this.repository.findById(id);
    if (!adjustment) throw new NotFoundError(`StockAdjustment [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: adjustment.locationId });
    if (adjustment.status !== 'PROPOSED' && adjustment.status !== 'UNDER_REVIEW') {
      throw new InvalidStateTransitionError(`Cannot reject adjustment in state [${adjustment.status}].`);
    }

    const updated = await this.repository.reject(id, { rejectedByActorId: actorId, rejectionReason: reason });

    await this.auditWriter.record({
      actorId,
      action: 'inventory.adjustment_reject',
      entityType: 'StockAdjustment',
      entityId: id,
      before: adjustment,
      after: updated,
      metadata: { reason },
      requestId
    });

    await notificationService.handleAdjustmentEvent({
      type: 'REJECTED',
      adjustmentId: updated.id,
      adjustmentNumber: updated.adjustmentNumber,
      proposedByActorId: updated.proposedByActorId,
      locationId: updated.locationId
    });

    return updated;
  }

  async post(id: string, actorId: string, requestId?: string): Promise<StockAdjustment> {
    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'StockAdjustment');
    if (!canApprove) throw new ForbiddenError('Lacks permission to post a stock adjustment.');

    const adjustment = await this.repository.findById(id);
    if (!adjustment) throw new NotFoundError(`StockAdjustment [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: adjustment.locationId });
    if (adjustment.status !== 'APPROVED') {
      throw new InvalidStateTransitionError(`Cannot post adjustment in state [${adjustment.status}]. Must be APPROVED.`);
    }

    await prisma.$transaction(async (tx) => {
      const txRepository = new StockAdjustmentRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const count = await txRepository.postConditional(id, tx);
      if (count === 0) {
        throw new InvalidStateTransitionError(`StockAdjustment [${id}] was modified concurrently; refetch and retry.`);
      }

      await txLedgerRepository.postEntry(
        {
          productId: adjustment.productId,
          materialId: adjustment.materialId,
          uomId: adjustment.uomId,
          locationId: adjustment.locationId,
          ownership: adjustment.ownership,
          direction: adjustment.direction === 'INCREASE' ? 'IN' : 'OUT',
          entryType: adjustment.direction === 'INCREASE' ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE',
          quantity: adjustment.quantity,
          postedByActorId: actorId,
          adjustmentId: id,
          note: adjustment.reason
        },
        tx
      );

      // Keep the authoritative modern balance/ledger projection in sync with
      // the governed adjustment record. The legacy StockLedgerEntry remains
      // for historical compatibility, but the dashboard and current ledger
      // read from inventory_balances/inventory_ledger_entries.
      const modernTables = typeof tx.$queryRaw === 'function'
        ? await tx.$queryRaw<Array<{ balances: string | null; ledger: string | null }>>`
            SELECT to_regclass('inventory_balances')::text AS balances,
                   to_regclass('inventory_ledger_entries')::text AS ledger
          `
        : [];
      if (modernTables[0]?.balances && modernTables[0]?.ledger) {
        const itemType = adjustment.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = adjustment.productId || adjustment.materialId;
        if (itemId) {
          await inventoryPostingService.post(tx, {
            itemType,
            itemId,
            uomId: adjustment.uomId,
            locationId: adjustment.locationId,
            movementType: 'ADJUSTMENT',
            quantity: Number(adjustment.quantity),
            delta: adjustment.direction === 'INCREASE' ? Number(adjustment.quantity) : -Number(adjustment.quantity),
            ownership: adjustment.ownership === 'OWNED' ? 'COMPANY' : 'VENDOR_HELD',
            condition: 'AVAILABLE',
            sourceType: 'STOCK_ADJUSTMENT',
            sourceId: adjustment.id,
            idempotencyKey: `STOCK_ADJUSTMENT:${adjustment.id}`,
            actorId,
            correlationId: requestId || adjustment.id,
          });
        }
      }
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`StockAdjustment [${id}] not found after posting.`);

    await this.auditWriter.record({
      actorId,
      action: 'inventory.adjustment_post',
      entityType: 'StockAdjustment',
      entityId: id,
      before: adjustment,
      after: updated,
      requestId
    });

    if (adjustment.direction === 'DECREASE') {
      try {
        const itemKey = computeItemKey(adjustment.productId, adjustment.materialId);
        const balance = await prisma.stockBalance.findUnique({
          where: {
            itemKey_uomId_locationId_ownership: {
              itemKey,
              uomId: adjustment.uomId,
              locationId: adjustment.locationId,
              ownership: adjustment.ownership
            }
          }
        });
        if (balance) {
          await reorderEvaluatorService.evaluateAndTrigger(balance.id);
        }
      } catch {
        // Non-blocking notification
      }
    }

    return updated;
  }

  async getById(id: string): Promise<StockAdjustment> {
    const adjustment = await this.repository.findById(id);
    if (!adjustment) throw new NotFoundError(`StockAdjustment [${id}] not found.`);
    return adjustment;
  }

  async list(params: { locationId?: string; status?: string; skip?: number; take?: number }) {
    return this.repository.list(params);
  }
}
