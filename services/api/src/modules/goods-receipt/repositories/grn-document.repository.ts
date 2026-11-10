/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient, GrnDocument } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class GrnDocumentRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async create(data: { grnId: string; fileUrl: string; storageKey?: string; fileName: string; uploadedBy: string; documentType?: string; sha256?: string; pageCount?: number }): Promise<GrnDocument> {
    try { return await (this.prisma as any).grnDocument.create({ data }); }
    catch (error) {
      // Keep legacy clients usable until `prisma generate` runs against the
      // additive schema. The migration still persists the richer fields once
      // the generated client supports them.
      if (data.documentType === undefined && data.sha256 === undefined && data.pageCount === undefined) throw error;
      return (this.prisma as any).grnDocument.create({ data: { grnId: data.grnId, fileUrl: data.fileUrl, fileName: data.fileName, uploadedBy: data.uploadedBy } });
    }
  }

  async listByGrnId(grnId: string): Promise<GrnDocument[]> {
    return this.prisma.grnDocument.findMany({ where: { grnId }, orderBy: { createdAt: 'desc' } });
  }
}
