import { PrismaClient, Prisma, MasterDataImportBatch, MasterDataImportRow, ImportBatchStatus, ImportRowStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class ImportRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async createBatch(data: Prisma.MasterDataImportBatchCreateInput): Promise<MasterDataImportBatch> {
    return this.prisma.masterDataImportBatch.create({ data });
  }

  async findBatchById(id: string): Promise<(MasterDataImportBatch & { rows: MasterDataImportRow[] }) | null> {
    return this.prisma.masterDataImportBatch.findUnique({
      where: { id },
      include: { rows: { orderBy: { rowNumber: 'asc' } } }
    });
  }

  async findBatchByNumber(batchNumber: string): Promise<MasterDataImportBatch | null> {
    return this.prisma.masterDataImportBatch.findUnique({ where: { batchNumber } });
  }

  async listBatches(params?: {
    entityType?: string;
    status?: ImportBatchStatus;
    skip?: number;
    take?: number;
  }): Promise<{ items: MasterDataImportBatch[]; total: number }> {
    const where: Prisma.MasterDataImportBatchWhereInput = {};
    if (params?.entityType) where.entityType = params.entityType;
    if (params?.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.masterDataImportBatch.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.masterDataImportBatch.count({ where })
    ]);
    return { items, total };
  }

  async updateBatchStatus(
    id: string,
    status: ImportBatchStatus,
    counts?: { validRows?: number; invalidRows?: number; committedRows?: number }
  ): Promise<MasterDataImportBatch> {
    return this.prisma.masterDataImportBatch.update({
      where: { id },
      data: {
        status,
        ...(counts?.validRows !== undefined ? { validRows: counts.validRows } : {}),
        ...(counts?.invalidRows !== undefined ? { invalidRows: counts.invalidRows } : {}),
        ...(counts?.committedRows !== undefined ? { committedRows: counts.committedRows } : {})
      }
    });
  }

  async bulkInsertRows(rows: Prisma.MasterDataImportRowCreateManyInput[]): Promise<{ count: number }> {
    return this.prisma.masterDataImportRow.createMany({
      data: rows,
      skipDuplicates: true
    });
  }

  async listRowsByBatch(batchId: string, status?: ImportRowStatus): Promise<MasterDataImportRow[]> {
    const where: Prisma.MasterDataImportRowWhereInput = { batchId };
    if (status) where.status = status;
    return this.prisma.masterDataImportRow.findMany({
      where,
      orderBy: { rowNumber: 'asc' }
    });
  }

  async updateRowDecision(
    id: string,
    resolutionDecision: string,
    status: ImportRowStatus
  ): Promise<MasterDataImportRow> {
    return this.prisma.masterDataImportRow.update({
      where: { id },
      data: { resolutionDecision, status }
    });
  }
}
