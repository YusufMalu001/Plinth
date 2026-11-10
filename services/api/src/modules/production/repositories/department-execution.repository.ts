import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

const BATCH_INCLUDE = {
  productionPlan: {
    select: {
      id: true,
      planNumber: true,
      status: true,
      productId: true,
      quantity: true,
      completedQuantity: true,
      partialQuantity: true,
      route: {
        include: {
          assemblyDepartment: { select: { id: true, code: true, name: true } },
          steps: {
            orderBy: [{ sequenceNumber: 'asc' as const }],
            include: { department: true, workCenter: true, nextDepartment: true }
          }
        }
      },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          uom: { select: { id: true, code: true, symbol: true, name: true } }
        }
      }
    }
  },
  materialIssue: {
    select: {
      id: true,
      issueNumber: true,
      quantity: true,
      issuedAt: true,
      reversedAt: true
    }
  },
  department: {
    select: {
      id: true,
      code: true,
      name: true
    }
  },
  workCenter: {
    select: {
      id: true,
      code: true,
      name: true
    }
  },
  routeStep: {
    select: {
      id: true,
      sequenceNumber: true,
      branchKey: true,
      stepOrder: true,
      parentStepId: true,
      parentStep: {
        select: {
          id: true,
          stepName: true,
          departmentId: true,
          department: { select: { id: true, code: true, name: true } },
          outputQuantityPerUnit: true
        }
      },
      departmentId: true,
      nextDepartmentId: true,
      nextDepartment: { select: { id: true, code: true, name: true } },
      outputItemType: true,
      outputItemId: true,
      outputUomId: true,
      outputQuantityPerUnit: true,
      stepName: true,
      standardDurationMinutes: true,
      isQcRequired: true
    }
  },
  workerAssignments: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { assignedAt: 'desc' as const }
  },
  progressEvents: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    },
    orderBy: { timestamp: 'desc' as const }
  },
  exceptionRecords: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          email: true
        }
      },
      LossEvent: {
        select: {
          id: true,
          lossNumber: true,
          status: true,
          quantity: true,
          reason: true,
          rejectionReason: true,
          replacementChallanRef: true,
          replacementChallan: {
            select: {
              id: true,
              challanNumber: true,
              quantity: true,
              issuedAt: true
            }
          }
        }
      }
    },
    orderBy: { timestamp: 'desc' as const }
  },
  outgoingHandovers: {
    include: {
      incomingDepartment: { select: { id: true, code: true, name: true } },
      createdBatch: { select: { id: true, batchNumber: true, status: true, departmentId: true } },
      assemblyIntake: { select: { id: true, itemType: true, itemId: true, uomId: true } }
    },
    orderBy: { proposedAt: 'desc' as const }
  },
  incomingHandovers: {
    include: {
      outgoingDepartment: { select: { id: true, code: true, name: true } },
      outgoingBatch: {
        select: {
          id: true,
          batchNumber: true,
          status: true,
          productionPlanId: true,
          outputItemId: true,
          outputItemType: true,
          outputUomId: true
        }
      }
    },
    orderBy: { proposedAt: 'desc' as const }
  },
  materialAssignments: {
    include: {
      bomLine: {
        include: {
          material: { select: { id: true, code: true, name: true, category: true } },
          componentProduct: { select: { id: true, sku: true, name: true } },
          uom: { select: { id: true, code: true, name: true, symbol: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  },
  sourceHandover: {
    include: {
      outgoingDepartment: { select: { id: true, code: true, name: true } }
    }
  }
};

export class DepartmentExecutionRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) { }
  private get db(): any { return this.prisma as any; }

  async createBatch(data: {
    batchNumber: string;
    productionPlanId: string;
    materialIssueId?: string | null;
    departmentId: string;
    workCenterId?: string | null;
    routeStepId?: string | null;
    stageSequenceNumber?: number;
    status?: any;
    received_qty?: number;
    pending_qty?: number;
    notes?: string | null;
    sourceHandoverId?: string | null;
    createdByActorId: string;
  }, tx?: any) {
    const client = tx || this.db;
    return client.departmentExecutionBatch.create({
      data: {
        batchNumber: data.batchNumber,
        productionPlanId: data.productionPlanId,
        materialIssueId: data.materialIssueId ?? null,
        departmentId: data.departmentId,
        workCenterId: data.workCenterId ?? null,
        routeStepId: data.routeStepId ?? null,
        stageSequenceNumber: data.stageSequenceNumber ?? 1,
        status: data.status ?? 'AWAITING_RECEIPT',
        received_qty: data.received_qty ?? 0,
        pending_qty: data.pending_qty ?? data.received_qty ?? 0,
        notes: data.notes ?? null,
        sourceHandoverId: data.sourceHandoverId ?? null,
        createdByActorId: data.createdByActorId
      },
      include: BATCH_INCLUDE
    });
  }

  async findBatchById(id: string, tx?: any) {
    const client = tx || this.db;
    return client.departmentExecutionBatch.findUnique({
      where: { id },
      include: BATCH_INCLUDE
    });
  }

  async findBatchByNumber(batchNumber: string, tx?: any) {
    const client = tx || this.db;
    return client.departmentExecutionBatch.findUnique({
      where: { batchNumber },
      include: BATCH_INCLUDE
    });
  }

  async findBatchesByPlanId(productionPlanId: string, tx?: any) {
    const client = tx || this.db;
    return client.departmentExecutionBatch.findMany({
      where: { productionPlanId },
      include: BATCH_INCLUDE,
      orderBy: { stageSequenceNumber: 'asc' }
    });
  }

  async listBatches(where: Record<string, unknown> = {}, skip = 0, take = 50) {
    return Promise.all([
      this.db.departmentExecutionBatch.findMany({
        where,
        include: BATCH_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take
      }),
      this.db.departmentExecutionBatch.count({ where })
    ]);
  }

  async listDepartmentQueue(departmentId: string, where: Record<string, unknown> = {}, skip = 0, take = 50) {
    const filter = { ...where, departmentId };
    return Promise.all([
      this.db.departmentExecutionBatch.findMany({
        where: filter,
        include: BATCH_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take
      }),
      this.db.departmentExecutionBatch.count({ where: filter })
    ]);
  }

  async updateBatch(id: string, data: Record<string, unknown>, tx?: any) {
    const client = tx || this.db;
    return client.departmentExecutionBatch.update({
      where: { id },
      data,
      include: BATCH_INCLUDE
    });
  }

  async createWorkerAssignment(data: {
    batchId: string;
    employeeId: string;
    subtaskDescription?: string | null;
    assignedByActorId: string;
  }, tx?: any) {
    const client = tx || this.db;
    return client.workerAssignment.create({
      data: {
        batchId: data.batchId,
        employeeId: data.employeeId,
        subtaskDescription: data.subtaskDescription ?? null,
        assignedByActorId: data.assignedByActorId
      },
      include: {
        employee: true
      }
    });
  }

  async createProgressEvent(data: {
    batchId: string;
    employeeId: string;
    eventType: any;
    quantityDelta?: number;
    notes?: string | null;
  }, tx?: any) {
    const client = tx || this.db;
    return client.progressEvent.create({
      data: {
        batchId: data.batchId,
        employeeId: data.employeeId,
        eventType: data.eventType,
        quantityDelta: data.quantityDelta ?? 0,
        notes: data.notes ?? null
      },
      include: {
        employee: true
      }
    });
  }

  async createExceptionRecord(data: {
    batchId: string;
    type: any;
    quantity: number;
    reason: string;
    employeeId: string;
  }, tx?: any) {
    const client = tx || this.db;
    return client.exceptionRecord.create({
      data: {
        batchId: data.batchId,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason,
        employeeId: data.employeeId
      },
      include: {
        employee: true
      }
    });
  }

  async createHandover(data: {
    outgoingBatchId: string;
    outgoingDepartmentId: string;
    incomingDepartmentId: string;
    quantity: number;
    status?: any;
    proposedByActorId: string;
    idempotencyKey: string;
    notes?: string | null;
  }, tx?: any) {
    const client = tx || this.db;
    return client.handover.create({
      data: {
        outgoingBatchId: data.outgoingBatchId,
        outgoingDepartmentId: data.outgoingDepartmentId,
        incomingDepartmentId: data.incomingDepartmentId,
        quantity: data.quantity,
        status: data.status ?? 'PROPOSED',
        proposedByActorId: data.proposedByActorId,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes ?? null
      },
      include: {
        outgoingBatch: true,
        outgoingDepartment: true,
        incomingDepartment: true
      }
    });
  }

  async findHandoverByIdempotencyKey(idempotencyKey: string, tx?: any) {
    const client = tx || this.db;
    return client.handover.findUnique({
      where: { idempotencyKey },
      include: {
        outgoingBatch: true,
        outgoingDepartment: true,
        incomingDepartment: true,
        createdBatch: true
      }
    });
  }

  async findHandoverById(id: string, tx?: any) {
    const client = tx || this.db;
    return client.handover.findUnique({
      where: { id },
      include: {
        outgoingBatch: true,
        outgoingDepartment: true,
        incomingDepartment: true,
        createdBatch: true
      }
    });
  }

  async updateHandover(id: string, data: Record<string, unknown>, tx?: any) {
    const client = tx || this.db;
    return client.handover.update({
      where: { id },
      data,
      include: {
        outgoingBatch: true,
        outgoingDepartment: true,
        incomingDepartment: true,
        createdBatch: true
      }
    });
  }
}
