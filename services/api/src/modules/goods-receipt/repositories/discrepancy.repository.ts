import { PrismaClient, Prisma, GoodsReceiptDiscrepancy, DiscrepancyResolutionType, DebitNoteStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class DiscrepancyRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findById(id: string) {
    return this.prisma.goodsReceiptDiscrepancy.findUnique({
      where: { id },
      include: { grnLine: { include: { grn: true } } }
    });
  }

  async listByGrnId(grnId: string): Promise<GoodsReceiptDiscrepancy[]> {
    return this.prisma.goodsReceiptDiscrepancy.findMany({
      where: { grnLine: { grnId } },
      include: { grnLine: true },
      orderBy: { createdAt: 'asc' }
    });
  }

  async countUnresolvedByGrnId(grnId: string): Promise<number> {
    return this.prisma.goodsReceiptDiscrepancy.count({
      where: {
        grnLine: { grnId },
        status: { in: ['PENDING', 'UNDER_REVIEW'] }
      }
    });
  }

  async create(data: {
    grnLineId: string;
    type: 'SHORTAGE' | 'EXCESS' | 'DAMAGE';
    quantity: number;
  }): Promise<GoodsReceiptDiscrepancy> {
    return this.prisma.goodsReceiptDiscrepancy.create({
      data: { ...data, status: 'PENDING' }
    });
  }

  async resolve(id: string, data: {
    resolutionType: DiscrepancyResolutionType;
    acceptanceJustification?: string;
    returnReference?: string;
    resolvedByActorId: string;
    debitNoteStatus?: DebitNoteStatus;
    debitNoteNotes?: string;
  }): Promise<GoodsReceiptDiscrepancy> {
    return this.prisma.goodsReceiptDiscrepancy.update({
      where: { id },
      data: {
        resolutionType: data.resolutionType,
        acceptanceJustification: data.acceptanceJustification,
        returnReference: data.returnReference,
        resolvedByActorId: data.resolvedByActorId,
        resolvedAt: new Date(),
        status: 'RESOLVED',
        debitNoteStatus: data.debitNoteStatus,
        debitNoteNotes: data.debitNoteNotes
      }
    });
  }

  async updateStatus(id: string, status: Prisma.GoodsReceiptDiscrepancyUpdateInput['status']): Promise<GoodsReceiptDiscrepancy> {
    return this.prisma.goodsReceiptDiscrepancy.update({ where: { id }, data: { status } });
  }
}
