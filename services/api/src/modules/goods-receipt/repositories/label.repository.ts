import { PrismaClient, GoodsReceiptLabel } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class LabelRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findByLineId(grnLineId: string) {
    return this.prisma.goodsReceiptLabel.findUnique({
      where: { grnLineId },
      include: { printEvents: { orderBy: { printedAt: 'asc' } } }
    });
  }

  async findById(id: string) {
    return this.prisma.goodsReceiptLabel.findUnique({
      where: { id },
      include: { printEvents: { orderBy: { printedAt: 'asc' } } }
    });
  }

  async countByCodePrefix(prefix: string): Promise<number> {
    return this.prisma.goodsReceiptLabel.count({ where: { labelCode: { startsWith: prefix } } });
  }

  async create(grnLineId: string, labelCode: string): Promise<GoodsReceiptLabel> {
    return this.prisma.goodsReceiptLabel.create({ data: { grnLineId, labelCode } });
  }

  async addPrintEvent(labelId: string, printedByActorId: string, reason?: string) {
    return this.prisma.goodsReceiptLabelPrintEvent.create({
      data: { labelId, printedByActorId, reason }
    });
  }
}
