import { AuditWriter, InspectionResultDto, CorrectiveActionDto, QcQueueItemDto, InspectionResultStatus, CorrectiveActionStatus } from '@plinth/types';
import { QcCheckpointType, Prisma, LifecycleStatus } from '@prisma/client';
import { DbAuditWriter } from '../../../common/audit/db-audit-writer';
import { QcRepository } from '../repositories/qc.repository';
import { QcCheckpointResolver } from './qc-checkpoint-resolver';
import {
  RecordInspectionInput,
  ReinspectInput,
  CreateCorrectiveActionInput,
  UpdateCorrectiveActionInput,
  CreateQcRuleInput,
  QcOverrideInput,
  QcReasonRequiredError,
  QcValidationError,
  NotFoundError
} from '../qc.types';

interface InspectionResultEntity {
  id: string;
  inspectionNumber: string;
  checkpointType: QcCheckpointType;
  qcRuleId?: string | null;
  qcRule?: {
    id: string;
    code: string;
    name: string;
    version: number;
    status: LifecycleStatus;
    parameters: Prisma.JsonValue;
  } | null;
  batchId?: string | null;
  batch?: { batchNumber: string } | null;
  grnLineId?: string | null;
  grnLine?: { grn?: { grnNumber: string } | null } | null;
  inspectorEmployeeId: string;
  inspector?: { firstName: string; lastName: string; employeeCode?: string | null } | null;
  sampledQuantity: Prisma.Decimal | number;
  defectiveQuantity: Prisma.Decimal | number;
  status: string;
  reason?: string | null;
  findings?: Prisma.JsonValue;
  evidenceAttachmentUrls: string[];
  isOverride: boolean;
  overrideReason?: string | null;
  overrideByActorId?: string | null;
  reinspectionOfId?: string | null;
  correctiveActions?: CorrectiveActionEntity[];
  createdAt: Date;
  updatedAt: Date;
}

interface CorrectiveActionEntity {
  id: string;
  inspectionResultId: string;
  actionDescription: string;
  assignedEmployeeId?: string | null;
  assignedEmployee?: { firstName: string; lastName: string } | null;
  targetReworkStageId?: string | null;
  status: string;
  resolutionNotes?: string | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class QcService {
  constructor(
    private readonly repository: QcRepository = new QcRepository(),
    private readonly resolver: QcCheckpointResolver = new QcCheckpointResolver(),
    private readonly auditWriter: AuditWriter = new DbAuditWriter()
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Inspection Queue
  // ---------------------------------------------------------------------------
  async getInspectionQueue(filters?: {
    checkpointType?: QcCheckpointType;
    targetType?: 'BATCH' | 'GRN_LINE' | 'ALL';
    departmentId?: string;
    requiresInspectionOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: QcQueueItemDto[]; total: number }> {
    const queueItems: QcQueueItemDto[] = [];
    const includeBatches = !filters?.targetType || filters.targetType === 'ALL' || filters.targetType === 'BATCH';
    const includeGrn = (!filters?.targetType || filters.targetType === 'ALL' || filters.targetType === 'GRN_LINE') && !filters?.departmentId;

    if (includeBatches) {
      const batches = await this.repository.listActiveBatchesForInspection({
        departmentId: filters?.departmentId
      });

      for (const b of batches) {
        const fallbackRule = await this.findApplicableApprovedRuleForBatch(b);
        if (fallbackRule) {
          (b as any).fallbackQcRule = fallbackRule;
          if (b.routeStep && !b.routeStep.qcRule) {
            b.routeStep.qcRule = fallbackRule;
          }
        }
        const checkpoints = this.resolver.resolveBatchCheckpoints(b);
        for (const cp of checkpoints) {
          if (filters?.checkpointType && cp.checkpointType !== filters.checkpointType) {
            continue;
          }

          const hasPassed = cp.latestInspection?.status === 'PASS';
          if (filters?.requiresInspectionOnly && hasPassed) {
            continue;
          }

          queueItems.push({
            targetType: 'BATCH',
            targetId: b.id,
            referenceNumber: b.batchNumber,
            checkpointType: cp.checkpointType,
            itemDescription: b.productionPlan?.product?.name || `Batch ${b.batchNumber}`,
            quantity: Number(b.received_qty) > 0 ? Number(b.received_qty) : 1,
            unitOfMeasure: 'PCS',
            departmentId: b.departmentId,
            departmentName: b.department?.name,
            qcRuleId: cp.qcRuleId,
            qcRuleCode: cp.qcRuleCode,
            qcRuleName: cp.qcRuleName,
            hasApprovedCriteria: cp.hasApprovedCriteria,
            missingCriteriaReason: cp.missingCriteriaReason,
            latestInspectionStatus: (cp.latestInspection?.status as InspectionResultStatus) || null,
            latestInspectionId: cp.latestInspection?.id || null,
            requiresInspection: !hasPassed,
            canInspect: cp.hasApprovedCriteria,
            createdAt: b.createdAt.toISOString()
          });
        }
      }
    }

    if (includeGrn) {
      const grnLines = await this.repository.listPendingGrnLinesForInspection();
      for (const g of grnLines) {
        const checkpoints = this.resolver.resolveGrnLineCheckpoints(g);
        for (const cp of checkpoints) {
          if (filters?.checkpointType && cp.checkpointType !== filters.checkpointType) {
            continue;
          }

          const hasPassed = cp.latestInspection?.status === 'PASS';
          if (filters?.requiresInspectionOnly && hasPassed) {
            continue;
          }

          const grnEntity = g.grn;
          const productEntity = g.product;
          const materialEntity = g.material;
          const uomEntity = g.uom;

          queueItems.push({
            targetType: 'GRN_LINE',
            targetId: g.id,
            referenceNumber: grnEntity?.grnNumber || g.id,
            checkpointType: cp.checkpointType,
            itemDescription: productEntity?.name || materialEntity?.name || 'Incoming Material Item',
            quantity: g.receivedQuantity,
            unitOfMeasure: uomEntity?.name,
            departmentId: null,
            departmentName: grnEntity?.location?.name || 'Receiving Dock',
            qcRuleId: cp.qcRuleId,
            qcRuleCode: cp.qcRuleCode,
            qcRuleName: cp.qcRuleName,
            hasApprovedCriteria: cp.hasApprovedCriteria,
            missingCriteriaReason: cp.missingCriteriaReason,
            latestInspectionStatus: (cp.latestInspection?.status as InspectionResultStatus) || null,
            latestInspectionId: cp.latestInspection?.id || null,
            requiresInspection: !hasPassed,
            canInspect: cp.hasApprovedCriteria,
            createdAt: g.createdAt.toISOString()
          });
        }
      }
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginatedItems = queueItems.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total: queueItems.length
    };
  }

  // Helper: Find applicable approved QC rule for a production batch (RouteStep -> Department -> OutputItem -> Product -> Global)
  async findApplicableApprovedRuleForBatch(batch: any): Promise<any> {
    if (!batch) return null;
    // 1. If batch already has routeStep with approved qcRule, use it
    if (batch.routeStep?.qcRule && batch.routeStep.qcRule.status === LifecycleStatus.APPROVED) {
      return batch.routeStep.qcRule;
    }

    // 2. Check if route step has a qcRuleId linked
    if (batch.routeStep?.qcRuleId) {
      const stepRule = await this.repository.findQcRuleById(batch.routeStep.qcRuleId);
      if (stepRule && stepRule.status === LifecycleStatus.APPROVED) {
        return stepRule;
      }
    }

    // 3. Check if batch.departmentId has an approved QC rule
    if (batch.departmentId) {
      const deptRule = await this.repository.findApprovedQcRuleForTarget('DEPARTMENT', batch.departmentId);
      if (deptRule) return deptRule;
    }

    // 4. Check if batch.outputItemId has an approved QC rule (PRODUCT or MATERIAL)
    if (batch.outputItemId) {
      const outputProdRule = await this.repository.findApprovedQcRuleForTarget('PRODUCT', batch.outputItemId);
      if (outputProdRule) return outputProdRule;

      const outputMatRule = await this.repository.findApprovedQcRuleForTarget('MATERIAL', batch.outputItemId);
      if (outputMatRule) return outputMatRule;
    }

    // 5. Check if batch.productionPlan has a productId with an approved QC rule
    const productId = batch.productionPlan?.productId || batch.productionPlan?.product?.id;
    if (productId) {
      const prodRule = await this.repository.findApprovedQcRuleForTarget('PRODUCT', productId);
      if (prodRule) return prodRule;
    }

    // 6. Check general department rule (targetType === 'DEPARTMENT' with targetId null)
    const generalDeptRule = await this.repository.findApprovedQcRuleForTarget('DEPARTMENT', null);
    if (generalDeptRule) return generalDeptRule;

    // 7. Check general product rule (targetType === 'PRODUCT' with targetId null)
    const generalProdRule = await this.repository.findApprovedQcRuleForTarget('PRODUCT', null);
    if (generalProdRule) return generalProdRule;

    // 8. Check if universal global QC rule exists
    const globalRule = await this.repository.findApprovedQcRuleForTarget('GLOBAL', null);
    if (globalRule) return globalRule;

    return null;
  }

  // ---------------------------------------------------------------------------
  // 2. Checkpoint Resolution
  // ---------------------------------------------------------------------------
  async resolveCheckpoints(targetType: 'BATCH' | 'GRN_LINE', targetId: string) {
    if (targetType === 'BATCH') {
      const batch = await this.repository.findBatchById(targetId);
      if (!batch) {
        throw new NotFoundError(`Batch with id '${targetId}' not found`);
      }

      const fallbackRule = await this.findApplicableApprovedRuleForBatch(batch);
      if (fallbackRule) {
        (batch as any).fallbackQcRule = fallbackRule;
        if (batch.routeStep && !batch.routeStep.qcRule) {
          batch.routeStep.qcRule = fallbackRule;
        }
      }

      return {
        targetType,
        targetId: batch.id,
        referenceNumber: batch.batchNumber,
        checkpoints: this.resolver.resolveBatchCheckpoints(batch)
      };
    } else {
      const grnLine = await this.repository.findGrnLineById(targetId);
      if (!grnLine) {
        throw new NotFoundError(`Goods receipt line with id '${targetId}' not found`);
      }
      return {
        targetType,
        targetId: grnLine.id,
        referenceNumber: grnLine.grn?.grnNumber || grnLine.id,
        checkpoints: this.resolver.resolveGrnLineCheckpoints(grnLine)
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Record Inspection Result
  // ---------------------------------------------------------------------------
  async recordInspection(input: RecordInspectionInput, actorId: string): Promise<InspectionResultDto> {
    // 1. Inspector Employee Validation (Strict Foreign Key)
    const inspector = await this.repository.findEmployeeById(input.inspectorEmployeeId);
    if (!inspector) {
      throw new NotFoundError(`Inspector employee with ID '${input.inspectorEmployeeId}' does not exist`);
    }

    // 2. Target Validation
    let batch = null;
    let grnLine = null;
    if (input.targetType === 'BATCH') {
      batch = await this.repository.findBatchById(input.targetId);
      if (!batch) {
        throw new NotFoundError(`Target batch '${input.targetId}' not found`);
      }
    } else {
      grnLine = await this.repository.findGrnLineById(input.targetId);
      if (!grnLine) {
        throw new NotFoundError(`Target goods receipt line '${input.targetId}' not found`);
      }
    }

    // 3. QC Rule & V-009 Criteria Gate Enforcement
    let resolvedQcRule = null;
    if (input.qcRuleId) {
      resolvedQcRule = await this.repository.findQcRuleById(input.qcRuleId);
    } else if (batch?.routeStep?.qcRule) {
      resolvedQcRule = batch.routeStep.qcRule;
    } else if (batch) {
      resolvedQcRule = await this.findApplicableApprovedRuleForBatch(batch);
    } else {
      // Look up approved rule for product/material
      const targetEntityId = grnLine?.productId || grnLine?.materialId;
      if (targetEntityId) {
        resolvedQcRule = await this.repository.findApprovedQcRuleForTarget('PRODUCT', targetEntityId);
      }
      if (!resolvedQcRule) {
        resolvedQcRule = await this.repository.findApprovedQcRuleForTarget('GLOBAL', null);
      }
    }

    // Hard-block if criteria are not approved (V-009 Gate)
    this.resolver.assertCriteriaApproved(input.checkpointType, resolvedQcRule);

    // 4. Invariant: Reason is strictly required for any non-PASS result
    if (input.status !== 'PASS') {
      if (!input.reason || input.reason.trim().length === 0) {
        throw new QcReasonRequiredError(
          `A non-empty reason is strictly required when recording an inspection with result '${input.status}'`
        );
      }
    }

    // 5. Quantity Invariants
    if (input.sampledQuantity <= 0) {
      throw new QcValidationError('Sampled quantity must be greater than 0');
    }
    if (input.defectiveQuantity > input.sampledQuantity) {
      throw new QcValidationError('Defective quantity cannot exceed sampled quantity');
    }

    // 6. Disposition specifics
    if (input.status === 'REWORK') {
      if (!input.correctiveActionDescription || input.correctiveActionDescription.trim().length === 0) {
        throw new QcValidationError('A corrective action description is required for REWORK disposition');
      }
      if (input.targetReworkStageId) {
        const reworkStep = await this.repository.findRouteStepById(input.targetReworkStageId);
        if (!reworkStep) {
          throw new NotFoundError(`Target rework stage '${input.targetReworkStageId}' does not exist`);
        }
      }
    }

    // 7. Generate Sequential Inspection Number & Create
    const inspectionNumber = await this.repository.generateNextInspectionNumber();
    const { inspection, correctiveAction } = await this.repository.createInspectionWithDisposition({
      inspectionNumber,
      checkpointType: input.checkpointType,
      qcRuleId: resolvedQcRule!.id,
      batchId: input.targetType === 'BATCH' ? input.targetId : null,
      grnLineId: input.targetType === 'GRN_LINE' ? input.targetId : null,
      inspectorEmployeeId: input.inspectorEmployeeId,
      sampledQuantity: input.sampledQuantity,
      defectiveQuantity: input.defectiveQuantity,
      status: input.status,
      reason: input.reason,
      findings: input.findings as Prisma.InputJsonValue,
      evidenceAttachmentUrls: input.evidenceAttachmentUrls || [],
      correctiveActionDescription: input.correctiveActionDescription,
      assignedEmployeeId: input.assignedEmployeeId,
      targetReworkStageId: input.targetReworkStageId,
      exceptionType: input.exceptionType
    });

    // 8. Audit Log
    await this.auditWriter.record({
      actorId,
      action: 'RECORD_INSPECTION',
      entityType: 'QualityInspection',
      entityId: inspection.id,
      after: {
        inspectionNumber,
        checkpointType: input.checkpointType,
        status: input.status,
        targetType: input.targetType,
        targetId: input.targetId,
        sampledQuantity: input.sampledQuantity,
        defectiveQuantity: input.defectiveQuantity,
        inspectorEmployeeId: input.inspectorEmployeeId
      },
      requestId: `req-${Date.now()}`
    });

    return this.mapToInspectionDto(inspection as unknown as InspectionResultEntity, correctiveAction ? [correctiveAction as unknown as CorrectiveActionEntity] : []);
  }

  // ---------------------------------------------------------------------------
  // 4. Record Re-Inspection
  // ---------------------------------------------------------------------------
  async recordReinspection(input: ReinspectInput, actorId: string): Promise<InspectionResultDto> {
    const originalInspection = await this.repository.findInspectionById(input.inspectionResultId);
    if (!originalInspection) {
      throw new NotFoundError(`Original inspection result '${input.inspectionResultId}' not found`);
    }

    const inspector = await this.repository.findEmployeeById(input.inspectorEmployeeId);
    if (!inspector) {
      throw new NotFoundError(`Inspector employee '${input.inspectorEmployeeId}' does not exist`);
    }

    if (input.status !== 'PASS' && (!input.reason || input.reason.trim().length === 0)) {
      throw new QcReasonRequiredError('Reason is required for non-PASS re-inspection results');
    }

    const inspectionNumber = await this.repository.generateNextInspectionNumber();
    const { inspection } = await this.repository.createInspectionWithDisposition({
      inspectionNumber,
      checkpointType: originalInspection.checkpointType,
      qcRuleId: originalInspection.qcRuleId,
      batchId: originalInspection.batchId,
      grnLineId: originalInspection.grnLineId,
      inspectorEmployeeId: input.inspectorEmployeeId,
      sampledQuantity: input.sampledQuantity,
      defectiveQuantity: input.defectiveQuantity,
      status: input.status,
      reason: input.reason,
      findings: input.findings as Prisma.InputJsonValue,
      evidenceAttachmentUrls: input.evidenceAttachmentUrls || [],
      reinspectionOfId: originalInspection.id
    });

    await this.auditWriter.record({
      actorId,
      action: 'RECORD_REINSPECTION',
      entityType: 'QualityInspection',
      entityId: inspection.id,
      after: {
        inspectionNumber,
        reinspectionOfId: originalInspection.id,
        status: input.status,
        inspectorEmployeeId: input.inspectorEmployeeId
      },
      requestId: `req-${Date.now()}`
    });

    return this.mapToInspectionDto(inspection as unknown as InspectionResultEntity);
  }

  // ---------------------------------------------------------------------------
  // 5. Corrective Actions
  // ---------------------------------------------------------------------------
  async createCorrectiveAction(input: CreateCorrectiveActionInput, actorId: string): Promise<CorrectiveActionDto> {
    const inspection = await this.repository.findInspectionById(input.inspectionResultId);
    if (!inspection) {
      throw new NotFoundError(`Inspection result '${input.inspectionResultId}' not found`);
    }

    if (input.assignedEmployeeId) {
      const emp = await this.repository.findEmployeeById(input.assignedEmployeeId);
      if (!emp) {
        throw new NotFoundError(`Assigned employee '${input.assignedEmployeeId}' not found`);
      }
    }

    const ca = await this.repository.createCorrectiveAction(input);

    await this.auditWriter.record({
      actorId,
      action: 'CREATE_CORRECTIVE_ACTION',
      entityType: 'QualityInspection',
      entityId: ca.id,
      after: ca,
      requestId: `req-${Date.now()}`
    });

    return this.mapToCorrectiveActionDto(ca as unknown as CorrectiveActionEntity);
  }

  async updateCorrectiveAction(input: UpdateCorrectiveActionInput, actorId: string): Promise<CorrectiveActionDto> {
    const existing = await this.repository.findCorrectiveActionById(input.actionId);
    if (!existing) {
      throw new NotFoundError(`Corrective action '${input.actionId}' not found`);
    }

    if (input.assignedEmployeeId) {
      const emp = await this.repository.findEmployeeById(input.assignedEmployeeId);
      if (!emp) {
        throw new NotFoundError(`Assigned employee '${input.assignedEmployeeId}' not found`);
      }
    }

    const updated = await this.repository.updateCorrectiveAction(input.actionId, {
      status: input.status,
      resolutionNotes: input.resolutionNotes,
      assignedEmployeeId: input.assignedEmployeeId
    });

    await this.auditWriter.record({
      actorId,
      action: 'UPDATE_CORRECTIVE_ACTION',
      entityType: 'QualityInspection',
      entityId: updated.id,
      before: existing,
      after: updated,
      requestId: `req-${Date.now()}`
    });

    return this.mapToCorrectiveActionDto(updated as unknown as CorrectiveActionEntity);
  }

  // ---------------------------------------------------------------------------
  // 6. Quality History
  // ---------------------------------------------------------------------------
  async getBatchQualityHistory(batchId: string): Promise<InspectionResultDto[]> {
    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundError(`Batch '${batchId}' not found`);
    }
    const results = await this.repository.getBatchQualityHistory(batchId);
    return results.map(r => this.mapToInspectionDto(r as unknown as InspectionResultEntity, r.correctiveActions as unknown as CorrectiveActionEntity[]));
  }

  async getGrnLineQualityHistory(grnLineId: string): Promise<InspectionResultDto[]> {
    const grnLine = await this.repository.findGrnLineById(grnLineId);
    if (!grnLine) {
      throw new NotFoundError(`GRN line '${grnLineId}' not found`);
    }
    const results = await this.repository.getGrnLineQualityHistory(grnLineId);
    return results.map(r => this.mapToInspectionDto(r as unknown as InspectionResultEntity, r.correctiveActions as unknown as CorrectiveActionEntity[]));
  }

  // ---------------------------------------------------------------------------
  // 7. QC Rule Criteria Management
  // ---------------------------------------------------------------------------
  async createQcRule(input: CreateQcRuleInput, actorId: string) {
    const existing = await this.repository.findQcRuleByCode(input.code);
    if (existing) {
      throw new QcValidationError(`QC Rule with code '${input.code}' already exists`);
    }

    const rule = await this.repository.createQcRule({
      code: input.code,
      name: input.name,
      description: input.description,
      targetType: input.targetType,
      targetId: input.targetId,
      parameters: input.parameters as Prisma.InputJsonValue,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo
    });

    await this.auditWriter.record({
      actorId,
      action: 'CREATE_QC_RULE',
      entityType: 'QualityInspection',
      entityId: rule.id,
      after: rule,
      requestId: `req-${Date.now()}`
    });

    return rule;
  }

  async approveQcRule(id: string, actorId: string) {
    const rule = await this.repository.findQcRuleById(id);
    if (!rule) {
      throw new NotFoundError(`QC Rule with id '${id}' not found`);
    }

    const approved = await this.repository.approveQcRule(id);

    await this.auditWriter.record({
      actorId,
      action: 'APPROVE_QC_RULE',
      entityType: 'QualityInspection',
      entityId: approved.id,
      before: rule,
      after: approved,
      requestId: `req-${Date.now()}`
    });

    return approved;
  }

  async linkRuleToBatch(batchId: string, qcRuleId: string, actorId: string) {
    const rule = await this.repository.findQcRuleById(qcRuleId);
    if (!rule) {
      throw new NotFoundError(`QC Rule with id '${qcRuleId}' not found`);
    }

    const batch = await this.repository.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundError(`Batch with id '${batchId}' not found`);
    }

    if (batch.routeStepId) {
      await this.repository.linkRuleToRouteStep(batch.routeStepId, rule.id);
    } else {
      await this.repository.updateQcRuleTarget(rule.id, 'DEPARTMENT', batch.departmentId);
    }

    await this.auditWriter.record({
      actorId,
      action: 'LINK_QC_RULE_TO_BATCH',
      entityType: 'QualityInspection',
      entityId: rule.id,
      after: { batchId, routeStepId: batch.routeStepId, ruleId: rule.id },
      requestId: `req-${Date.now()}`
    });

    return {
      success: true,
      batchId,
      qcRuleId: rule.id,
      qcRuleName: rule.name
    };
  }

  async listQcRules(filters?: { targetType?: string; status?: LifecycleStatus }) {
    return this.repository.listQcRules(filters);
  }

  async getQcRuleById(id: string) {
    const rule = await this.repository.findQcRuleById(id);
    if (!rule) {
      throw new NotFoundError(`QC Rule with id '${id}' not found`);
    }
    return rule;
  }

  // ---------------------------------------------------------------------------
  // 8. Mandatory Gate Override (Distinct Audited Action)
  // ---------------------------------------------------------------------------
  async recordOverride(input: QcOverrideInput): Promise<InspectionResultDto> {
    if (!input.overrideReason || input.overrideReason.trim().length < 5) {
      throw new QcValidationError('A detailed override reason (min 5 characters) is required to bypass a mandatory QC gate');
    }

    let batch = null;
    let grnLine = null;
    let fallbackInspectorId: string | null = null;

    if (input.targetType === 'BATCH') {
      batch = await this.repository.findBatchById(input.targetId);
      if (!batch) {
        throw new NotFoundError(`Target batch '${input.targetId}' not found`);
      }
    } else {
      grnLine = await this.repository.findGrnLineById(input.targetId);
      if (!grnLine) {
        throw new NotFoundError(`Target GRN line '${input.targetId}' not found`);
      }
    }

    // Resolve an inspector employee reference for the override record
    const employee = await this.repository.findEmployeeById(input.actorId);
    if (employee) {
      fallbackInspectorId = employee.id;
    }

    // If still null, query first employee in database
    if (!fallbackInspectorId) {
      const firstEmp = await this.repository.findEmployeeById('emp-default');
      fallbackInspectorId = firstEmp?.id || 'emp-system';
    }

    const inspectionNumber = await this.repository.generateNextInspectionNumber();
    const { inspection } = await this.repository.createInspectionWithDisposition({
      inspectionNumber,
      checkpointType: input.checkpointType,
      batchId: input.targetType === 'BATCH' ? input.targetId : null,
      grnLineId: input.targetType === 'GRN_LINE' ? input.targetId : null,
      inspectorEmployeeId: fallbackInspectorId,
      sampledQuantity: input.sampledQuantity || 1,
      defectiveQuantity: 0,
      status: 'PASS',
      reason: `MANDATORY GATE OVERRIDE: ${input.overrideReason}`,
      evidenceAttachmentUrls: [],
      isOverride: true,
      overrideReason: input.overrideReason,
      overrideByActorId: input.actorId
    });

    // High-priority mandatory gate override audit event
    await this.auditWriter.record({
      actorId: input.actorId,
      action: 'MANDATORY_GATE_OVERRIDE',
      entityType: 'QualityInspection',
      entityId: inspection.id,
      after: {
        inspectionNumber,
        checkpointType: input.checkpointType,
        targetType: input.targetType,
        targetId: input.targetId,
        overrideReason: input.overrideReason,
        overrideByActorId: input.actorId
      },
      requestId: `req-${Date.now()}`
    });

    return this.mapToInspectionDto(inspection as unknown as InspectionResultEntity);
  }

  // ---------------------------------------------------------------------------
  // Helper Mappers
  // ---------------------------------------------------------------------------
  private mapToInspectionDto(insp: InspectionResultEntity, correctiveActions: CorrectiveActionEntity[] = []): InspectionResultDto {
    return {
      id: insp.id,
      inspectionNumber: insp.inspectionNumber,
      checkpointType: insp.checkpointType,
      qcRuleId: insp.qcRuleId,
      qcRule: insp.qcRule
        ? {
            id: insp.qcRule.id,
            code: insp.qcRule.code,
            name: insp.qcRule.name,
            version: insp.qcRule.version,
            status: insp.qcRule.status,
            parameters: insp.qcRule.parameters as Record<string, unknown>
          }
        : null,
      batchId: insp.batchId,
      batchNumber: insp.batch?.batchNumber,
      grnLineId: insp.grnLineId,
      grnNumber: insp.grnLine?.grn?.grnNumber,
      inspectorEmployeeId: insp.inspectorEmployeeId,
      inspectorEmployeeName: insp.inspector ? `${insp.inspector.firstName} ${insp.inspector.lastName}` : null,
      inspectorEmployeeCode: insp.inspector?.employeeCode || null,
      sampledQuantity: Number(insp.sampledQuantity),
      defectiveQuantity: Number(insp.defectiveQuantity),
      status: insp.status as InspectionResultStatus,
      reason: insp.reason,
      findings: insp.findings as Record<string, unknown> | null,
      evidenceAttachmentUrls: insp.evidenceAttachmentUrls || [],
      isOverride: insp.isOverride,
      overrideReason: insp.overrideReason,
      overrideByActorId: insp.overrideByActorId,
      reinspectionOfId: insp.reinspectionOfId,
      correctiveActions: (insp.correctiveActions || correctiveActions || []).map((ca) => this.mapToCorrectiveActionDto(ca)),
      createdAt: insp.createdAt.toISOString(),
      updatedAt: insp.updatedAt.toISOString()
    };
  }

  private mapToCorrectiveActionDto(ca: CorrectiveActionEntity): CorrectiveActionDto {
    return {
      id: ca.id,
      inspectionResultId: ca.inspectionResultId,
      actionDescription: ca.actionDescription,
      assignedEmployeeId: ca.assignedEmployeeId,
      assignedEmployeeName: ca.assignedEmployee ? `${ca.assignedEmployee.firstName} ${ca.assignedEmployee.lastName}` : null,
      targetReworkStageId: ca.targetReworkStageId,
      status: ca.status as CorrectiveActionStatus,
      resolutionNotes: ca.resolutionNotes,
      resolvedAt: ca.resolvedAt ? ca.resolvedAt.toISOString() : null,
      createdAt: ca.createdAt.toISOString(),
      updatedAt: ca.updatedAt.toISOString()
    };
  }
}
