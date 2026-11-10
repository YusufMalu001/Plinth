import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PermissionChecker, AuditWriter, ConsoleAuditWriter } from '@synergy/types';
import { prisma as defaultPrisma } from '../../../database';
import { DepartmentExecutionRepository } from '../repositories/department-execution.repository';
import { assertDepartmentScope } from '../../../common/rbac/department-scope';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { notificationService } from '../../notifications/notification.service';
import { notifyAssemblyReadiness, productionActorScope } from './parallel-execution.service';
import { availableGoodOutput, childWorkFromAcceptedOutput } from './production-flow.math';
import { markReleasedPlanInProgress } from './production-plan-status';
import {
  ValidationError,
  NotFoundError,
  InvalidStateTransitionError,
  ConflictError,
  ForbiddenError
} from '../../../common/errors/AppError';

export class DepartmentExecutionService {
  constructor(
    private readonly repo: DepartmentExecutionRepository = new DepartmentExecutionRepository(),
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditWriter: AuditWriter = new ConsoleAuditWriter()
  ) { }

  private async assertCan(
    checker: PermissionChecker | undefined,
    actorId: string,
    action: string
  ): Promise<void> {
    if (actorId === 'system') return;
    if (!checker) return;
    const allowed = await checker.can(actorId, action, 'DepartmentExecution');
    if (!allowed) {
      throw new ForbiddenError(`Actor is not authorized to ${action} department executions.`);
    }
  }

  private async checkDeptScope(
    actorId: string,
    departmentId: string | null | undefined,
    checker?: PermissionChecker
  ): Promise<void> {
    await assertDepartmentScope({
      permissionChecker: checker,
      actorId,
      departmentId,
      prismaClient: this.prisma
    });
  }

  /**
   * Helper to verify quantity conservation invariant:
   * received_qty = completed_qty + rejected_qty + scrap_qty + wastage_qty + pending_qty
   */
  private assertConservation(
    received: number,
    completed: number,
    rejected: number,
    scrap: number,
    wastage: number,
    pending: number
  ): void {
    const sum = completed + rejected + scrap + wastage + pending;
    if (Math.abs(sum - received) > 0.0001) {
      throw new ValidationError(
        `Quantity conservation invariant violated: sum (${sum}) does not equal received_qty (${received}). Breakdown -> completed: ${completed}, rejected: ${rejected}, scrap: ${scrap}, wastage: ${wastage}, pending: ${pending}.`
      );
    }
  }

  /**
   * State Machine transition validator.
   */
  private validateStateTransition(current: string, next: string): void {
    const allowedTransitions: Record<string, string[]> = {
      AWAITING_RECEIPT: ['RECEIVED', 'REJECTED'],
      RECEIVED: ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'],
      ASSIGNED: ['IN_PROGRESS', 'PAUSED', 'REJECTED'],
      IN_PROGRESS: ['PAUSED', 'PARTIAL', 'COMPLETE', 'REWORK', 'REJECTED', 'HANDOVER_PENDING'],
      PAUSED: ['IN_PROGRESS', 'REJECTED'],
      PARTIAL: ['IN_PROGRESS', 'COMPLETE', 'HANDOVER_PENDING', 'REJECTED'],
      COMPLETE: ['HANDOVER_PENDING', 'NEXT_STAGE_ACCEPTED'],
      REWORK: ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'],
      REJECTED: [],
      HANDOVER_PENDING: ['NEXT_STAGE_ACCEPTED', 'HANDOVER_PENDING'],
      NEXT_STAGE_ACCEPTED: []
    };

    const validNexts = allowedTransitions[current] || [];
    if (!validNexts.includes(next)) {
      throw new InvalidStateTransitionError(
        `Invalid batch status transition from ${current} to ${next}.`
      );
    }
  }

  /**
   * 1. Initialize Batch from RELEASED ProductionPlan & Route
   * Constraint 5: Master Data Routing enforcement (V-003 Gate).
   * Gate 3: ProductionPlan must be RELEASED (or later).
   */
  async initializeBatch(
    data: {
      productionPlanId: string;
      batchNumber?: string;
      notes?: string | null;
    },
    actorId: string,
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'view');

    const plan = await this.prisma.productionPlan.findUnique({
      where: { id: data.productionPlanId },
      include: {
        product: true,
        route: {
          include: {
            steps: {
              orderBy: { sequenceNumber: 'asc' },
              include: { department: true, workCenter: true }
            }
          }
        }
      }
    });

    if (!plan) {
      throw new NotFoundError(`Production plan [${data.productionPlanId}] not found.`);
    }
    if (plan.route?.graphReviewedAt) {
      throw new ValidationError('Tasks for a reviewed branch route are created when the schedule is released.');
    }

    // Trigger condition check: Plan must be RELEASED or IN_PROGRESS
    if (!['RELEASED', 'IN_PROGRESS'].includes(plan.status)) {
      throw new ValidationError(
        `Production plan [${plan.planNumber}] is in status ${plan.status}. Batches can only be produced when plan is RELEASED or IN_PROGRESS.`
      );
    }

    // V-003 Gate: Verify Product Route
    let route = plan.route;
    if (!route) {
      // Check for approved route on product
      route = await this.prisma.productRoute.findFirst({
        where: {
          productId: plan.productId,
          status: { in: ['APPROVED', 'ACTIVE'] }
        },
        include: {
          steps: {
            orderBy: { sequenceNumber: 'asc' },
            include: { department: true, workCenter: true }
          }
        }
      });
      if (route) {
        await this.prisma.productionPlan.update({
          where: { id: plan.id },
          data: { routeId: route.id }
        }).catch(() => { });
      }
    }

    if (!route || !['APPROVED', 'ACTIVE'].includes(route.status) || !route.steps || route.steps.length === 0) {
      throw new ValidationError(
        `Routing sequence for product "${plan.product.name}" (${plan.product.sku}) is not defined or not approved in Master Data.`
      );
    }

    // Check if batch already exists for this plan
    const existingBatches = await this.repo.findBatchesByPlanId(plan.id);
    if (existingBatches && existingBatches.length > 0 && !data.batchNumber) {
      return existingBatches[0];
    }

    const firstStep = route.steps[0];
    const initialQty = Number(plan.quantity);

    // Generate batch number
    const year = new Date().getFullYear();
    let batchNumber = data.batchNumber?.trim();
    if (!batchNumber) {
      let count = await this.prisma.departmentExecutionBatch.count({
        where: { batchNumber: { startsWith: `BATCH-${year}-` } }
      });
      batchNumber = `BATCH-${year}-${String(count + 1).padStart(4, '0')}`;
      while (await this.repo.findBatchByNumber(batchNumber)) {
        count++;
        batchNumber = `BATCH-${year}-${String(count + 1).padStart(4, '0')}`;
      }
    }

    const existing = await this.repo.findBatchByNumber(batchNumber);
    if (existing) {
      if (existing.productionPlanId === plan.id) return existing;
      throw new ConflictError(`Batch with number [${batchNumber}] already exists.`);
    }

    const batch = await this.repo.createBatch({
      batchNumber,
      productionPlanId: plan.id,
      departmentId: firstStep.departmentId,
      workCenterId: firstStep.workCenterId,
      routeStepId: firstStep.id,
      stageSequenceNumber: firstStep.sequenceNumber,
      status: 'AWAITING_RECEIPT',
      received_qty: initialQty,
      pending_qty: initialQty,
      notes: data.notes ?? null,
      createdByActorId: actorId
    });

    // Auto-assign department operator if department has assigned employees (excluding department heads/supervisors)
    const deptEmployees = (this.prisma as any).employee?.findMany
      ? await (this.prisma as any).employee.findMany({
        where: {
          departmentId: firstStep.departmentId,
          status: 'ACTIVE',
          NOT: [
            { designation: { contains: 'Head', mode: 'insensitive' } },
            { designation: { contains: 'Incharge', mode: 'insensitive' } },
            { designation: { contains: 'Manager', mode: 'insensitive' } },
            { role: { contains: 'Head', mode: 'insensitive' } },
            { role: { contains: 'Incharge', mode: 'insensitive' } },
            { role: { contains: 'Manager', mode: 'insensitive' } },
          ]
        },
        take: 2
      })
      : [];
    if (deptEmployees.length > 0) {
      const assignedEmp = deptEmployees[0];
      await this.repo.createWorkerAssignment({
        batchId: batch.id,
        employeeId: assignedEmp.id,
        subtaskDescription: `Auto-assigned department operator (${firstStep.stepName})`,
        assignedByActorId: actorId
      });
      await this.notifyAssignedOperator({
        employeeId: assignedEmp.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        stageSequenceNumber: firstStep.sequenceNumber,
        stepName: firstStep.stepName,
        departmentName: firstStep.department?.name,
        quantity: initialQty
      });
    }

    // Notify all active users / department head in the target department queue
    await this.notifyDepartmentOfNewBatch({
      departmentId: firstStep.departmentId,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      stageSequenceNumber: firstStep.sequenceNumber,
      stepName: firstStep.stepName,
      departmentName: firstStep.department?.name,
      productName: plan.product?.name,
      quantity: initialQty
    });

    await this.auditWriter.record({
      actorId,
      action: 'BATCH_INITIALIZED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batch.id,
      after: { batchNumber: batch.batchNumber, departmentId: firstStep.departmentId, quantity: initialQty }
    });

    return batch;
  }

  /**
   * 2. Receive Batch at Department
   * First department requires confirmed/valid ProductionMaterialIssue.
   * Scoped to receiving department.
   */
  async receiveBatch(
    batchId: string,
    actorId: string,
    data: { materialIssueId?: string; notes?: string },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'receive');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);
    if ((batch.routeStep as any)?.branchKey) return this.receiveGraphBatch(batchId, actorId, checker);
    this.validateStateTransition(batch.status, 'RECEIVED');

    // Material Issue Gate for First Stage:
    // If it's the first stage (stageSequenceNumber === 1), verify materialIssue
    let materialIssueId = data.materialIssueId || batch.materialIssueId;
    if (batch.stageSequenceNumber === 1) {
      if (!materialIssueId) {
        // Look up any existing active issue for this plan
        const issue = await this.prisma.productionMaterialIssue.findFirst({
          where: {
            productionPlanId: batch.productionPlanId,
            reversedAt: null
          },
          orderBy: { issuedAt: 'desc' }
        });
        if (!issue) {
          // If no manual issue was recorded yet, check if the plan has reserved requirements to auto-issue
          const plan = await this.prisma.productionPlan.findUnique({
            where: { id: batch.productionPlanId },
            include: { requirements: true }
          });
          const reservedReqs = (plan?.requirements || []).filter(
            (r: any) => Number(r.reservedQuantity ?? 0) > Number(r.issuedQuantity ?? 0)
          );
          if (reservedReqs.length > 0) {
            for (const req of reservedReqs) {
              const qtyToIssue = Number(req.reservedQuantity) - Number(req.issuedQuantity ?? 0);
              const key = `PRODUCTION_ISSUE_AUTO:${batch.productionPlanId}:${req.id}:${Date.now()}`;
              const newIssue = await this.prisma.productionMaterialIssue.create({
                data: {
                  issueNumber: `ISS-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
                  productionPlanId: batch.productionPlanId,
                  idempotencyKey: key,
                  itemType: req.itemType,
                  itemId: req.itemId,
                  uomId: req.inventoryUomId,
                  locationId: req.locationId,
                  lotId: null,
                  quantity: qtyToIssue,
                  issuedByActorId: actorId,
                  reason: 'Auto-issued upon shop floor batch receipt'
                }
              });
              try {
                await inventoryPostingService.post(this.prisma, {
                  itemType: req.itemType as 'MATERIAL' | 'PRODUCT',
                  itemId: req.itemId,
                  uomId: req.inventoryUomId,
                  locationId: req.locationId,
                  movementType: 'RELEASE',
                  quantity: qtyToIssue,
                  sourceType: 'PRODUCTION_MATERIAL_ISSUE',
                  sourceId: newIssue.id,
                  idempotencyKey: `${key}:RELEASE`,
                  actorId,
                  correlationId: batch.productionPlanId
                });
                const ledger = await inventoryPostingService.post(this.prisma, {
                  itemType: req.itemType as 'MATERIAL' | 'PRODUCT',
                  itemId: req.itemId,
                  uomId: req.inventoryUomId,
                  locationId: req.locationId,
                  movementType: 'ISSUE',
                  quantity: qtyToIssue,
                  sourceType: 'PRODUCTION_MATERIAL_ISSUE',
                  sourceId: newIssue.id,
                  idempotencyKey: key,
                  actorId,
                  correlationId: batch.productionPlanId
                });
                await this.prisma.productionMaterialIssue.update({
                  where: { id: newIssue.id },
                  data: { inventoryLedgerEntryId: ledger.id }
                });
                await (this.prisma as any).productionPlanRequirement.update({
                  where: { id: req.id },
                  data: { issuedQuantity: Number(req.issuedQuantity ?? 0) + qtyToIssue }
                });
              } catch (postErr) {
                console.warn('Inventory posting for auto-issue warning:', postErr);
              }
              materialIssueId = newIssue.id;
            }
          }
        } else {
          materialIssueId = issue.id;
        }

        if (!materialIssueId) {
          throw new ValidationError(
            `First department stage requires a confirmed Material Issue for Production Plan [${batch.productionPlan?.planNumber || batch.productionPlanId}]. None found.`
          );
        }
      } else {
        const issue = await this.prisma.productionMaterialIssue.findUnique({
          where: { id: materialIssueId }
        });
        if (!issue || issue.productionPlanId !== batch.productionPlanId || issue.reversedAt !== null) {
          throw new ValidationError(`Material Issue [${materialIssueId}] is invalid or reversed.`);
        }
      }
    }

    const updated = await this.repo.updateBatch(batchId, {
      status: 'RECEIVED',
      materialIssueId: materialIssueId ?? null,
      notes: data.notes ? `${batch.notes ? batch.notes + ' | ' : ''}${data.notes}` : batch.notes
    });

    await this.auditWriter.record({
      actorId,
      action: 'BATCH_RECEIVED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      before: { status: batch.status },
      after: { status: 'RECEIVED', materialIssueId }
    });

    return updated;
  }

  /**
   * 3. Assign Worker to Batch
   * Requires real Employee reference.
   */
  async assignWorker(
    batchId: string,
    actorId: string,
    data: { employeeId: string; subtaskDescription?: string },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'assign');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);

    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { department: true }
    });
    if (!employee || employee.status === 'INACTIVE') {
      throw new NotFoundError(`Active Employee with ID [${data.employeeId}] not found.`);
    }

    // 1. Prevent duplicate assignment to the same batch
    const existingAssignment = await (this.prisma as any).workerAssignment?.findFirst({
      where: {
        batchId,
        employeeId: employee.id
      }
    });
    if (existingAssignment) {
      throw new ValidationError(`Employee [${employee.firstName} ${employee.lastName}] is already assigned to this batch.`);
    }

    // 2. Prevent department head / supervisor from being assigned as a shop-floor operator
    const isHead =
      (batch.department?.departmentHead && (
        batch.department.departmentHead.toLowerCase().trim() === `${employee.firstName} ${employee.lastName}`.toLowerCase().trim() ||
        batch.department.departmentHead.toLowerCase().trim() === employee.firstName.toLowerCase().trim()
      )) ||
      (employee.designation && ['head', 'incharge', 'manager'].some((k) => employee.designation!.toLowerCase().includes(k))) ||
      (employee.role && ['head', 'incharge', 'manager'].some((k) => employee.role!.toLowerCase().includes(k)));

    if (isHead) {
      throw new ValidationError(`Employee [${employee.firstName} ${employee.lastName}] is a Department Head/Incharge and cannot be assigned as a shop-floor operator.`);
    }

    // Must be in a workable state
    if (!['PENDING', 'AWAITING_RECEIPT', 'RECEIVED', 'ASSIGNED', 'IN_PROGRESS', 'PARTIAL', 'PAUSED', 'REWORK'].includes(batch.status)) {
      throw new InvalidStateTransitionError(`Cannot assign worker to batch in ${batch.status} status.`);
    }

    const assignment = await this.repo.createWorkerAssignment({
      batchId,
      employeeId: employee.id,
      subtaskDescription: data.subtaskDescription?.trim() || null,
      assignedByActorId: actorId
    });

    const nextStatus = batch.status === 'RECEIVED' ? 'ASSIGNED' : batch.status;
    const updatedBatch = await this.repo.updateBatch(batchId, { status: nextStatus });

    await this.auditWriter.record({
      actorId,
      action: 'WORKER_ASSIGNED',
      entityType: 'WorkerAssignment',
      entityId: assignment.id,
      metadata: { batchId, employeeId: employee.id, subtask: data.subtaskDescription }
    });

    await this.notifyAssignedOperator({
      employeeId: employee.id,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      stageSequenceNumber: batch.stageSequenceNumber,
      stepName: batch.routeStep?.stepName,
      departmentName: batch.department?.name,
      quantity: Number(batch.received_qty)
    });

    return { batch: updatedBatch, assignment };
  }

  /**
   * 3b. Unassign Worker from Batch
   */
  async unassignWorker(
    batchId: string,
    actorId: string,
    employeeId: string,
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'assign');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);

    const assignment = await (this.prisma as any).workerAssignment?.findFirst({
      where: { batchId, employeeId }
    });
    if (!assignment) {
      throw new NotFoundError(`Worker assignment not found for employee [${employeeId}] in batch [${batchId}].`);
    }

    await (this.prisma as any).workerAssignment.delete({
      where: { id: assignment.id }
    });

    const remainingAssignments = await (this.prisma as any).workerAssignment.count({
      where: { batchId }
    });

    // If batch was in ASSIGNED status and has no remaining workers, return to RECEIVED
    if (batch.status === 'ASSIGNED' && remainingAssignments === 0) {
      await this.repo.updateBatch(batchId, { status: 'RECEIVED' });
    }

    await this.auditWriter.record({
      actorId,
      action: 'WORKER_UNASSIGNED',
      entityType: 'WorkerAssignment',
      entityId: assignment.id,
      metadata: { batchId, employeeId }
    });

    const updatedBatch = await this.repo.findBatchById(batchId);
    return { batch: updatedBatch, unassignedEmployeeId: employeeId };
  }

  /**
   * 4. Start Batch Execution
   * Requires real Employee attribution.
   */
  async startBatch(
    batchId: string,
    actorId: string,
    data: { employeeId: string; notes?: string },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'start');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);
    this.validateStateTransition(batch.status, 'IN_PROGRESS');

    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundError(`Employee [${data.employeeId}] not found.`);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.createProgressEvent({
        batchId,
        employeeId: employee.id,
        eventType: 'STARTED',
        notes: data.notes ?? 'Batch processing started'
      }, tx);
      const startedBatch = await this.repo.updateBatch(batchId, { status: 'IN_PROGRESS' }, tx);
      await markReleasedPlanInProgress(tx, batch.productionPlanId, actorId);
      return startedBatch;
    });

    await this.auditWriter.record({
      actorId,
      action: 'BATCH_STARTED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      before: { status: batch.status },
      after: { status: 'IN_PROGRESS', employeeId: employee.id }
    });

    return updated;
  }

  /**
   * 5. Pause Batch Execution
   * Requires real Employee attribution and mandatory reason.
   */
  async pauseBatch(
    batchId: string,
    actorId: string,
    data: { employeeId: string; reason: string },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'update');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);
    this.validateStateTransition(batch.status, 'PAUSED');

    if (!data.reason?.trim()) {
      throw new ValidationError('Interruption reason is mandatory to pause a batch.');
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundError(`Employee [${data.employeeId}] not found.`);

    await this.repo.createProgressEvent({
      batchId,
      employeeId: employee.id,
      eventType: 'PAUSED',
      notes: `Paused: ${data.reason.trim()}`
    });

    await this.repo.createExceptionRecord({
      batchId,
      type: 'INTERRUPTION',
      quantity: 0,
      reason: data.reason.trim(),
      employeeId: employee.id
    });

    const updated = await this.repo.updateBatch(batchId, { status: 'PAUSED' });

    // Notify Admin and Store Manager that production was stopped / paused by assigned worker
    try {
      const planNumber = batch.productionPlan?.planNumber || batch.batchNumber;
      await notificationService.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager', 'manager', 'inventory-manager'],
        title: `Incomplete Production Schedule Alert: ${planNumber}`,
        message: `Assigned worker ${employee.firstName} ${employee.lastName} stopped production on batch ${batch.batchNumber} (${batch.department?.name || 'Department'}). Reason: ${data.reason.trim()}. If not resumed today, next-day reminder will be sent.`,
        resource: 'ProductionSchedule',
        resourceId: batchId,
        href: `/production/execution/${batchId}`,
        metadata: { batchId, reason: data.reason.trim(), employeeId: employee.id, status: 'PAUSED' }
      });
    } catch (notifErr) {
      console.warn('[DepartmentExecutionService.pauseBatch] Notification warning:', notifErr);
    }

    await this.auditWriter.record({
      actorId,
      action: 'BATCH_PAUSED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      before: { status: batch.status },
      after: { status: 'PAUSED', reason: data.reason.trim(), employeeId: employee.id }
    });

    return updated;
  }

  /**
   * 6. Resume Batch Execution
   * Requires real Employee attribution.
   */
  async resumeBatch(
    batchId: string,
    actorId: string,
    data: { employeeId: string; notes?: string },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'update');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);

    // Business Rule: Check if there are unresolved scrap/loss/wastage exceptions
    const openLossException = (batch.exceptionRecords || []).find((e: any) =>
      ['SCRAP', 'WASTAGE', 'REJECTION'].includes(e.type) &&
      (!e.LossEvent || ['REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(e.LossEvent.status))
    );
    if (openLossException) {
      throw new ValidationError(
        `Cannot resume execution: Batch [${batch.batchNumber}] has an open scrap/loss exception awaiting Store Manager action (Proposal: ${openLossException.LossEvent?.lossNumber || 'unresolved'}). Execution remains paused until the Store Manager verifies the scrap and issues replacement material or reverts the scrap.`
      );
    }

    this.validateStateTransition(batch.status, 'IN_PROGRESS');

    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundError(`Employee [${data.employeeId}] not found.`);

    await this.repo.createProgressEvent({
      batchId,
      employeeId: employee.id,
      eventType: 'RESUMED',
      notes: data.notes ?? 'Batch processing resumed'
    });

    const updated = await this.repo.updateBatch(batchId, { status: 'IN_PROGRESS' });

    await this.auditWriter.record({
      actorId,
      action: 'BATCH_RESUMED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      before: { status: batch.status },
      after: { status: 'IN_PROGRESS', employeeId: employee.id }
    });

    return updated;
  }

  /**
   * 7. Record Intermediate Progress
   * Enforces quantity conservation.
   */
  async recordProgress(
    batchId: string,
    actorId: string,
    data: {
      employeeId: string;
      quantityDelta?: number;
      eventType?: string;
      completed_qty?: number;
      rejected_qty?: number;
      scrap_qty?: number;
      wastage_qty?: number;
      pending_qty?: number;
      notes?: string;
    },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'update');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);

    if (!['IN_PROGRESS', 'PARTIAL', 'REWORK', 'ASSIGNED', 'RECEIVED', 'PAUSED'].includes(batch.status)) {
      throw new InvalidStateTransitionError(`Cannot record progress for batch in ${batch.status} status. Batch is locked.`);
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundError(`Employee [${data.employeeId}] not found.`);

    const received = Number(batch.received_qty);
    const currentCompleted = Number(batch.completed_qty);
    const rejected = Number(data.rejected_qty !== undefined ? data.rejected_qty : (batch.rejected_qty ?? 0));
    const scrap = Number(data.scrap_qty !== undefined ? data.scrap_qty : (batch.scrap_qty ?? 0));
    const wastage = Number(data.wastage_qty !== undefined ? data.wastage_qty : (batch.wastage_qty ?? 0));
    const availableCustody = Math.max(0, received - currentCompleted - scrap - rejected - wastage);

    const delta = data.quantityDelta !== undefined
      ? Number(data.quantityDelta)
      : (data.completed_qty !== undefined ? Number(data.completed_qty) - currentCompleted : 0);

    const completed = data.completed_qty !== undefined
      ? Number(data.completed_qty)
      : Math.min(received, currentCompleted + delta);

    if (completed > received) {
      const upstreamName =
        (batch.incomingHandovers?.[0] as any)?.outgoingDepartment?.name ||
        (batch.routeStep as any)?.parentStep?.department?.name ||
        'upstream department';
      throw new ValidationError(
        `Cannot record ${completed} completed units: this workstation has only received ${received} units in physical custody (${currentCompleted} already completed, ${availableCustody} available to work). Please await additional handovers from ${upstreamName} before recording more progress.`
      );
    }

    if (completed + rejected + scrap + wastage > received) {
      throw new ValidationError(
        `Quantity breakdown (${completed} completed + ${rejected} rejected + ${scrap} scrap + ${wastage} wastage = ${completed + rejected + scrap + wastage}) exceeds custody received (${received}). Available to process: ${availableCustody}.`
      );
    }

    const pending = Number(
      data.pending_qty !== undefined
        ? data.pending_qty
        : Math.max(0, received - completed - rejected - scrap - wastage)
    );

    // Verify Invariant
    this.assertConservation(received, completed, rejected, scrap, wastage, pending);
    if ((batch.routeStep as any)?.branchKey && completed + 0.000001 < batch.outgoingHandovers.filter((row: any) => row.status !== 'REFUSED').reduce((sum: number, row: any) => sum + Number(row.quantity), 0)) {
      throw new ValidationError('Good output cannot be reduced below quantities already sent or awaiting acceptance.');
    }

    const totalAccounted = completed + rejected + scrap + wastage;
    const allExpectedReceived = !batch.expectedOutputQty || received >= Number(batch.expectedOutputQty) - 0.000001;
    const targetStatus = (totalAccounted >= received && received > 0 && allExpectedReceived)
      ? 'COMPLETE'
      : (totalAccounted > 0)
        ? 'PARTIAL'
        : ['ASSIGNED', 'RECEIVED'].includes(batch.status)
          ? 'IN_PROGRESS'
          : batch.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.createProgressEvent({
        batchId,
        employeeId: employee.id,
        eventType: (data.eventType as any) || 'PARTIAL_RECORDED',
        quantityDelta: delta > 0 ? delta : 0,
        notes: data.notes ?? `Progress update: completed ${completed}, pending ${pending}`
      }, tx);
      const progressBatch = await this.repo.updateBatch(batchId, {
        completed_qty: completed,
        rejected_qty: rejected,
        scrap_qty: scrap,
        wastage_qty: wastage,
        pending_qty: pending,
        status: targetStatus,
        notes: data.notes ? `${batch.notes ? batch.notes + ' | ' : ''}${data.notes}` : batch.notes
      }, tx);
      await markReleasedPlanInProgress(tx, batch.productionPlanId, actorId);
      return progressBatch;
    });

    await this.auditWriter.record({
      actorId,
      action: 'PROGRESS_RECORDED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      after: { completed, rejected, scrap, wastage, pending, employeeId: employee.id }
    });

    return updated;
  }

  /**
   * 8. Record Exception (Rejection, Scrap, Wastage, Interruption)
   */
  async recordException(
    batchId: string,
    actorId: string,
    data: {
      employeeId: string;
      type: 'REJECTION' | 'SCRAP' | 'WASTAGE' | 'PENDING' | 'INTERRUPTION';
      quantity: number;
      reason: string;
    },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'update');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);

    if (!data.reason?.trim()) {
      throw new ValidationError('Reason is mandatory for exception records.');
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundError(`Employee [${data.employeeId}] not found.`);

    const record = await this.repo.createExceptionRecord({
      batchId,
      type: data.type,
      quantity: Number(data.quantity || 0),
      reason: data.reason.trim(),
      employeeId: employee.id
    });

    await this.auditWriter.record({
      actorId,
      action: 'EXCEPTION_RECORDED',
      entityType: 'ExceptionRecord',
      entityId: record.id,
      metadata: { batchId, type: data.type, quantity: data.quantity, reason: data.reason }
    });
    // If exception is SCRAP, WASTAGE, or REJECTION, automatically register LossEvent in Scrap & Wastage Module
    // and PAUSE the batch execution until the Store Manager verifies, reverts, or replaces the scrap
    const isLossException = ['SCRAP', 'WASTAGE', 'REJECTION'].includes(data.type);
    if (isLossException) {
      try {
        const fullBatch = await this.prisma.departmentExecutionBatch.findUnique({
          where: { id: batchId },
          include: {
            productionPlan: { include: { product: true } },
            department: true
          }
        });

        const productId = fullBatch?.productionPlan?.productId || null;
        const uomId = fullBatch?.productionPlan?.product?.uomId;

        if (productId && uomId) {
          const year = new Date().getFullYear();
          const count = await this.prisma.lossEvent.count();
          const pad = String(count + 1).padStart(5, '0');
          const lossNumber = `LOSS-${year}-${pad}`;

          const createdLoss = await this.prisma.lossEvent.create({
            data: {
              lossNumber,
              sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
              sourceExceptionRecordId: record.id,
              productId,
              uomId,
              departmentId: batch.departmentId || null,
              quantity: Number(data.quantity || 0),
              reason: data.reason.trim(),
              reportedByActorId: actorId,
              status: 'REPORTED'
            }
          });

          // 1. Notify Store Managers and Admins
          try {
            const planNumber = fullBatch?.productionPlan?.planNumber || batch.batchNumber;
            const deptName = fullBatch?.department?.name || 'Department';
            const prodName = fullBatch?.productionPlan?.product?.name || 'Product';
            await notificationService.notifyRoles({
              roles: ['store-manager', 'store_manager', 'inventory-manager', 'admin', 'manager'],
              type: 'WORKFLOW',
              title: `[EXECUTION PAUSED] ${data.type} Exception on ${batch.batchNumber}`,
              message: `${deptName} reported ${Number(data.quantity)} units ${data.type} ("${data.reason.trim()}") on batch #${batch.batchNumber} (${prodName}, Plan: ${planNumber}). Execution is PAUSED awaiting your material verification and replacement/reversal.`,
              resource: 'LossEvent',
              resourceId: createdLoss.id,
              href: `/scrap-wastage/${createdLoss.id}`,
              metadata: {
                lossEventId: createdLoss.id,
                lossNumber: createdLoss.lossNumber,
                batchId: batch.id,
                batchNumber: batch.batchNumber,
                quantity: Number(data.quantity),
                reason: data.reason
              }
            });
          } catch (notifErr) {
            console.warn('[DepartmentExecutionService.recordException] Store Manager notification warning:', notifErr);
          }

          // 2. Notify Department Head and Department
          try {
            if (batch.departmentId) {
              await notificationService.notifyDepartment({
                departmentId: batch.departmentId,
                type: 'WORKFLOW',
                title: `[EXECUTION PAUSED] ${data.type} Exception on ${batch.batchNumber}`,
                message: `Batch #${batch.batchNumber} has been PAUSED due to a ${data.type} exception of ${Number(data.quantity)} units ("${data.reason.trim()}"). Store Manager has been notified to verify scrap and issue replacement material before production can resume.`,
                resource: 'DepartmentExecutionBatch',
                resourceId: batch.id,
                href: `/production/execution/${batch.id}`,
                metadata: {
                  batchId: batch.id,
                  batchNumber: batch.batchNumber,
                  exceptionType: data.type,
                  quantity: Number(data.quantity)
                }
              });
            }
          } catch (deptNotifErr) {
            console.warn('[DepartmentExecutionService.recordException] Department notification warning:', deptNotifErr);
          }
        }
      } catch (lossErr) {
        console.warn('[DepartmentExecutionService.recordException] Failed to auto-create LossEvent:', lossErr);
      }
    }

    // Automatically update batch yield breakdown (scrap/wastage/rejection)
    const qty = Number(data.quantity || 0);
    const received = Number(batch.received_qty);
    const completed = Number(batch.completed_qty);
    let rejected = Number(batch.rejected_qty || 0);
    let scrap = Number(batch.scrap_qty || 0);
    let wastage = Number(batch.wastage_qty || 0);

    if (data.type === 'SCRAP') {
      scrap += qty;
    } else if (data.type === 'WASTAGE') {
      wastage += qty;
    } else if (data.type === 'REJECTION') {
      rejected += qty;
    }

    const pending = Math.max(0, received - completed - rejected - scrap - wastage);

    // In-process scrap/loss logging updates yield breakdown while allowing run to continue
    const allExpectedReceived = !batch.expectedOutputQty || received >= Number(batch.expectedOutputQty) - 0.000001;
    const targetStatus = (pending === 0 && (completed + scrap + wastage + rejected >= received) && allExpectedReceived)
      ? 'COMPLETE'
      : (completed + scrap + wastage + rejected > 0)
        ? 'PARTIAL'
        : batch.status;

    await this.repo.updateBatch(batchId, {
      completed_qty: completed,
      rejected_qty: rejected,
      scrap_qty: scrap,
      wastage_qty: wastage,
      pending_qty: pending,
      status: targetStatus,
      notes: isLossException
        ? `${batch.notes ? batch.notes + ' | ' : ''}${data.type} exception recorded (${qty} units: "${data.reason.trim()}"). Loss proposal registered.`
        : batch.notes
    });

    if (isLossException) {
      await this.repo.createProgressEvent({
        batchId,
        employeeId: employee.id,
        eventType: 'PARTIAL_RECORDED',
        quantityDelta: 0,
        notes: `Floor defect/scrap logged: ${data.type} (${qty} units: "${data.reason.trim()}").`
      });
    }

    return record;
  }

  /**
   * 9. Complete Department Stage
   * Enforces quantity conservation.
   * Graph tasks remain department output until Assembly accepts their handovers.
   */
  async completeBatch(
    batchId: string,
    actorId: string,
    data: {
      employeeId: string;
      completed_qty?: number;
      rejected_qty?: number;
      scrap_qty?: number;
      wastage_qty?: number;
      pending_qty?: number;
      notes?: string;
    },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'complete');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);
    if ((batch.routeStep as any)?.branchKey && Number(batch.received_qty) < Number(batch.expectedOutputQty) - 0.000001) {
      throw new ValidationError('This task still has expected upstream work to receive.');
    }
    this.validateStateTransition(batch.status, 'COMPLETE');

    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundError(`Employee [${data.employeeId}] not found.`);

    const received = Number(batch.received_qty);
    const completed = Number(data.completed_qty !== undefined ? data.completed_qty : (batch.completed_qty ?? received));
    const rejected = Number(data.rejected_qty !== undefined ? data.rejected_qty : (batch.rejected_qty ?? 0));
    const scrap = Number(data.scrap_qty !== undefined ? data.scrap_qty : (batch.scrap_qty ?? 0));
    const wastage = Number(data.wastage_qty !== undefined ? data.wastage_qty : (batch.wastage_qty ?? 0));
    const pending = Number(
      data.pending_qty !== undefined
        ? data.pending_qty
        : Math.max(0, received - completed - rejected - scrap - wastage)
    );

    // Check if scrap proposal was explicitly rejected by Store Manager
    const scrapExceptions = (batch.exceptionRecords || []).filter(
      (exc: any) => exc.type === 'SCRAP' && Number(exc.quantity) > 0
    );
    for (const exc of scrapExceptions) {
      const lossEvent = exc.LossEvent;
      if (lossEvent?.status === 'REJECTED') {
        throw new ValidationError(
          `Cannot complete stage with unworked scrap: Scrap proposal [${lossEvent.lossNumber}] was rejected by the Store Manager (Reason: "${lossEvent.rejectionReason || 'Production required'}"). The department head is bound to complete production with this material.`
        );
      }
    }

    // Enforce conservation
    this.assertConservation(received, completed, rejected, scrap, wastage, pending);
    if ((batch.routeStep as any)?.branchKey && completed + 0.000001 < batch.outgoingHandovers.filter((row: any) => row.status !== 'REFUSED').reduce((sum: number, row: any) => sum + Number(row.quantity), 0)) {
      throw new ValidationError('Good output cannot be reduced below quantities already sent or awaiting acceptance.');
    }
    if ((batch.routeStep as any)?.branchKey && pending > 0.000001) {
      throw new ValidationError('Finish or reconcile all remaining work before completing this task.');
    }
    await this.repo.createProgressEvent({
      batchId,
      employeeId: employee.id,
      eventType: 'COMPLETED',
      quantityDelta: completed - Number(batch.completed_qty),
      notes: data.notes ?? `Completed stage with ${completed} units`
    });

    const updatedBatch = await this.repo.updateBatch(batchId, {
      completed_qty: completed,
      rejected_qty: rejected,
      scrap_qty: scrap,
      wastage_qty: wastage,
      pending_qty: pending,
      status: 'COMPLETE',
      notes: data.notes ? `${batch.notes ? batch.notes + ' | ' : ''}${data.notes}` : batch.notes
    });

    await this.auditWriter.record({
      actorId,
      action: 'BATCH_COMPLETED',
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      before: { status: batch.status },
      after: { status: 'COMPLETE', completed }
    });

    return updatedBatch;
  }

  /**
   * 10. Propose Digital Handover
   * Dispatched by outgoing department with specific quantity and idempotency key.
   */
  async proposeHandover(
    batchId: string,
    actorId: string,
    data: {
      quantity: number;
      incomingDepartmentId: string;
      idempotencyKey: string;
      notes?: string;
    },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'handover_propose');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    await this.checkDeptScope(actorId, batch.departmentId, checker);
    if ((batch.routeStep as any)?.branchKey) return this.proposeGraphHandover(batchId, actorId, data, checker);

    if (!['COMPLETE', 'PARTIAL'].includes(batch.status)) {
      throw new InvalidStateTransitionError(`Batch must be COMPLETE or PARTIAL to propose handover (current: ${batch.status}).`);
    }

    // Idempotency check:
    const existing = await this.repo.findHandoverByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return existing;
    }

    const qty = Number(data.quantity);
    if (qty <= 0 || qty > Number(batch.completed_qty)) {
      throw new ValidationError(
        `Handover quantity (${qty}) must be positive and cannot exceed completed quantity (${batch.completed_qty}).`
      );
    }

    // Business rule: Before completing the supposed amount of production (e.g. if 10 are supposed then 10 should be completed),
    // department head cannot handover or dispatch.
    // Check that completed quantity equals or exceeds received_qty (full planned target).
    const supposedQty = Number(batch.received_qty);
    const completedQty = Number(batch.completed_qty);
    if (completedQty < supposedQty) {
      throw new ValidationError(
        `Cannot propose handover or dispatch: The department head is bound to complete the full supposed production quantity (${supposedQty} units). Current completed quantity is only ${completedQty} units. If scrap occurred, await Store Manager approval and inventory replenishment before dispatching handover.`
      );
    }

    const incomingDept = await this.prisma.department.findUnique({
      where: { id: data.incomingDepartmentId }
    });
    if (!incomingDept) {
      throw new NotFoundError(`Incoming department [${data.incomingDepartmentId}] not found.`);
    }

    const handover = await this.repo.createHandover({
      outgoingBatchId: batchId,
      outgoingDepartmentId: batch.departmentId,
      incomingDepartmentId: data.incomingDepartmentId,
      quantity: qty,
      status: 'PROPOSED',
      proposedByActorId: actorId,
      idempotencyKey: data.idempotencyKey,
      notes: data.notes ?? null
    });

    await this.repo.updateBatch(batchId, { status: 'HANDOVER_PENDING' });

    await this.auditWriter.record({
      actorId,
      action: 'HANDOVER_PROPOSED',
      entityType: 'Handover',
      entityId: handover.id,
      metadata: { outgoingBatchId: batchId, incomingDepartmentId: data.incomingDepartmentId, quantity: qty }
    });

    await this.notifyProposedHandover({
      handoverId: handover.id,
      outgoingBatchId: batch.id,
      outgoingBatchNumber: batch.batchNumber,
      outgoingDeptName: batch.department?.name || 'Previous Department',
      incomingDepartmentId: incomingDept.id,
      incomingDeptName: incomingDept.name,
      quantity: qty,
      notes: data.notes
    });

    return handover;
  }

  /**
   * 11. Decide Handover (Accept or Refuse)
   * Scoped to incoming department.
   * If ACCEPTED: Creates next department's DepartmentExecutionBatch with status RECEIVED
   * and received_qty referencing accepted quantity.
   */
  async decideHandover(
    handoverId: string,
    actorId: string,
    data: {
      status: 'ACCEPTED' | 'REFUSED';
      refusalReason?: string;
      idempotencyKey?: string;
      notes?: string;
    },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'handover_accept');

    const handover = await this.repo.findHandoverById(handoverId);
    if (!handover) throw new NotFoundError(`Handover [${handoverId}] not found.`);
    const graphHandover = await this.prisma.handover.findUnique({ where: { id: handoverId }, select: { incomingBatchId: true, assemblyIntakeId: true } });
    if (graphHandover?.incomingBatchId || graphHandover?.assemblyIntakeId) return this.decideGraphHandover(handoverId, actorId, data, checker);

    // Scoped to incoming department
    await this.checkDeptScope(actorId, handover.incomingDepartmentId, checker);

    if (handover.status !== 'PROPOSED') {
      // Idempotent replay: if already decided, return current state
      return handover;
    }

    if (data.status === 'REFUSED') {
      if (!data.refusalReason?.trim()) {
        throw new ValidationError('Refusal reason is mandatory when refusing a handover.');
      }

      const updated = await this.repo.updateHandover(handoverId, {
        status: 'REFUSED',
        decidedByActorId: actorId,
        decidedAt: new Date(),
        refusalReason: data.refusalReason.trim(),
        notes: data.notes ?? handover.notes
      });

      // Outgoing batch remains at HANDOVER_PENDING for visibility and correction
      await this.auditWriter.record({
        actorId,
        action: 'HANDOVER_REFUSED',
        entityType: 'Handover',
        entityId: handoverId,
        metadata: { reason: data.refusalReason }
      });

      // Notify outgoing department head that handover transfer was refused
      try {
        await notificationService.notifyDepartment({
          departmentId: handover.outgoingDepartmentId,
          type: 'WARNING' as any,
          title: `Handover Transfer Refused: Batch ${handover.outgoingBatch?.batchNumber || 'Batch'}`,
          message: `${handover.incomingDepartment?.name || 'Incoming department'} refused the handover transfer of ${handover.quantity} units. Reason: ${data.refusalReason.trim()}`,
          resource: 'DepartmentExecutionBatch',
          resourceId: handover.outgoingBatchId,
          href: `/production/execution`,
          metadata: {
            handoverId,
            batchId: handover.outgoingBatchId,
            refusalReason: data.refusalReason.trim()
          }
        });
      } catch (notifErr) {
        console.warn('Failed to dispatch handover refused notification:', notifErr);
      }

      return updated;
    }

    // ACCEPTED Workflow:
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedHandover = await this.repo.updateHandover(handoverId, {
        status: 'ACCEPTED',
        decidedByActorId: actorId,
        decidedAt: now,
        notes: data.notes ?? handover.notes
      }, tx);

      // Outgoing batch marked NEXT_STAGE_ACCEPTED
      await this.repo.updateBatch(handover.outgoingBatchId, {
        status: 'NEXT_STAGE_ACCEPTED'
      }, tx);

      // Find next route step details
      const outgoingBatch = await this.repo.findBatchById(handover.outgoingBatchId, tx);
      const nextSequence = (outgoingBatch?.stageSequenceNumber ?? 1) + 1;

      // Lookup RouteStep for incoming department
      const plan = await tx.productionPlan.findUnique({
        where: { id: outgoingBatch!.productionPlanId },
        include: {
          route: {
            include: {
              steps: { orderBy: { sequenceNumber: 'asc' } }
            }
          }
        }
      });

      const sortedSteps = [...(plan?.route?.steps || [])].sort((a: any, b: any) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
      const currentStepIdx = sortedSteps.findIndex((s: any) => (outgoingBatch?.routeStepId && s.id === outgoingBatch.routeStepId) || s.sequenceNumber === outgoingBatch?.stageSequenceNumber);
      const nextRouteStep = (currentStepIdx !== -1 && currentStepIdx < sortedSteps.length - 1)
        ? sortedSteps[currentStepIdx + 1]
        : sortedSteps.find((s: any) => s.sequenceNumber === nextSequence) || sortedSteps.find((s: any) => (s.sequenceNumber ?? 0) > (outgoingBatch?.stageSequenceNumber ?? 0));

      const resolvedSequenceNumber = nextRouteStep?.sequenceNumber ?? nextSequence;

      // Generate next batch number
      const nextBatchNumber = `${outgoingBatch!.batchNumber}-S${resolvedSequenceNumber}`;
      const acceptedQty = Number(handover.quantity);

      const newBatch = await this.repo.createBatch({
        batchNumber: nextBatchNumber,
        productionPlanId: outgoingBatch!.productionPlanId,
        materialIssueId: outgoingBatch!.materialIssueId,
        departmentId: handover.incomingDepartmentId,
        workCenterId: nextRouteStep?.workCenterId ?? null,
        routeStepId: nextRouteStep?.id ?? null,
        stageSequenceNumber: resolvedSequenceNumber,
        status: 'RECEIVED',
        received_qty: acceptedQty,
        pending_qty: acceptedQty,
        notes: `Created from accepted handover [${handover.id}] from ${handover.outgoingDepartment.name}`,
        sourceHandoverId: handover.id,
        createdByActorId: actorId
      }, tx);

      // Auto-assign incoming department operator if available
      const incomingEmployees = (tx as any).employee?.findMany
        ? await (tx as any).employee.findMany({
          where: { departmentId: handover.incomingDepartmentId, status: 'ACTIVE' },
          take: 2
        })
        : [];
      if (incomingEmployees.length > 0) {
        const assignedEmp = incomingEmployees[0];
        await this.repo.createWorkerAssignment({
          batchId: newBatch.id,
          employeeId: assignedEmp.id,
          subtaskDescription: `Auto-assigned operator for stage #${nextSequence} (${nextRouteStep?.stepName || 'Processing'})`,
          assignedByActorId: actorId
        }, tx);
      }

      await this.auditWriter.record({
        actorId,
        action: 'HANDOVER_ACCEPTED',
        entityType: 'Handover',
        entityId: handoverId,
        after: { newBatchId: newBatch.id, acceptedQuantity: acceptedQty }
      });

      return { handover: updatedHandover, newBatch, assignedEmpId: incomingEmployees[0]?.id };
    });

    // Send notification to newly assigned operator outside of transaction
    if (result.assignedEmpId && result.newBatch) {
      await this.notifyAssignedOperator({
        employeeId: result.assignedEmpId,
        batchId: result.newBatch.id,
        batchNumber: result.newBatch.batchNumber,
        stageSequenceNumber: result.newBatch.stageSequenceNumber,
        stepName: result.newBatch.routeStep?.stepName,
        departmentName: result.newBatch.department?.name,
        quantity: Number(result.newBatch.received_qty)
      });
    }

    if (result.newBatch) {
      await this.notifyDepartmentOfNewBatch({
        departmentId: result.newBatch.departmentId,
        batchId: result.newBatch.id,
        batchNumber: result.newBatch.batchNumber,
        stageSequenceNumber: result.newBatch.stageSequenceNumber,
        stepName: result.newBatch.routeStep?.stepName,
        departmentName: result.newBatch.department?.name,
        quantity: Number(result.newBatch.received_qty)
      });
    }

    // Notify outgoing department head that handover was accepted
    try {
      await notificationService.notifyDepartment({
        departmentId: handover.outgoingDepartmentId,
        type: 'SUCCESS' as any,
        title: `Handover Transfer Accepted: Batch ${handover.outgoingBatch?.batchNumber || result.newBatch?.batchNumber || 'Batch'}`,
        message: `${handover.incomingDepartment?.name || 'Incoming department'} accepted your handover transfer of ${handover.quantity} units.`,
        resource: 'DepartmentExecutionBatch',
        resourceId: handover.outgoingBatchId,
        href: `/production/execution`,
        metadata: {
          handoverId,
          batchId: handover.outgoingBatchId,
          quantity: handover.quantity
        }
      });
    } catch (notifErr) {
      console.warn('Failed to dispatch handover accepted notification:', notifErr);
    }

    return { handover: result.handover, newBatch: result.newBatch };
  }

  /**
   * 12. Managerial Override Actions
   * Uses distinct 'override_manage' permission and emits distinguishable audit events.
   */
  async managerialOverride(
    batchId: string,
    actorId: string,
    data: {
      action: 'FORCE_ACCEPT_HANDOVER' | 'REASSIGN_DEPARTMENT' | 'OVERRIDE_STATUS';
      targetDepartmentId?: string;
      targetStatus?: any;
      reason: string;
    },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'override_manage');

    if (!data.reason?.trim() || data.reason.trim().length < 5) {
      throw new ValidationError('A detailed reason (at least 5 characters) is mandatory for managerial override.');
    }

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);

    const updateData: Record<string, unknown> = {};

    if (data.action === 'REASSIGN_DEPARTMENT') {
      if (!data.targetDepartmentId) {
        throw new ValidationError('targetDepartmentId is required for REASSIGN_DEPARTMENT override.');
      }
      const dept = await this.prisma.department.findUnique({ where: { id: data.targetDepartmentId } });
      if (!dept) throw new NotFoundError(`Target Department [${data.targetDepartmentId}] not found.`);
      updateData.departmentId = data.targetDepartmentId;
    } else if (data.action === 'OVERRIDE_STATUS') {
      if (!data.targetStatus) {
        throw new ValidationError('targetStatus is required for OVERRIDE_STATUS override.');
      }
      updateData.status = data.targetStatus;
    } else if (data.action === 'FORCE_ACCEPT_HANDOVER') {
      const pendingHandover = await this.prisma.handover.findFirst({
        where: { outgoingBatchId: batchId, status: 'PROPOSED' }
      });
      if (!pendingHandover) {
        throw new NotFoundError('No pending handover found to force-accept.');
      }
      return this.decideHandover(pendingHandover.id, actorId, { status: 'ACCEPTED', notes: `Managerial Force-Accept: ${data.reason}` }, checker);
    }

    const updated = await this.repo.updateBatch(batchId, updateData);

    await this.auditWriter.record({
      actorId,
      action: `MANAGERIAL_OVERRIDE_${data.action}`,
      entityType: 'DepartmentExecutionBatch',
      entityId: batchId,
      metadata: { reason: data.reason.trim(), overrideAction: data.action, changes: updateData }
    });

    return updated;
  }

  /**
   * 13. Post Final Stage Semi-Finished Goods (SFG) to Inventory & Store
   * Updates InventoryBalance, creates StockLedgerEntry (RECEIPT), and syncs with Store & Raw Materials.
   */
  async postBatchToInventory(_batchId: string, _actorId: string, _data: { quantity?: number; locationId?: string; notes?: string }, _checker?: PermissionChecker) {
    throw new ValidationError('Department output must be handed to its configured next task or Assembly. Finished product inventory is created only after Assembly.');
  }

  private async receiveGraphBatch(batchId: string, actorId: string, checker?: PermissionChecker) {
    const batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError('Task not found.');
    await this.checkDeptScope(actorId, batch.departmentId, checker);
    const upstreamAccepted = batch.incomingHandovers.some((row: any) => row.status === 'ACCEPTED');
    const hasParent = Boolean((batch.routeStep as any)?.parentStepId);
    return this.prisma.$transaction(async (tx) => {
      for (const row of batch.materialAssignments) {
        await tx.productionTaskMaterialAssignment.update({ where: { id: row.id }, data: { receivedQty: row.issuedQty } });
      }
      return tx.departmentExecutionBatch.update({
        where: { id: batchId },
        data: {
          status: hasParent && !upstreamAccepted ? 'PENDING' : 'RECEIVED',
          ...(!hasParent && Number(batch.received_qty) === 0 ? {
            received_qty: batch.expectedOutputQty,
            pending_qty: batch.expectedOutputQty
          } : {})
        }
      });
    });
  }

  private async proposeGraphHandover(
    batchId: string, actorId: string,
    data: { quantity: number; incomingDepartmentId: string; idempotencyKey: string; notes?: string },
    checker?: PermissionChecker
  ) {
    await this.checkDeptScope(actorId, (await this.repo.findBatchById(batchId))?.departmentId, checker);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "department_execution_batches" WHERE "id" = ${batchId} FOR UPDATE`;
      const existing = await tx.handover.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) {
        if (existing.outgoingBatchId !== batchId) throw new ConflictError('Handover request key belongs to another task.');
        return existing;
      }
      const batch = await tx.departmentExecutionBatch.findUnique({ where: { id: batchId }, include: { routeStep: true, outgoingHandovers: true, productionPlan: { include: { route: true } } } });
      if (!batch?.routeStep?.branchKey) throw new NotFoundError('Graph task not found.');
      if (!['IN_PROGRESS', 'PARTIAL', 'COMPLETE', 'HANDOVER_PENDING'].includes(batch.status)) throw new ValidationError('Record good output before handing it over.');
      const available = availableGoodOutput(batch.completed_qty, batch.outgoingHandovers);
      const quantity = Number(data.quantity);
      if (!(quantity > 0) || quantity > available + 0.000001) throw new ValidationError(`Only ${Math.max(0, available)} units are available to hand over.`);
      const sequenceNext = await tx.routeStep.findUnique({ where: { parentStepId: batch.routeStep.id } });
      const selectedNextDepartmentId = batch.routeStep.nextDepartmentId || sequenceNext?.departmentId || batch.productionPlan.route?.assemblyDepartmentId;
      const sendsToAssembly = selectedNextDepartmentId === batch.productionPlan.route?.assemblyDepartmentId;
      const next = sendsToAssembly ? null : selectedNextDepartmentId
        ? await tx.routeStep.findFirst({ where: { routeId: batch.routeStep.routeId, departmentId: selectedNextDepartmentId } })
        : sequenceNext;
      const incomingBatch = next ? await tx.departmentExecutionBatch.findFirst({ where: { productionPlanId: batch.productionPlanId, routeStepId: next.id } }) : null;
      const intake = sendsToAssembly || !next
        ? await tx.assemblyIntakeRequirement.findUnique({ where: { productionPlanId_sourceStepId: { productionPlanId: batch.productionPlanId, sourceStepId: batch.routeStep.id } } })
        : null;
      if (next && !incomingBatch || !next && !intake) throw new ValidationError('The configured destination is missing.');
      const destinationDepartmentId = selectedNextDepartmentId;
      const targetDepartmentId = data.incomingDepartmentId || destinationDepartmentId;
      if (!destinationDepartmentId || targetDepartmentId !== destinationDepartmentId) throw new ValidationError('Handover destination does not match the approved route.');
      return tx.handover.create({
        data: {
          outgoingBatchId: batchId, outgoingDepartmentId: batch.departmentId,
          incomingDepartmentId: destinationDepartmentId, incomingBatchId: incomingBatch?.id,
          assemblyIntakeId: intake?.id, quantity, status: 'PROPOSED',
          proposedByActorId: actorId, idempotencyKey: data.idempotencyKey, notes: data.notes || null
        }
      });
    });
    const source = await this.prisma.departmentExecutionBatch.findUnique({ where: { id: batchId }, select: { productionPlanId: true, outputItemId: true, outputItemType: true, outputUomId: true } });
    const [unit, namedItem] = await Promise.all([
      source?.outputUomId ? this.prisma.unitOfMeasure.findUnique({ where: { id: source.outputUomId }, select: { symbol: true, name: true } }) : null,
      source?.outputItemId ? source.outputItemType === 'MATERIAL'
        ? this.prisma.material.findUnique({ where: { id: source.outputItemId }, select: { name: true } })
        : this.prisma.product.findUnique({ where: { id: source.outputItemId }, select: { name: true } }) : null
    ]);
    await notificationService.notifyDepartment({
      departmentId: result.incomingDepartmentId, title: 'Production handover ready to receive',
      message: `${result.quantity} ${unit?.symbol || unit?.name || 'units'} of ${namedItem?.name || 'department output'} are ready for acceptance.`,
      resource: 'Handover', resourceId: result.id,
      href: result.incomingBatchId ? `/production/execution/${result.incomingBatchId}` : `/production/execution/plans/${source?.productionPlanId}`,
      dedupeKeyPrefix: `GRAPH_HANDOVER_PROPOSED:${result.id}`
    });
    return result;
  }

  private async decideGraphHandover(
    handoverId: string, actorId: string,
    data: { status: 'ACCEPTED' | 'REFUSED'; refusalReason?: string; notes?: string },
    checker?: PermissionChecker
  ) {
    const handover = await this.prisma.handover.findUnique({ where: { id: handoverId } });
    if (!handover) throw new NotFoundError('Handover not found.');
    await this.checkDeptScope(actorId, handover.incomingDepartmentId, checker);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "handovers" WHERE "id" = ${handoverId} FOR UPDATE`;
      const current = await tx.handover.findUniqueOrThrow({ where: { id: handoverId } });
      if (current.status !== 'PROPOSED') return current;
      if (data.status === 'REFUSED' && !data.refusalReason?.trim()) throw new ValidationError('A refusal reason is required.');
      const updated = await tx.handover.update({
        where: { id: handoverId }, data: {
          status: data.status, decidedByActorId: actorId, decidedAt: new Date(),
          refusalReason: data.status === 'REFUSED' ? data.refusalReason!.trim() : null,
          notes: data.notes ?? current.notes
        }
      });
      if (data.status === 'ACCEPTED') {
        if (current.incomingBatchId) {
          const target = await tx.departmentExecutionBatch.findUniqueOrThrow({ where: { id: current.incomingBatchId }, include: { materialAssignments: true, routeStep: { include: { parentStep: true } } } });
          const parentRatio = Number(target.routeStep?.parentStep?.outputQuantityPerUnit || 0);
          const childRatio = Number(target.routeStep?.outputQuantityPerUnit || 0);
          if (!(parentRatio > 0) || !(childRatio > 0)) throw new ValidationError('The subroute output ratio is missing.');
          const workQuantity = childWorkFromAcceptedOutput(current.quantity, parentRatio, childRatio);
          // Department handover receives WIP from upstream workstation.
          // Warehouse raw material assignments are kept strictly separate and must be accepted individually by the department.
          const allMaterialsReceived =
            target.materialAssignments.length === 0 ||
            target.materialAssignments.every((row: any) => Number(row.receivedQty) >= Number(row.issuedQty));

          await tx.departmentExecutionBatch.update({
            where: { id: target.id }, data: {
              received_qty: { increment: workQuantity }, pending_qty: { increment: workQuantity },
              ...(target.status === 'PENDING'
                ? { status: allMaterialsReceived ? ('RECEIVED' as const) : ('AWAITING_RECEIPT' as const) }
                : {})
            }
          });
        }
        if (current.assemblyIntakeId) await tx.assemblyIntakeRequirement.update({ where: { id: current.assemblyIntakeId }, data: { acceptedQty: { increment: current.quantity } } });
      }
      return updated;
    });
    await notificationService.notifyDepartment({
      departmentId: result.outgoingDepartmentId,
      title: result.status === 'ACCEPTED' ? 'Handover accepted' : 'Handover refused',
      message: result.status === 'ACCEPTED' ? `${result.quantity} units were accepted.` : data.refusalReason || 'Handover refused.',
      resource: 'Handover', resourceId: result.id, href: `/production/execution/${result.outgoingBatchId}`,
      dedupeKeyPrefix: `GRAPH_HANDOVER_DECISION:${result.id}:${result.status}`
    });
    if (result.status === 'ACCEPTED' && result.assemblyIntakeId) {
      const intake = await this.prisma.assemblyIntakeRequirement.findUnique({ where: { id: result.assemblyIntakeId } });
      if (intake) await notifyAssemblyReadiness(intake.productionPlanId);
    }
    return result;
  }

  // Queue and Detail Queries
  async getDepartmentQueue(departmentId: string, actorId: string, params: { page?: number; limit?: number; status?: any; search?: string } = {}, checker?: PermissionChecker) {
    const actorScope = actorId === 'system' ? null : await productionActorScope(actorId);
    if (departmentId !== 'all') await this.checkDeptScope(actorId, departmentId, checker);
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 50)));
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (actorScope?.operator) where.workerAssignments = { some: { employeeId: actorScope.employeeId } };
    if (params.search) {
      where.OR = [
        { batchNumber: { contains: params.search, mode: 'insensitive' } },
        { notes: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    let resolvedDeptId = departmentId;
    if (departmentId === 'all') {
      const isGlobal = await this.checkDeptScope(actorId, 'all', checker).then(() => true).catch(() => false);
      if (!isGlobal) {
        // Resolve actor assigned department if they are not a global manager
        const actor = await this.prisma.user.findUnique({
          where: { id: actorId },
          select: { assignedDepartmentId: true }
        }).catch(() => null);
        if (actor?.assignedDepartmentId) {
          resolvedDeptId = actor.assignedDepartmentId;
        }
      }
    }
    const isAll = resolvedDeptId === 'all' || !resolvedDeptId;
    // Auto-initialize batches for released plans missing batches
    try {
      const releasedPlansWithoutBatches = await this.prisma.productionPlan.findMany({
        where: {
          status: { in: ['APPROVED', 'IN_PROGRESS'] },
          batches: { none: {} }
        },
        include: {
          route: {
            include: {
              steps: { orderBy: { sequenceNumber: 'asc' } }
            }
          }
        }
      });
      for (const p of releasedPlansWithoutBatches) {
        const step1 = p.route?.steps?.[0];
        if (step1 && (isAll || step1.departmentId === departmentId)) {
          await this.initializeBatch({ productionPlanId: p.id }, actorId, checker).catch(() => { });
        }
      }
    } catch {
      // Ignore background sync errors
    }

    const [items, total] = isAll
      ? await this.repo.listBatches(where, (page - 1) * limit, limit)
      : await this.repo.listDepartmentQueue(resolvedDeptId, where, (page - 1) * limit, limit);

    const handoverWhere: Record<string, unknown> = { status: 'PROPOSED' };
    if (!isAll) {
      handoverWhere.incomingDepartmentId = resolvedDeptId;
    }

    const incomingHandovers = !actorScope?.operator && (this.prisma as any).handover?.findMany
      ? await (this.prisma as any).handover.findMany({
        where: handoverWhere,
        include: {
          outgoingBatch: {
            include: {
              productionPlan: {
                include: {
                  product: { include: { uom: true } },
                  route: {
                    include: {
                      steps: {
                        orderBy: { sequenceNumber: 'asc' },
                        include: { department: true, workCenter: true }
                      }
                    }
                  }
                }
              },
              department: true,
              workCenter: true,
              routeStep: true
            }
          },
          outgoingDepartment: true,
          incomingDepartment: true
        },
        orderBy: { proposedAt: 'desc' }
      })
      : [];

    const enrichedItems = await Promise.all(items.map((b: any) => this.enrichBatchWithItemDetails(b)));
    return { items: enrichedItems, total, page, limit, incomingHandovers };
  }

  async getBatchById(batchId: string, actorId: string, checker?: PermissionChecker) {
    let batch = await this.repo.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Batch [${batchId}] not found.`);
    await this.checkDeptScope(actorId, batch.departmentId, checker);

    // Auto-reconcile / self-heal custody quantity if batch received_qty was inflated beyond the plan quantity
    if (!(batch.routeStep as any)?.branchKey && batch.productionPlan && batch.stageSequenceNumber === 1) {
      const planTarget = Number(batch.productionPlan.quantity || 0);
      const currReceived = Number(batch.received_qty || 0);
      if (planTarget > 0 && currReceived > planTarget) {
        const completed = Number(batch.completed_qty || 0);
        const rejected = Number(batch.rejected_qty || 0);
        const scrap = Number(batch.scrap_qty || 0);
        const wastage = Number(batch.wastage_qty || 0);
        const correctPending = Math.max(0, planTarget - completed - rejected - scrap - wastage);

        await this.repo.updateBatch(batchId, {
          received_qty: planTarget,
          pending_qty: correctPending
        });
        batch = await this.repo.findBatchById(batchId);
      }
    } else if (!(batch.routeStep as any)?.branchKey && batch.sourceHandover && batch.stageSequenceNumber && batch.stageSequenceNumber > 1) {
      const handoverTarget = Number(batch.sourceHandover.quantity || 0);
      const currReceived = Number(batch.received_qty || 0);
      if (handoverTarget > 0 && currReceived > handoverTarget) {
        const completed = Number(batch.completed_qty || 0);
        const rejected = Number(batch.rejected_qty || 0);
        const scrap = Number(batch.scrap_qty || 0);
        const wastage = Number(batch.wastage_qty || 0);
        const correctPending = Math.max(0, handoverTarget - completed - rejected - scrap - wastage);

        await this.repo.updateBatch(batchId, {
          received_qty: handoverTarget,
          pending_qty: correctPending
        });
        batch = await this.repo.findBatchById(batchId);
      }
    }

    return this.enrichBatchWithItemDetails(batch!);
  }

  private async enrichBatchWithItemDetails(batch: any): Promise<any> {
    if (!batch) return batch;

    const productIds = new Set<string>();
    const materialIds = new Set<string>();
    const uomIds = new Set<string>();

    const outItemId = batch.outputItemId || batch.routeStep?.outputItemId;
    const outItemType = batch.outputItemType || batch.routeStep?.outputItemType;
    const outUomId = batch.outputUomId || batch.routeStep?.outputUomId;

    if (outItemId) {
      if (outItemType === 'PRODUCT') productIds.add(outItemId);
      else if (outItemType === 'MATERIAL') materialIds.add(outItemId);
    }
    if (outUomId) uomIds.add(outUomId);

    (batch.incomingHandovers || []).forEach((h: any) => {
      const ob = h.outgoingBatch;
      if (ob?.outputItemId) {
        if (ob.outputItemType === 'PRODUCT') productIds.add(ob.outputItemId);
        else if (ob.outputItemType === 'MATERIAL') materialIds.add(ob.outputItemId);
      }
      if (ob?.outputUomId) uomIds.add(ob.outputUomId);
    });

    (batch.outgoingHandovers || []).forEach((h: any) => {
      if (h.assemblyIntake?.itemId) {
        if (h.assemblyIntake.itemType === 'PRODUCT') productIds.add(h.assemblyIntake.itemId);
        else if (h.assemblyIntake.itemType === 'MATERIAL') materialIds.add(h.assemblyIntake.itemId);
      }
      if (h.assemblyIntake?.uomId) uomIds.add(h.assemblyIntake.uomId);
    });

    const [products, materials, uoms] = await Promise.all([
      productIds.size > 0
        ? this.prisma.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            select: { id: true, name: true, sku: true, uom: { select: { id: true, symbol: true, name: true } } }
          })
        : [],
      materialIds.size > 0
        ? this.prisma.material.findMany({
            where: { id: { in: Array.from(materialIds) } },
            select: { id: true, name: true, code: true, uom: { select: { id: true, symbol: true, name: true } } }
          })
        : [],
      uomIds.size > 0
        ? this.prisma.unitOfMeasure.findMany({
            where: { id: { in: Array.from(uomIds) } },
            select: { id: true, symbol: true, name: true }
          })
        : []
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const materialMap = new Map(materials.map((m) => [m.id, m]));
    const uomMap = new Map(uoms.map((u) => [u.id, u.symbol || u.name]));

    let outputItemName = batch.productionPlan?.product?.name || 'Target Output';
    let outputItemCode = batch.productionPlan?.product?.sku || '';
    let outputUnitName = batch.productionPlan?.product?.uom?.symbol || batch.productionPlan?.product?.uom?.name || 'units';

    if (outItemId) {
      if (outItemType === 'PRODUCT' && productMap.has(outItemId)) {
        const p = productMap.get(outItemId)!;
        outputItemName = p.name;
        outputItemCode = p.sku || '';
        if (p.uom?.symbol || p.uom?.name) outputUnitName = p.uom.symbol || p.uom.name;
      } else if (outItemType === 'MATERIAL' && materialMap.has(outItemId)) {
        const m = materialMap.get(outItemId)!;
        outputItemName = m.name;
        outputItemCode = m.code || '';
        if (m.uom?.symbol || m.uom?.name) outputUnitName = m.uom.symbol || m.uom.name;
      }
    }
    if (outUomId && uomMap.has(outUomId)) {
      outputUnitName = uomMap.get(outUomId)!;
    }

    const incomingHandovers = (batch.incomingHandovers || []).map((h: any) => {
      let itemName = outputItemName;
      let itemCode = outputItemCode;
      let itemType = 'PRODUCT';
      let unitName = outputUnitName;

      const ob = h.outgoingBatch;
      if (ob?.outputItemId) {
        if (ob.outputItemType === 'PRODUCT' && productMap.has(ob.outputItemId)) {
          const p = productMap.get(ob.outputItemId)!;
          itemName = p.name;
          itemCode = p.sku || '';
          itemType = 'PRODUCT';
          if (p.uom?.symbol || p.uom?.name) unitName = p.uom.symbol || p.uom.name;
        } else if (ob.outputItemType === 'MATERIAL' && materialMap.has(ob.outputItemId)) {
          const m = materialMap.get(ob.outputItemId)!;
          itemName = m.name;
          itemCode = m.code || '';
          itemType = 'MATERIAL';
          if (m.uom?.symbol || m.uom?.name) unitName = m.uom.symbol || m.uom.name;
        }
      } else if (batch.productionPlan?.product) {
        itemName = batch.productionPlan.product.name;
        itemCode = batch.productionPlan.product.sku || '';
        unitName = batch.productionPlan.product.uom?.symbol || batch.productionPlan.product.uom?.name || 'units';
      }

      if (ob?.outputUomId && uomMap.has(ob.outputUomId)) {
        unitName = uomMap.get(ob.outputUomId)!;
      }

      return {
        ...h,
        itemName,
        itemCode,
        itemType,
        unitName
      };
    });

    const outgoingHandovers = (batch.outgoingHandovers || []).map((h: any) => {
      let itemName = outputItemName;
      let itemCode = outputItemCode;
      let itemType = outItemType || 'PRODUCT';
      let unitName = outputUnitName;

      if (h.assemblyIntake?.itemId) {
        if (h.assemblyIntake.itemType === 'PRODUCT' && productMap.has(h.assemblyIntake.itemId)) {
          const p = productMap.get(h.assemblyIntake.itemId)!;
          itemName = p.name;
          itemCode = p.sku || '';
        } else if (h.assemblyIntake.itemType === 'MATERIAL' && materialMap.has(h.assemblyIntake.itemId)) {
          const m = materialMap.get(h.assemblyIntake.itemId)!;
          itemName = m.name;
          itemCode = m.code || '';
        }
      }
      if (h.assemblyIntake?.uomId && uomMap.has(h.assemblyIntake.uomId)) {
        unitName = uomMap.get(h.assemblyIntake.uomId)!;
      }

      return {
        ...h,
        itemName,
        itemCode,
        itemType,
        unitName
      };
    });

    const materialAssignments = (batch.materialAssignments || []).map((m: any) => ({
      ...m,
      itemName: m.bomLine?.material?.name || m.bomLine?.componentProduct?.name || m.itemName || 'Raw Material',
      itemCode: m.bomLine?.material?.code || m.bomLine?.componentProduct?.sku || m.itemCode || '',
      unitName: m.bomLine?.uom?.symbol || m.bomLine?.uom?.name || m.unitName || 'units'
    }));

    return {
      ...batch,
      outputItemName,
      outputItemCode,
      outputUnitName,
      outgoingHandovers,
      incomingHandovers,
      materialAssignments
    };
  }

  async getBatchHistory(batchId: string, actorId: string, checker?: PermissionChecker) {
    const batch = await this.getBatchById(batchId, actorId, checker);
    const timeline: Array<{ timestamp: Date; type: string; details: any }> = [];

    (batch.workerAssignments || []).forEach((w: any) => {
      timeline.push({ timestamp: w.assignedAt, type: 'WORKER_ASSIGNED', details: w });
    });
    (batch.progressEvents || []).forEach((p: any) => {
      timeline.push({ timestamp: p.timestamp, type: `PROGRESS_${p.eventType}`, details: p });
    });
    (batch.exceptionRecords || []).forEach((e: any) => {
      timeline.push({ timestamp: e.timestamp, type: `EXCEPTION_${e.type}`, details: e });
    });
    (batch.outgoingHandovers || []).forEach((h: any) => {
      timeline.push({ timestamp: h.proposedAt, type: 'HANDOVER_PROPOSED', details: h });
      if (h.decidedAt) {
        timeline.push({ timestamp: h.decidedAt, type: `HANDOVER_${h.status}`, details: h });
      }
    });

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { batch, timeline };
  }

  /**
   * Helper to dispatch notification to incoming department operators when a handover is proposed
   */
  private async notifyProposedHandover(data: {
    handoverId: string;
    outgoingBatchId: string;
    outgoingBatchNumber: string;
    outgoingDeptName: string;
    incomingDepartmentId: string;
    incomingDeptName: string;
    quantity: number;
    notes?: string | null;
  }) {
    try {
      await notificationService.notifyDepartment({
        departmentId: data.incomingDepartmentId,
        type: 'INFO' as any,
        title: `Handover Proposed: Batch ${data.outgoingBatchNumber}`,
        message: `${data.outgoingDeptName} has proposed a transfer of ${data.quantity} units to ${data.incomingDeptName}. Accept custody to commence stage operations.`,
        resource: 'DepartmentExecutionBatch',
        resourceId: data.outgoingBatchId,
        href: `/production/execution`,
        metadata: {
          handoverId: data.handoverId,
          batchId: data.outgoingBatchId,
          batchNumber: data.outgoingBatchNumber,
          quantity: data.quantity,
          incomingDepartmentId: data.incomingDepartmentId
        }
      });
    } catch (err) {
      console.warn('Failed to dispatch handover proposed notification:', err);
    }
  }

  /**
   * Helper to dispatch notification to entire department when a new batch enters their queue
   */
  private async notifyDepartmentOfNewBatch(data: {
    departmentId: string;
    batchId: string;
    batchNumber: string;
    stageSequenceNumber: number;
    stepName?: string;
    departmentName?: string;
    productName?: string;
    quantity: number;
  }) {
    try {
      const stageInfo = data.stepName ? `${data.stepName} (Stage #${data.stageSequenceNumber})` : `Stage #${data.stageSequenceNumber}`;
      const deptName = data.departmentName || 'your department';
      const prodInfo = data.productName ? ` for ${data.productName}` : '';
      await notificationService.notifyDepartment({
        departmentId: data.departmentId,
        type: 'INFO' as any,
        title: `New Batch In Queue: ${data.batchNumber}`,
        message: `Batch ${data.batchNumber} (${data.quantity} units${prodInfo}) has entered the ${deptName} queue for ${stageInfo}. Awaiting physical receipt & execution.`,
        resource: 'DepartmentExecutionBatch',
        resourceId: data.batchId,
        href: `/production/execution`,
        metadata: {
          batchId: data.batchId,
          batchNumber: data.batchNumber,
          stageSequence: data.stageSequenceNumber,
          quantity: data.quantity,
          departmentId: data.departmentId
        }
      });
    } catch (err) {
      console.warn('Failed to dispatch new batch queue notification:', err);
    }
  }

  /**
   * Helper to dispatch dashboard notifications to the assigned operator's user account
   */
  private async notifyAssignedOperator(data: {
    employeeId: string;
    batchId: string;
    batchNumber: string;
    stageSequenceNumber: number;
    stepName?: string;
    departmentName?: string;
    quantity: number;
    recipientId?: string;
  }) {
    try {
      const employee = await this.prisma.employee.findUnique({
        where: { id: data.employeeId }
      });
      if (!employee?.email) return;

      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: employee.email, mode: 'insensitive' } },
            { name: { contains: `${employee.firstName} ${employee.lastName}`, mode: 'insensitive' } }
          ]
        }
      });
      if (!user) return;

      const stageInfo = data.stepName ? `${data.stepName} (Stage #${data.stageSequenceNumber})` : `Stage #${data.stageSequenceNumber}`;
      await notificationService.createAndDispatch({
        recipientId: user.id,
        type: 'INFO' as any,
        title: `Production Stage Assigned: ${data.batchNumber}`,
        message: `You have been assigned to process Batch #${data.batchNumber} for ${stageInfo} (${data.quantity} units).`,
        resource: 'DepartmentExecutionBatch',
        resourceId: data.batchId,
        href: `/production/execution/${data.batchId}`,
        metadata: {
          batchId: data.batchId,
          batchNumber: data.batchNumber,
          stageSequence: data.stageSequenceNumber
        }
      });
    } catch (err) {
      console.warn('Failed to dispatch operator assignment notification:', err);
    }
  }
}
