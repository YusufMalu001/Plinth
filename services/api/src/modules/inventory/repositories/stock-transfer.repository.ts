import { PrismaClient, Prisma, StockTransfer, StockOwnership, StockTransferStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

const TRANSFER_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  fromLocation: true,
  toLocation: true,
  requestedByActor: { select: { id: true, name: true, email: true } },
  issuedByActor: { select: { id: true, name: true, email: true } },
  receivedByActor: { select: { id: true, name: true, email: true } },
  cancelledByActor: { select: { id: true, name: true, email: true } },
  ledgerEntries: true
} satisfies Prisma.StockTransferInclude;

export class StockTransferRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string) {
    return this.prisma.stockTransfer.findUnique({ where: { id }, include: TRANSFER_INCLUDE });
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.stockTransfer.findUnique({ where: { idempotencyKey }, include: TRANSFER_INCLUDE });
  }

  async countByNumberPrefix(prefix: string): Promise<number> {
    return this.prisma.stockTransfer.count({ where: { transferNumber: { startsWith: prefix } } });
  }

  async existsByTransferNumber(transferNumber: string): Promise<boolean> {
    const found = await this.prisma.stockTransfer.findUnique({ where: { transferNumber } });
    return Boolean(found);
  }

  async create(
    data: {
      transferNumber: string;
      productId?: string;
      materialId?: string;
      uomId: string;
      fromLocationId: string;
      toLocationId: string;
      ownership: StockOwnership;
      requestedQuantity: number;
      idempotencyKey?: string;
      requestedByActorId: string;
      note?: string;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<StockTransfer> {
    return client.stockTransfer.create({ data, include: TRANSFER_INCLUDE });
  }

  /** Conditional status flip used as a concurrency guard, same pattern as GRN finalize. */
  async updateStatusConditional(
    id: string,
    fromStatuses: StockTransferStatus[],
    toStatus: StockTransferStatus,
    extra: Prisma.StockTransferUncheckedUpdateInput,
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.stockTransfer.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra }
    });
    return count;
  }

  async list(params: { locationId?: string; status?: string; skip?: number; take?: number }) {
    const where: Prisma.StockTransferWhereInput = {};
    if (params.locationId) where.OR = [{ fromLocationId: params.locationId }, { toLocationId: params.locationId }];
    if (params.status) where.status = params.status as never;
    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({ where, include: TRANSFER_INCLUDE, skip: params.skip, take: params.take, orderBy: { requestedAt: 'desc' } }),
      this.prisma.stockTransfer.count({ where })
    ]);
    return { items, total };
  }
}
