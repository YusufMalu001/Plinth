import { PrismaClient, Prisma, StockBalance, StockLedgerEntry, StockDirection, StockOwnership, StockLedgerEntryType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { ValidationError, InsufficientStockError } from '../../../common/errors/AppError';

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

/** "PRODUCT:<id>" | "MATERIAL:<id>" - see StockBalance schema comment for why this exists. */
export function computeItemKey(productId?: string | null, materialId?: string | null): string {
  if (productId && materialId) {
    throw new ValidationError('An item must reference exactly one of productId or materialId, not both.');
  }
  if (productId) return `PRODUCT:${productId}`;
  if (materialId) return `MATERIAL:${materialId}`;
  throw new ValidationError('An item must reference either productId or materialId.');
}

export interface PostLedgerEntryInput {
  productId?: string | null;
  materialId?: string | null;
  uomId: string;
  locationId: string;
  ownership: StockOwnership;
  direction: StockDirection;
  quantity: number;
  entryType: StockLedgerEntryType;
  postedByActorId: string;
  note?: string;
  grnId?: string;
  grnLineId?: string;
  issueId?: string;
  transferId?: string;
  adjustmentId?: string;
  materialIssueLineId?: string;
  reversalOfId?: string;
}

/**
 * The one place that knows how to post a ledger entry and atomically update the StockBalance
 * projection in the same step. Every mutating Inventory action (and GRN's finalize) goes through
 * postEntry/reserve/release so on-hand quantity can never go negative under concurrent writes -
 * each is a single conditional SQL statement (Prisma's updateMany/upsert for one-column
 * comparisons, one hand-written $executeRaw for the two-column "available" comparison Prisma's
 * query builder can't express), never a read-then-write race.
 */
export class StockLedgerRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async postEntry(data: PostLedgerEntryInput, client: PrismaOrTx = this.prisma): Promise<StockLedgerEntry> {
    if (data.quantity <= 0) throw new ValidationError('Ledger entry quantity must be positive.');
    const itemKey = computeItemKey(data.productId, data.materialId);

    if (data.direction === 'IN') {
      await client.stockBalance.upsert({
        where: { itemKey_uomId_locationId_ownership: { itemKey, uomId: data.uomId, locationId: data.locationId, ownership: data.ownership } },
        create: {
          itemKey,
          productId: data.productId ?? undefined,
          materialId: data.materialId ?? undefined,
          uomId: data.uomId,
          locationId: data.locationId,
          ownership: data.ownership,
          onHandQuantity: data.quantity,
          reservedQuantity: 0
        },
        update: { onHandQuantity: { increment: data.quantity } }
      });
    } else {
      const { count } = await client.stockBalance.updateMany({
        where: { itemKey, uomId: data.uomId, locationId: data.locationId, ownership: data.ownership, onHandQuantity: { gte: data.quantity } },
        data: { onHandQuantity: { decrement: data.quantity } }
      });
      if (count === 0) {
        throw new InsufficientStockError(
          `Insufficient on-hand stock for [${itemKey}] at location [${data.locationId}] to move ${data.quantity} units out.`
        );
      }
    }

    return client.stockLedgerEntry.create({
      data: {
        productId: data.productId ?? undefined,
        materialId: data.materialId ?? undefined,
        uomId: data.uomId,
        locationId: data.locationId,
        ownership: data.ownership,
        direction: data.direction,
        quantity: data.quantity,
        entryType: data.entryType,
        note: data.note,
        postedByActorId: data.postedByActorId,
        grnId: data.grnId,
        grnLineId: data.grnLineId,
        issueId: data.issueId,
        transferId: data.transferId,
        adjustmentId: data.adjustmentId,
        materialIssueLineId: data.materialIssueLineId,
        reversalOfId: data.reversalOfId
      }
    });
  }

  /** Holds `quantity` against available stock (onHand - reserved) without moving on-hand quantity. */
  async reserve(
    params: { productId?: string | null; materialId?: string | null; uomId: string; locationId: string; ownership: StockOwnership; quantity: number },
    client: PrismaOrTx = this.prisma
  ): Promise<void> {
    if (params.quantity <= 0) throw new ValidationError('Reservation quantity must be positive.');
    const itemKey = computeItemKey(params.productId, params.materialId);

    const affected = await client.$executeRaw`
      UPDATE stock_balances
      SET "reservedQuantity" = "reservedQuantity" + ${params.quantity}, "updatedAt" = now()
      WHERE "itemKey" = ${itemKey} AND "uomId" = ${params.uomId} AND "locationId" = ${params.locationId}
        AND "ownership" = ${params.ownership}::"StockOwnership"
        AND ("onHandQuantity" - "reservedQuantity") >= ${params.quantity}
    `;
    if (affected === 0) {
      throw new InsufficientStockError(
        `Insufficient available stock for [${itemKey}] at location [${params.locationId}] to reserve ${params.quantity} units.`
      );
    }
  }

  /** Releases a previously-held reservation quantity. Floored at 0 defensively. */
  async release(
    params: { productId?: string | null; materialId?: string | null; uomId: string; locationId: string; ownership: StockOwnership; quantity: number },
    client: PrismaOrTx = this.prisma
  ): Promise<void> {
    if (params.quantity <= 0) throw new ValidationError('Release quantity must be positive.');
    if (!params.productId && !params.materialId) {
      return;
    }
    const itemKey = computeItemKey(params.productId, params.materialId);

    await client.$executeRaw`
      UPDATE stock_balances
      SET "reservedQuantity" = GREATEST("reservedQuantity" - ${params.quantity}, 0), "updatedAt" = now()
      WHERE "itemKey" = ${itemKey} AND "uomId" = ${params.uomId} AND "locationId" = ${params.locationId}
        AND "ownership" = ${params.ownership}::"StockOwnership"
    `;
  }

  async findBalance(
    params: { productId?: string | null; materialId?: string | null; uomId: string; locationId: string; ownership: StockOwnership },
    client: PrismaOrTx = this.prisma
  ): Promise<StockBalance | null> {
    const itemKey = computeItemKey(params.productId, params.materialId);
    return client.stockBalance.findUnique({
      where: { itemKey_uomId_locationId_ownership: { itemKey, uomId: params.uomId, locationId: params.locationId, ownership: params.ownership } }
    });
  }
}
