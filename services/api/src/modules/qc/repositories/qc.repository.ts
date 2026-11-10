import { PrismaClient, Prisma, LifecycleStatus, QcCheckpointType, InspectionResultStatus, CorrectiveActionStatus, ExceptionRecordType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class QcRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  // ---------------------------------------------------------------------------
  // QC Rules
  // ---------------------------------------------------------------------------
  async findQcRuleById(id: string) {
    return this.prisma.qcRule.findUnique({
      where: { id }
    });
  }

  async findQcRuleByCode(code: string) {
    return this.prisma.qcRule.findUnique({
      where: { code }
    });
  }

  async findApprovedQcRuleForTarget(targetType: string, targetId?: string | null) {
    const nowWithBuffer = new Date(Date.now() + 5 * 60 * 1000); // 5 min clock skew buffer
    const whereClause: any = {
      targetType,
      status: LifecycleStatus.APPROVED,
      effectiveFrom: { lte: nowWithBuffer },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: new Date() } }
      ]
    };

    if (targetId !== undefined) {
      whereClause.targetId = targetId;
    }

    return this.prisma.qcRule.findFirst({
      where: whereClause,
      orderBy: { version: 'desc' }
    });
  }

  async listQcRules(filters?: { targetType?: string; status?: LifecycleStatus }) {
    return this.prisma.qcRule.findMany({
      where: {
        targetType: filters?.targetType,
        status: filters?.status
      },
      orderBy: [{ code: 'asc' }, { version: 'desc' }]
    });
  }

  async createQcRule(data: {
    code: string;
    name: string;
    description?: string | null;
    targetType: string;
    targetId?: string | null;
    parameters: Prisma.InputJsonValue;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }) {
    return this.prisma.qcRule.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        targetType: data.targetType,
        targetId: data.targetId,
        parameters: data.parameters,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        status: LifecycleStatus.DRAFT,
        version: 1
      }
    });
  }

  async approveQcRule(id: string) {
    return this.prisma.qcRule.update({
      where: { id },
      data: {
        status: LifecycleStatus.APPROVED
      }
    });
  }

  async linkRuleToRouteStep(routeStepId: string, ruleId: string) {
    return this.prisma.routeStep.update({
      where: { id: routeStepId },
      data: {
        qcRuleId: ruleId,
        isQcRequired: true
      }
    });
  }

  async updateQcRuleTarget(ruleId: string, targetType: string, targetId?: string | null) {
    return this.prisma.qcRule.update({
      where: { id: ruleId },
      data: {
        targetType,
        targetId: targetId ?? null
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Employee Validation
  // ---------------------------------------------------------------------------
  async findEmployeeById(id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      include: { department: true }
    });
  }

  // ---------------------------------------------------------------------------
  // Targets (Batch & GRN Line)
  // ---------------------------------------------------------------------------
  async findBatchById(id: string) {
    return this.prisma.departmentExecutionBatch.findUnique({
      where: { id },
      include: {
        department: true,
        workCenter: true,
        routeStep: {
          include: {
            qcRule: true
          }
        },
        productionPlan: {
          include: {
            product: {
              include: {
                routes: {
                  where: { status: LifecycleStatus.APPROVED },
                  include: {
                    steps: {
                      orderBy: { sequenceNumber: 'asc' },
                      include: {
                        qcRule: true,
                        department: true,
                        workCenter: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        inspectionResults: {
          orderBy: { createdAt: 'desc' },
          include: {
            inspector: true,
            qcRule: true,
            correctiveActions: {
              include: { assignedEmployee: true }
            },
            reinspections: true
          }
        },
        exceptionRecords: true
      }
    });
  }

  async findGrnLineById(id: string) {
    return this.prisma.goodsReceiptLine.findUnique({
      where: { id },
      include: {
        grn: {
          include: {
            location: true,
            receivedByActor: true
          }
        },
        product: {
          include: {
            routes: {
              where: { status: LifecycleStatus.APPROVED },
              include: {
                steps: {
                  include: { qcRule: true }
                }
              }
            }
          }
        },
        material: true,
        uom: true,
        inspectionResults: {
          orderBy: { createdAt: 'desc' },
          include: {
            inspector: true,
            qcRule: true,
            correctiveActions: {
              include: { assignedEmployee: true }
            },
            reinspections: true
          }
        }
      }
    });
  }

  async findRouteStepById(id: string) {
    return this.prisma.routeStep.findUnique({
      where: { id },
      include: { qcRule: true, department: true, workCenter: true }
    });
  }

  // ---------------------------------------------------------------------------
  // Sequential Inspection Number Generator
  // ---------------------------------------------------------------------------
  async generateNextInspectionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.inspectionResult.count();
    const seq = String(count + 1).padStart(5, '0');
    return `QC-INSP-${year}-${seq}`;
  }

  // ---------------------------------------------------------------------------
  // Inspection Results & Dispositions (Atomic Transaction)
  // ---------------------------------------------------------------------------
  async createInspectionWithDisposition(params: {
    inspectionNumber: string;
    checkpointType: QcCheckpointType;
    qcRuleId?: string | null;
    batchId?: string | null;
    grnLineId?: string | null;
    inspectorEmployeeId: string;
    sampledQuantity: number;
    defectiveQuantity: number;
    status: InspectionResultStatus;
    reason?: string | null;
    findings?: Prisma.InputJsonValue;
    evidenceAttachmentUrls: string[];
    isOverride?: boolean;
    overrideReason?: string | null;
    overrideByActorId?: string | null;
    reinspectionOfId?: string | null;
    // Rework disposition details
    correctiveActionDescription?: string | null;
    assignedEmployeeId?: string | null;
    targetReworkStageId?: string | null;
    // Reject/Scrap disposition details for batch
    exceptionType?: 'REJECTION' | 'SCRAP';
  }) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the Inspection Result
      const inspection = await tx.inspectionResult.create({
        data: {
          inspectionNumber: params.inspectionNumber,
          checkpointType: params.checkpointType,
          qcRuleId: params.qcRuleId,
          batchId: params.batchId,
          grnLineId: params.grnLineId,
          inspectorEmployeeId: params.inspectorEmployeeId,
          sampledQuantity: new Prisma.Decimal(params.sampledQuantity),
          defectiveQuantity: new Prisma.Decimal(params.defectiveQuantity),
          status: params.status,
          reason: params.reason,
          findings: params.findings,
          evidenceAttachmentUrls: params.evidenceAttachmentUrls,
          isOverride: params.isOverride ?? false,
          overrideReason: params.overrideReason,
          overrideByActorId: params.overrideByActorId,
          reinspectionOfId: params.reinspectionOfId
        },
        include: {
          inspector: true,
          qcRule: true
        }
      });

      // 2. If disposition is REWORK and corrective action is provided, create CorrectiveAction
      let correctiveAction = null;
      if (params.status === InspectionResultStatus.REWORK && params.correctiveActionDescription) {
        correctiveAction = await tx.correctiveAction.create({
          data: {
            inspectionResultId: inspection.id,
            actionDescription: params.correctiveActionDescription,
            assignedEmployeeId: params.assignedEmployeeId,
            targetReworkStageId: params.targetReworkStageId,
            status: CorrectiveActionStatus.OPEN
          },
          include: {
            assignedEmployee: true
          }
        });
      }

      // 3. If disposition is REJECT_SCRAP on a Batch, write real ExceptionRecord to Module 8
      if (params.status === InspectionResultStatus.REJECT_SCRAP && params.batchId) {
        const exceptionRecordType =
          params.exceptionType === 'SCRAP'
            ? ExceptionRecordType.SCRAP
            : ExceptionRecordType.REJECTION;

        await tx.exceptionRecord.create({
          data: {
            batchId: params.batchId,
            type: exceptionRecordType,
            quantity: new Prisma.Decimal(params.defectiveQuantity > 0 ? params.defectiveQuantity : params.sampledQuantity),
            reason: params.reason || 'QC Inspection Rejection / Scrap Disposition',
            employeeId: params.inspectorEmployeeId
          }
        });
      }

      return { inspection, correctiveAction };
    });
  }

  // ---------------------------------------------------------------------------
  // Corrective Actions
  // ---------------------------------------------------------------------------
  async findCorrectiveActionById(id: string) {
    return this.prisma.correctiveAction.findUnique({
      where: { id },
      include: {
        inspectionResult: {
          include: { inspector: true, batch: true, grnLine: true }
        },
        assignedEmployee: true
      }
    });
  }

  async createCorrectiveAction(data: {
    inspectionResultId: string;
    actionDescription: string;
    assignedEmployeeId?: string | null;
    targetReworkStageId?: string | null;
    status?: CorrectiveActionStatus;
  }) {
    return this.prisma.correctiveAction.create({
      data: {
        inspectionResultId: data.inspectionResultId,
        actionDescription: data.actionDescription,
        assignedEmployeeId: data.assignedEmployeeId,
        targetReworkStageId: data.targetReworkStageId,
        status: data.status ?? CorrectiveActionStatus.OPEN
      },
      include: {
        assignedEmployee: true
      }
    });
  }

  async updateCorrectiveAction(id: string, data: {
    status?: CorrectiveActionStatus;
    resolutionNotes?: string | null;
    assignedEmployeeId?: string | null;
  }) {
    return this.prisma.correctiveAction.update({
      where: { id },
      data: {
        status: data.status,
        resolutionNotes: data.resolutionNotes,
        assignedEmployeeId: data.assignedEmployeeId,
        resolvedAt: data.status === CorrectiveActionStatus.COMPLETED || data.status === CorrectiveActionStatus.VERIFIED
          ? new Date()
          : undefined
      },
      include: {
        assignedEmployee: true
      }
    });
  }

  // ---------------------------------------------------------------------------
  // History Lookups
  // ---------------------------------------------------------------------------
  async findInspectionById(id: string) {
    return this.prisma.inspectionResult.findUnique({
      where: { id },
      include: {
        inspector: true,
        qcRule: true,
        batch: {
          include: { department: true, productionPlan: { include: { product: true } } }
        },
        grnLine: {
          include: { grn: true, product: true, material: true, uom: true }
        },
        correctiveActions: {
          include: { assignedEmployee: true }
        },
        reinspections: {
          include: { inspector: true }
        },
        reinspectionOf: {
          include: { inspector: true }
        }
      }
    });
  }

  async getBatchQualityHistory(batchId: string) {
    return this.prisma.inspectionResult.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
      include: {
        inspector: true,
        qcRule: true,
        correctiveActions: {
          include: { assignedEmployee: true }
        },
        reinspections: {
          include: { inspector: true }
        },
        reinspectionOf: {
          include: { inspector: true }
        }
      }
    });
  }

  async getGrnLineQualityHistory(grnLineId: string) {
    return this.prisma.inspectionResult.findMany({
      where: { grnLineId },
      orderBy: { createdAt: 'desc' },
      include: {
        inspector: true,
        qcRule: true,
        correctiveActions: {
          include: { assignedEmployee: true }
        },
        reinspections: {
          include: { inspector: true }
        },
        reinspectionOf: {
          include: { inspector: true }
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Queue Queries
  // ---------------------------------------------------------------------------
  async listActiveBatchesForInspection(filters?: {
    departmentId?: string;
  }) {
    return this.prisma.departmentExecutionBatch.findMany({
      where: {
        departmentId: filters?.departmentId,
        status: {
          notIn: ['COMPLETE', 'COMPLETED', 'CANCELLED', 'REJECTED']
        }
      },
      include: {
        department: true,
        routeStep: {
          include: { qcRule: true }
        },
        productionPlan: {
          include: { product: true }
        },
        inspectionResults: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listPendingGrnLinesForInspection() {
    return this.prisma.goodsReceiptLine.findMany({
      include: {
        grn: {
          include: { location: true }
        },
        product: true,
        material: true,
        uom: true,
        inspectionResults: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
