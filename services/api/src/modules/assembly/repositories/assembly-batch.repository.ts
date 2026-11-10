import { PrismaClient, Prisma, AssemblyBatchStatus, AssemblyComponentType, ProgressEventType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export interface AssemblyBatchFilterOptions {
  productId?: string;
  productionPlanId?: string;
  status?: AssemblyBatchStatus;
  skip?: number;
  take?: number;
  assemblyDepartmentId?: string;
  employeeId?: string;
}

export class AssemblyBatchRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async createBatch(data: {
    batchNumber: string;
    productId: string;
    productVariantId?: string | null;
    productionPlanId?: string | null;
    bomVersionId: string;
    productRouteId?: string | null;
    targetOutputQuantity: number;
    plannedStartDate?: Date | null;
    notes?: string | null;
    createdByActorId: string;
  }) {
    return this.prisma.assemblyBatch.create({
      data: {
        batchNumber: data.batchNumber,
        productId: data.productId,
        productVariantId: data.productVariantId,
        productionPlanId: data.productionPlanId,
        bomVersionId: data.bomVersionId,
        productRouteId: data.productRouteId || null,
        targetOutputQuantity: new Prisma.Decimal(data.targetOutputQuantity),
        plannedStartDate: data.plannedStartDate,
        notes: data.notes,
        createdByActorId: data.createdByActorId,
        status: AssemblyBatchStatus.PLANNED
      },
      include: {
        product: true,
        productVariant: true,
        productionPlan: true,
        bomVersion: true,
        productRoute: true,
        createdByActor: {
          select: { id: true, email: true, name: true }
        }
      }
    });
  }

  async findBatchById(id: string) {
    return this.prisma.assemblyBatch.findUnique({
      where: { id },
      include: {
        product: true,
        productVariant: true,
        productionPlan: true,
        bomVersion: {
          include: {
            lines: {
              include: {
                material: true,
                componentProduct: true,
                uom: true
              }
            }
          }
        },
        productRoute: {
          include: {
            steps: {
              include: {
                qcRule: true
              }
            }
          }
        },
        components: {
          include: {
            bomLine: {
              include: {
                material: true,
                componentProduct: true,
                uom: true
              }
            },
            sourceBatch: {
              include: {
                department: true,
                workCenter: true,
                productionPlan: true
              }
            },
            materialIssueLine: {
              include: {
                material: true,
                componentProduct: true,
                uom: true,
                materialIssue: true
              }
            },
            uom: true
          }
        },
        workerAssignments: {
          include: {
            employee: true,
            assignedByActor: {
              select: { id: true, email: true, name: true }
            }
          },
          orderBy: { assignedAt: 'asc' }
        },
        progressEvents: {
          include: {
            employee: true
          },
          orderBy: { timestamp: 'asc' }
        },
        qcInspectionResult: true,
        fgReadyOutputs: {
          include: {
            packagingRecord: true,
            fgReceipt: {
              include: {
                location: true,
                receivedByActor: true
              }
            }
          }
        },
        createdByActor: {
          select: { id: true, email: true, name: true }
        },
        allocatedByActor: {
          select: { id: true, email: true, name: true }
        },
        completedByActor: {
          select: { id: true, email: true, name: true }
        }
      }
    });
  }

  async findBatchByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.assemblyBatch.findUnique({
      where: { idempotencyKey },
      include: {
        components: true,
        product: true
      }
    });
  }

  async listBatches(filters: AssemblyBatchFilterOptions) {
    const where: Prisma.AssemblyBatchWhereInput = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.productionPlanId) {
      where.productionPlanId = filters.productionPlanId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.assemblyDepartmentId) where.productionPlan = { route: { assemblyDepartmentId: filters.assemblyDepartmentId } };
    if (filters.employeeId) where.workerAssignments = { some: { employeeId: filters.employeeId } };

    const [items, total] = await Promise.all([
      this.prisma.assemblyBatch.findMany({
        where,
        include: {
          product: true,
          productVariant: true,
          productionPlan: true,
          bomVersion: true,
          components: {
            include: {
              bomLine: {
                include: {
                  material: true,
                  componentProduct: true,
                  uom: true
                }
              },
              sourceBatch: {
                include: {
                  department: true,
                  workCenter: true,
                  productionPlan: {
                    include: { product: true }
                  }
                }
              },
              materialIssueLine: {
                include: {
                  material: true,
                  componentProduct: true,
                  uom: true,
                  materialIssue: true
                }
              },
              uom: true
            }
          },
          workerAssignments: {
            include: { employee: true }
          },
          createdByActor: {
            select: { id: true, email: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip || 0,
        take: filters.take || 50
      }),
      this.prisma.assemblyBatch.count({ where })
    ]);

    return { items, total };
  }

  async countBatchesForProduct(productId: string) {
    return this.prisma.assemblyBatch.count({
      where: { productId }
    });
  }

  async allocateComponents(
    assemblyBatchId: string,
    allocatedByActorId: string,
    components: Array<{
      bomLineId?: string | null;
      componentType: AssemblyComponentType;
      sourceBatchId?: string | null;
      materialIssueLineId?: string | null;
      uomId: string;
      unitRatio: number;
      requiredQuantity: number;
    }>
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Delete existing components if any are in draft/allocated state
      await tx.assemblyBatchComponent.deleteMany({
        where: { assemblyBatchId }
      });

      // Create new component allocations
      for (const comp of components) {
        await tx.assemblyBatchComponent.create({
          data: {
            assemblyBatchId,
            bomLineId: comp.bomLineId,
            componentType: comp.componentType,
            sourceBatchId: comp.sourceBatchId,
            materialIssueLineId: comp.materialIssueLineId,
            uomId: comp.uomId,
            unitRatio: new Prisma.Decimal(comp.unitRatio),
            requiredQuantity: new Prisma.Decimal(comp.requiredQuantity),
            consumedQuantity: new Prisma.Decimal(0),
            scrapQuantity: new Prisma.Decimal(0)
          }
        });
      }

      // Update assembly batch status to ALLOCATED
      return tx.assemblyBatch.update({
        where: { id: assemblyBatchId },
        data: {
          status: AssemblyBatchStatus.ALLOCATED,
          allocatedByActorId
        },
        include: {
          product: true,
          productVariant: true,
          productionPlan: true,
          bomVersion: {
            include: {
              lines: {
                include: {
                  material: true,
                  componentProduct: true,
                  uom: true
                }
              }
            }
          },
          components: {
            include: {
              bomLine: {
                include: {
                  material: true,
                  componentProduct: true,
                  uom: true
                }
              },
              sourceBatch: {
                include: {
                  department: true,
                  workCenter: true,
                  productionPlan: {
                    include: { product: true }
                  }
                }
              },
              materialIssueLine: {
                include: {
                  material: true,
                  componentProduct: true,
                  uom: true,
                  materialIssue: true
                }
              },
              uom: true
            }
          }
        }
      });
    });
  }

  async startBatch(assemblyBatchId: string, actualStartDate: Date = new Date()) {
    return this.prisma.assemblyBatch.update({
      where: { id: assemblyBatchId },
      data: {
        status: AssemblyBatchStatus.IN_ASSEMBLY,
        actualStartDate
      }
    });
  }

  async assignWorker(data: {
    assemblyBatchId: string;
    employeeId: string;
    subtaskDescription?: string | null;
    assignedByActorId: string;
  }) {
    return this.prisma.assemblyWorkerAssignment.create({
      data: {
        assemblyBatchId: data.assemblyBatchId,
        employeeId: data.employeeId,
        subtaskDescription: data.subtaskDescription,
        assignedByActorId: data.assignedByActorId
      },
      include: {
        employee: true
      }
    });
  }

  async recordProgress(data: {
    assemblyBatchId: string;
    employeeId: string;
    eventType: ProgressEventType;
    quantityDelta: number;
    notes?: string | null;
  }) {
    return this.prisma.assemblyProgressEvent.create({
      data: {
        assemblyBatchId: data.assemblyBatchId,
        employeeId: data.employeeId,
        eventType: data.eventType,
        quantityDelta: new Prisma.Decimal(data.quantityDelta),
        notes: data.notes
      },
      include: {
        employee: true
      }
    });
  }

  async completeBatch(
    assemblyBatchId: string,
    completedByActorId: string,
    data: {
      actualOutputQuantity: number;
      scrapQuantity: number;
      idempotencyKey: string;
      notes?: string | null;
      componentConsumptions: Array<{
        componentId: string;
        consumedQuantity: number;
        scrapQuantity: number;
      }>;
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Update component consumptions and scrap
      for (const comp of data.componentConsumptions) {
        await tx.assemblyBatchComponent.update({
          where: { id: comp.componentId },
          data: {
            consumedQuantity: new Prisma.Decimal(comp.consumedQuantity),
            scrapQuantity: new Prisma.Decimal(comp.scrapQuantity)
          }
        });
      }

      // 2. Update assembly batch to QC_PENDING
      return tx.assemblyBatch.update({
        where: { id: assemblyBatchId },
        data: {
          status: AssemblyBatchStatus.QC_PENDING,
          actualOutputQuantity: new Prisma.Decimal(data.actualOutputQuantity),
          scrapQuantity: new Prisma.Decimal(data.scrapQuantity),
          completedAt: new Date(),
          completedByActorId,
          idempotencyKey: data.idempotencyKey,
          notes: data.notes
        },
        include: {
          components: true,
          product: true
        }
      });
    });
  }

  async updateStatus(
    assemblyBatchId: string,
    status: AssemblyBatchStatus,
    extraData?: {
      qcInspectionResultId?: string | null;
      reworkCountIncrement?: boolean;
    }
  ) {
    const data: Prisma.AssemblyBatchUpdateInput = {
      status
    };

    if (extraData?.qcInspectionResultId !== undefined) {
      data.qcInspectionResult = extraData.qcInspectionResultId
        ? { connect: { id: extraData.qcInspectionResultId } }
        : { disconnect: true };
    }

    if (extraData?.reworkCountIncrement) {
      data.reworkCount = { increment: 1 };
    }

    return this.prisma.assemblyBatch.update({
      where: { id: assemblyBatchId },
      data,
      include: {
        components: true,
        product: true,
        qcInspectionResult: true,
        fgReadyOutputs: {
          include: {
            packagingRecord: true,
            fgReceipt: {
              include: {
                location: true,
                receivedByActor: true
              }
            }
          }
        }
      }
    });
  }
}
