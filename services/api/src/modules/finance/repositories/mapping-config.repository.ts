import { PrismaClient, MappingConfiguration, LifecycleStatus, TransactionSourceType } from '@prisma/client';
import { prisma } from '../../../database';

export class MappingConfigRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findById(id: string): Promise<MappingConfiguration | null> {
    return this.db.mappingConfiguration.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async findApprovedBySourceType(sourceType: TransactionSourceType): Promise<MappingConfiguration | null> {
    return this.db.mappingConfiguration.findFirst({
      where: {
        sourceType,
        status: LifecycleStatus.APPROVED
      },
      orderBy: { version: 'desc' }
    });
  }

  async list(filters?: { sourceType?: TransactionSourceType; status?: LifecycleStatus }): Promise<MappingConfiguration[]> {
    return this.db.mappingConfiguration.findMany({
      where: {
        ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
        ...(filters?.status ? { status: filters.status } : {})
      },
      orderBy: [{ sourceType: 'asc' }, { version: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async getLatestVersionNumber(sourceType: TransactionSourceType): Promise<number> {
    const latest = await this.db.mappingConfiguration.findFirst({
      where: { sourceType },
      orderBy: { version: 'desc' },
      select: { version: true }
    });
    return latest?.version ?? 0;
  }

  async create(data: {
    sourceType: TransactionSourceType;
    version: number;
    fieldMapping: any;
    effectiveFrom?: Date | null;
    createdById: string;
  }): Promise<MappingConfiguration> {
    return this.db.mappingConfiguration.create({
      data: {
        sourceType: data.sourceType,
        version: data.version,
        status: LifecycleStatus.DRAFT,
        fieldMapping: data.fieldMapping,
        effectiveFrom: data.effectiveFrom || null,
        createdById: data.createdById
      }
    });
  }

  async approve(id: string, approvedById: string): Promise<MappingConfiguration> {
    return this.db.mappingConfiguration.update({
      where: { id },
      data: {
        status: LifecycleStatus.APPROVED,
        approvedById,
        approvedAt: new Date()
      }
    });
  }
}
