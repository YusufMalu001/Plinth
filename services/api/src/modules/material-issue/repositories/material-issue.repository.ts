import { PrismaClient, Prisma, MaterialIssue, MaterialIssueStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export const MATERIAL_ISSUE_INCLUDE = {
  productionPlan: true,
  bomVersion: true,
  location: true,
  lines: {
    include: { bomLine: true, material: true, componentProduct: true, uom: true, ledgerEntry: true },
    orderBy: { createdAt: 'asc' as const }
  },
  returns: { orderBy: { requestedAt: 'asc' as const } }
} satisfies Prisma.MaterialIssueInclude;

export type MaterialIssueWithLines = Prisma.MaterialIssueGetPayload<{ include: typeof MATERIAL_ISSUE_INCLUDE }>;

export interface MaterialIssueLineInput {
  bomLineId?: string | null;
  materialId?: string | null;
  componentProductId?: string | null;
  uomId: string;
  requiredQuantity: number;
}

export class MaterialIssueRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string): Promise<MaterialIssueWithLines | null> {
    return this.prisma.materialIssue.findUnique({ where: { id }, include: MATERIAL_ISSUE_INCLUDE });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<MaterialIssueWithLines | null> {
    return this.prisma.materialIssue.findUnique({ where: { idempotencyKey }, include: MATERIAL_ISSUE_INCLUDE });
  }

  async countByNumberPrefix(prefix: string): Promise<number> {
    return this.prisma.materialIssue.count({ where: { issueNumber: { startsWith: prefix } } });
  }

  async existsByIssueNumber(issueNumber: string): Promise<boolean> {
    const found = await this.prisma.materialIssue.findUnique({ where: { issueNumber } });
    return Boolean(found);
  }

  /** Any material issue against this plan that hasn't reached a terminal state yet. */
  async findActiveByProductionPlanId(productionPlanId: string): Promise<MaterialIssue | null> {
    return this.prisma.materialIssue.findFirst({
      where: { productionPlanId, status: { notIn: ['POSTED', 'CANCELLED'] } }
    });
  }

  async create(
    data: {
      issueNumber: string;
      productionPlanId: string;
      bomVersionId: string;
      locationId: string;
      idempotencyKey?: string;
      note?: string;
      requestedByActorId: string;
      lines: MaterialIssueLineInput[];
    },
    client: PrismaOrTx = this.prisma
  ): Promise<MaterialIssueWithLines> {
    return client.materialIssue.create({
      data: {
        issueNumber: data.issueNumber,
        productionPlanId: data.productionPlanId,
        bomVersionId: data.bomVersionId,
        locationId: data.locationId,
        idempotencyKey: data.idempotencyKey,
        note: data.note,
        status: 'REQUESTED',
        requestedByActorId: data.requestedByActorId,
        lines: {
          create: data.lines.map((line) => ({
            bomLineId: line.bomLineId ?? null,
            materialId: line.materialId ?? null,
            componentProductId: line.componentProductId ?? null,
            uomId: line.uomId,
            requiredQuantity: line.requiredQuantity
          }))
        }
      },
      include: MATERIAL_ISSUE_INCLUDE
    });
  }

  /** Conditional status flip, exact GoodsReceiptRepository.updateStatusConditional shape. */
  async updateStatusConditional(
    id: string,
    fromStatuses: MaterialIssueStatus[],
    toStatus: MaterialIssueStatus,
    extra?: Prisma.MaterialIssueUncheckedUpdateInput,
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.materialIssue.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra }
    });
    return count;
  }

  async updateLineQuantities(
    lineId: string,
    data: { issuedQuantity?: number; shortageQuantity?: number },
    client: PrismaOrTx = this.prisma
  ): Promise<void> {
    await client.materialIssueLine.update({ where: { id: lineId }, data });
  }

  async list(params: {
    productionPlanId?: string;
    status?: MaterialIssueStatus;
    locationId?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: MaterialIssueWithLines[]; total: number }> {
    const where: Prisma.MaterialIssueWhereInput = {};
    if (params.productionPlanId) where.productionPlanId = params.productionPlanId;
    if (params.status) where.status = params.status;
    if (params.locationId) where.locationId = params.locationId;

    const [items, total] = await Promise.all([
      this.prisma.materialIssue.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: MATERIAL_ISSUE_INCLUDE,
        orderBy: { requestedAt: 'desc' }
      }),
      this.prisma.materialIssue.count({ where })
    ]);
    return { items, total };
  }
}
