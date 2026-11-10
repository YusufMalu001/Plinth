import { PrismaClient, ReconciliationRecord, InternalReconciliationStatus } from '@prisma/client';
import { prisma } from '../../../database';

export class ReconciliationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async create(data: {
    jobItemId: string;
    internalAmount: any;
    externalAmount?: any;
    status: InternalReconciliationStatus;
    investigatedById?: string;
    resolutionNotes?: string;
  }): Promise<ReconciliationRecord> {
    return this.db.reconciliationRecord.create({
      data: {
        jobItemId: data.jobItemId,
        internalAmount: data.internalAmount,
        externalAmount: data.externalAmount,
        status: data.status,
        investigatedById: data.investigatedById,
        resolutionNotes: data.resolutionNotes,
        reconciledAt: new Date()
      },
      include: {
        investigatedBy: { select: { id: true, name: true, email: true } },
        jobItem: true
      }
    });
  }

  async list(filters?: { status?: InternalReconciliationStatus }): Promise<ReconciliationRecord[]> {
    return this.db.reconciliationRecord.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        investigatedBy: { select: { id: true, name: true, email: true } },
        jobItem: {
          include: {
            job: true
          }
        }
      }
    });
  }
}
