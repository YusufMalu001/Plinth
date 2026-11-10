import { PrismaClient, Prisma, GoodsReceiptNote, GoodsReceiptLine, GrnStatus, GrnLineStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

const LINE_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  poLine: true,
  measurements: { orderBy: { recordedAt: 'asc' as const } },
  discrepancies: { orderBy: { createdAt: 'asc' as const } },
  label: { include: { printEvents: { orderBy: { printedAt: 'asc' as const } } } },
  stockLedgerEntry: true
} satisfies Prisma.GoodsReceiptLineInclude;

const GRN_INCLUDE = {
  lines: { include: LINE_INCLUDE },
  documents: true,
  po: true,
  vendor: true,
  location: true,
  jobWorkReceiptReturn: {
    include: {
      jobWorkOrder: {
        select: {
          id: true,
          orderNumber: true,
          natureOfProcessing: true,
          status: true
        }
      }
    }
  }
} satisfies Prisma.GoodsReceiptNoteInclude;

export class GoodsReceiptRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string) {
    return this.prisma.goodsReceiptNote.findUnique({ where: { id }, include: GRN_INCLUDE });
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.goodsReceiptNote.findUnique({ where: { idempotencyKey }, include: GRN_INCLUDE });
  }

  async countByNumberPrefix(prefix: string): Promise<number> {
    return this.prisma.goodsReceiptNote.count({ where: { grnNumber: { startsWith: prefix } } });
  }

  async existsByGrnNumber(grnNumber: string): Promise<boolean> {
    const found = await this.prisma.goodsReceiptNote.findUnique({ where: { grnNumber } });
    return Boolean(found);
  }

  async createFromPo(data: {
    grnNumber: string;
    poId: string;
    vendorId: string;
    locationId: string;
    idempotencyKey?: string;
    receivedByActorId: string;
    lines: Array<{
      poLineId: string;
      productId?: string;
      materialId?: string;
      uomId: string;
      expectedQuantity?: number;
      receivedQuantity?: number;
    }>;
  }): Promise<GoodsReceiptNote> {
    return this.prisma.goodsReceiptNote.create({
      data: {
        grnNumber: data.grnNumber,
        poId: data.poId,
        vendorId: data.vendorId,
        locationId: data.locationId,
        isUnreferenced: false,
        idempotencyKey: data.idempotencyKey,
        status: 'ARRIVED',
        receivedByActorId: data.receivedByActorId,
        lines: {
          create: data.lines.map(l => ({
            poLineId: l.poLineId,
            productId: l.productId,
            materialId: l.materialId,
            uomId: l.uomId,
            expectedQuantity: l.expectedQuantity,
            receivedQuantity: l.receivedQuantity ?? 0,
            status: 'PENDING'
          }))
        }
      },
      include: GRN_INCLUDE
    });
  }

  async createUnreferenced(data: {
    grnNumber: string;
    vendorId: string;
    locationId: string;
    unreferencedJustification: string;
    idempotencyKey?: string;
    receivedByActorId: string;
    lines: Array<{
      productId?: string;
      materialId?: string;
      uomId: string;
      receivedQuantity?: number;
    }>;
  }): Promise<GoodsReceiptNote> {
    return this.prisma.goodsReceiptNote.create({
      data: {
        grnNumber: data.grnNumber,
        vendorId: data.vendorId,
        locationId: data.locationId,
        isUnreferenced: true,
        unreferencedJustification: data.unreferencedJustification,
        idempotencyKey: data.idempotencyKey,
        status: 'ARRIVED',
        receivedByActorId: data.receivedByActorId,
        lines: {
          create: data.lines.map(l => ({
            productId: l.productId,
            materialId: l.materialId,
            uomId: l.uomId,
            receivedQuantity: l.receivedQuantity ?? 0,
            status: 'PENDING'
          }))
        }
      },
      include: GRN_INCLUDE
    });
  }

  async updateStatus(
    id: string,
    status: GrnStatus,
    extra?: Prisma.GoodsReceiptNoteUncheckedUpdateInput
  ): Promise<GoodsReceiptNote> {
    return this.prisma.goodsReceiptNote.update({
      where: { id },
      data: { status, ...extra },
      include: GRN_INCLUDE
    });
  }

  /**
   * Conditional status flip used as the finalize concurrency guard: only succeeds if the row is
   * currently in one of `fromStatuses`. Two concurrent finalize calls race on this updateMany -
   * only one can flip a SIGNED_OFF row, the other gets count = 0 and must not proceed.
   */
  async updateStatusConditional(
    id: string,
    fromStatuses: GrnStatus[],
    toStatus: GrnStatus,
    extra?: Prisma.GoodsReceiptNoteUncheckedUpdateInput,
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.goodsReceiptNote.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra }
    });
    return count;
  }

  async updateLines(id: string, lines: Array<{
    id: string;
    receivedQuantity?: number;
    acceptedQuantity?: number;
    rejectedQuantity?: number;
    damagedQuantity?: number;
    invoiceUnitPrice?: number;
    putAwayLocationId?: string;
    lotId?: string;
    lotNumber?: string;
    lotManufacturedAt?: Date;
    lotExpiresAt?: Date;
    inventoryCondition?: 'AVAILABLE' | 'QUARANTINED' | 'DAMAGED' | 'REJECTED';
    inventoryOwnership?: 'COMPANY' | 'VENDOR_HELD';
  }>): Promise<GoodsReceiptNote> {
    // A Prisma.TransactionClient cannot open a nested $transaction, so only batch this way
    // when running against the top-level client; otherwise (already inside a tx) run sequentially.
    if ('$transaction' in this.prisma && typeof this.prisma.$transaction === 'function') {
      await (this.prisma as PrismaClient).$transaction(
        lines.map(l => this.prisma.goodsReceiptLine.update({
          where: { id: l.id },
          data: ({
            receivedQuantity: l.receivedQuantity,
            acceptedQuantity: l.acceptedQuantity,
            rejectedQuantity: l.rejectedQuantity,
            damagedQuantity: l.damagedQuantity,
            invoiceUnitPrice: l.invoiceUnitPrice,
            putAwayLocationId: l.putAwayLocationId,
            lotId: l.lotId,
            lotNumber: l.lotNumber,
            lotManufacturedAt: l.lotManufacturedAt,
            lotExpiresAt: l.lotExpiresAt,
            inventoryCondition: l.inventoryCondition,
            inventoryOwnership: l.inventoryOwnership
          } as any)
        }))
      );
    } else {
      for (const l of lines) {
        await this.prisma.goodsReceiptLine.update({
          where: { id: l.id },
          data: ({
            receivedQuantity: l.receivedQuantity,
            acceptedQuantity: l.acceptedQuantity,
            rejectedQuantity: l.rejectedQuantity,
            damagedQuantity: l.damagedQuantity,
            invoiceUnitPrice: l.invoiceUnitPrice,
            putAwayLocationId: l.putAwayLocationId,
            lotId: l.lotId,
            lotNumber: l.lotNumber,
            lotManufacturedAt: l.lotManufacturedAt,
            lotExpiresAt: l.lotExpiresAt,
            inventoryCondition: l.inventoryCondition,
            inventoryOwnership: l.inventoryOwnership
          } as any)
        });
      }
    }
    return this.prisma.goodsReceiptNote.findUniqueOrThrow({
      where: { id },
      include: GRN_INCLUDE
    });
  }

  async list(params: {
    skip?: number;
    take?: number;
    status?: GrnStatus;
    poId?: string;
    search?: string;
    locationId?: string;
  }): Promise<{ items: GoodsReceiptNote[]; total: number }> {
    const where: Prisma.GoodsReceiptNoteWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.poId) where.poId = params.poId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.search) {
      where.OR = [{ grnNumber: { contains: params.search, mode: 'insensitive' } }];
    }
    const [items, total] = await Promise.all([
      this.prisma.goodsReceiptNote.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: GRN_INCLUDE,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.goodsReceiptNote.count({ where })
    ]);
    return { items, total };
  }

  async exportRows(locationId?: string) {
    return this.prisma.goodsReceiptLine.findMany({
      where: locationId ? { grn: { locationId } } : undefined,
      orderBy: [{ grn: { receivedAt: 'desc' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        expectedQuantity: true,
        receivedQuantity: true,
        acceptedQuantity: true,
        rejectedQuantity: true,
        damagedQuantity: true,
        shortQuantity: true,
        excessQuantity: true,
        status: true,
        product: { select: { sku: true, name: true } },
        material: { select: { code: true, name: true } },
        uom: { select: { symbol: true } },
        grn: {
          select: {
            id: true, grnNumber: true, status: true, isUnreferenced: true,
            receivedAt: true, finalizedAt: true,
            vendor: { select: { code: true, name: true } },
            location: { select: { code: true, name: true } },
            po: { select: { poNumber: true } }
          }
        }
      }
    });
  }

  async getLineById(lineId: string) {
    return this.prisma.goodsReceiptLine.findUnique({
      where: { id: lineId },
      include: { ...LINE_INCLUDE, grn: true }
    });
  }

  async updateLineStatus(lineId: string, status: GrnLineStatus): Promise<GoodsReceiptLine> {
    return this.prisma.goodsReceiptLine.update({ where: { id: lineId }, data: { status } });
  }

  async updateLineQuantities(lineId: string, data: {
    receivedQuantity?: number;
    acceptedQuantity?: number;
    rejectedQuantity?: number;
    damagedQuantity?: number;
    shortQuantity?: number;
    excessQuantity?: number;
    status?: GrnLineStatus;
  }): Promise<GoodsReceiptLine> {
    return this.prisma.goodsReceiptLine.update({ where: { id: lineId }, data });
  }

  async createMeasurement(data: {
    grnLineId: string;
    measuredByActorId: string;
    type: 'WEIGHT' | 'PIECE' | 'BUNDLE' | 'PACKET';
    value: number;
    unitLabel: string;
    note?: string;
  }) {
    return this.prisma.goodsReceiptMeasurement.create({ data });
  }

  /** Legacy GRN posting seam retained for the receiving finalization transaction. */
  async createStockLedgerEntry(data: {
    grnId: string;
    grnLineId: string;
    productId?: string | null;
    materialId?: string | null;
    uomId: string;
    locationId?: string | null;
    quantity: number;
    postedByActorId: string;
  }, client: PrismaOrTx = this.prisma) {
    return client.stockLedgerEntry.create({ data: {
      grnId: data.grnId,
      grnLineId: data.grnLineId,
      productId: data.productId ?? undefined,
      materialId: data.materialId ?? undefined,
      uomId: data.uomId,
      locationId: data.locationId ?? undefined,
      quantity: data.quantity,
      postedByActorId: data.postedByActorId,
      entryType: 'GRN_RECEIPT'
    } });
  }
}
