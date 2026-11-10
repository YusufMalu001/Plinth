import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

const PLAN_INCLUDE = {
  product: { include: { uom: true, productFamily: true, category: true } },
  bomVersion: {
    include: {
      lines: {
        orderBy: { sequence: 'asc' as const },
        include: { material: true, componentProduct: true, uom: true }
      }
    }
  },
  route: { include: { steps: { orderBy: { sequenceNumber: 'asc' as const }, include: { department: true, workCenter: true } } } },
  owner: true,
  createdByActor: true,
  checkedByActor: true,
  submittedByActor: true,
  approvedByActor: true,
  releasedByActor: true,
  cancelledByActor: true,
  modifiedByActor: true,
  interruptedByActor: true,
  events: { orderBy: { createdAt: 'asc' as const } }
  ,requirements: { include: { requiredUom: true, inventoryUom: true, bomLine: true }, orderBy: { createdAt: 'asc' as const } }
  ,materialIssues: { orderBy: { issuedAt: 'asc' as const } }
  ,outputs: { orderBy: { recordedAt: 'asc' as const } }
};

export type ProductionPlanWithRelations = Record<string, unknown>;

export class ProductionPlanRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}
  private get db(): any { return this.prisma as any; } // eslint-disable-line @typescript-eslint/no-explicit-any
  findById(id: string) { return this.db.productionPlan.findUnique({ where: { id }, include: PLAN_INCLUDE }); }
  findExecutionBatchesByPlanId(productionPlanId: string) {
    return this.db.departmentExecutionBatch.findMany({
      where: { productionPlanId },
      orderBy: [{ stageSequenceNumber: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        routeStepId: true,
        stageSequenceNumber: true,
        status: true,
        received_qty: true,
        completed_qty: true,
        department: { select: { id: true, code: true, name: true } },
        routeStep: { select: { id: true, sequenceNumber: true, stepName: true } },
      },
    });
  }
  findByPlanNumber(planNumber: string) { return this.db.productionPlan.findUnique({ where: { planNumber }, include: PLAN_INCLUDE }); }
  list(where: Record<string, unknown>, skip?: number, take?: number) {
    return Promise.all([
      this.db.productionPlan.findMany({ where, include: PLAN_INCLUDE, orderBy: [{ scheduleDate: 'desc' }, { createdAt: 'desc' }], skip, take }),
      this.db.productionPlan.count({ where })
    ]).then(([items, total]: [unknown[], number]) => ({ items, total }));
  }
  async updateConditional(id: string, from: string[], data: Record<string, unknown>, transaction?: unknown) {
    const client = transaction ? transaction as any : this.db;
    const result = await client.productionPlan.updateMany({ where: { id, status: { in: from } }, data });
    return result.count;
  }
  create(data: Record<string, unknown>) { return this.db.productionPlan.create({ data, include: PLAN_INCLUDE }); }
  update(id: string, data: Record<string, unknown>) { return this.db.productionPlan.update({ where: { id }, data, include: PLAN_INCLUDE }); }
  createEvent(data: Record<string, unknown>, transaction?: unknown) { return (transaction ? transaction as any : this.db).productionPlanEvent.create({ data }); }
  hasDuplicate(scheduleDate: Date, productId: string, scheduleType: string, excludeId?: string) {
    return this.db.productionPlan.findFirst({ where: { scheduleDate, productId, scheduleType, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  }
}
