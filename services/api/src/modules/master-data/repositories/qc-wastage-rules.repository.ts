import { PrismaClient, Prisma, QcRule, WastageRule, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class QcWastageRulesRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  // ==========================================
  // QcRule Operations
  // ==========================================
  async findQcRuleById(id: string): Promise<QcRule | null> {
    return this.prisma.qcRule.findUnique({ where: { id } });
  }

  async findQcRuleByCode(code: string): Promise<QcRule | null> {
    return this.prisma.qcRule.findUnique({ where: { code } });
  }

  async listQcRules(params?: {
    targetType?: string;
    targetId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: QcRule[]; total: number }> {
    const where: Prisma.QcRuleWhereInput = {};
    if (params?.targetType) where.targetType = params.targetType;
    if (params?.targetId) where.targetId = params.targetId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.qcRule.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { effectiveFrom: 'desc' }
      }),
      this.prisma.qcRule.count({ where })
    ]);
    return { items, total };
  }

  async createQcRule(data: Prisma.QcRuleCreateInput): Promise<QcRule> {
    return this.prisma.qcRule.create({ data });
  }

  async updateQcRule(id: string, data: Prisma.QcRuleUpdateInput): Promise<QcRule> {
    return this.prisma.qcRule.update({ where: { id }, data });
  }

  async supersedeQcRule(oldId: string, newQcRuleData: Prisma.QcRuleCreateInput): Promise<{ oldRule: QcRule; newRule: QcRule }> {
    return this.prisma.$transaction(async (tx) => {
      const newRule = await tx.qcRule.create({ data: newQcRuleData });
      const oldRule = await tx.qcRule.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newRule.id,
          deactivatedAt: new Date()
        }
      });
      return { oldRule, newRule };
    });
  }

  async findEffectiveQcRule(targetType: string, targetId: string, date: Date): Promise<QcRule | null> {
    return this.prisma.qcRule.findFirst({
      where: {
        targetType,
        targetId,
        status: { in: ['APPROVED', 'ACTIVE'] },
        effectiveFrom: { lte: date },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: date } }
        ]
      },
      orderBy: { effectiveFrom: 'desc' }
    });
  }

  async countQcRuleActiveReferences(qcRuleId: string): Promise<number> {
    return this.prisma.routeStep.count({
      where: { qcRuleId, status: { in: ['APPROVED', 'ACTIVE'] } }
    });
  }

  // ==========================================
  // WastageRule Operations
  // ==========================================
  async findWastageRuleById(id: string): Promise<WastageRule | null> {
    return this.prisma.wastageRule.findUnique({
      where: { id },
      include: { material: true, workCenter: true }
    });
  }

  async findWastageRuleByCode(code: string): Promise<WastageRule | null> {
    return this.prisma.wastageRule.findUnique({ where: { code } });
  }

  async listWastageRules(params?: {
    materialId?: string;
    workCenterId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: WastageRule[]; total: number }> {
    const where: Prisma.WastageRuleWhereInput = {};
    if (params?.materialId) where.materialId = params.materialId;
    if (params?.workCenterId) where.workCenterId = params.workCenterId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.wastageRule.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { material: true, workCenter: true },
        orderBy: { effectiveFrom: 'desc' }
      }),
      this.prisma.wastageRule.count({ where })
    ]);
    return { items, total };
  }

  async createWastageRule(data: Prisma.WastageRuleCreateInput): Promise<WastageRule> {
    return this.prisma.wastageRule.create({ data });
  }

  async updateWastageRule(id: string, data: Prisma.WastageRuleUpdateInput): Promise<WastageRule> {
    return this.prisma.wastageRule.update({ where: { id }, data });
  }

  async supersedeWastageRule(oldId: string, newWastageRuleData: Prisma.WastageRuleCreateInput): Promise<{ oldRule: WastageRule; newRule: WastageRule }> {
    return this.prisma.$transaction(async (tx) => {
      const newRule = await tx.wastageRule.create({ data: newWastageRuleData });
      const oldRule = await tx.wastageRule.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newRule.id,
          deactivatedAt: new Date()
        }
      });
      return { oldRule, newRule };
    });
  }

  async findEffectiveWastageRule(materialId: string, workCenterId: string, date: Date): Promise<WastageRule | null> {
    return this.prisma.wastageRule.findFirst({
      where: {
        materialId,
        workCenterId,
        status: { in: ['APPROVED', 'ACTIVE'] },
        effectiveFrom: { lte: date },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: date } }
        ]
      },
      orderBy: { effectiveFrom: 'desc' }
    });
  }
}
