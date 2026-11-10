/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';

/**
 * The single transactional stock posting primitive.  Callers provide an
 * already-open Prisma transaction so GRN, issues, reservations, transfers and
 * adjustments can commit their business document and inventory atomically.
 */
export type InventoryPostingCommand = {
  itemType: 'PRODUCT' | 'MATERIAL';
  itemId: string;
  uomId: string;
  locationId: string;
  lotId?: string | null;
  movementType: 'RECEIPT' | 'ISSUE' | 'RETURN' | 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE' | 'TRANSFER_OUT' | 'TRANSFER_IN';
  quantity: number;
  /** Optional signed delta for governed adjustments. */
  delta?: number;
  condition?: string;
  ownership?: string;
  unitCost?: number;
  /** Consume stock that was already reserved for this business document. */
  consumeReserved?: boolean;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  actorId: string;
  correlationId?: string;
  note?: string;
};

export class InventoryPostingService {
  private async nextDocumentNumber(tx: any, prefix: 'ISS' | 'ADJ'): Promise<string> {
    const year = new Date().getFullYear();
    const numberPrefix = `${prefix}-${year}-`;

    // Serialize number allocation inside the same transaction as the ledger
    // insert so concurrent issue/adjustment requests cannot reuse a number.
    await tx.$queryRaw<Array<{ lock_status: string }>>`
      SELECT pg_advisory_xact_lock(hashtext(${`inventory-ledger-number:${numberPrefix}`}), 0)::text AS lock_status
    `;
    const sequenceStart = numberPrefix.length + 1;
    const numberPattern = `^${numberPrefix}[0-9]+$`;
    const rows = prefix === 'ISS'
      ? await tx.$queryRaw<Array<{ maxSequence: number | string }>>`
          SELECT COALESCE(MAX(seq_value), 0) AS "maxSequence"
          FROM (
            SELECT substring("entryNumber" from ${sequenceStart}::integer)::integer AS seq_value
            FROM "inventory_ledger_entries"
            WHERE "entryNumber" ~ ${numberPattern}
            UNION ALL
            SELECT substring("issueNumber" from ${sequenceStart}::integer)::integer AS seq_value
            FROM "stock_issues"
            WHERE "issueNumber" ~ ${numberPattern}
          ) AS issue_numbers
        `
      : await tx.$queryRaw<Array<{ maxSequence: number | string }>>`
          SELECT COALESCE(MAX(seq_value), 0) AS "maxSequence"
          FROM (
            SELECT substring("entryNumber" from ${sequenceStart}::integer)::integer AS seq_value
            FROM "inventory_ledger_entries"
            WHERE "entryNumber" ~ ${numberPattern}
            UNION ALL
            SELECT substring("adjustmentNumber" from ${sequenceStart}::integer)::integer AS seq_value
            FROM "stock_adjustments"
            WHERE "adjustmentNumber" ~ ${numberPattern}
          ) AS adjustment_numbers
        `;
    const nextSequence = Number(rows[0]?.maxSequence ?? 0) + 1;
    return `${numberPrefix}${String(nextSequence).padStart(3, '0')}`;
  }

  async post(tx: any, command: InventoryPostingCommand): Promise<any> {
    // A small number of older production execution paths pass the root client.
    // Promote those calls into a transaction so the ledger, balance and outbox
    // remain one atomic source transition.
    if (typeof tx?.$transaction === 'function') {
      return tx.$transaction((transaction: any) => this.post(transaction, command));
    }
    const duplicate = await tx.$queryRaw<any[]>`
      SELECT * FROM "inventory_ledger_entries"
      WHERE "idempotencyKey" = ${command.idempotencyKey} LIMIT 1
    `;
    if (duplicate[0]) return duplicate[0];

    const condition = command.condition || 'AVAILABLE';
    const ownership = command.ownership || 'COMPANY';
    const quantity = Number(command.quantity);
    const signedDelta = command.delta !== undefined
      ? Number(command.delta)
      : ['ISSUE', 'TRANSFER_OUT'].includes(command.movementType) ? -quantity
        : ['RESERVATION', 'RELEASE'].includes(command.movementType) ? 0 : quantity;

    const findBalance = () => tx.$queryRaw<any[]>`
      SELECT * FROM "inventory_balances"
      WHERE "itemType" = ${command.itemType} AND "itemId" = ${command.itemId}
        AND "uomId" = ${command.uomId} AND "locationId" = ${command.locationId}
        AND "condition" = ${condition}::"InventoryCondition"
        AND "ownership" = ${ownership}::"InventoryOwnership"
        AND COALESCE("lotId", '') = ${command.lotId || ''}
      FOR UPDATE
    `;
    let balance = (await findBalance())[0];
    if (!balance) {
      await tx.$executeRaw`
        INSERT INTO "inventory_balances"
          ("id", "itemType", "itemId", "uomId", "locationId", "lotId", "condition", "ownership", "quantity", "reserved", "averageCost", "updatedAt")
        VALUES
          (${randomUUID()}, ${command.itemType}, ${command.itemId}, ${command.uomId}, ${command.locationId}, ${command.lotId || null},
           ${condition}::"InventoryCondition", ${ownership}::"InventoryOwnership", 0, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `;
      balance = (await findBalance())[0];
    }
    if (!balance) throw new Error('Unable to create or lock inventory balance.');

    const before = Number(balance.quantity || 0);
    const reservedBefore = Number(balance.reserved || 0);
    if (command.movementType === 'ISSUE' && command.consumeReserved && (before < quantity || reservedBefore < quantity)) {
      throw new Error('Insufficient reserved inventory to consume.');
    }
    if (command.movementType === 'ISSUE' && !command.consumeReserved && before - reservedBefore < quantity) throw new Error('Insufficient available inventory.');
    if (command.movementType === 'RESERVATION' && before - reservedBefore < quantity) throw new Error('Insufficient available inventory to reserve.');
    const reservedAfter = reservedBefore + (command.movementType === 'RESERVATION' ? quantity : command.movementType === 'RELEASE' ? -quantity : command.movementType === 'ISSUE' && command.consumeReserved ? -quantity : 0);
    const quantityAfter = before + signedDelta;
    if (quantityAfter < 0 || reservedAfter < 0 || reservedAfter > quantityAfter) throw new Error('Movement would create a negative or over-reserved balance.');

    const averageBefore = Number(balance.averageCost || 0);
    // Outbound inventory always carries the authoritative balance cost unless
    // the caller explicitly supplies another governed cost (for example a
    // receipt). Selling price must never become inventory cost.
    const unitCost = command.unitCost === undefined ? averageBefore : Number(command.unitCost);
    const averageAfter = signedDelta > 0
      ? ((before * averageBefore) + (signedDelta * unitCost)) / Math.max(quantityAfter, 1)
      : averageBefore;
    await tx.$executeRaw`
      UPDATE "inventory_balances"
      SET "quantity" = ${quantityAfter}, "reserved" = ${reservedAfter}, "averageCost" = ${averageAfter}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${balance.id}
    `;
    const ledgerDelta = command.delta !== undefined ? signedDelta : command.movementType === 'RESERVATION' ? quantity
      : command.movementType === 'RELEASE' ? -quantity
      : signedDelta;

    const sequentialPrefix = command.movementType === 'ISSUE'
      ? 'ISS'
      : command.movementType === 'ADJUSTMENT' ? 'ADJ' : null;
    const entryNumber = sequentialPrefix
      ? await this.nextDocumentNumber(tx, sequentialPrefix)
      : `INV-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const entry = {
      id: randomUUID(),
      entryNumber,
      ...command,
      condition,
      ownership,
      quantityDelta: ledgerDelta,
      quantityBefore: before,
      quantityAfter,
      averageCostBefore: averageBefore,
      averageCostAfter: averageAfter,
      unitCost,
      totalCost: unitCost * Math.abs(quantity),
      postedBy: command.actorId,
    };
    await tx.$executeRaw`
      INSERT INTO "inventory_ledger_entries"
        ("id", "entryNumber", "itemType", "itemId", "uomId", "locationId", "lotId", "movementType", "condition", "ownership",
         "quantityDelta", "quantityBefore", "quantityAfter", "averageCostBefore", "averageCostAfter", "unitCost", "totalCost",
         "sourceType", "sourceId", "idempotencyKey", "postedBy", "correlationId")
      VALUES
        (${entry.id}, ${entry.entryNumber}, ${command.itemType}, ${command.itemId}, ${command.uomId}, ${command.locationId}, ${command.lotId || null},
         ${command.movementType}::"InventoryMovementType", ${condition}::"InventoryCondition", ${ownership}::"InventoryOwnership",
         ${ledgerDelta}, ${before}, ${quantityAfter}, ${averageBefore}, ${averageAfter}, ${unitCost}, ${unitCost * quantity},
         ${command.sourceType}, ${command.sourceId}, ${command.idempotencyKey}, ${command.actorId}, ${command.correlationId || null})
    `;
    // Keep the legacy outbox event name/shape emitted by this posting path;
    // event worker validation normalizes it to the versioned inventory contract.
    await publishIntelligenceEvent(tx, { type: 'INVENTORY_POSTED', entityType: 'InventoryLedgerEntry', entityId: entry.id, transitionId: command.idempotencyKey, correlationId: command.correlationId, metadata: { itemType: command.itemType, itemId: command.itemId, locationId: command.locationId, movementType: command.movementType, sourceType: command.sourceType, sourceId: command.sourceId } });
    return entry;
  }
}

export const inventoryPostingService = new InventoryPostingService();
