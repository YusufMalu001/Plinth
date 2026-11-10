import { PrismaClient, Prisma, StockReservation, StockOwnership } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

const RESERVATION_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  location: true,
  reservedByActor: { select: { id: true, name: true, email: true } },
  releasedByActor: { select: { id: true, name: true, email: true } }
} satisfies Prisma.StockReservationInclude;

export class StockReservationRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string) {
    return this.prisma.stockReservation.findUnique({ where: { id }, include: RESERVATION_INCLUDE });
  }

  async create(
    data: {
      productId?: string;
      materialId?: string;
      uomId: string;
      locationId: string;
      ownership: StockOwnership;
      quantity: number;
      reason: string;
      sourceReference?: string;
      reservedByActorId: string;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<StockReservation> {
    return client.stockReservation.create({ data, include: RESERVATION_INCLUDE });
  }

  /** Conditional status flip used as a concurrency guard, same pattern as GRN finalize. */
  async updateStatusConditional(
    id: string,
    fromStatuses: Array<'ACTIVE'>,
    toStatus: 'RELEASED' | 'CONSUMED' | 'CANCELLED',
    extra: Prisma.StockReservationUncheckedUpdateInput,
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.stockReservation.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra }
    });
    return count;
  }

  async list(params: { productId?: string; materialId?: string; locationId?: string; status?: string; skip?: number; take?: number }) {
    const where: Prisma.StockReservationWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.materialId) where.materialId = params.materialId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status as never;
    const [items, total] = await Promise.all([
      this.prisma.stockReservation.findMany({ where, include: RESERVATION_INCLUDE, skip: params.skip, take: params.take, orderBy: { reservedAt: 'desc' } }),
      this.prisma.stockReservation.count({ where })
    ]);
    return { items, total };
  }
}
