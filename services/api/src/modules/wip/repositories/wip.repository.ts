import { PrismaClient, Prisma, WipExceptionType, WipExceptionStatus, WipExceptionSeverity } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { WipBatchFilterOptions, WipExceptionFilterOptions } from '../wip.types';

export class WipRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findBatchById(id: string) {
    return this.prisma.departmentExecutionBatch.findUnique({
      where: { id },
      include: {
        productionPlan: {
          include: {
            product: true
          }
        },
        department: true,
        workCenter: true,
        routeStep: true,
        workerAssignments: {
          include: {
            employee: true
          },
          orderBy: { assignedAt: 'asc' }
        },
        progressEvents: {
          include: {
            employee: true
          },
          orderBy: { timestamp: 'asc' }
        },
        exceptionRecords: {
          include: {
            employee: true
          },
          orderBy: { timestamp: 'asc' }
        },
        sourceHandover: {
          include: {
            outgoingBatch: {
              include: {
                department: true
              }
            },
            outgoingDepartment: true
          }
        },
        outgoingHandovers: {
          include: {
            incomingDepartment: true,
            createdBatch: {
              include: {
                department: true
              }
            }
          },
          orderBy: { proposedAt: 'asc' }
        },
        reconciliationExceptions: {
          orderBy: { detectedAt: 'desc' }
        }
      }
    });
  }

  async findBatchByNumber(batchNumber: string) {
    return this.prisma.departmentExecutionBatch.findUnique({
      where: { batchNumber },
      include: {
        productionPlan: {
          include: {
            product: true
          }
        },
        department: true,
        workCenter: true,
        routeStep: true,
        workerAssignments: {
          include: {
            employee: true
          },
          orderBy: { assignedAt: 'asc' }
        },
        progressEvents: {
          include: {
            employee: true
          },
          orderBy: { timestamp: 'asc' }
        },
        exceptionRecords: {
          include: {
            employee: true
          },
          orderBy: { timestamp: 'asc' }
        },
        sourceHandover: {
          include: {
            outgoingBatch: {
              include: {
                department: true
              }
            },
            outgoingDepartment: true
          }
        },
        outgoingHandovers: {
          include: {
            incomingDepartment: true,
            createdBatch: {
              include: {
                department: true
              }
            }
          },
          orderBy: { proposedAt: 'asc' }
        }
      }
    });
  }

  async listBatches(options: WipBatchFilterOptions) {
    const {
      departmentId,
      productionPlanId,
      status,
      search,
      workCenterId,
      stageSequenceNumber,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = options;

    const where: Prisma.DepartmentExecutionBatchWhereInput = {};

    if (departmentId) {
      where.departmentId = departmentId;
    }
    if (productionPlanId) {
      where.productionPlanId = productionPlanId;
    }
    if (status) {
      where.status = status as any;
    }
    if (workCenterId) {
      where.workCenterId = workCenterId;
    }
    if (stageSequenceNumber !== undefined) {
      where.stageSequenceNumber = stageSequenceNumber;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    if (search) {
      where.OR = [
        { batchNumber: { contains: search, mode: 'insensitive' } },
        { productionPlan: { planNumber: { contains: search, mode: 'insensitive' } } },
        { productionPlan: { product: { name: { contains: search, mode: 'insensitive' } } } },
        { productionPlan: { product: { sku: { contains: search, mode: 'insensitive' } } } }
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.departmentExecutionBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          productionPlan: {
            include: {
              product: true
            }
          },
          department: true,
          workCenter: true,
          routeStep: true,
          _count: {
            select: {
              workerAssignments: true,
              progressEvents: true,
              exceptionRecords: true,
              outgoingHandovers: true
            }
          }
        }
      }),
      this.prisma.departmentExecutionBatch.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async getDepartmentQueue(departmentId: string, status?: string, page = 1, limit = 20) {
    const where: Prisma.DepartmentExecutionBatchWhereInput = {
      departmentId
    };

    if (status) {
      where.status = status as any;
    } else {
      // Default department queue: active / not completed / not handover accepted
      where.status = {
        in: ['AWAITING_RECEIPT', 'RECEIVED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'PARTIAL', 'REWORK', 'HANDOVER_PENDING']
      };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.departmentExecutionBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ stageSequenceNumber: 'asc' }, { createdAt: 'asc' }],
        include: {
          productionPlan: {
            include: {
              product: true
            }
          },
          department: true,
          workCenter: true,
          progressEvents: {
            orderBy: { timestamp: 'asc' }
          },
          _count: {
            select: {
              workerAssignments: true
            }
          }
        }
      }),
      this.prisma.departmentExecutionBatch.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async getAllBatchesForPlan(productionPlanId: string) {
    return this.prisma.departmentExecutionBatch.findMany({
      where: { productionPlanId },
      include: {
        department: true,
        workCenter: true,
        sourceHandover: {
          include: {
            outgoingBatch: {
              include: {
                department: true
              }
            },
            outgoingDepartment: true
          }
        },
        outgoingHandovers: {
          include: {
            incomingDepartment: true,
            createdBatch: {
              include: {
                department: true
              }
            }
          },
          orderBy: { proposedAt: 'asc' }
        },
        progressEvents: {
          orderBy: { timestamp: 'asc' }
        },
        exceptionRecords: {
          orderBy: { timestamp: 'asc' }
        }
      },
      orderBy: { stageSequenceNumber: 'asc' }
    });
  }

  async getOverviewData(departmentId?: string) {
    const batchWhere: Prisma.DepartmentExecutionBatchWhereInput = {};
    if (departmentId) {
      batchWhere.departmentId = departmentId;
    }

    const [batches, departments, openExceptionsCount] = await Promise.all([
      this.prisma.departmentExecutionBatch.findMany({
        where: batchWhere,
        select: {
          id: true,
          departmentId: true,
          status: true,
          received_qty: true,
          completed_qty: true,
          rejected_qty: true,
          scrap_qty: true,
          wastage_qty: true,
          pending_qty: true
        }
      }),
      this.prisma.department.findMany({
        where: departmentId ? { id: departmentId } : {},
        select: {
          id: true,
          code: true,
          name: true
        }
      }),
      this.prisma.wipReconciliationException.count({
        where: {
          status: { in: ['OPEN', 'INVESTIGATING'] },
          ...(departmentId ? { departmentId } : {})
        }
      })
    ]);

    return { batches, departments, openExceptionsCount };
  }

  // Reconciliation Exceptions

  async findExistingException(batchId: string, exceptionType: WipExceptionType, status?: WipExceptionStatus) {
    return this.prisma.wipReconciliationException.findFirst({
      where: {
        batchId,
        exceptionType,
        ...(status ? { status } : { status: { in: ['OPEN', 'INVESTIGATING'] } })
      }
    });
  }

  async createException(data: {
    batchId: string;
    productionPlanId?: string | null;
    departmentId?: string | null;
    exceptionType: WipExceptionType;
    severity?: WipExceptionSeverity;
    description: string;
    details?: any;
    status?: WipExceptionStatus;
  }) {
    return this.prisma.wipReconciliationException.create({
      data: {
        batchId: data.batchId,
        productionPlanId: data.productionPlanId,
        departmentId: data.departmentId,
        exceptionType: data.exceptionType,
        severity: data.severity || 'HIGH',
        description: data.description,
        details: data.details ? data.details : undefined,
        status: data.status || 'OPEN'
      },
      include: {
        batch: {
          include: {
            department: true,
            productionPlan: true
          }
        }
      }
    });
  }

  async listExceptions(options: WipExceptionFilterOptions) {
    const {
      batchId,
      departmentId,
      productionPlanId,
      exceptionType,
      severity,
      status,
      page = 1,
      limit = 20
    } = options;

    const where: Prisma.WipReconciliationExceptionWhereInput = {};

    if (batchId) where.batchId = batchId;
    if (departmentId) where.departmentId = departmentId;
    if (productionPlanId) where.productionPlanId = productionPlanId;
    if (exceptionType) where.exceptionType = exceptionType;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.wipReconciliationException.findMany({
        where,
        skip,
        take: limit,
        orderBy: { detectedAt: 'desc' },
        include: {
          batch: {
            include: {
              department: true,
              productionPlan: true
            }
          }
        }
      }),
      this.prisma.wipReconciliationException.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async findExceptionById(id: string) {
    return this.prisma.wipReconciliationException.findUnique({
      where: { id },
      include: {
        batch: {
          include: {
            department: true,
            productionPlan: {
              include: {
                product: true
              }
            },
            progressEvents: true,
            outgoingHandovers: true
          }
        }
      }
    });
  }

  async updateException(
    id: string,
    data: Prisma.WipReconciliationExceptionUpdateInput
  ) {
    return this.prisma.wipReconciliationException.update({
      where: { id },
      data,
      include: {
        batch: {
          include: {
            department: true,
            productionPlan: true
          }
        }
      }
    });
  }
}
