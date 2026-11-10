import { PrismaClient, Prisma, BomGoldenExample } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface BomGoldenExampleExpectedResult {
  bomLineId: string;
  expectedQuantity: number;
  uomId: string;
}

export class BomGoldenExampleRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async create(
    data: {
      bomVersionId: string;
      label: string;
      inputQuantity: number;
      inputUomId: string;
      expectedResults: BomGoldenExampleExpectedResult[];
      sourceReference?: string;
      createdByActorId: string;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<BomGoldenExample> {
    return client.bomGoldenExample.create({
      data: {
        bomVersionId: data.bomVersionId,
        label: data.label,
        inputQuantity: data.inputQuantity,
        inputUomId: data.inputUomId,
        expectedResults: data.expectedResults as unknown as Prisma.InputJsonValue,
        sourceReference: data.sourceReference,
        createdByActorId: data.createdByActorId
      }
    });
  }

  async listByVersion(bomVersionId: string): Promise<BomGoldenExample[]> {
    return this.prisma.bomGoldenExample.findMany({
      where: { bomVersionId },
      orderBy: { createdAt: 'asc' }
    });
  }
}
