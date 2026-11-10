import { PrismaClient, Prisma, StockAdjustment, StockOwnership, StockAdjustmentDirection } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

const ADJUSTMENT_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  location: true,
  proposedByActor: { select: { id: true, name: true, email: true } },
  reviewedByActor: { select: { id: true, name: true, email: true } },
  approvedByActor: { select: { id: true, name: true, email: true } },
  rejectedByActor: { select: { id: true, name: true, email: true } },
  ledgerEntries: true
} satisfies Prisma.StockAdjustmentInclude;

export class StockAdjustmentRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string) {
    return this.prisma.stockAdjustment.findUnique({ where: { id }, include: ADJUSTMENT_INCLUDE });
  }

  async countByNumberPrefix(prefix: string): Promise<number> {
    return this.prisma.stockAdjustment.count({ where: { adjustmentNumber: { startsWith: prefix } } });
  }

  async existsByAdjustmentNumber(adjustmentNumber: string): Promise<boolean> {
    const found = await this.prisma.stockAdjustment.findUnique({ where: { adjustmentNumber } });
    return Boolean(found);
  }

  async create(data: {
    adjustmentNumber: string;
    productId?: string;
    materialId?: string;
    uomId: string;
    locationId: string;
    ownership: StockOwnership;
    direction: StockAdjustmentDirection;
    quantity: number;
    reason: string;
    proposedByActorId: string;
  }): Promise<StockAdjustment> {
    return this.prisma.stockAdjustment.create({ data, include: ADJUSTMENT_INCLUDE });
  }

  async review(id: string, data: { reviewedByActorId: string; reviewNote?: string }): Promise<StockAdjustment> {
    return this.prisma.stockAdjustment.update({
      where: { id },
      data: { status: 'UNDER_REVIEW', reviewedByActorId: data.reviewedByActorId, reviewNote: data.reviewNote, reviewedAt: new Date() },
      include: ADJUSTMENT_INCLUDE
    });
  }

  async approve(id: string, approvedByActorId: string): Promise<StockAdjustment> {
    return this.prisma.stockAdjustment.update({
      where: { id },
      data: { status: 'APPROVED', approvedByActorId, approvedAt: new Date() },
      include: ADJUSTMENT_INCLUDE
    });
  }

  async reject(id: string, data: { rejectedByActorId: string; rejectionReason: string }): Promise<StockAdjustment> {
    return this.prisma.stockAdjustment.update({
      where: { id },
      data: { status: 'REJECTED', rejectedByActorId: data.rejectedByActorId, reviewNote: data.rejectionReason, rejectedAt: new Date() },
      include: ADJUSTMENT_INCLUDE
    });
  }

  /** Conditional status flip used as a concurrency guard, same pattern as GRN finalize. */
  async postConditional(id: string, client: PrismaOrTx = this.prisma): Promise<number> {
    const { count } = await client.stockAdjustment.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'POSTED', postedAt: new Date() }
    });
    return count;
  }

  async list(params: { locationId?: string; status?: string; skip?: number; take?: number }) {
    const where: Prisma.StockAdjustmentWhereInput = {};
    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status as never;
    const [items, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({ where, include: ADJUSTMENT_INCLUDE, skip: params.skip, take: params.take, orderBy: { proposedAt: 'desc' } }),
      this.prisma.stockAdjustment.count({ where })
    ]);
    return { items, total };
  }
}
