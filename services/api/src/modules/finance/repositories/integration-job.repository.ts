import {
  PrismaClient,
  IntegrationJob,
  IntegrationJobItem,
  IntegrationJobStatus,
  IntegrationJobItemStatus,
  TransactionSourceType,
  Prisma
} from '@prisma/client';
import { prisma } from '../../../database';

export interface CreateJobWithItemsInput {
  jobCode: string;
  sourceType: TransactionSourceType;
  createdById: string;
  items: {
    sourceType: TransactionSourceType;
    sourceId: string;
    mappingConfigId: string;
    amount: Prisma.Decimal;
    currency: string;
    payloadFingerprint: string;
    errorMessage?: string | null;
  }[];
}

export class IntegrationJobRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findJobById(id: string): Promise<(IntegrationJob & { items: IntegrationJobItem[] }) | null> {
    return this.db.integrationJob.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            reconciliationRecord: true,
            acknowledgedBy: { select: { id: true, name: true, email: true } }
          }
        },
        triggeredBy: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async findJobItemById(id: string): Promise<(IntegrationJobItem & { job: IntegrationJob; reconciliationRecord: any | null }) | null> {
    return this.db.integrationJobItem.findUnique({
      where: { id },
      include: {
        job: true,
        reconciliationRecord: true,
        acknowledgedBy: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async findItemByFingerprint(fingerprint: string): Promise<IntegrationJobItem | null> {
    return this.db.integrationJobItem.findUnique({
      where: { payloadFingerprint: fingerprint }
    });
  }

  async findItemsBySourceId(sourceType: TransactionSourceType, sourceId: string): Promise<IntegrationJobItem[]> {
    return this.db.integrationJobItem.findMany({
      where: { sourceType, sourceId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listJobs(filters?: {
    sourceType?: TransactionSourceType;
    status?: IntegrationJobStatus;
    page?: number;
    limit?: number;
  }): Promise<{ jobs: IntegrationJob[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.IntegrationJobWhereInput = {
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters?.status ? { status: filters.status } : {})
    };

    const [jobs, total] = await Promise.all([
      this.db.integrationJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          triggeredBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } }
        }
      }),
      this.db.integrationJob.count({ where })
    ]);

    return { jobs, total };
  }

  async listJobItems(filters?: {
    jobId?: string;
    sourceType?: TransactionSourceType;
    status?: IntegrationJobItemStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: IntegrationJobItem[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.IntegrationJobItemWhereInput = {
      ...(filters?.jobId ? { jobId: filters.jobId } : {}),
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters?.status ? { status: filters.status } : {})
    };

    const [items, total] = await Promise.all([
      this.db.integrationJobItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          job: { select: { id: true, jobCode: true, status: true } },
          acknowledgedBy: { select: { id: true, name: true, email: true } }
        }
      }),
      this.db.integrationJobItem.count({ where })
    ]);

    return { items, total };
  }

  async createJobWithItems(input: CreateJobWithItemsInput): Promise<IntegrationJob & { items: IntegrationJobItem[] }> {
    return this.db.$transaction(async (tx) => {
      const job = await tx.integrationJob.create({
        data: {
          jobCode: input.jobCode,
          sourceType: input.sourceType,
          status: IntegrationJobStatus.QUEUED,
          totalItems: input.items.length,
          successCount: 0,
          failureCount: 0,
          triggeredById: input.createdById
        }
      });

      const createdItems: IntegrationJobItem[] = [];
      for (const item of input.items) {
        const createdItem = await tx.integrationJobItem.create({
          data: {
            jobId: job.id,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            mappingConfigId: item.mappingConfigId,
            status: IntegrationJobItemStatus.QUEUED,
            amount: item.amount,
            currency: item.currency,
            payloadFingerprint: item.payloadFingerprint,
            errorMessage: item.errorMessage
          }
        });
        createdItems.push(createdItem);
      }

      return {
        ...job,
        items: createdItems
      };
    });
  }

  async updateJobExportSuccess(
    jobId: string,
    batchFileRef: string
  ): Promise<IntegrationJob> {
    return this.db.$transaction(async (tx) => {
      // Transition items to SENT
      await tx.integrationJobItem.updateMany({
        where: { jobId, status: IntegrationJobItemStatus.QUEUED },
        data: { status: IntegrationJobItemStatus.SENT }
      });

      const count = await tx.integrationJobItem.count({
        where: { jobId }
      });

      return tx.integrationJob.update({
        where: { id: jobId },
        data: {
          status: IntegrationJobStatus.COMPLETED,
          batchFileRef,
          successCount: count,
          completedAt: new Date()
        }
      });
    });
  }

  async updateItemStatus(
    itemId: string,
    status: IntegrationJobItemStatus,
    data?: {
      errorMessage?: string;
      retryCountIncrement?: boolean;
      acknowledgedById?: string;
      externalReference?: string;
    }
  ): Promise<IntegrationJobItem> {
    return this.db.integrationJobItem.update({
      where: { id: itemId },
      data: {
        status,
        ...(data?.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
        ...(data?.retryCountIncrement ? { retryCount: { increment: 1 } } : {}),
        ...(data?.acknowledgedById ? { acknowledgedById: data.acknowledgedById, acknowledgedAt: new Date() } : {}),
        ...(data?.externalReference ? { externalReference: data.externalReference } : {})
      }
    });
  }

  async countTotalActiveByFingerprint(fingerprint: string): Promise<number> {
    return this.db.integrationJobItem.count({
      where: {
        payloadFingerprint: fingerprint,
        status: {
          notIn: [IntegrationJobItemStatus.REJECTED, IntegrationJobItemStatus.FAILED]
        }
      }
    });
  }
}
