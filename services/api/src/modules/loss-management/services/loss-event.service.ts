import {
  LossSourceType,
  LossEventStatus
} from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { prisma } from '../../../database';
import { getActorCapabilities } from '../../../common/rbac/permission-cache';
import {
  LossEventRepository,
  LossEventWithRelations,
  ListLossEventsFilter,
  ReplacementChallanRepository,
  ReplacementChallanWithRelations
} from '../repositories';
import { ToleranceEvaluatorService } from './tolerance-evaluator.service';
import { StockLedgerRepository, computeItemKey } from '../../inventory/repositories/stock-ledger.repository';
import { reorderEvaluatorService } from '../../inventory/services/reorder-evaluator.service';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import { notificationService } from '../../notifications/notification.service';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  InvalidStateTransitionError,
  ValidationError
} from '../../../common/errors/AppError';

export interface CreateLossEventDto {
  sourceType: LossSourceType;
  sourceExceptionRecordId?: string | null;
  sourceDiscrepancyId?: string | null;
  sourceInspectionResultId?: string | null;
  materialId?: string | null;
  productId?: string | null;
  uomId: string;
  locationId?: string | null;
  departmentId?: string | null;
  quantity: number;
  reason: string;
}

export class LossEventService {
  private readonly db: typeof prisma;

  constructor(
    private readonly repository: LossEventRepository,
    private readonly replacementChallanRepository: ReplacementChallanRepository,
    private readonly toleranceEvaluator: ToleranceEvaluatorService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    dbClient?: typeof prisma
  ) {
    this.db = dbClient ?? prisma;
  }

  /**
   * 1. REPORT LOSS EVENT
   * Creates a new LossEvent with status REPORTED.
   * Enforces source-uniqueness constraints (no two LossEvents can reference the same source).
   */
  async report(
    data: CreateLossEventDto,
    actorId: string,
    requestId?: string
  ): Promise<LossEventWithRelations> {
    const canReport = await this.permissionChecker.can(actorId, 'report', 'LossEvent');
    if (!canReport) {
      throw new ForbiddenError('Lacks permission to report a loss event.');
    }

    if (Boolean(data.materialId) === Boolean(data.productId)) {
      throw new ValidationError('A loss event must reference exactly one of materialId or productId.');
    }
    if (data.quantity <= 0) {
      throw new ValidationError('Loss quantity must be positive.');
    }
    if (!data.reason?.trim()) {
      throw new ValidationError('Reason is mandatory for a loss event.');
    }

    // Source verification and uniqueness check
    if (data.sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION') {
      if (!data.sourceExceptionRecordId) {
        throw new ValidationError('sourceExceptionRecordId is required for DEPARTMENT_EXECUTION_EXCEPTION.');
      }
      const existing = await this.repository.findBySourceExceptionRecordId(data.sourceExceptionRecordId);
      if (existing) {
        throw new ConflictError(`A LossEvent [${existing.lossNumber}] already exists for source [${data.sourceExceptionRecordId}].`);
      }
      let exceptionRecord = await this.db.exceptionRecord.findUnique({
        where: { id: data.sourceExceptionRecordId },
        include: { batch: true }
      });

      // If not an ExceptionRecord ID directly, check if it is a DepartmentExecutionBatch ID
      if (!exceptionRecord) {
        const batch = await this.db.departmentExecutionBatch.findUnique({
          where: { id: data.sourceExceptionRecordId },
          include: { workerAssignments: true, department: true }
        });
        if (batch) {
          // Find employee to attribute the exception to
          let empId: string | undefined = batch.workerAssignments?.[0]?.employeeId;
          if (!empId) {
            const activeEmp = await this.db.employee.findFirst({
              where: batch.departmentId ? { departmentId: batch.departmentId, status: 'ACTIVE' } : { status: 'ACTIVE' }
            }) || await this.db.employee.findFirst({ where: { status: 'ACTIVE' } });
            empId = activeEmp?.id ?? undefined;
          }

          if (typeof empId === 'string' && empId.length > 0) {
            const assignedEmpId = empId;
            // Create the ExceptionRecord on the batch so foreign keys and yield conservation stay unified
            exceptionRecord = await this.db.exceptionRecord.create({
              data: {
                batchId: batch.id,
                type: 'SCRAP',
                quantity: data.quantity,
                reason: data.reason.trim(),
                employeeId: assignedEmpId
              },
              include: { batch: true }
            });
            // Link the LossEvent directly to the created ExceptionRecord
            data.sourceExceptionRecordId = exceptionRecord.id;

            // Update batch scrap quantity breakdown
            const currentScrap = Number(batch.scrap_qty || 0);
            await this.db.departmentExecutionBatch.update({
              where: { id: batch.id },
              data: {
                scrap_qty: currentScrap + Number(data.quantity)
              }
            });
          }
        }
      }

      if (!exceptionRecord) {
        throw new NotFoundError(`ExceptionRecord [${data.sourceExceptionRecordId}] not found.`);
      }
      if (!data.departmentId && exceptionRecord.batch?.departmentId) {
        data.departmentId = exceptionRecord.batch.departmentId;
      }
    } else if (data.sourceType === 'GRN_DISCREPANCY') {
      if (!data.sourceDiscrepancyId) {
        throw new ValidationError('sourceDiscrepancyId is required for GRN_DISCREPANCY.');
      }
      const existing = await this.repository.findBySourceDiscrepancyId(data.sourceDiscrepancyId);
      if (existing) {
        throw new ConflictError(`A LossEvent [${existing.lossNumber}] already exists for GoodsReceiptDiscrepancy [${data.sourceDiscrepancyId}].`);
      }
      const discrepancy = await this.db.goodsReceiptDiscrepancy.findUnique({
        where: { id: data.sourceDiscrepancyId },
        include: { grnLine: { include: { grn: true } } }
      });
      if (!discrepancy) {
        throw new NotFoundError(`GoodsReceiptDiscrepancy [${data.sourceDiscrepancyId}] not found.`);
      }
      if (!data.locationId && discrepancy.grnLine?.grn?.locationId) {
        data.locationId = discrepancy.grnLine.grn.locationId;
      }
    } else if (data.sourceType === 'QC_REJECTION_NO_BATCH') {
      if (!data.sourceInspectionResultId) {
        throw new ValidationError('sourceInspectionResultId is required for QC_REJECTION_NO_BATCH.');
      }
      const existing = await this.repository.findBySourceInspectionResultId(data.sourceInspectionResultId);
      if (existing) {
        throw new ConflictError(`A LossEvent [${existing.lossNumber}] already exists for InspectionResult [${data.sourceInspectionResultId}].`);
      }
      const inspection = await this.db.inspectionResult.findUnique({
        where: { id: data.sourceInspectionResultId }
      });
      if (!inspection) {
        throw new NotFoundError(`InspectionResult [${data.sourceInspectionResultId}] not found.`);
      }
    }

    const year = new Date().getFullYear();
    const lossNumber = await generateSequentialNumber({
      prefix: `LOSS-${year}-`,
      countByPrefix: (prefix) => this.repository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.repository.existsByNumber(candidate)
    });

    const created = await this.repository.create({
      lossNumber,
      sourceType: data.sourceType,
      sourceExceptionRecordId: data.sourceExceptionRecordId,
      sourceDiscrepancyId: data.sourceDiscrepancyId,
      sourceInspectionResultId: data.sourceInspectionResultId,
      materialId: data.materialId,
      productId: data.productId,
      uomId: data.uomId,
      locationId: data.locationId,
      departmentId: data.departmentId,
      quantity: data.quantity,
      reason: data.reason.trim(),
      reportedByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_reported',
      entityType: 'LossEvent',
      entityId: created.id,
      after: created,
      requestId
    });

    // If reported for a Stage Batch, immediately pause the floor execution
    try {
      const stageMatch = data.reason?.match(/Stage Batch:\s*([A-Za-z0-9_-]+)/i);
      const batchRef = stageMatch?.[1]?.trim() || (data.sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION' ? data.sourceExceptionRecordId : null);
      if (batchRef) {
        const batch = await this.db.departmentExecutionBatch.findFirst({
          where: {
            OR: [
              { id: batchRef },
              { batchNumber: batchRef }
            ]
          },
          include: { department: true }
        });

        if (batch) {
          const qty = Number(data.quantity || 0);
          const currentScrap = Number(batch.scrap_qty || 0);
          const currentReceived = Number(batch.received_qty || 0);
          const currentCompleted = Number(batch.completed_qty || 0);
          const currentRejected = Number(batch.rejected_qty || 0);
          const currentWastage = Number(batch.wastage_qty || 0);
          const newScrap = currentScrap + qty;
          const newPending = Math.max(0, currentReceived - currentCompleted - currentRejected - newScrap - currentWastage);

          await this.db.departmentExecutionBatch.update({
            where: { id: batch.id },
            data: {
              scrap_qty: newScrap,
              pending_qty: newPending,
              status: 'PAUSED',
              notes: batch.notes
                ? `${batch.notes} | PAUSED: Scrap proposal [${created.lossNumber}] reported (${qty} units: "${data.reason.trim()}"). Awaiting Store Manager verification and replacement/reversal.`
                : `PAUSED: Scrap proposal [${created.lossNumber}] reported (${qty} units: "${data.reason.trim()}"). Awaiting Store Manager verification and replacement/reversal.`
            }
          });

          const activeEmp = await this.db.employee.findFirst({
            where: batch.departmentId ? { departmentId: batch.departmentId, status: 'ACTIVE' } : { status: 'ACTIVE' }
          });
          if (activeEmp) {
            await this.db.progressEvent.create({
              data: {
                batchId: batch.id,
                employeeId: activeEmp.id,
                eventType: 'PAUSED',
                quantityDelta: 0,
                notes: `Floor execution PAUSED due to scrap/loss proposal [${created.lossNumber}] (${qty} units: "${data.reason.trim()}"). Awaiting Store Manager verification and replacement/reversal.`
              }
            });
          }

          // Notify Department Head
          if (batch.departmentId) {
            await notificationService.notifyDepartment({
              departmentId: batch.departmentId,
              type: 'WORKFLOW',
              title: `[EXECUTION PAUSED] Scrap Proposal Reported: ${created.lossNumber}`,
              message: `Batch #${batch.batchNumber} execution is PAUSED due to a scrap proposal of ${qty} units (${created.lossNumber}). Store Manager has been notified to verify scrap and issue replacement before production can resume.`,
              resource: 'DepartmentExecutionBatch',
              resourceId: batch.id,
              href: `/production/execution/${batch.id}`
            });
          }
        }
      }
    } catch (batchErr) {
      console.warn('[LossEventService.report] Batch pause handling warning:', batchErr);
    }

    // Alert Store Managers & Admins that a new Scrap/Wastage Proposal has been reported
    try {
      const itemDesc = created.material?.name || created.product?.name || 'Material/Product';
      const deptDesc = created.department?.name ? ` from ${created.department.name}` : '';
      await notificationService.notifyRoles({
        roles: ['store-manager', 'store_manager', 'inventory-manager', 'admin', 'manager'],
        type: 'APPROVAL_REQUIRED',
        title: `[SCRAP REPORTED] New Proposal: ${created.lossNumber}`,
        message: `Department reported ${Number(created.quantity)} ${created.uom?.symbol || 'units'} (${itemDesc})${deptDesc}. Floor execution is PAUSED awaiting your verification to approve, reject, or issue replacement materials.`,
        resource: 'LossEvent',
        resourceId: created.id,
        href: `/scrap-wastage/${created.id}`,
        metadata: {
          lossEventId: created.id,
          lossNumber: created.lossNumber,
          quantity: Number(created.quantity),
          reason: created.reason,
          status: created.status
        }
      });
    } catch (notifErr) {
      console.warn('[LossEventService.report] Store Manager notification note:', notifErr);
    }

    return created;
  }

  /**
   * 2. CLASSIFY LOSS EVENT AGAINST WASTAGE RULE (TOLERANCE COMPARISON)
   * Resolves the applicable approved WastageRule version and calculates tolerance.
   * Blocks with MissingWastageRuleError if no approved rule exists.
   */
  async classify(
    id: string,
    params: { basisQuantity?: number },
    actorId: string,
    requestId?: string
  ): Promise<LossEventWithRelations> {
    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    // Resolve work center if department is known
    let workCenterId: string | null = null;
    if (loss.departmentId) {
      const dept = await this.db.department.findUnique({
        where: { id: loss.departmentId },
        include: { workCenters: { select: { id: true }, take: 1 } }
      });
      if (dept?.workCenters?.length) {
        workCenterId = dept.workCenters[0].id;
      }
    }

    const rule = await this.toleranceEvaluator.resolveWastageRule({
      materialId: loss.materialId,
      workCenterId,
      asOfDate: loss.reportedAt
    });

    const evalResult = this.toleranceEvaluator.evaluate(
      Number(loss.quantity),
      params.basisQuantity ?? Number(loss.quantity),
      rule
    );

    const updated = await this.repository.updateClassification(id, {
      appliedWastageRuleId: rule.id,
      appliedWastageRuleVersion: rule.version,
      varianceFromExpected: evalResult.varianceFromExpected,
      classification: evalResult.classification
    });

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_classified',
      entityType: 'LossEvent',
      entityId: id,
      before: loss,
      after: updated,
      metadata: {
        appliedWastageRuleId: rule.id,
        ruleCode: rule.code,
        version: rule.version,
        classification: evalResult.classification,
        varianceFromExpected: evalResult.varianceFromExpected
      },
      requestId
    });

    return updated;
  }

  /**
   * 3. REVIEW LOSS EVENT
   * Moves status to REVIEWED.
   * Enforces separation of duties: reviewedByActorId must differ from reportedByActorId.
   */
  async review(
    id: string,
    notes: string | undefined,
    actorId: string,
    requestId?: string
  ): Promise<LossEventWithRelations> {
    const canReview = await this.permissionChecker.can(actorId, 'review', 'LossEvent');
    if (!canReview) throw new ForbiddenError('Lacks permission to review loss events.');

    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    const isReporter = loss.reportedByActorId === actorId;
    let canOverride = false;
    try {
      const actorCaps = await getActorCapabilities(this.db, actorId);
      canOverride = Boolean(actorCaps.admin || actorCaps.storeManager);
    } catch {
      canOverride = false;
    }

    if (isReporter && !canOverride) {
      throw new ForbiddenError('Separation of duties violation: Reporter cannot review their own loss event.');
    }
    if (loss.status !== 'REPORTED') {
      throw new InvalidStateTransitionError(`Cannot review LossEvent in state [${loss.status}]. Must be REPORTED.`);
    }

    // If classification is not yet computed, compute it automatically
    let classifiedLoss = loss;
    if (!loss.classification || !loss.appliedWastageRuleId) {
      classifiedLoss = await this.classify(id, {}, actorId, requestId);
    }

    const count = await this.repository.updateStatusConditional(
      id,
      ['REPORTED'],
      'REVIEWED',
      {
        reviewedByActorId: actorId,
        reviewedAt: new Date(),
        reviewNotes: notes?.trim() ?? null
      }
    );

    if (count === 0) {
      throw new InvalidStateTransitionError(`LossEvent [${id}] was modified concurrently; refetch and retry.`);
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`LossEvent [${id}] not found after review.`);

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_reviewed',
      entityType: 'LossEvent',
      entityId: id,
      before: classifiedLoss,
      after: updated,
      requestId
    });

    return updated;
  }

  /**
   * 4. APPROVE LOSS EVENT
   * Moves status to APPROVED.
   * Enforces separation of duties: approvedByActorId must differ from reportedByActorId.
   */
  async approve(
    id: string,
    actorId: string,
    requestId?: string
  ): Promise<LossEventWithRelations> {
    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'LossEvent');
    if (!canApprove) throw new ForbiddenError('Lacks permission to approve loss events.');

    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    const isReporter = loss.reportedByActorId === actorId;
    let canOverride = false;
    try {
      const actorCaps = await getActorCapabilities(this.db, actorId);
      canOverride = Boolean(actorCaps.admin || actorCaps.storeManager);
    } catch {
      canOverride = false;
    }

    if (isReporter && !canOverride) {
      throw new ForbiddenError('Separation of duties violation: Reporter cannot approve their own loss event.');
    }
    if (!['REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(loss.status)) {
      throw new InvalidStateTransitionError(`Cannot approve LossEvent in state [${loss.status}]. Must be REPORTED, REVIEWED, or INVESTIGATED.`);
    }

    const count = await this.repository.updateStatusConditional(
      id,
      ['REPORTED', 'REVIEWED', 'INVESTIGATED'],
      'APPROVED',
      {
        approvedByActorId: actorId,
        approvedAt: new Date()
      }
    );

    if (count === 0) {
      throw new InvalidStateTransitionError(`LossEvent [${id}] was modified concurrently; refetch and retry.`);
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`LossEvent [${id}] not found after approval.`);

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_approved',
      entityType: 'LossEvent',
      entityId: id,
      before: loss,
      after: updated,
      requestId
    });

    // Notify department that scrap was approved and replenishment from inventory will be issued
    try {
      const targetDeptId = loss.departmentId || loss.sourceExceptionRecord?.batch?.departmentId;
      if (targetDeptId) {
        await notificationService.notifyDepartment({
          departmentId: targetDeptId,
          type: 'APPROVED',
          title: `Scrap Proposal Approved: ${loss.lossNumber}`,
          message: `The Store Manager has approved the scrap proposal of ${Number(loss.quantity)} ${loss.uom?.symbol || 'units'} (${loss.material?.name || loss.product?.name || 'Item'}). The store manager will issue replenishment materials from inventory to complete production.`,
          resource: 'LossEvent',
          resourceId: loss.id,
          href: `/scrap-wastage/${loss.id}`,
          metadata: {
            lossEventId: loss.id,
            lossNumber: loss.lossNumber,
            quantity: Number(loss.quantity),
            status: 'APPROVED'
          }
        });
      }
      if (loss.reportedByActorId) {
        await notificationService.createAndDispatch({
          recipientId: loss.reportedByActorId,
          type: 'APPROVED',
          title: `Scrap Proposal Approved: ${loss.lossNumber}`,
          message: `Your scrap proposal for ${Number(loss.quantity)} ${loss.uom?.symbol || 'units'} has been approved by the Store Manager. Replenishment materials will be issued from inventory.`,
          resource: 'LossEvent',
          resourceId: loss.id,
          href: `/scrap-wastage/${loss.id}`
        });
      }
    } catch (notifErr) {
      console.warn('[LossEventService.approve] Non-blocking notification failure:', notifErr);
    }

    return updated;
  }

  /**
   * 5. REJECT LOSS EVENT
   * Moves status to REJECTED.
   */
  async reject(
    id: string,
    reason: string,
    actorId: string,
    requestId?: string,
    rejectedQuantity?: number
  ): Promise<LossEventWithRelations> {
    const canReject = await this.permissionChecker.can(actorId, 'reject', 'LossEvent');
    if (!canReject) throw new ForbiddenError('Lacks permission to reject loss events.');
    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    if (!['REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(loss.status)) {
      throw new InvalidStateTransitionError(`Cannot reject LossEvent in state [${loss.status}].`);
    }

    const totalLossQty = Number(loss.quantity);
    const rejectQty = rejectedQuantity !== undefined && rejectedQuantity > 0 && rejectedQuantity <= totalLossQty
      ? rejectedQuantity
      : totalLossQty;

    const count = await this.repository.updateStatusConditional(
      id,
      ['REPORTED', 'REVIEWED', 'INVESTIGATED'],
      'REJECTED',
      {
        rejectedByActorId: actorId,
        rejectedAt: new Date(),
        rejectionReason: reason.trim()
      }
    );

    if (count === 0) {
      throw new InvalidStateTransitionError(`LossEvent [${id}] was modified concurrently; refetch and retry.`);
    }
    // Revert logic: If this LossEvent came from a department execution batch,
    // revert the scrap_qty back to pending_qty so the department head is bound
    // to complete production with that quantity.
    let batchToRevert: any = null;
    if (loss.sourceExceptionRecordId) {
      const exc = await this.db.exceptionRecord.findUnique({
        where: { id: loss.sourceExceptionRecordId },
        include: { batch: { include: { department: true } } }
      });
      if (exc?.batch) batchToRevert = exc.batch;
    }
    if (!batchToRevert && loss.reason) {
      const stageMatch = loss.reason.match(/Stage Batch:\s*([A-Za-z0-9_-]+)/i);
      if (stageMatch && stageMatch[1]) {
        const batchRef = stageMatch[1].trim();
        batchToRevert = await this.db.departmentExecutionBatch.findFirst({
          where: {
            OR: [
              { id: batchRef },
              { batchNumber: batchRef }
            ]
          },
          include: { department: true }
        });
      }
    }

    if (batchToRevert) {
      const batch = batchToRevert;
      const lossQty = rejectQty;
      const currReceived = Number(batch.received_qty || 0);
      const currCompleted = Number(batch.completed_qty || 0);
      const currRejected = Number(batch.rejected_qty || 0);
      const currWastage = Number(batch.wastage_qty || 0);
      const currentScrap = Number(batch.scrap_qty || 0);

      // Revert clears the scrap proposal quantity and restores pending_qty
      const newScrap = Math.max(0, currentScrap - lossQty);
      const newPending = Math.max(0, currReceived - currCompleted - currRejected - newScrap - currWastage);

      await this.db.departmentExecutionBatch.update({
        where: { id: batch.id },
        data: {
          scrap_qty: newScrap,
          pending_qty: newPending,
          status: 'IN_PROGRESS',
          notes: batch.notes
            ? `${batch.notes} | Scrap proposal rejected by Store Manager (${loss.lossNumber}, ${lossQty} units returned): ${reason.trim()}`
            : `Scrap proposal rejected by Store Manager (${loss.lossNumber}, ${lossQty} units returned): ${reason.trim()}`
        }
      });

      // Record a progress event on the batch for full traceability
      const activeEmp = await this.db.employee.findFirst({
        where: batch.departmentId ? { departmentId: batch.departmentId, status: 'ACTIVE' } : { status: 'ACTIVE' }
      });
      if (activeEmp) {
        await this.db.progressEvent.create({
          data: {
            batchId: batch.id,
            employeeId: activeEmp.id,
            eventType: 'RESUMED',
            quantityDelta: 0,
            notes: `Scrap proposal [${loss.lossNumber}] was REJECTED by Store Manager: "${reason.trim()}". Returned ${lossQty} units back to department queue. Batch unpaused to complete production.`
          }
        });
      }

      // 1. Notify Department Head that scrap was reverted and batch unpaused
      try {
        if (batch.departmentId) {
          await notificationService.notifyDepartment({
            departmentId: batch.departmentId,
            type: 'WORKFLOW',
            title: `[EXECUTION RESUMED] Scrap Proposal Reverted by Store Manager`,
            message: `Store Manager rejected scrap proposal ${loss.lossNumber} (Reason: "${reason.trim()}"). ${lossQty} units returned to department queue. Batch #${batch.batchNumber} is unpaused to complete production.`,
            resource: 'DepartmentExecutionBatch',
            resourceId: batch.id,
            href: `/production/execution/${batch.id}`
          });
        }
      } catch (deptErr) {
        console.warn('[LossEventService.reject] Department notification note:', deptErr);
      }
    }

    // 2. Direct notification to the reporter
    if (loss.reportedByActorId) {
      try {
        await notificationService.createAndDispatch({
          recipientId: loss.reportedByActorId,
          type: 'INFO',
          title: `[EXECUTION RESUMED] Scrap Proposal Reverted: ${loss.lossNumber}`,
          message: `The Store Manager rejected scrap proposal ${loss.lossNumber} (Reason: "${reason.trim()}"). ${rejectQty} units have been returned to your department queue. Production execution is now unpaused and can continue.`,
          resource: 'LossEvent',
          resourceId: loss.id,
          href: batchToRevert ? `/production/execution/${batchToRevert.id}` : `/scrap-wastage/${loss.id}`
        });
      } catch (reporterErr) {
        console.warn('[LossEventService.reject] Reporter notification note:', reporterErr);
      }
    }
    // If this LossEvent came from an Assembly Batch, log the rejection note and progress event on the assembly batch
    const asyRejectMatch = loss.reason.match(/Assembly Batch:\s*([A-Za-z0-9_-]+)/i);
    if (asyRejectMatch && asyRejectMatch[1]) {
      const asyRef = asyRejectMatch[1].trim();
      const asyBatch = await this.db.assemblyBatch.findFirst({
        where: {
          OR: [
            { id: asyRef },
            { batchNumber: asyRef }
          ]
        }
      });
      if (asyBatch) {
        await this.db.assemblyBatch.update({
          where: { id: asyBatch.id },
          data: {
            notes: asyBatch.notes
              ? `${asyBatch.notes} | Scrap proposal [${loss.lossNumber}] REJECTED by Store Manager (${rejectQty} units returned): "${reason.trim()}". Returned to department; operator must complete production with original stock.`
              : `Scrap proposal [${loss.lossNumber}] REJECTED by Store Manager (${rejectQty} units returned): "${reason.trim()}". Returned to department; operator must complete production with original stock.`
          }
        });
        const activeEmp = await this.db.employee.findFirst({ where: { status: 'ACTIVE' } });
        if (activeEmp) {
          await this.db.assemblyProgressEvent.create({
            data: {
              assemblyBatchId: asyBatch.id,
              employeeId: activeEmp.id,
              eventType: 'PAUSED',
              quantityDelta: 0,
              notes: `Scrap proposal [${loss.lossNumber}] was REJECTED by Store Manager (${rejectQty} units returned): "${reason.trim()}". Material returned to department; operator is bound to produce full target output.`
            }
          });
        }
      }
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`LossEvent [${id}] not found after rejection.`);

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_rejected',
      entityType: 'LossEvent',
      entityId: id,
      before: loss,
      after: updated,
      metadata: { reason },
      requestId
    });

    // Notify the department head/department that proposal was rejected and material is reverted
    try {
      const targetDeptId = loss.departmentId || loss.sourceExceptionRecord?.batch?.departmentId;
      if (targetDeptId) {
        await notificationService.notifyDepartment({
          departmentId: targetDeptId,
          type: 'CHANGES_REQUESTED',
          title: `Scrap Proposal Rejected: ${loss.lossNumber}`,
          message: `The Store Manager has rejected your scrap proposal of ${Number(loss.quantity)} ${loss.uom?.symbol || 'units'} (${loss.material?.name || loss.product?.name || 'Item'}). Reason: "${reason.trim()}". The material/product has been reverted to your department queue. You are required to complete the production with this quantity.`,
          resource: 'LossEvent',
          resourceId: loss.id,
          href: `/scrap-wastage/${loss.id}`,
          metadata: {
            lossEventId: loss.id,
            lossNumber: loss.lossNumber,
            quantity: Number(loss.quantity),
            rejectionReason: reason.trim(),
            reverted: true
          }
        });
      }
      // Also notify reporter directly if different
      if (loss.reportedByActorId) {
        await notificationService.createAndDispatch({
          recipientId: loss.reportedByActorId,
          type: 'CHANGES_REQUESTED',
          title: `Scrap Proposal Rejected: ${loss.lossNumber}`,
          message: `Your scrap proposal for ${Number(loss.quantity)} ${loss.uom?.symbol || 'units'} was rejected by the Store Manager. Reason: "${reason.trim()}". Material has been reverted to your department. Please complete the production as scheduled.`,
          resource: 'LossEvent',
          resourceId: loss.id,
          href: `/scrap-wastage/${loss.id}`
        });
      }
    } catch (notifErr) {
      console.warn('[LossEventService.reject] Non-blocking notification failure:', notifErr);
    }
    return updated;
  }

  /**
   * 6. INVESTIGATE ABNORMAL LOSS EVENT
   * Moves status to INVESTIGATED.
   */
  async investigate(
    id: string,
    notes: string,
    actorId: string,
    requestId?: string
  ): Promise<LossEventWithRelations> {
    const canInvestigate = await this.permissionChecker.can(actorId, 'investigate', 'LossEvent');
    if (!canInvestigate) throw new ForbiddenError('Lacks permission to investigate abnormal loss events.');

    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    if (!['REVIEWED', 'REPORTED'].includes(loss.status)) {
      throw new InvalidStateTransitionError(`Cannot mark LossEvent as INVESTIGATED from state [${loss.status}].`);
    }

    const count = await this.repository.updateStatusConditional(
      id,
      ['REVIEWED', 'REPORTED'],
      'INVESTIGATED',
      {
        investigatedByActorId: actorId,
        investigatedAt: new Date(),
        investigationNotes: notes.trim()
      }
    );

    if (count === 0) {
      throw new InvalidStateTransitionError(`LossEvent [${id}] was modified concurrently; refetch and retry.`);
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`LossEvent [${id}] not found after investigation.`);

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_investigated',
      entityType: 'LossEvent',
      entityId: id,
      before: loss,
      after: updated,
      metadata: { notes },
      requestId
    });

    return updated;
  }

  /**
   * 7. POST STOCK EFFECT
   * On APPROVED, atomically posts the inventory effect to StockLedgerEntry and flips status to POSTED.
   * If the loss is warehouse-held inventory (locationId present), writes StockLedgerEntry (ADJUSTMENT_DECREASE, OUT).
   */
  async postStockEffect(
    id: string,
    actorId: string,
    requestId?: string
  ): Promise<LossEventWithRelations> {
    const canPost = await this.permissionChecker.can(actorId, 'post', 'LossEvent');
    if (!canPost) throw new ForbiddenError('Lacks permission to post inventory loss effects.');

    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    if (loss.status !== 'APPROVED') {
      throw new InvalidStateTransitionError(`Cannot post inventory effect for LossEvent in state [${loss.status}]. Must be APPROVED.`);
    }

    let ledgerEntryId: string | null = null;

    await this.db.$transaction(async (tx) => {
      const txLedgerRepo = new StockLedgerRepository(tx);
      const txLossRepo = new LossEventRepository(tx);

      if (loss.locationId) {
        const ledgerEntry = await txLedgerRepo.postEntry(
          {
            productId: loss.productId ?? undefined,
            materialId: loss.materialId ?? undefined,
            uomId: loss.uomId,
            locationId: loss.locationId,
            ownership: 'OWNED',
            direction: 'OUT',
            entryType: 'ADJUSTMENT_DECREASE',
            quantity: Number(loss.quantity),
            postedByActorId: actorId,
            note: `Loss Event ${loss.lossNumber}: ${loss.reason}`
          },
          tx
        );
        ledgerEntryId = ledgerEntry.id;
      }

      const count = await txLossRepo.updateStatusConditional(
        id,
        ['APPROVED'],
        'POSTED',
        {
          stockEffectRef: ledgerEntryId
        },
        tx
      );

      if (count === 0) {
        throw new InvalidStateTransitionError(`LossEvent [${id}] was modified concurrently; refetch and retry posting.`);
      }
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`LossEvent [${id}] not found after posting.`);

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.loss_posted',
      entityType: 'LossEvent',
      entityId: id,
      before: loss,
      after: updated,
      metadata: { stockEffectRef: ledgerEntryId },
      requestId
    });

    // Evaluate reorder signals if on-hand decreased
    if (loss.locationId) {
      try {
        const itemKey = computeItemKey(loss.productId ?? undefined, loss.materialId ?? undefined);
        const balance = await this.db.stockBalance.findUnique({
          where: {
            itemKey_uomId_locationId_ownership: {
              itemKey,
              uomId: loss.uomId,
              locationId: loss.locationId,
              ownership: 'OWNED'
            }
          }
        });
        if (balance) {
          await reorderEvaluatorService.evaluateAndTrigger(balance.id);
        }
      } catch {
        // Non-blocking notification
      }
    }

    return updated;
  }

  /**
   * 8. ISSUE REPLACEMENT CHALLAN
   */
  async issueReplacementChallan(
    id: string,
    data: {
      dispatchLocationId: string;
      targetDepartmentId?: string | null;
      targetVendorId?: string | null;
      replacementQuantity?: number;
      rejectedQuantity?: number;
      rejectionReason?: string | null;
      notes?: string | null;
    },
    actorId: string,
    requestId?: string
  ): Promise<ReplacementChallanWithRelations> {
    const canReplace = await this.permissionChecker.can(actorId, 'replace', 'LossEvent');
    if (!canReplace) throw new ForbiddenError('Lacks permission to issue a replacement challan.');

    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);

    if (!['APPROVED', 'POSTED', 'REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(loss.status)) {
      throw new InvalidStateTransitionError(`Cannot issue replacement challan for LossEvent in state [${loss.status}].`);
    }
    const existingChallan = await this.replacementChallanRepository.findByLossEventId(id);
    if (existingChallan) {
      throw new ConflictError(`ReplacementChallan [${existingChallan.challanNumber}] already exists for LossEvent [${id}].`);
    }

    const year = new Date().getFullYear();
    const challanNumber = await generateSequentialNumber({
      prefix: `REP-CHAL-${year}-`,
      countByPrefix: (prefix) => this.replacementChallanRepository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.replacementChallanRepository.existsByNumber(candidate)
    });

    let createdChallan: ReplacementChallanWithRelations;

    await this.db.$transaction(async (tx) => {
      const txChallanRepo = new ReplacementChallanRepository(tx);
      const txLossRepo = new LossEventRepository(tx);

      const totalProposalQty = Number(loss.quantity);
      const repQty = data.replacementQuantity !== undefined && data.replacementQuantity > 0
        ? Math.min(data.replacementQuantity, totalProposalQty)
        : totalProposalQty;
      const rejQty = data.rejectedQuantity !== undefined && data.rejectedQuantity > 0
        ? data.rejectedQuantity
        : Math.max(0, totalProposalQty - repQty);

      createdChallan = await txChallanRepo.create(
        {
          challanNumber,
          lossEventId: id,
          materialId: loss.materialId,
          productId: loss.productId,
          uomId: loss.uomId,
          quantity: repQty,
          dispatchLocationId: data.dispatchLocationId,
          targetDepartmentId: data.targetDepartmentId,
          targetVendorId: data.targetVendorId,
          notes: data.notes,
          issuedByActorId: actorId
        },
        tx
      );

      const splitNote = rejQty > 0
        ? ` (Split disposition: ${repQty} replaced, ${rejQty} rejected & returned: "${data.rejectionReason || 'Production required'}")`
        : '';

      await txLossRepo.updateStatusConditional(
        id,
        ['APPROVED', 'POSTED', 'REPORTED', 'REVIEWED', 'INVESTIGATED'],
        'REPLACED',
        {
          replacementChallanRef: createdChallan.challanNumber,
          rejectionReason: rejQty > 0 ? (data.rejectionReason || 'Partial scrap rejected; remainder returned to department') : null,
          reviewNotes: loss.reviewNotes ? `${loss.reviewNotes}${splitNote}` : splitNote || undefined
        },
        tx
      );
      // Replenishment inventory posting: Issue specific replacement material from inventory
      // and replenish department batch pending quantity so department head continues production.
      if (data.dispatchLocationId && (loss.materialId || loss.productId)) {
        const itemType = loss.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = (loss.productId || loss.materialId)!;
        const replenishQty = repQty;
        try {
          await inventoryPostingService.post(tx, {
            itemType,
            itemId,
            uomId: loss.uomId,
            locationId: data.dispatchLocationId,
            movementType: 'ISSUE',
            quantity: replenishQty,
            sourceType: 'REPLACEMENT_CHALLAN',
            sourceId: createdChallan.id,
            idempotencyKey: `REP_POST:${createdChallan.id}:${Date.now()}`,
            actorId,
            correlationId: id
          });
        } catch (invErr) {
          console.warn('[LossEventService.issueReplacementChallan] Ledger post fallback notice:', invErr);
        }
      }

      // Replenish the department execution batch:
      // When replacement is issued, increment batch received_qty and pending_qty
      // by the replenished quantity so the department head can complete the supposed production.
      let batchToReplenish: any = null;
      if (loss.sourceExceptionRecordId) {
        const exc = await tx.exceptionRecord.findUnique({
          where: { id: loss.sourceExceptionRecordId },
          include: { batch: true }
        });
        if (exc?.batch) batchToReplenish = exc.batch;
      }
      if (!batchToReplenish && loss.reason) {
        const stageMatch = loss.reason.match(/Stage Batch:\s*([A-Za-z0-9_-]+)/i);
        if (stageMatch && stageMatch[1]) {
          const batchRef = stageMatch[1].trim();
          batchToReplenish = await tx.departmentExecutionBatch.findFirst({
            where: {
              OR: [
                { id: batchRef },
                { batchNumber: batchRef }
              ]
            }
          });
        }
      }

      if (batchToReplenish) {
        const currReceived = Number(batchToReplenish.received_qty || 0);
        const currCompleted = Number(batchToReplenish.completed_qty || 0);
        const currRejected = Number(batchToReplenish.rejected_qty || 0);
        const currWastage = Number(batchToReplenish.wastage_qty || 0);
        const currScrap = Number(batchToReplenish.scrap_qty || 0);

        // Replacement replaces the scrap quantity on a 1-to-1 basis:
        // - newScrap clears the replaced scrap amount
        // - received_qty remains the planned custody target of the batch
        // - pending_qty restores the remaining quantity to complete
        const newScrap = Math.max(0, currScrap - totalProposalQty);
        const newPending = Math.max(0, currReceived - currCompleted - currRejected - newScrap - currWastage);

        await tx.departmentExecutionBatch.update({
          where: { id: batchToReplenish.id },
          data: {
            pending_qty: newPending,
            scrap_qty: newScrap,
            status: 'IN_PROGRESS',
            notes: batchToReplenish.notes
              ? `${batchToReplenish.notes} | Store Manager processed proposal [${createdChallan.challanNumber}]: ${repQty} units replaced from store, ${rejQty} units returned to department queue`
              : `Store Manager processed proposal [${createdChallan.challanNumber}]: ${repQty} units replaced from store, ${rejQty} units returned to department queue`
          }
        });
        const activeEmp = await tx.employee.findFirst({
          where: batchToReplenish.departmentId ? { departmentId: batchToReplenish.departmentId, status: 'ACTIVE' } : { status: 'ACTIVE' }
        });
        if (activeEmp) {
          await tx.progressEvent.create({
            data: {
              batchId: batchToReplenish.id,
              employeeId: activeEmp.id,
              eventType: 'RESUMED',
              quantityDelta: repQty,
              notes: `Store Manager disposition [${createdChallan.challanNumber}]: ${repQty} units replaced from store, ${rejQty} units returned to department. Batch is unpaused and ready to resume production.`
            }
          });
        }

        // Notify Department Head that replacement was issued and execution has resumed
        try {
          if (batchToReplenish.departmentId) {
            await notificationService.notifyDepartment({
              departmentId: batchToReplenish.departmentId,
              type: 'INFO',
              title: `[EXECUTION RESUMED] Replacement Material Issued (${createdChallan.challanNumber})`,
              message: `The Store Manager has issued ${repQty} units of replacement material under challan #${createdChallan.challanNumber}. Batch execution is unpaused and ready to resume.`,
              resource: 'ReplacementChallan',
              resourceId: createdChallan.id,
              href: `/inventory/replacement-challans/${createdChallan.id}`
            });
          }
        } catch (notifErr) {
          console.warn('[LossEventService.issueReplacementChallan] Department notification failure:', notifErr);
        }
      }

      // Direct notification to reporter
      if (loss.reportedByActorId) {
        try {
          await notificationService.createAndDispatch({
            recipientId: loss.reportedByActorId,
            type: 'INFO',
            title: `[EXECUTION RESUMED] Replacement Material Issued: ${createdChallan.challanNumber}`,
            message: `The Store Manager has issued ${repQty} units of replacement material under challan #${createdChallan.challanNumber}. Production execution is now unpaused and can continue.`,
            resource: 'ReplacementChallan',
            resourceId: createdChallan.id,
            href: batchToReplenish ? `/production/execution/${batchToReplenish.id}` : `/scrap-wastage/${loss.id}`
          });
        } catch (reporterErr) {
          console.warn('[LossEventService.issueReplacementChallan] Reporter notification note:', reporterErr);
        }
      }
      // Replenish Assembly Batch if this scrap was reported against an AssemblyBatch:
      // Matches reason "[Assembly Batch: <id/number>]" or extracts batchNumber
      const asyMatch = loss.reason.match(/Assembly Batch:\s*([A-Za-z0-9_-]+)/i);
      if (asyMatch && asyMatch[1]) {
        const asyRef = asyMatch[1].trim();
        const asyBatch = await tx.assemblyBatch.findFirst({
          where: {
            OR: [
              { id: asyRef },
              { batchNumber: asyRef }
            ]
          },
          include: { components: true }
        });

        if (asyBatch) {
          // If loss was for a material or component product, replenish component required/consumed quantity
          if (loss.materialId || loss.productId) {
            const targetComp = asyBatch.components.find((c) =>
              (loss.materialId && c.materialIssueLineId) ||
              (loss.productId && c.sourceBatchId) ||
              (c.scrapQuantity && Number(c.scrapQuantity) > 0)
            );
            if (targetComp) {
              await tx.assemblyBatchComponent.update({
                where: { id: targetComp.id },
                data: {
                  scrapQuantity: Math.max(0, Number(targetComp.scrapQuantity) - totalProposalQty),
                  requiredQuantity: Number(targetComp.requiredQuantity) + repQty
                }
              });
            }
          }

          // Decrement batch scrapQuantity by total resolved proposal quantity
          const currentScrap = Number(asyBatch.scrapQuantity || 0);
          await tx.assemblyBatch.update({
            where: { id: asyBatch.id },
            data: {
              scrapQuantity: Math.max(0, currentScrap - totalProposalQty),
              notes: asyBatch.notes
                ? `${asyBatch.notes} | Store Manager issued replacement challan [${createdChallan.challanNumber}]: ${repQty} units replaced, ${rejQty} units returned to department`
                : `Store Manager issued replacement challan [${createdChallan.challanNumber}]: ${repQty} units replaced, ${rejQty} units returned to department`
            }
          });

          const activeEmp = await tx.employee.findFirst({
            where: { status: 'ACTIVE' }
          });
          if (activeEmp) {
            await tx.assemblyProgressEvent.create({
              data: {
                assemblyBatchId: asyBatch.id,
                employeeId: activeEmp.id,
                eventType: 'RESUMED',
                quantityDelta: repQty,
                notes: `Replenishment material of ${repQty} units received via Replacement Challan [${createdChallan.challanNumber}], ${rejQty} units returned to department. Workstation target restored.`
              }
            });
          }
        }
      }
    });

    // Notify department of issued replacement materials
    try {
      const targetDeptId = data.targetDepartmentId || loss.departmentId || loss.sourceExceptionRecord?.batch?.departmentId;
      if (targetDeptId) {
        await notificationService.notifyDepartment({
          departmentId: targetDeptId,
          type: 'INFO',
          title: `Replacement Material Issued: ${challanNumber}`,
          message: `The Store Manager has issued ${Number(loss.quantity)} ${loss.uom?.symbol || 'units'} of replacement material against scrap ${loss.lossNumber} (Challan: ${challanNumber}). Production queue has been replenished. Please continue production to achieve full scheduled output.`,
          resource: 'ReplacementChallan',
          resourceId: createdChallan!.id,
          href: `/scrap-wastage/replacements`,
          metadata: {
            challanNumber,
            lossEventId: id,
            lossNumber: loss.lossNumber,
            quantity: Number(loss.quantity)
          }
        });
      }
    } catch (notifErr) {
      console.warn('[LossEventService.issueReplacementChallan] Notification failure:', notifErr);
    }
    await this.auditWriter.record({
      actorId,
      action: 'loss_management.replacement_challan_issued',
      entityType: 'ReplacementChallan',
      entityId: createdChallan!.id,
      after: createdChallan!,
      metadata: { lossEventId: id, challanNumber },
      requestId
    });

    return createdChallan!;
  }

  /**
   * 9. ACKNOWLEDGE REPLACEMENT CHALLAN
   */
  async acknowledgeReplacementChallan(
    challanId: string,
    actorId: string,
    requestId?: string
  ): Promise<ReplacementChallanWithRelations> {
    const canAck = await this.permissionChecker.can(actorId, 'acknowledge', 'ReplacementChallan');
    if (!canAck) throw new ForbiddenError('Lacks permission to acknowledge replacement challan.');

    const challan = await this.replacementChallanRepository.findById(challanId);
    if (!challan) throw new NotFoundError(`ReplacementChallan [${challanId}] not found.`);

    if (challan.acknowledgedByActorId) {
      return challan; // Idempotent
    }

    const updated = await this.replacementChallanRepository.acknowledge(challanId, actorId);

    await this.auditWriter.record({
      actorId,
      action: 'loss_management.replacement_challan_acknowledged',
      entityType: 'ReplacementChallan',
      entityId: challanId,
      before: challan,
      after: updated,
      requestId
    });

    return updated;
  }

  async getById(id: string): Promise<LossEventWithRelations> {
    const loss = await this.repository.findById(id);
    if (!loss) throw new NotFoundError(`LossEvent [${id}] not found.`);
    return loss;
  }

  async list(filter: ListLossEventsFilter) {
    return this.repository.list(filter);
  }

  /**
   * 10. PLANT-WIDE LOSS ANALYTICS ROLLUP
   * Rollup aggregations across batches, departments, materials, and source types.
   */
  async getAnalytics(filter: {
    departmentId?: string;
    locationId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const events = await this.repository.getAnalyticsData(filter);

    let totalQuantity = 0;
    let withinToleranceCount = 0;
    let withinToleranceQuantity = 0;
    let abnormalCount = 0;
    let abnormalQuantity = 0;

    const byStatus: Record<LossEventStatus, number> = {
      REPORTED: 0,
      REVIEWED: 0,
      APPROVED: 0,
      REJECTED: 0,
      INVESTIGATED: 0,
      POSTED: 0,
      REPLACED: 0
    };

    const bySourceType: Record<LossSourceType, { count: number; quantity: number }> = {
      DEPARTMENT_EXECUTION_EXCEPTION: { count: 0, quantity: 0 },
      GRN_DISCREPANCY: { count: 0, quantity: 0 },
      QC_REJECTION_NO_BATCH: { count: 0, quantity: 0 },
      MANUAL_REPORT: { count: 0, quantity: 0 }
    };

    const deptMap = new Map<string, { departmentId: string | null; departmentName: string; count: number; quantity: number; abnormalCount: number }>();
    const matMap = new Map<string, { materialId: string | null; productId: string | null; name: string; code: string; uomSymbol: string; count: number; quantity: number; abnormalQuantity: number }>();

    for (const ev of events) {
      const qty = Number(ev.quantity);
      totalQuantity += qty;

      byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;
      if (bySourceType[ev.sourceType]) {
        bySourceType[ev.sourceType].count += 1;
        bySourceType[ev.sourceType].quantity += qty;
      }

      if (ev.classification === 'WITHIN_TOLERANCE') {
        withinToleranceCount += 1;
        withinToleranceQuantity += qty;
      } else if (ev.classification === 'ABNORMAL') {
        abnormalCount += 1;
        abnormalQuantity += qty;
      }

      // Department aggregation
      const deptKey = ev.departmentId || 'unassigned';
      const deptName = ev.department?.name || 'Unassigned Department';
      if (!deptMap.has(deptKey)) {
        deptMap.set(deptKey, {
          departmentId: ev.departmentId,
          departmentName: deptName,
          count: 0,
          quantity: 0,
          abnormalCount: 0
        });
      }
      const deptAgg = deptMap.get(deptKey)!;
      deptAgg.count += 1;
      deptAgg.quantity += qty;
      if (ev.classification === 'ABNORMAL') deptAgg.abnormalCount += 1;

      // Material/Product aggregation
      const itemKey = ev.materialId ? `mat-${ev.materialId}` : `prod-${ev.productId}`;
      const name = ev.material?.name || ev.product?.name || 'Unknown Item';
      const code = ev.material?.code || ev.product?.sku || 'N/A';
      const uomSymbol = ev.uom?.symbol || ev.uom?.code || '';

      if (!matMap.has(itemKey)) {
        matMap.set(itemKey, {
          materialId: ev.materialId,
          productId: ev.productId,
          name,
          code,
          uomSymbol,
          count: 0,
          quantity: 0,
          abnormalQuantity: 0
        });
      }
      const matAgg = matMap.get(itemKey)!;
      matAgg.count += 1;
      matAgg.quantity += qty;
      if (ev.classification === 'ABNORMAL') matAgg.abnormalQuantity += qty;
    }

    return {
      totalEvents: events.length,
      totalQuantity,
      withinToleranceCount,
      withinToleranceQuantity,
      abnormalCount,
      abnormalQuantity,
      byStatus,
      bySourceType,
      byDepartment: Array.from(deptMap.values()),
      byMaterial: Array.from(matMap.values())
    };
  }
}
