import { PrismaClient, Prisma, StockBalance, StockLedgerEntry, StockOwnership, StockSnapshot } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

const BALANCE_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  location: true
} satisfies Prisma.StockBalanceInclude;

const LEDGER_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  location: true,
  grn: true,
  grnLine: true,
  issue: true,
  transfer: true,
  adjustment: true,
  reversalOf: true,
  postedByActor: { select: { id: true, name: true, email: true } }
} satisfies Prisma.StockLedgerEntryInclude;

export class StockBalanceRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async list(params: {
    productId?: string;
    materialId?: string;
    locationId?: string;
    ownership?: StockOwnership;
    belowReorderOnly?: boolean;
    skip?: number;
    take?: number;
  }): Promise<{ items: StockBalance[]; total: number }> {
    const where: Prisma.StockBalanceWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.materialId) where.materialId = params.materialId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.ownership) where.ownership = params.ownership;

    const [items, total] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where,
        include: BALANCE_INCLUDE,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: 'desc' }
      }),
      this.prisma.stockBalance.count({ where })
    ]);
    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.stockBalance.findUnique({ where: { id }, include: BALANCE_INCLUDE });
  }

  async findByItemKey(itemKey: string, uomId: string, locationId: string, ownership: StockOwnership) {
    return this.prisma.stockBalance.findUnique({
      where: { itemKey_uomId_locationId_ownership: { itemKey, uomId, locationId, ownership } },
      include: BALANCE_INCLUDE
    });
  }

  async listAll(): Promise<StockBalance[]> {
    return this.prisma.stockBalance.findMany({ include: BALANCE_INCLUDE });
  }

  async listLedger(params: {
    productId?: string;
    materialId?: string;
    locationId?: string;
    entryType?: string;
    postedFrom?: Date;
    postedTo?: Date;
    skip?: number;
    take?: number;
  }): Promise<{ items: StockLedgerEntry[]; total: number }> {
    const where: Prisma.StockLedgerEntryWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.materialId) where.materialId = params.materialId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.entryType) where.entryType = params.entryType as never;
    if (params.postedFrom || params.postedTo) {
      where.postedAt = {
        ...(params.postedFrom ? { gte: params.postedFrom } : {}),
        ...(params.postedTo ? { lte: params.postedTo } : {})
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.stockLedgerEntry.findMany({
        where,
        include: LEDGER_INCLUDE,
        skip: params.skip,
        take: params.take,
        orderBy: { postedAt: 'desc' }
      }),
      this.prisma.stockLedgerEntry.count({ where })
    ]);
    return { items, total };
  }

  async getLedgerEntryById(id: string) {
    return this.prisma.stockLedgerEntry.findUnique({ where: { id }, include: LEDGER_INCLUDE });
  }

  async getMovementHistory(params: { productId?: string; materialId?: string; locationId: string }): Promise<StockLedgerEntry[]> {
    const where: Prisma.StockLedgerEntryWhereInput = { locationId: params.locationId };
    if (params.productId) where.productId = params.productId;
    if (params.materialId) where.materialId = params.materialId;
    return this.prisma.stockLedgerEntry.findMany({ where, include: LEDGER_INCLUDE, orderBy: { postedAt: 'desc' } });
  }

  async getLastMovementAt(params: { productId?: string; materialId?: string; locationId: string }): Promise<Date | null> {
    const where: Prisma.StockLedgerEntryWhereInput = { locationId: params.locationId };
    if (params.productId) where.productId = params.productId;
    if (params.materialId) where.materialId = params.materialId;
    const latest = await this.prisma.stockLedgerEntry.findFirst({ where, orderBy: { postedAt: 'desc' }, select: { postedAt: true } });
    return latest?.postedAt ?? null;
  }

  /** Sum of ISSUE-direction-OUT ledger quantity per item+location since a given date - the raw
   *  material for the consumption-based reorder signal (never a static reorder-point substitute). */
  async sumIssuedQuantitySince(since: Date): Promise<Array<{ productId: string | null; materialId: string | null; locationId: string | null; total: number }>> {
    const grouped = await this.prisma.stockLedgerEntry.groupBy({
      by: ['productId', 'materialId', 'locationId'],
      where: {
        entryType: 'ISSUE',
        direction: 'OUT',
        postedAt: { gte: since },
        OR: [
          { productId: { not: null } },
          { materialId: { not: null } }
        ]
      },
      _sum: { quantity: true }
    });
    return grouped.map((g) => ({
      productId: g.productId,
      materialId: g.materialId,
      locationId: g.locationId,
      total: g._sum?.quantity ?? 0
    }));
  }

  async createSnapshotRows(rows: Array<Omit<Prisma.StockSnapshotUncheckedCreateInput, 'id'>>): Promise<number> {
    const result = await this.prisma.stockSnapshot.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  async listSnapshots(params: { asOfDate?: Date; locationId?: string; skip?: number; take?: number }): Promise<{ items: StockSnapshot[]; total: number }> {
    const where: Prisma.StockSnapshotWhereInput = {};
    if (params.asOfDate) where.asOfDate = params.asOfDate;
    if (params.locationId) where.locationId = params.locationId;
    const [items, total] = await Promise.all([
      this.prisma.stockSnapshot.findMany({ where, skip: params.skip, take: params.take, orderBy: { asOfDate: 'desc' } }),
      this.prisma.stockSnapshot.count({ where })
    ]);
    return { items, total };
  }
}
