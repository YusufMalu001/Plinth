import { PrismaClient, Prisma, StockIssue, StockOwnership } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

const ISSUE_INCLUDE = {
  product: true,
  material: true,
  uom: true,
  location: true,
  issuedByActor: { select: { id: true, name: true, email: true } },
  reversedByActor: { select: { id: true, name: true, email: true } },
  ledgerEntries: true
} satisfies Prisma.StockIssueInclude;

export class StockIssueRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string) {
    return this.prisma.stockIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.stockIssue.findUnique({ where: { idempotencyKey }, include: ISSUE_INCLUDE });
  }

  async countByNumberPrefix(prefix: string): Promise<number> {
    return this.prisma.stockIssue.count({ where: { issueNumber: { startsWith: prefix } } });
  }

  async existsByIssueNumber(issueNumber: string): Promise<boolean> {
    const found = await this.prisma.stockIssue.findUnique({ where: { issueNumber } });
    return Boolean(found);
  }

  async create(
    data: {
      issueNumber: string;
      productId?: string;
      materialId?: string;
      uomId: string;
      locationId: string;
      ownership: StockOwnership;
      quantity: number;
      reason: string;
      idempotencyKey?: string;
      issuedByActorId: string;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<StockIssue> {
    return client.stockIssue.create({ data, include: ISSUE_INCLUDE });
  }

  /** Conditional status flip used as a concurrency guard, same pattern as GRN finalize. */
  async markReversedConditional(
    id: string,
    data: { reversedByActorId: string; reversalReason: string },
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.stockIssue.updateMany({
      where: { id, status: 'ISSUED' },
      data: { status: 'REVERSED', reversedByActorId: data.reversedByActorId, reversalReason: data.reversalReason, reversedAt: new Date() }
    });
    return count;
  }

  async list(params: { productId?: string; materialId?: string; locationId?: string; status?: string; skip?: number; take?: number }) {
    const where: Prisma.StockIssueWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.materialId) where.materialId = params.materialId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status as never;
    const [items, total] = await Promise.all([
      this.prisma.stockIssue.findMany({ where, include: ISSUE_INCLUDE, skip: params.skip, take: params.take, orderBy: { issuedAt: 'desc' } }),
      this.prisma.stockIssue.count({ where })
    ]);
    return { items, total };
  }
}
