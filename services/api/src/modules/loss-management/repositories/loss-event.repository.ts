import {
  PrismaClient,
  Prisma,
  LossSourceType,
  LossClassification,
  LossEventStatus
} from '@prisma/client';

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface CreateLossEventInput {
  lossNumber: string;
  sourceType: LossSourceType;
  sourceExceptionRecordId?: string | null;
  sourceDiscrepancyId?: string | null;
  sourceInspectionResultId?: string | null;
  materialId?: string | null;
  productId?: string | null;
  uomId: string;
  locationId?: string | null;
  departmentId?: string | null;
  quantity: Prisma.Decimal | number;
  reason: string;
  reportedByActorId: string;
}

export interface ListLossEventsFilter {
  sourceType?: LossSourceType;
  classification?: LossClassification;
  status?: LossEventStatus;
  departmentId?: string;
  locationId?: string;
  materialId?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  skip?: number;
  take?: number;
}

const LOSS_EVENT_INCLUDE = {
  material: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, sku: true, name: true } },
  uom: { select: { id: true, code: true, symbol: true } },
  location: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  reportedByActor: { select: { id: true, name: true, email: true } },
  reviewedByActor: { select: { id: true, name: true, email: true } },
  approvedByActor: { select: { id: true, name: true, email: true } },
  rejectedByActor: { select: { id: true, name: true, email: true } },
  investigatedByActor: { select: { id: true, name: true, email: true } },
  appliedWastageRule: { select: { id: true, code: true, name: true, version: true, standardWastagePct: true, tolerancePct: true } },
  sourceExceptionRecord: {
    include: {
      batch: {
        include: {
          productionPlan: { select: { id: true, planNumber: true, quantity: true, status: true } },
          department: { select: { id: true, code: true, name: true } }
        }
      }
    }
  },
  replacementChallan: {
    include: {
      dispatchLocation: { select: { id: true, code: true, name: true } },
      targetDepartment: { select: { id: true, code: true, name: true } },
      targetVendor: { select: { id: true, name: true } },
      issuedByActor: { select: { id: true, name: true, email: true } },
      acknowledgedByActor: { select: { id: true, name: true, email: true } }
    }
  }
} satisfies Prisma.LossEventInclude;

export type LossEventWithRelations = Prisma.LossEventGetPayload<{
  include: typeof LOSS_EVENT_INCLUDE;
}>;

export class LossEventRepository {
  constructor(private readonly prisma: PrismaOrTx) {}

  async create(data: CreateLossEventInput, client: PrismaOrTx = this.prisma): Promise<LossEventWithRelations> {
    return client.lossEvent.create({
      data: {
        lossNumber: data.lossNumber,
        sourceType: data.sourceType,
        sourceExceptionRecordId: data.sourceExceptionRecordId ?? null,
        sourceDiscrepancyId: data.sourceDiscrepancyId ?? null,
        sourceInspectionResultId: data.sourceInspectionResultId ?? null,
        materialId: data.materialId ?? null,
        productId: data.productId ?? null,
        uomId: data.uomId,
        locationId: data.locationId ?? null,
        departmentId: data.departmentId ?? null,
        quantity: new Prisma.Decimal(data.quantity),
        reason: data.reason,
        reportedByActorId: data.reportedByActorId,
        status: 'REPORTED'
      },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async findById(id: string, client: PrismaOrTx = this.prisma): Promise<LossEventWithRelations | null> {
    return client.lossEvent.findUnique({
      where: { id },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async findByLossNumber(lossNumber: string, client: PrismaOrTx = this.prisma): Promise<LossEventWithRelations | null> {
    return client.lossEvent.findUnique({
      where: { lossNumber },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async findBySourceExceptionRecordId(sourceExceptionRecordId: string, client: PrismaOrTx = this.prisma): Promise<LossEventWithRelations | null> {
    return client.lossEvent.findUnique({
      where: { sourceExceptionRecordId },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async findBySourceDiscrepancyId(sourceDiscrepancyId: string, client: PrismaOrTx = this.prisma): Promise<LossEventWithRelations | null> {
    return client.lossEvent.findUnique({
      where: { sourceDiscrepancyId },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async findBySourceInspectionResultId(sourceInspectionResultId: string, client: PrismaOrTx = this.prisma): Promise<LossEventWithRelations | null> {
    return client.lossEvent.findUnique({
      where: { sourceInspectionResultId },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async existsByNumber(lossNumber: string, client: PrismaOrTx = this.prisma): Promise<boolean> {
    const count = await client.lossEvent.count({ where: { lossNumber } });
    return count > 0;
  }

  async countByNumberPrefix(prefix: string, client: PrismaOrTx = this.prisma): Promise<number> {
    return client.lossEvent.count({
      where: {
        lossNumber: {
          startsWith: prefix
        }
      }
    });
  }

  async updateClassification(
    id: string,
    data: {
      appliedWastageRuleId: string;
      appliedWastageRuleVersion: number;
      varianceFromExpected: Prisma.Decimal | number;
      classification: LossClassification;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<LossEventWithRelations> {
    return client.lossEvent.update({
      where: { id },
      data: {
        appliedWastageRuleId: data.appliedWastageRuleId,
        appliedWastageRuleVersion: data.appliedWastageRuleVersion,
        varianceFromExpected: new Prisma.Decimal(data.varianceFromExpected),
        classification: data.classification
      },
      include: LOSS_EVENT_INCLUDE
    });
  }

  async updateStatusConditional(
    id: string,
    currentStatuses: LossEventStatus[],
    newStatus: LossEventStatus,
    extraData: Prisma.LossEventUncheckedUpdateManyInput = {},
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const result = await client.lossEvent.updateMany({
      where: {
        id,
        status: { in: currentStatuses }
      },
      data: {
        ...extraData,
        status: newStatus
      }
    });
    return result.count;
  }

  async list(params: ListLossEventsFilter, client: PrismaOrTx = this.prisma): Promise<{ items: LossEventWithRelations[]; total: number }> {
    const where: Prisma.LossEventWhereInput = {};

    if (params.sourceType) where.sourceType = params.sourceType;
    if (params.classification) where.classification = params.classification;
    if (params.status) where.status = params.status;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.materialId) where.materialId = params.materialId;
    if (params.productId) where.productId = params.productId;
    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { lossNumber: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
        { material: { name: { contains: q, mode: 'insensitive' } } },
        { material: { code: { contains: q, mode: 'insensitive' } } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { product: { sku: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (params.startDate || params.endDate) {
      where.reportedAt = {};
      if (params.startDate) where.reportedAt.gte = params.startDate;
      if (params.endDate) where.reportedAt.lte = params.endDate;
    }
    const [items, total] = await Promise.all([
      client.lossEvent.findMany({
        where,
        include: LOSS_EVENT_INCLUDE,
        orderBy: { reportedAt: 'desc' },
        skip: params.skip ?? 0,
        take: params.take ?? 50
      }),
      client.lossEvent.count({ where })
    ]);

    return { items, total };
  }

  async getAnalyticsData(
    filter: { departmentId?: string; locationId?: string; startDate?: Date; endDate?: Date },
    client: PrismaOrTx = this.prisma
  ): Promise<LossEventWithRelations[]> {
    const where: Prisma.LossEventWhereInput = {};
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.locationId) where.locationId = filter.locationId;
    if (filter.startDate || filter.endDate) {
      where.reportedAt = {};
      if (filter.startDate) where.reportedAt.gte = filter.startDate;
      if (filter.endDate) where.reportedAt.lte = filter.endDate;
    }

    return client.lossEvent.findMany({
      where,
      include: LOSS_EVENT_INCLUDE,
      orderBy: { reportedAt: 'desc' }
    });
  }
}
