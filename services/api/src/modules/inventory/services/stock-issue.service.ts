import { StockIssue, StockOwnership } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { StockIssueRepository } from '../repositories/stock-issue.repository';
import { StockLedgerRepository } from '../repositories/stock-ledger.repository';
import { assertLocationScope, resolveRequiredLocation } from '../../../common/rbac/location-scope';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { reorderEvaluatorService } from './reorder-evaluator.service';

import { inventoryPostingService } from './inventory-posting.service';
export class StockIssueService {
  constructor(
    private readonly repository: StockIssueRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async create(
    data: {
      productId?: string;
      materialId?: string;
      uomId: string;
      locationId?: string;
      ownership?: StockOwnership;
      quantity: number;
      reason: string;
    },
    actorId: string,
    idempotencyKey?: string,
    requestId?: string
  ): Promise<StockIssue> {
    const canIssue = await this.permissionChecker.can(actorId, 'issue', 'StockIssue');
    if (!canIssue) throw new ForbiddenError('Lacks permission to issue stock.');

    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    if (Boolean(data.productId) === Boolean(data.materialId)) {
      throw new ValidationError('An issue must reference exactly one of productId or materialId.');
    }
    if (data.quantity <= 0) throw new ValidationError('Quantity must be positive.');

    const locationId = await resolveRequiredLocation(actorId, data.locationId);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId });

    const ownership = data.ownership ?? 'OWNED';
    const year = new Date().getFullYear();
    const issueNumber = await generateSequentialNumber({
      prefix: `ISS-${year}-`,
      countByPrefix: (prefix) => this.repository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.repository.existsByIssueNumber(candidate)
    });

    const created = await prisma.$transaction(async (tx) => {
      const txIssueRepository = new StockIssueRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const issue = await txIssueRepository.create(
        {
          issueNumber,
          productId: data.productId,
          materialId: data.materialId,
          uomId: data.uomId,
          locationId,
          ownership,
          quantity: data.quantity,
          reason: data.reason,
          idempotencyKey,
          issuedByActorId: actorId
        },
        tx
      );

      await txLedgerRepository.postEntry(
        {
          productId: data.productId,
          materialId: data.materialId,
          uomId: data.uomId,
          locationId,
          ownership,
          direction: 'OUT',
          entryType: 'ISSUE',
          quantity: data.quantity,
          postedByActorId: actorId,
          issueId: issue.id
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
        const itemType = data.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = data.productId || data.materialId;
        if (itemId) {
          await inventoryPostingService.post(tx, {
            itemType,
            itemId,
            uomId: data.uomId,
            locationId,
            movementType: 'ISSUE',
            quantity: Number(data.quantity),
            delta: -Number(data.quantity),
            ownership: ownership === 'OWNED' ? 'COMPANY' : 'VENDOR_HELD',
            condition: 'AVAILABLE',
            sourceType: 'STOCK_ISSUE',
            sourceId: issue.id,
            idempotencyKey: `STOCK_ISSUE:${issue.id}`,
            actorId,
            correlationId: requestId || issue.id,
          });
        }
      }

      return issue;
    });

    await this.auditWriter.record({
      actorId,
      action: 'inventory.issue_create',
      entityType: 'StockIssue',
      entityId: created.id,
      after: created,
      requestId
    });

    // Check if new balance fell below configured reorder point
    const freshIssue = (await this.repository.findById(created.id)) ?? created;
    try {
      const itemKey = data.productId ? `PRODUCT:${data.productId}` : `MATERIAL:${data.materialId}`;
      const balance = await prisma.stockBalance.findUnique({
        where: {
          itemKey_uomId_locationId_ownership: {
            itemKey,
            uomId: data.uomId,
            locationId,
            ownership
          }
        },
        include: { product: true, material: true }
      });

      if (balance) {
        // Trigger auto-PR creation and admin/store manager notification when stock is below threshold
        await reorderEvaluatorService.evaluateAndTrigger(balance.id);
      }
    } catch {
      // Non-blocking notification dispatch
    }

    return freshIssue;
  }

  async reverse(id: string, reason: string, actorId: string, requestId?: string): Promise<StockIssue> {
    const canIssue = await this.permissionChecker.can(actorId, 'issue', 'StockIssue');
    if (!canIssue) throw new ForbiddenError('Lacks permission to reverse a stock issue.');

    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`StockIssue [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: issue.locationId });

    if (issue.status !== 'ISSUED') {
      throw new InvalidStateTransitionError(`Cannot reverse issue in state [${issue.status}]. Must be ISSUED.`);
    }

    await prisma.$transaction(async (tx) => {
      const txIssueRepository = new StockIssueRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const count = await txIssueRepository.markReversedConditional(id, { reversedByActorId: actorId, reversalReason: reason }, tx);
      if (count === 0) {
        throw new InvalidStateTransitionError(`StockIssue [${id}] was modified concurrently; refetch and retry reversal.`);
      }

      await txLedgerRepository.postEntry(
        {
          productId: issue.productId,
          materialId: issue.materialId,
          uomId: issue.uomId,
          locationId: issue.locationId,
          ownership: issue.ownership,
          direction: 'IN',
          entryType: 'REVERSAL',
          quantity: issue.quantity,
          postedByActorId: actorId,
          issueId: issue.id,
          note: `Reversal of ${issue.issueNumber}: ${reason}`
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
        const itemType = issue.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = issue.productId || issue.materialId;
        if (itemId) {
          await inventoryPostingService.post(tx, {
            itemType,
            itemId,
            uomId: issue.uomId,
            locationId: issue.locationId,
            movementType: 'RETURN',
            quantity: Number(issue.quantity),
            delta: Number(issue.quantity),
            ownership: issue.ownership === 'OWNED' ? 'COMPANY' : 'VENDOR_HELD',
            condition: 'AVAILABLE',
            sourceType: 'STOCK_ISSUE',
            sourceId: issue.id,
            idempotencyKey: `STOCK_ISSUE_REVERSAL:${issue.id}`,
            actorId,
            correlationId: requestId || issue.id,
          });
        }
      }
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`StockIssue [${id}] not found after reversal.`);

    await this.auditWriter.record({
      actorId,
      action: 'inventory.issue_reverse',
      entityType: 'StockIssue',
      entityId: id,
      before: issue,
      after: updated,
      metadata: { reason },
      requestId
    });

    return updated;
  }

  async getById(id: string): Promise<StockIssue> {
    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`StockIssue [${id}] not found.`);
    return issue;
  }

  async list(params: { productId?: string; materialId?: string; locationId?: string; status?: string; skip?: number; take?: number }) {
    return this.repository.list(params);
  }
}
