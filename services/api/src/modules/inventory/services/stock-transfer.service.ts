import { StockTransfer, StockOwnership } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { StockTransferRepository } from '../repositories/stock-transfer.repository';
import { StockLedgerRepository, computeItemKey } from '../repositories/stock-ledger.repository';
import { reorderEvaluatorService } from './reorder-evaluator.service';
import { assertLocationScope } from '../../../common/rbac/location-scope';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';
import { inventoryPostingService } from './inventory-posting.service';

export class StockTransferService {
  constructor(
    private readonly repository: StockTransferRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  private async assertPermission(actorId: string, action: string): Promise<void> {
    const allowed = await this.permissionChecker.can(actorId, action, 'StockTransfer');
    if (!allowed) throw new ForbiddenError(`Lacks permission to ${action} a stock transfer.`);
  }

  async request(
    data: {
      productId?: string;
      materialId?: string;
      uomId: string;
      fromLocationId: string;
      toLocationId: string;
      ownership?: StockOwnership;
      requestedQuantity: number;
      note?: string;
    },
    actorId: string,
    idempotencyKey?: string,
    requestId?: string
  ): Promise<StockTransfer> {
    await this.assertPermission(actorId, 'transfer');

    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    if (Boolean(data.productId) === Boolean(data.materialId)) {
      throw new ValidationError('A transfer must reference exactly one of productId or materialId.');
    }
    if (data.requestedQuantity <= 0) throw new ValidationError('Requested quantity must be positive.');
    if (data.fromLocationId === data.toLocationId) {
      throw new ValidationError('fromLocationId and toLocationId must be different.');
    }

    // A transfer request is location-scoped on the source location - the actor is the one
    // depleting their own store, not necessarily the one who will receive it.
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: data.fromLocationId });

    const year = new Date().getFullYear();
    const transferNumber = await generateSequentialNumber({
      prefix: `TRF-${year}-`,
      countByPrefix: (prefix) => this.repository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.repository.existsByTransferNumber(candidate)
    });

    const created = await this.repository.create({
      transferNumber,
      productId: data.productId,
      materialId: data.materialId,
      uomId: data.uomId,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      ownership: data.ownership ?? 'OWNED',
      requestedQuantity: data.requestedQuantity,
      idempotencyKey,
      requestedByActorId: actorId,
      note: data.note
    });

    await this.auditWriter.record({
      actorId,
      action: 'inventory.transfer_request',
      entityType: 'StockTransfer',
      entityId: created.id,
      after: created,
      requestId
    });

    await notificationService.handleTransferEvent({
      type: 'REQUESTED',
      transferId: created.id,
      transferNumber: created.transferNumber,
      requestedByActorId: created.requestedByActorId,
      fromLocationId: created.fromLocationId,
      toLocationId: created.toLocationId
    });

    return created;
  }

  async issue(id: string, quantity: number, actorId: string, requestId?: string): Promise<StockTransfer> {
    const transfer = await this.repository.findById(id);
    if (!transfer) throw new NotFoundError(`StockTransfer [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: transfer.fromLocationId });

    let isOverride = false;
    if (transfer.requestedByActorId === actorId) {
      const canOverride = await this.permissionChecker.can(actorId, 'transfer_override', 'StockTransfer');
      if (!canOverride) {
        throw new ForbiddenError('Separation of duties violation: Requester cannot issue or approve their own stock transfer.');
      }
      isOverride = true;
    } else {
      const canTransfer = await this.permissionChecker.can(actorId, 'transfer', 'StockTransfer');
      if (!canTransfer) {
        const canOverride = await this.permissionChecker.can(actorId, 'transfer_override', 'StockTransfer');
        if (!canOverride) throw new ForbiddenError('Lacks permission to transfer stock.');
        isOverride = true;
      }
    }

    if (transfer.status !== 'REQUESTED') {
      throw new InvalidStateTransitionError(`Cannot issue transfer in state [${transfer.status}]. Must be REQUESTED.`);
    }
    if (quantity <= 0 || quantity > transfer.requestedQuantity) {
      throw new ValidationError(`Issued quantity must be between 0 and the requested quantity [${transfer.requestedQuantity}].`);
    }

    await prisma.$transaction(async (tx) => {
      const txRepository = new StockTransferRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const count = await txRepository.updateStatusConditional(
        id,
        ['REQUESTED'],
        'ISSUED',
        { issuedByActorId: actorId, issuedAt: new Date(), issuedQuantity: quantity },
        tx
      );
      if (count === 0) {
        throw new InvalidStateTransitionError(`StockTransfer [${id}] was modified concurrently; refetch and retry.`);
      }

      await txLedgerRepository.postEntry(
        {
          productId: transfer.productId,
          materialId: transfer.materialId,
          uomId: transfer.uomId,
          locationId: transfer.fromLocationId,
          ownership: transfer.ownership,
          direction: 'OUT',
          entryType: 'TRANSFER_OUT',
          quantity,
          postedByActorId: actorId,
          transferId: id
        },
        tx
      );

      const modernTables = typeof tx.$queryRaw === 'function'
        ? await tx.$queryRaw<Array<{ balances: string | null; ledger: string | null }>>`
            SELECT to_regclass('inventory_balances')::text AS balances,
                   to_regclass('inventory_ledger_entries')::text AS ledger
          `
        : [];
      if (modernTables[0]?.balances && modernTables[0]?.ledger) {
        const itemType = transfer.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = transfer.productId || transfer.materialId;
        if (itemId) {
          await inventoryPostingService.post(tx, {
            itemType,
            itemId,
            uomId: transfer.uomId,
            locationId: transfer.fromLocationId,
            movementType: 'TRANSFER_OUT',
            quantity,
            delta: -quantity,
            ownership: transfer.ownership === 'OWNED' ? 'COMPANY' : 'VENDOR_HELD',
            condition: 'AVAILABLE',
            sourceType: 'STOCK_TRANSFER',
            sourceId: transfer.id,
            idempotencyKey: `STOCK_TRANSFER_OUT:${transfer.id}`,
            actorId,
            correlationId: requestId || transfer.id,
          });
        }
      }
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`StockTransfer [${id}] not found after issuing.`);

    await this.auditWriter.record({
      actorId,
      action: isOverride ? 'inventory.transfer_override_issue' : 'inventory.transfer_issue',
      entityType: 'StockTransfer',
      entityId: id,
      before: transfer,
      after: updated,
      metadata: isOverride ? { override: true, sameActor: transfer.requestedByActorId === actorId } : undefined,
      requestId
    });

    await notificationService.handleTransferEvent({
      type: 'IN_TRANSIT',
      transferId: updated.id,
      transferNumber: updated.transferNumber,
      requestedByActorId: updated.requestedByActorId,
      fromLocationId: updated.fromLocationId,
      toLocationId: updated.toLocationId
    });

    try {
      const itemKey = computeItemKey(transfer.productId, transfer.materialId);
      const balance = await prisma.stockBalance.findUnique({
        where: {
          itemKey_uomId_locationId_ownership: {
            itemKey,
            uomId: transfer.uomId,
            locationId: transfer.fromLocationId,
            ownership: transfer.ownership
          }
        }
      });
      if (balance) {
        await reorderEvaluatorService.evaluateAndTrigger(balance.id);
      }
    } catch {
      // Non-blocking notification
    }

    return updated;
  }

  async receive(id: string, quantity: number, actorId: string, requestId?: string): Promise<StockTransfer> {
    await this.assertPermission(actorId, 'transfer');

    const transfer = await this.repository.findById(id);
    if (!transfer) throw new NotFoundError(`StockTransfer [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: transfer.toLocationId });

    if (transfer.status !== 'ISSUED') {
      throw new InvalidStateTransitionError(`Cannot receive transfer in state [${transfer.status}]. Must be ISSUED.`);
    }
    const issuedQuantity = transfer.issuedQuantity ?? 0;
    if (quantity <= 0 || quantity > issuedQuantity) {
      throw new ValidationError(`Received quantity must be between 0 and the issued quantity [${issuedQuantity}].`);
    }

    await prisma.$transaction(async (tx) => {
      const txRepository = new StockTransferRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const count = await txRepository.updateStatusConditional(
        id,
        ['ISSUED'],
        'RECEIVED',
        { receivedByActorId: actorId, receivedAt: new Date(), receivedQuantity: quantity },
        tx
      );
      if (count === 0) {
        throw new InvalidStateTransitionError(`StockTransfer [${id}] was modified concurrently; refetch and retry.`);
      }

      await txLedgerRepository.postEntry(
        {
          productId: transfer.productId,
          materialId: transfer.materialId,
          uomId: transfer.uomId,
          locationId: transfer.toLocationId,
          ownership: transfer.ownership,
          direction: 'IN',
          entryType: 'TRANSFER_IN',
          quantity,
          postedByActorId: actorId,
          transferId: id,
          note:
            quantity < issuedQuantity
              ? `Partial receipt: ${quantity} of ${issuedQuantity} issued. Shortfall of ${issuedQuantity - quantity} requires a separate StockAdjustment to reconcile.`
              : undefined
        },
        tx
      );

      const modernTables = typeof tx.$queryRaw === 'function'
        ? await tx.$queryRaw<Array<{ balances: string | null; ledger: string | null }>>`
            SELECT to_regclass('inventory_balances')::text AS balances,
                   to_regclass('inventory_ledger_entries')::text AS ledger
          `
        : [];
      if (modernTables[0]?.balances && modernTables[0]?.ledger) {
        const itemType = transfer.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = transfer.productId || transfer.materialId;
        if (itemId) {
          await inventoryPostingService.post(tx, {
            itemType,
            itemId,
            uomId: transfer.uomId,
            locationId: transfer.toLocationId,
            movementType: 'TRANSFER_IN',
            quantity,
            delta: quantity,
            ownership: transfer.ownership === 'OWNED' ? 'COMPANY' : 'VENDOR_HELD',
            condition: 'AVAILABLE',
            sourceType: 'STOCK_TRANSFER',
            sourceId: transfer.id,
            idempotencyKey: `STOCK_TRANSFER_IN:${transfer.id}`,
            actorId,
            correlationId: requestId || transfer.id,
          });
        }
      }
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`StockTransfer [${id}] not found after receiving.`);

    await this.auditWriter.record({
      actorId,
      action: 'inventory.transfer_receive',
      entityType: 'StockTransfer',
      entityId: id,
      before: transfer,
      after: updated,
      metadata: { shortfall: issuedQuantity - quantity },
      requestId
    });

    await notificationService.handleTransferEvent({
      type: quantity < issuedQuantity ? 'PARTIALLY_RECEIVED' : 'RECEIVED',
      transferId: updated.id,
      transferNumber: updated.transferNumber,
      requestedByActorId: updated.requestedByActorId,
      fromLocationId: updated.fromLocationId,
      toLocationId: updated.toLocationId,
      shortfall: issuedQuantity - quantity
    });

    return updated;
  }

  async cancel(id: string, actorId: string, requestId?: string): Promise<StockTransfer> {
    await this.assertPermission(actorId, 'transfer');

    const transfer = await this.repository.findById(id);
    if (!transfer) throw new NotFoundError(`StockTransfer [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: transfer.fromLocationId });

    if (transfer.status !== 'REQUESTED' && transfer.status !== 'ISSUED') {
      throw new InvalidStateTransitionError(`Cannot cancel transfer in state [${transfer.status}].`);
    }

    await prisma.$transaction(async (tx) => {
      const txRepository = new StockTransferRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const count = await txRepository.updateStatusConditional(
        id,
        [transfer.status],
        'CANCELLED',
        { cancelledByActorId: actorId, cancelledAt: new Date() },
        tx
      );
      if (count === 0) {
        throw new InvalidStateTransitionError(`StockTransfer [${id}] was modified concurrently; refetch and retry.`);
      }

      // The goods never physically left when cancelling an already-ISSUED transfer - post a
      // compensating reversal at the source location so on-hand stock is restored.
      if (transfer.status === 'ISSUED' && transfer.issuedQuantity) {
        await txLedgerRepository.postEntry(
          {
            productId: transfer.productId,
            materialId: transfer.materialId,
            uomId: transfer.uomId,
            locationId: transfer.fromLocationId,
            ownership: transfer.ownership,
            direction: 'IN',
            entryType: 'REVERSAL',
            quantity: transfer.issuedQuantity,
            postedByActorId: actorId,
            transferId: id,
            note: `Cancellation of issued transfer ${transfer.transferNumber} - goods never left ${transfer.fromLocationId}.`
          },
          tx
        );
      }
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`StockTransfer [${id}] not found after cancellation.`);

    await this.auditWriter.record({
      actorId,
      action: 'inventory.transfer_cancel',
      entityType: 'StockTransfer',
      entityId: id,
      before: transfer,
      after: updated,
      requestId
    });

    return updated;
  }

  async getById(id: string): Promise<StockTransfer> {
    const transfer = await this.repository.findById(id);
    if (!transfer) throw new NotFoundError(`StockTransfer [${id}] not found.`);
    return transfer;
  }

  async list(params: { locationId?: string; status?: string; skip?: number; take?: number }) {
    return this.repository.list(params);
  }
}
