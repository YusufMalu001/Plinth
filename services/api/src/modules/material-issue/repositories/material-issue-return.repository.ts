import { PrismaClient, Prisma, MaterialIssueReturn, MaterialIssueReturnStatus, MaterialIssueReturnType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export class MaterialIssueReturnRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string): Promise<MaterialIssueReturn | null> {
    return this.prisma.materialIssueReturn.findUnique({ where: { id } });
  }

  /** Sum of already acknowledged/posted returns against one line - the "outstanding issue" guard. */
  async sumSettledByLineId(materialIssueLineId: string): Promise<number> {
    const result = await this.prisma.materialIssueReturn.aggregate({
      where: { materialIssueLineId, status: { in: ['ACKNOWLEDGED', 'POSTED'] } },
      _sum: { quantity: true }
    });
    return result._sum.quantity ?? 0;
  }

  async create(
    data: {
      materialIssueId: string;
      materialIssueLineId: string;
      returnType: MaterialIssueReturnType;
      quantity: number;
      reason?: string;
      requestedByActorId: string;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<MaterialIssueReturn> {
    return client.materialIssueReturn.create({
      data: {
        materialIssueId: data.materialIssueId,
        materialIssueLineId: data.materialIssueLineId,
        returnType: data.returnType,
        quantity: data.quantity,
        reason: data.reason,
        status: 'REQUESTED',
        requestedByActorId: data.requestedByActorId
      }
    });
  }

  async updateStatusConditional(
    id: string,
    fromStatuses: MaterialIssueReturnStatus[],
    toStatus: MaterialIssueReturnStatus,
    extra?: Prisma.MaterialIssueReturnUncheckedUpdateInput,
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.materialIssueReturn.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra }
    });
    return count;
  }

  async listByMaterialIssueId(materialIssueId: string): Promise<MaterialIssueReturn[]> {
    return this.prisma.materialIssueReturn.findMany({ where: { materialIssueId }, orderBy: { requestedAt: 'asc' } });
  }
}
