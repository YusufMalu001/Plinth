import { PrismaClient, Prisma, BomSimulationRun } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface BomSimulationLineResult {
  bomLineId: string;
  requiredQuantity: number;
  uomId: string;
  departmentId: string | null;
  conversionFactorUsed: number;
}

export class BomSimulationRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async create(
    data: {
      bomVersionId: string;
      bomVersionNumber: number;
      requestedQuantity: number;
      requestedUomId: string;
      isAuthoritative: boolean;
      resultBreakdown: BomSimulationLineResult[];
      matchesGolden?: boolean | null;
      runByActorId: string;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<BomSimulationRun> {
    return client.bomSimulationRun.create({
      data: {
        bomVersionId: data.bomVersionId,
        bomVersionNumber: data.bomVersionNumber,
        requestedQuantity: data.requestedQuantity,
        requestedUomId: data.requestedUomId,
        isAuthoritative: data.isAuthoritative,
        resultBreakdown: data.resultBreakdown as unknown as Prisma.InputJsonValue,
        matchesGolden: data.matchesGolden ?? null,
        runByActorId: data.runByActorId
      }
    });
  }

  async listByVersion(bomVersionId: string): Promise<BomSimulationRun[]> {
    return this.prisma.bomSimulationRun.findMany({
      where: { bomVersionId },
      orderBy: { runAt: 'desc' }
    });
  }
}
