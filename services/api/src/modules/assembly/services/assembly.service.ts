import {
  AssemblyBatchStatus,
  AssemblyComponentType,
  ProgressEventType,
  LossSourceType,
  Prisma
} from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma as defaultPrisma } from '../../../database';
import { AssemblyBatchRepository, AssemblyBatchFilterOptions } from '../repositories/assembly-batch.repository';
import { LossEventService } from '../../loss-management/services/loss-event.service';
import { ToleranceEvaluatorService } from '../../loss-management/services/tolerance-evaluator.service';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { notificationService } from '../../notifications/notification.service';
import { productionActorScope } from '../../production/services/parallel-execution.service';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  InvalidStateTransitionError,
  AppError
} from '../../../common/errors/AppError';
import { generateSequentialNumber } from '../../../common/utils/sequence';

export class MissingApprovedBomRatiosError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'MISSING_APPROVED_BOM_RATIOS', details);
  }
}

export class MissingAssemblyRouteStageError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'MISSING_ASSEMBLY_ROUTE_STAGE', details);
  }
}

export class MissingAssemblyQcCriteriaError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'MISSING_ASSEMBLY_QC_CRITERIA', details);
  }
}

export class QuantityConservationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'QUANTITY_CONSERVATION_VIOLATION', details);
  }
}

export class ComponentAllocationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'COMPONENT_ALLOCATION_ERROR', details);
  }
}

export interface PlanAssemblyBatchInput {
  productId: string;
  productVariantId?: string | null;
  productionPlanId?: string | null;
  bomVersionId: string;
  productRouteId?: string | null;
  targetOutputQuantity: number;
  plannedStartDate?: string | null;
  notes?: string | null;
}

export interface AllocateAssemblyComponentsInput {
  allocations: Array<{
    bomLineId?: string | null;
    componentType: 'BATCH_SOURCED' | 'ISSUE_LINE_SOURCED';
    sourceBatchId?: string | null;
    materialIssueLineId?: string | null;
    uomId: string;
    unitRatio: number;
    requiredQuantity: number;
  }>;
}

export interface CompleteAssemblyBatchInput {
  actualOutputQuantity: number;
  scrapQuantity?: number;
  idempotencyKey: string;
  componentConsumptions: Array<{
    componentId: string;
    consumedQuantity: number;
    scrapQuantity?: number;
  }>;
  notes?: string | null;
}

export interface QcDispositionInput {
  disposition: 'PASSED_TO_FG' | 'REWORK' | 'REJECTED';
  inspectionNotes?: string | null;
  rejectionReason?: string | null;
  defectTypeId?: string | null;
  locationId?: string | null;
  costImpact?: number | null;
}

export class AssemblyService {
  constructor(
    private readonly repository: AssemblyBatchRepository,
    private readonly lossEventService: LossEventService,
    public readonly toleranceEvaluator: ToleranceEvaluatorService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    private readonly prisma: typeof defaultPrisma = defaultPrisma
  ) {}

  /**
   * 1. PLAN ASSEMBLY BATCH
   * Evaluates V-002 (approved BOM with complete lines & ratios).
   * Assembly module converges components directly according to BOM without requiring shop-floor routing.
   * Blocks with named missing data errors if incomplete.
   */
  async planBatch(input: PlanAssemblyBatchInput, actorId: string, requestId?: string) {
    const hasPermission = await this.permissionChecker.can(actorId, 'plan', 'AssemblyBatch');
    if (!hasPermission) {
      throw new ForbiddenError('Permission denied: plan AssemblyBatch');
    }
    if (input.productionPlanId) {
      const scheduled = await this.prisma.productionPlan.findUnique({ where: { id: input.productionPlanId }, include: { route: true } });
      if (scheduled?.route?.graphReviewedAt) throw new ValidationError('Create Assembly waves from the production execution readiness view.');
    }

    // 1. Verify Product exists
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId }
    });
    if (!product) {
      throw new NotFoundError(`Product '${input.productId}' not found`);
    }

    // 2. Evaluate V-002: BOM Version & Ratios Gate
    const bomVersion = await this.prisma.bomVersion.findUnique({
      where: { id: input.bomVersionId },
      include: {
        lines: {
          include: {
            material: true,
            componentProduct: true,
            uom: true
          }
        }
      }
    });

    if (!bomVersion) {
      throw new NotFoundError(`BOM Version '${input.bomVersionId}' not found`);
    }

    if (bomVersion.productId !== input.productId) {
      throw new ValidationError(`BOM Version '${input.bomVersionId}' does not belong to Product '${input.productId}'`);
    }

    if (bomVersion.status !== 'APPROVED') {
      throw new MissingApprovedBomRatiosError(
        `MISSING_APPROVED_BOM_RATIOS: BOM Version '${bomVersion.bomNumber}' for product '${product.name}' is in '${bomVersion.status}' state (must be APPROVED) (V-002).`,
        { productId: product.id, bomVersionId: bomVersion.id, status: bomVersion.status }
      );
    }

    if (!bomVersion.lines || bomVersion.lines.length === 0) {
      throw new MissingApprovedBomRatiosError(
        `MISSING_APPROVED_BOM_RATIOS: BOM Version '${bomVersion.bomNumber}' for product '${product.name}' has no component lines defined (V-002).`,
        { productId: product.id, bomVersionId: bomVersion.id, lineCount: 0 }
      );
    }

    // Check that every BOM line has a valid positive quantity/ratio
    for (const line of bomVersion.lines) {
      const qty = Number(line.quantity);
      if (!qty || qty <= 0 || isNaN(qty)) {
        throw new MissingApprovedBomRatiosError(
          `MISSING_APPROVED_BOM_RATIOS: BOM Version '${bomVersion.bomNumber}' line for component '${line.material?.name || line.componentProduct?.name || line.id}' has missing or non-positive ratio '${qty}' (V-002).`,
          { productId: product.id, bomLineId: line.id, quantity: qty }
        );
      }
    }

    // Optional: If productRouteId is supplied, verify it belongs to product
    if (input.productRouteId) {
      const route = await this.prisma.productRoute.findUnique({
        where: { id: input.productRouteId }
      });
      if (route && route.productId !== input.productId) {
        throw new ValidationError(`Product Route '${input.productRouteId}' does not belong to Product '${input.productId}'`);
      }
    }

    // 3. Generate batchNumber and create AssemblyBatch
    const year = new Date().getFullYear();
    const prefix = `ASY-${year}-`;
    const batchNumber = await generateSequentialNumber({
      prefix,
      countByPrefix: async (p) => {
        return this.prisma.assemblyBatch.count({
          where: { batchNumber: { startsWith: p } }
        });
      },
      existsByNumber: async (cand) => {
        const found = await this.prisma.assemblyBatch.findUnique({
          where: { batchNumber: cand }
        });
        return !!found;
      },
      padLength: 4
    });

    const batch = await this.repository.createBatch({
      batchNumber,
      productId: input.productId,
      productVariantId: input.productVariantId,
      productionPlanId: input.productionPlanId,
      bomVersionId: input.bomVersionId,
      productRouteId: input.productRouteId || null,
      targetOutputQuantity: input.targetOutputQuantity,
      plannedStartDate: input.plannedStartDate ? new Date(input.plannedStartDate) : null,
      notes: input.notes,
      createdByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'PLAN_ASSEMBLY_BATCH',
      entityType: 'AssemblyBatch',
      entityId: batch.id,
      after: batch,
      requestId
    });

    return this.formatBatchDto(batch);
  }

  /**
   * 2. ALLOCATE COMPONENTS
   * Allocates source components (many-to-one convergence).
   * Validates discrete source batches (DepartmentExecutionBatch) or bulk kit issues (MaterialIssueLine).
   */
  async allocateComponents(
    assemblyBatchId: string,
    input: AllocateAssemblyComponentsInput,
    actorId: string,
    requestId?: string
  ) {
    const hasPermission = await this.permissionChecker.can(actorId, 'allocate', 'AssemblyBatch');
    if (!hasPermission) {
      throw new ForbiddenError('Permission denied: allocate AssemblyBatch');
    }

    const batch = await this.repository.findBatchById(assemblyBatchId);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${assemblyBatchId}' not found`);
    }
    if (batch.productRoute?.graphReviewedAt) throw new ValidationError('Assembly components for this schedule are allocated from accepted intake quantities.');

    if (batch.status !== AssemblyBatchStatus.PLANNED && batch.status !== AssemblyBatchStatus.ALLOCATED) {
      throw new InvalidStateTransitionError(
        `Cannot allocate components for AssemblyBatch in '${batch.status}' status (must be PLANNED or ALLOCATED)`
      );
    }

    // Validate each allocation
    for (const alloc of input.allocations) {
      if (alloc.componentType === 'BATCH_SOURCED' && alloc.sourceBatchId) {
        const sourceBatch = await this.prisma.departmentExecutionBatch.findUnique({
          where: { id: alloc.sourceBatchId }
        });
        if (!sourceBatch) {
          throw new NotFoundError(`Source DepartmentExecutionBatch '${alloc.sourceBatchId}' not found`);
        }
        // Verify available completed/received quantity from source batch
        const sourceOutputQty = Number(sourceBatch.completed_qty ?? sourceBatch.received_qty);
        if (sourceOutputQty < alloc.requiredQuantity) {
          throw new ComponentAllocationError(
            `Source batch '${sourceBatch.batchNumber}' completed quantity (${sourceOutputQty}) is less than required quantity (${alloc.requiredQuantity})`
          );
        }
      } else if (alloc.componentType === 'ISSUE_LINE_SOURCED' && alloc.materialIssueLineId) {
        const issueLine = await this.prisma.materialIssueLine.findUnique({
          where: { id: alloc.materialIssueLineId }
        });
        if (!issueLine) {
          throw new NotFoundError(`MaterialIssueLine '${alloc.materialIssueLineId}' not found`);
        }
        const issuedQty = Number(issueLine.issuedQuantity);
        if (issuedQty < alloc.requiredQuantity) {
          throw new ComponentAllocationError(
            `MaterialIssueLine '${alloc.materialIssueLineId}' issued quantity (${issuedQty}) is less than required quantity (${alloc.requiredQuantity})`
          );
        }
      }

      // Verify UOM exists
      const uom = await this.prisma.unitOfMeasure.findUnique({
        where: { id: alloc.uomId }
      });
      if (!uom) {
        throw new NotFoundError(`UnitOfMeasure '${alloc.uomId}' not found`);
      }
    }

    const updated = await this.repository.allocateComponents(
      assemblyBatchId,
      actorId,
      input.allocations.map((a) => ({
        bomLineId: a.bomLineId,
        componentType: a.componentType as AssemblyComponentType,
        sourceBatchId: a.sourceBatchId,
        materialIssueLineId: a.materialIssueLineId,
        uomId: a.uomId,
        unitRatio: a.unitRatio,
        requiredQuantity: a.requiredQuantity
      }))
    );

    await this.auditWriter.record({
      actorId,
      action: 'ALLOCATE_ASSEMBLY_COMPONENTS',
      entityType: 'AssemblyBatch',
      entityId: assemblyBatchId,
      before: { status: batch.status, componentsCount: batch.components.length },
      after: { status: updated.status, componentsCount: updated.components.length },
      requestId
    });

    return this.formatBatchDto(updated);
  }

  /**
   * 3. START ASSEMBLY
   */
  async startBatch(assemblyBatchId: string, actualStartDate?: string, actorId?: string, requestId?: string) {
    if (actorId) {
      const hasPermission = await this.permissionChecker.can(actorId, 'execute', 'AssemblyBatch');
      if (!hasPermission) {
        throw new ForbiddenError('Permission denied: execute AssemblyBatch');
      }
    }

    const batch = await this.repository.findBatchById(assemblyBatchId);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${assemblyBatchId}' not found`);
    }

    if (batch.status !== AssemblyBatchStatus.ALLOCATED && batch.status !== AssemblyBatchStatus.REWORK) {
      throw new InvalidStateTransitionError(
        `Cannot start AssemblyBatch in '${batch.status}' status (must be ALLOCATED or REWORK)`
      );
    }

    if (batch.components.length === 0) {
      throw new ValidationError(`Cannot start AssemblyBatch '${assemblyBatchId}' without allocated components`);
    }

    const startDate = actualStartDate ? new Date(actualStartDate) : new Date();
    const updated = await this.repository.startBatch(assemblyBatchId, startDate);

    // Step 3: Post inventory stock release for assembly batch components
    for (const comp of batch.productRoute?.graphReviewedAt ? [] : batch.components) {
      try {
        const itemType = comp.sourceBatchId ? 'PRODUCT' : comp.materialIssueLine?.componentProductId ? 'PRODUCT' : 'MATERIAL';
        const itemId = comp.sourceBatch?.productionPlan?.productId ||
          comp.materialIssueLine?.componentProductId ||
          comp.materialIssueLine?.materialId ||
          comp.bomLine?.componentProductId ||
          comp.bomLine?.materialId;
        
        let locationId = comp.materialIssueLine?.materialIssue?.locationId || null;
        if (!locationId) {
          const defaultLoc = await this.prisma.warehouseLocation.findFirst({
            where: {
              OR: [
                { type: { in: ['SFG', 'SEMI_FINISHED', 'WIP', 'STORE', 'STORAGE', 'RAW_MATERIAL'] } },
                { name: { contains: 'WIP', mode: 'insensitive' } },
                { name: { contains: 'Semi', mode: 'insensitive' } },
                { name: { contains: 'Store', mode: 'insensitive' } }
              ],
              status: 'ACTIVE'
            }
          }) || await this.prisma.warehouseLocation.findFirst({ where: { status: 'ACTIVE' } });
          locationId = defaultLoc?.id || null;
        }

        if (itemId && comp.uomId && locationId) {
          const key = `ASSEMBLY_ISSUE_AUTO:${batch.id}:${comp.id}:${Date.now()}`;
          await inventoryPostingService.post(this.prisma, {
            itemType: itemType as 'PRODUCT' | 'MATERIAL',
            itemId,
            uomId: comp.uomId,
            locationId,
            movementType: 'ISSUE',
            quantity: Number(comp.requiredQuantity),
            condition: 'AVAILABLE',
            ownership: 'COMPANY',
            sourceType: 'ASSEMBLY_BATCH',
            sourceId: batch.id,
            idempotencyKey: key,
            actorId: actorId || 'system',
            correlationId: batch.productionPlanId || batch.id
          });
        }
      } catch (postErr) {
        console.warn(`[AssemblyService.startBatch] Component stock issue ledger post note (${comp.id}):`, postErr);
      }
    }

    if (actorId) {
      await this.auditWriter.record({
        actorId,
        action: 'START_ASSEMBLY_BATCH',
        entityType: 'AssemblyBatch',
        entityId: assemblyBatchId,
        before: { status: batch.status },
        after: { status: updated.status, actualStartDate: startDate },
        requestId
      });
    }

    return this.formatBatchDto(updated);
  }

  /**
   * 4. ASSIGN WORKER
   */
  async assignWorker(
    assemblyBatchId: string,
    employeeId: string,
    subtaskDescription?: string | null,
    actorId?: string,
    requestId?: string
  ) {
    if (actorId) {
      const hasPermission = await this.permissionChecker.can(actorId, 'assign_worker', 'AssemblyBatch');
      if (!hasPermission) {
        throw new ForbiddenError('Permission denied: assign_worker AssemblyBatch');
      }
    }

    const batch = await this.repository.findBatchById(assemblyBatchId);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${assemblyBatchId}' not found`);
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId }
    });
    if (!employee) {
      throw new NotFoundError(`Employee '${employeeId}' not found`);
    }

    // 1. Prevent duplicate assignment to the same assembly wave
    const existingAssignment = await (this.prisma as any).assemblyWorkerAssignment?.findFirst({
      where: {
        assemblyBatchId,
        employeeId: employee.id
      }
    });
    if (existingAssignment) {
      throw new ValidationError(`Employee [${employee.firstName} ${employee.lastName}] is already assigned to this assembly wave.`);
    }

    // 2. Prevent department head / supervisor from being assigned as an operator
    const isHead =
      (employee.designation && ['head', 'incharge', 'manager'].some((k) => employee.designation!.toLowerCase().includes(k))) ||
      (employee.role && ['head', 'incharge', 'manager'].some((k) => employee.role!.toLowerCase().includes(k)));

    if (isHead) {
      throw new ValidationError(`Employee [${employee.firstName} ${employee.lastName}] is a Department Head/Incharge and cannot be assigned as an assembly operator.`);
    }

    const assignment = await this.repository.assignWorker({
      assemblyBatchId,
      employeeId,
      subtaskDescription,
      assignedByActorId: actorId || 'system'
    });

    await this.auditWriter.record({
      actorId: actorId || 'system',
      action: 'ASSIGN_ASSEMBLY_WORKER',
      entityType: 'AssemblyBatch',
      entityId: assemblyBatchId,
      after: assignment,
      requestId
    });

    return assignment;
  }

  /**
   * 4b. UNASSIGN WORKER
   */
  async unassignWorker(
    assemblyBatchId: string,
    employeeId: string,
    actorId?: string,
    requestId?: string
  ) {
    if (actorId) {
      const hasPermission = await this.permissionChecker.can(actorId, 'assign_worker', 'AssemblyBatch');
      if (!hasPermission) {
        throw new ForbiddenError('Permission denied: assign_worker AssemblyBatch');
      }
    }

    const assignment = await (this.prisma as any).assemblyWorkerAssignment?.findFirst({
      where: { assemblyBatchId, employeeId }
    });
    if (!assignment) {
      throw new NotFoundError(`Worker assignment not found for employee '${employeeId}' in assembly wave '${assemblyBatchId}'`);
    }

    await (this.prisma as any).assemblyWorkerAssignment.delete({
      where: { id: assignment.id }
    });

    await this.auditWriter.record({
      actorId: actorId || 'system',
      action: 'UNASSIGN_ASSEMBLY_WORKER',
      entityType: 'AssemblyBatch',
      entityId: assemblyBatchId,
      metadata: { employeeId },
      requestId
    });

    return { success: true };
  }

  /**
   * 5. RECORD PROGRESS
   */
  async recordProgress(
    assemblyBatchId: string,
    input: {
      employeeId: string;
      eventType: ProgressEventType;
      quantityDelta: number;
      notes?: string | null;
    },
    actorId?: string,
    requestId?: string
  ) {
    if (actorId) {
      const hasPermission = await this.permissionChecker.can(actorId, 'execute', 'AssemblyBatch');
      if (!hasPermission) {
        throw new ForbiddenError('Permission denied: execute AssemblyBatch');
      }
    }

    const batch = await this.repository.findBatchById(assemblyBatchId);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${assemblyBatchId}' not found`);
    }

    if (batch.status !== AssemblyBatchStatus.IN_ASSEMBLY && batch.status !== AssemblyBatchStatus.PARTIAL) {
      throw new InvalidStateTransitionError(
        `Cannot record progress for AssemblyBatch in '${batch.status}' status (must be IN_ASSEMBLY or PARTIAL)`
      );
    }

    const event = await this.repository.recordProgress({
      assemblyBatchId,
      employeeId: input.employeeId,
      eventType: input.eventType,
      quantityDelta: input.quantityDelta,
      notes: input.notes
    });

    // If worker stopped/paused assembly, notify Admin and Store Manager of incomplete assembly
    if (input.eventType === 'PAUSED') {
      try {
        const emp = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Assigned worker';
        await notificationService.notifyRoles({
          roles: ['admin', 'super-admin', 'store-manager', 'manager', 'inventory-manager'],
          title: `Incomplete Assembly Batch Alert: ${batch.batchNumber}`,
          message: `${empName} stopped/paused assembly for ${batch.product?.name || 'Finished Product'} (${batch.batchNumber}). Notes: ${input.notes || 'No notes provided'}. If not resumed today, next-day reminder will be sent.`,
          resource: 'AssemblyBatch',
          resourceId: assemblyBatchId,
          href: `/production/assembly/${assemblyBatchId}`,
          metadata: { assemblyBatchId, batchNumber: batch.batchNumber, employeeId: input.employeeId, eventType: 'PAUSED' }
        });
      } catch (notifErr) {
        console.warn('[AssemblyService.recordProgress] Pause notification warning:', notifErr);
      }
    }

    await this.auditWriter.record({
      actorId: actorId || 'system',
      action: 'RECORD_ASSEMBLY_PROGRESS',
      entityType: 'AssemblyBatch',
      entityId: assemblyBatchId,
      after: event,
      requestId
    });

    return event;
  }

  /**
   * 6. COMPLETE ASSEMBLY BATCH
   * Performs atomic quantity conservation check.
   * Evaluates mathematical yield: sum(component.consumed) / unitRatio >= output.
   * Reconciles discrete lot trace and stores kit consumptions.
   */
  async completeBatch(
    assemblyBatchId: string,
    input: CompleteAssemblyBatchInput,
    actorId: string,
    requestId?: string
  ) {
    const hasPermission = await this.permissionChecker.can(actorId, 'complete', 'AssemblyBatch');
    if (!hasPermission) {
      throw new ForbiddenError('Permission denied: complete AssemblyBatch');
    }

    // Check Idempotency Key
    const existingByIdempotency = await this.repository.findBatchByIdempotencyKey(input.idempotencyKey);
    if (existingByIdempotency) {
      if (existingByIdempotency.id === assemblyBatchId) {
        return this.formatBatchDto(existingByIdempotency);
      }
      throw new ConflictError(
        `Idempotency key '${input.idempotencyKey}' was already used for AssemblyBatch '${existingByIdempotency.id}'`
      );
    }

    const batch = await this.repository.findBatchById(assemblyBatchId);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${assemblyBatchId}' not found`);
    }

    if (batch.status !== AssemblyBatchStatus.IN_ASSEMBLY && batch.status !== AssemblyBatchStatus.PARTIAL) {
      throw new InvalidStateTransitionError(
        `Cannot complete AssemblyBatch in '${batch.status}' status (must be IN_ASSEMBLY or PARTIAL)`
      );
    }
    if (batch.productRoute?.graphReviewedAt) {
      const submitted = new Map(input.componentConsumptions.map((row) => [row.componentId, row]));
      if (submitted.size !== batch.components.length || input.componentConsumptions.length !== batch.components.length || batch.components.some((row) => !submitted.has(row.id))) {
        throw new ValidationError('Every allocated Assembly input must be reconciled once before completing this wave.');
      }
      if (!(input.actualOutputQuantity > 0) || input.actualOutputQuantity > Number(batch.targetOutputQuantity)) {
        throw new ValidationError('Good Assembly output must be positive and within the allocated wave quantity.');
      }
      for (const component of batch.components) {
        const consumption = submitted.get(component.id)!;
        if (consumption.consumedQuantity < 0 || consumption.consumedQuantity > Number(component.requiredQuantity) || Number(consumption.scrapQuantity || 0) < 0) {
          throw new ValidationError('Assembly consumption exceeds an allocated item quantity.');
        }
      }
    }
    const scrapQty = input.scrapQuantity ?? 0;
    const totalOutputAccounted = input.actualOutputQuantity + scrapQty;
    const targetOutputQty = Number(batch.targetOutputQuantity || 0);

    // Business rule: Assembly department head cannot just report a quantity into scrap and complete
    // assembly before Store Manager approves and issues replacement materials.
    // 1. Fetch any LossEvents logged for this Assembly Batch (by batch id or batch number)
    const assemblyLossEvents = await this.prisma.lossEvent.findMany({
      where: {
        OR: [
          { reason: { contains: batch.id } },
          { reason: { contains: batch.batchNumber } }
        ]
      }
    });

    for (const lossEvent of assemblyLossEvents) {
      if (['REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(lossEvent.status)) {
        throw new ValidationError(
          `Cannot complete assembly: Scrap proposal [${lossEvent.lossNumber}] for ${lossEvent.quantity} units is still awaiting Store Manager approval (Status: ${lossEvent.status}). Department head must wait for Store Manager approval and replenishment before completing assembly.`
        );
      }
      if (lossEvent.status === 'REJECTED') {
        throw new ValidationError(
          `Cannot complete assembly with unworked scrap: Scrap proposal [${lossEvent.lossNumber}] was rejected by Store Manager (Reason: "${lossEvent.rejectionReason || 'Production required'}"). The department is bound to complete production with this material.`
        );
      }
    }

    // 2. Bound to complete the supposed amount of production:
    // A production schedule/assembly cannot be completed until its supposed quantity is successfully produced.
    if (input.actualOutputQuantity < targetOutputQty && scrapQty > 0) {
      // Check if replacement has been completed for all approved losses
      const unreplacedLosses = assemblyLossEvents.filter(
        (e) => e.status === 'APPROVED' && !e.replacementChallanRef
      );
      if (unreplacedLosses.length > 0) {
        throw new ValidationError(
          `Cannot complete assembly: Scrap proposal [${unreplacedLosses[0].lossNumber}] is approved but awaiting Store Manager physical material replacement. The department head is bound to produce the full scheduled quantity (${targetOutputQty} units).`
        );
      }
      throw new ValidationError(
        `Cannot complete assembly: Good output quantity (${input.actualOutputQuantity}) is less than supposed production quantity (${targetOutputQty}). A production schedule cannot be completed until its supposed quantity is successfully produced. Awaiting Store Manager replenishment issue.`
      );
    }
    // Evaluate Quantity Conservation Invariant per component
    for (const compInput of input.componentConsumptions) {
      const component = batch.components.find((c) => c.id === compInput.componentId);
      if (!component) {
        throw new ValidationError(`Component '${compInput.componentId}' does not belong to AssemblyBatch '${assemblyBatchId}'`);
      }

      const unitRatio = Number(component.unitRatio) > 0 ? Number(component.unitRatio) : 1;
      const consumedQty = Number(compInput.consumedQuantity);
      const maxPossibleOutputFromComponent = consumedQty / unitRatio;

      // Check quantity conservation: total output cannot exceed theoretical yield plus allowed tolerance
      if (totalOutputAccounted > maxPossibleOutputFromComponent * 1.05) { // 5% max tolerance if not overridden by rule
        throw new QuantityConservationError(
          `QUANTITY_CONSERVATION_VIOLATION: Output quantity (${totalOutputAccounted}) exceeds theoretical yield (${maxPossibleOutputFromComponent.toFixed(4)}) from consumed component quantity (${consumedQty}) with unit ratio (${unitRatio}). Conservation broken.`,
          {
            componentId: component.id,
            totalOutputAccounted,
            consumedQuantity: consumedQty,
            unitRatio,
            maxPossibleOutputFromComponent
          }
        );
      }
    }

    const updated = await this.repository.completeBatch(assemblyBatchId, actorId, {
      actualOutputQuantity: input.actualOutputQuantity,
      scrapQuantity: scrapQty,
      idempotencyKey: input.idempotencyKey,
      notes: input.notes,
      componentConsumptions: input.componentConsumptions.map((c) => ({
        componentId: c.componentId,
        consumedQuantity: c.consumedQuantity,
        scrapQuantity: c.scrapQuantity ?? 0
      }))
    });

    await this.auditWriter.record({
      actorId,
      action: 'COMPLETE_ASSEMBLY_BATCH',
      entityType: 'AssemblyBatch',
      entityId: assemblyBatchId,
      before: { status: batch.status },
      after: {
        status: updated.status,
        actualOutputQuantity: input.actualOutputQuantity,
        scrapQuantity: scrapQty,
        idempotencyKey: input.idempotencyKey
      },
      requestId
    });

    return this.formatBatchDto(updated);
  }

  /**
   * 7. QC DISPOSITION
   * Evaluates V-009 gate (approved QC criteria at ASSEMBLY checkpoint).
   * Transitions batch to PASSED_TO_FG, REWORK, or REJECTED.
   * If REJECTED, automatically routes to LossEventService.report (Module 11).
   */
  async qcDisposition(
    assemblyBatchId: string,
    input: QcDispositionInput,
    actorId: string,
    requestId?: string
  ) {
    const hasPermission = await this.permissionChecker.can(actorId, 'qc_disposition', 'AssemblyBatch');
    if (!hasPermission) {
      throw new ForbiddenError('Permission denied: qc_disposition AssemblyBatch');
    }

    const batch = await this.repository.findBatchById(assemblyBatchId);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${assemblyBatchId}' not found`);
    }

    if (batch.status !== AssemblyBatchStatus.QC_PENDING) {
      throw new InvalidStateTransitionError(
        `Cannot perform QC disposition on AssemblyBatch in '${batch.status}' status (must be QC_PENDING)`
      );
    }

    // Evaluate V-009: Check that approved QC criteria exist for ASSEMBLY checkpoint on this product/route
    const route = batch.productRoute;
    const assemblyStep = route?.steps?.find((s: any) => s.stepName?.toLowerCase().includes('assembly'));
    
    // Check if qcRule exists and is approved
    let qcRuleApproved = false;
    if (assemblyStep?.qcRuleId) {
      const qcRule = await this.prisma.qcRule.findUnique({
        where: { id: assemblyStep.qcRuleId }
      });
      if (qcRule && (qcRule.status === 'APPROVED' || qcRule.status === 'ACTIVE')) {
        qcRuleApproved = true;
      }
    }

    let genericQcRule: any = null;
    if (!qcRuleApproved) {
      // Check if there is an approved QC rule targeting this product or global
      genericQcRule = await this.prisma.qcRule.findFirst({
        where: {
          status: { in: ['APPROVED', 'ACTIVE'] },
          OR: [
            { targetType: 'PRODUCT', targetId: batch.productId },
            { targetType: 'GLOBAL' }
          ]
        }
      });
      if (genericQcRule) {
        qcRuleApproved = true;
      }
    }

    if (!qcRuleApproved) {
      throw new MissingAssemblyQcCriteriaError(
        `MISSING_ASSEMBLY_QC_CRITERIA: Assembly step on product '${batch.product.name}' has no approved QC criteria (V-009). QC disposition is blocked.`,
        { productId: batch.productId, routeId: route?.id || null, checkpointType: 'ASSEMBLY' }
      );
    }

    // Process Disposition
    if (input.disposition === 'PASSED_TO_FG') {
      const outputQty = Number(batch.actualOutputQuantity) > 0
        ? Number(batch.actualOutputQuantity)
        : Number(batch.targetOutputQuantity);

      // 1. Create or link QC InspectionResult with PASS status
      const inspectionNumber = await generateSequentialNumber({
        prefix: `QC-ASM-${new Date().getFullYear()}-`,
        countByPrefix: async (p) => {
          return this.prisma.inspectionResult.count({
            where: { inspectionNumber: { startsWith: p } }
          });
        },
        existsByNumber: async (cand) => {
          const found = await this.prisma.inspectionResult.findUnique({
            where: { inspectionNumber: cand }
          });
          return !!found;
        },
        padLength: 4
      });

      // Find an inspector employee
      const inspectorEmp = await this.prisma.employee.findFirst({
        where: { status: 'ACTIVE' }
      });

      const inspectionResult = await this.prisma.inspectionResult.create({
        data: {
          inspectionNumber,
          checkpointType: 'FINAL_FG',
          qcRuleId: genericQcRule?.id || assemblyStep?.qcRuleId || null,
          inspectorEmployeeId: inspectorEmp?.id || (batch.workerAssignments?.[0]?.employeeId) || actorId,
          sampledQuantity: new Prisma.Decimal(outputQty),
          defectiveQuantity: new Prisma.Decimal(0),
          status: 'PASS',
          reason: input.inspectionNotes || 'Passed assembly QC gate inspection',
          findings: { disposition: 'PASSED_TO_FG' }
        }
      });

      // 2. Generate FG Ready Output for Finished Goods receipt queue
      const existingFgOutput = await this.prisma.fgReadyOutput.findFirst({
        where: { assemblyBatchId }
      });

      if (!existingFgOutput) {
        const outputNumber = await generateSequentialNumber({
          prefix: `FG-OUT-${new Date().getFullYear()}-`,
          countByPrefix: async (p) => {
            return this.prisma.fgReadyOutput.count({
              where: { outputNumber: { startsWith: p } }
            });
          },
          existsByNumber: async (cand) => {
            const found = await this.prisma.fgReadyOutput.findUnique({
              where: { outputNumber: cand }
            });
            return !!found;
          },
          padLength: 4
        });

        const product = await this.prisma.product.findUnique({
          where: { id: batch.productId }
        });

        await this.prisma.$transaction(async (tx) => {
          if (typeof (tx as any).$queryRaw === 'function') {
            await (tx as any).$queryRaw`SELECT "id" FROM "production_plans" WHERE "id" = ${batch.productionPlanId || ''} FOR UPDATE`;
          }
          const duplicate = await tx.fgReadyOutput.findFirst({ where: { assemblyBatchId } });
          if (duplicate) return;
          await tx.fgReadyOutput.create({ data: {
            outputNumber,
            assemblyBatchId,
            productId: batch.productId,
            productVariantId: batch.productVariantId,
            quantity: new Prisma.Decimal(outputQty),
            uomId: product?.uomId || batch.components?.[0]?.uomId || '',
            qcInspectionResultId: inspectionResult.id,
            notes: input.inspectionNotes || `Completed assembly batch ${batch.batchNumber}`,
            packagingRecord: {
              create: {
                status: 'READY_FOR_DISPATCH',
                packNotes: 'Packaged upon assembly completion and QC gate clearance',
                updatedByActorId: actorId
              }
            }
          } });
          if (batch.productionPlanId && route?.graphReviewedAt) {
            const plan = await tx.productionPlan.findUniqueOrThrow({ where: { id: batch.productionPlanId } });
            const completed = Number(plan.completedQuantity || 0) + outputQty;
            if (completed > Number(plan.quantity)) throw new ValidationError('Finished output exceeds the scheduled quantity.');
            const nextStatus = completed + 0.000001 >= Number(plan.quantity) ? 'COMPLETED' : 'PARTIALLY_COMPLETED';
            await tx.productionPlan.update({ where: { id: plan.id }, data: {
              completedQuantity: completed,
              status: nextStatus,
              completedAt: nextStatus === 'COMPLETED' ? new Date() : null
            } });
            const planEvent = await tx.productionPlanEvent.create({ data: {
              productionPlanId: plan.id,
              eventType: nextStatus === 'COMPLETED' ? 'COMPLETED' : 'PARTIAL_COMPLETION',
              fromStatus: plan.status,
              toStatus: nextStatus,
              actorId,
              payload: { acceptedOutputQuantity: outputQty, completedQuantity: completed, plannedQuantity: Number(plan.quantity) }
            } });
            await publishIntelligenceEvent(tx as any, {
              type: nextStatus === 'COMPLETED' ? 'PRODUCTION_COMPLETED' : 'PRODUCTION_QUANTITY_CHANGED',
              entityType: 'ProductionPlan',
              entityId: plan.id,
              transitionId: planEvent.id,
              metadata: {
                fromStatus: plan.status,
                status: nextStatus,
                productId: plan.productId,
                quantity: outputQty
              }
            });
          }
        });
      }

      const updated = await this.repository.updateStatus(assemblyBatchId, AssemblyBatchStatus.PASSED_TO_FG, {
        qcInspectionResultId: inspectionResult.id
      });

      await this.auditWriter.record({
        actorId,
        action: 'QC_DISPOSITION_PASS',
        entityType: 'AssemblyBatch',
        entityId: assemblyBatchId,
        before: { status: batch.status },
        after: {
          status: updated.status,
          inspectionNotes: input.inspectionNotes,
          inspectionResultId: inspectionResult.id
        },
        requestId
      });

      return this.formatBatchDto(updated);
    } else if (input.disposition === 'REWORK') {
      const updated = await this.repository.updateStatus(assemblyBatchId, AssemblyBatchStatus.REWORK, {
        reworkCountIncrement: true
      });

      await this.auditWriter.record({
        actorId,
        action: 'QC_DISPOSITION_REWORK',
        entityType: 'AssemblyBatch',
        entityId: assemblyBatchId,
        before: { status: batch.status },
        after: { status: updated.status, reworkCount: updated.reworkCount, notes: input.inspectionNotes },
        requestId
      });

      return this.formatBatchDto(updated);
    } else if (input.disposition === 'REJECTED') {
      // 1. Update status to REJECTED
      const updated = await this.repository.updateStatus(assemblyBatchId, AssemblyBatchStatus.REJECTED);

      // 2. Report loss directly to Module 11 (LossEvent)
      const rejectedQty = Number(batch.actualOutputQuantity) > 0
        ? Number(batch.actualOutputQuantity)
        : Number(batch.targetOutputQuantity);

      // Find primary UOM from product
      const product = await this.prisma.product.findUnique({
        where: { id: batch.productId }
      });

      if (product) {
        try {
          await this.lossEventService.report(
            {
              sourceType: LossSourceType.DEPARTMENT_EXECUTION_EXCEPTION,
              productId: batch.productId,
              uomId: product.uomId,
              quantity: rejectedQty,
              reason: input.rejectionReason || `Assembly QC rejection for batch ${batch.batchNumber}: ${input.inspectionNotes || 'Failed criteria'}`
            },
            actorId,
            requestId
          );
        } catch (lossErr) {
          // Log or handle gracefully if loss recording has minor non-fatal conflict
          console.error('Failed to log LossEvent for rejected assembly batch:', lossErr);
        }
      }

      await this.auditWriter.record({
        actorId,
        action: 'QC_DISPOSITION_REJECT',
        entityType: 'AssemblyBatch',
        entityId: assemblyBatchId,
        before: { status: batch.status },
        after: { status: updated.status, rejectionReason: input.rejectionReason },
        requestId
      });

      return this.formatBatchDto(updated);
    }

    throw new ValidationError(`Unknown disposition '${input.disposition}'`);
  }

  /**
   * 8. GET BATCH BY ID
   */
  async getBatchById(id: string, actorId?: string) {
    if (actorId) {
      const hasPermission = await this.permissionChecker.can(actorId, 'view', 'AssemblyBatch');
      if (!hasPermission) {
        throw new ForbiddenError('Permission denied: view AssemblyBatch');
      }
    }

    const batch = await this.repository.findBatchById(id);
    if (!batch) {
      throw new NotFoundError(`AssemblyBatch '${id}' not found`);
    }

    return this.formatBatchDto(batch);
  }

  /**
   * 9. LIST BATCHES
   */
  async listBatches(filters: AssemblyBatchFilterOptions, actorId?: string) {
    if (actorId) {
      const hasPermission = await this.permissionChecker.can(actorId, 'view', 'AssemblyBatch');
      if (!hasPermission) {
        throw new ForbiddenError('Permission denied: view AssemblyBatch');
      }
    }

    const scope = actorId ? await productionActorScope(actorId) : null;
    const res = await this.repository.listBatches({ ...filters,
      ...(scope && !scope.global ? { assemblyDepartmentId: scope.departmentId!, ...(scope.operator ? { employeeId: scope.employeeId! } : {}) } : {})
    });
    return {
      items: res.items.map((b) => this.formatBatchDto(b)),
      total: res.total
    };
  }

  private formatBatchDto(batch: any): any {
    if (!batch) return batch;
    return {
      ...batch,
      productName: batch.product?.name ?? batch.productName ?? null,
      productSku: batch.product?.sku ?? batch.productSku ?? null,
      productionPlanNumber: batch.productionPlan?.planNumber ?? batch.productionPlanNumber ?? null,
      bomNumber: batch.bomVersion?.bomNumber ?? batch.bomNumber ?? null,
      bomVersionNumber: batch.bomVersion?.version ?? batch.bomVersionNumber ?? null,
      routeCode: batch.productRoute?.code ?? batch.routeCode ?? null,
      routeName: batch.productRoute?.name ?? batch.routeName ?? null,
      createdByActorName: batch.createdByActor?.name ?? batch.createdByActorName ?? null,
      allocatedByActorName: batch.allocatedByActor?.name ?? batch.allocatedByActorName ?? null,
      completedByActorName: batch.completedByActor?.name ?? batch.completedByActorName ?? null,
      workerAssignments: (batch.workerAssignments || []).map((w: any) => ({
        ...w,
        employeeName: w.employee
          ? `${w.employee.firstName} ${w.employee.lastName} (${w.employee.employeeCode})`
          : (w.employeeName ?? w.employeeId)
      })),
      progressEvents: (batch.progressEvents || []).map((ev: any) => ({
        ...ev,
        employeeName: ev.employee
          ? `${ev.employee.firstName} ${ev.employee.lastName} (${ev.employee.employeeCode})`
          : (ev.employeeName ?? ev.employeeId)
      })),
      fgReadyOutputs: (batch.fgReadyOutputs || []).map((output: any) => ({
        ...output,
        packagingRecord: output.packagingRecord ?? null,
        fgReceipt: output.fgReceipt ? {
          ...output.fgReceipt,
          locationName: output.fgReceipt.location?.name ?? output.fgReceipt.locationName ?? null,
          locationCode: output.fgReceipt.location?.code ?? output.fgReceipt.locationCode ?? null,
          receivedByActorName: output.fgReceipt.receivedByActor?.name ?? output.fgReceipt.receivedByActorName ?? null
        } : null
      })),
      components: (batch.components || []).map((comp: any) => {
        const noteName = comp.bomLine?.note ? comp.bomLine.note.split(' — ')[0].trim() : null;
        const noteSub = comp.bomLine?.note && comp.bomLine.note.includes(' — ') ? comp.bomLine.note.split(' — ')[1].trim() : null;
        const materialName = comp.bomLine?.material?.name ?? comp.materialIssueLine?.material?.name ?? comp.materialName ?? noteName ?? null;
        const productName = comp.bomLine?.componentProduct?.name ?? comp.materialIssueLine?.componentProduct?.name ?? comp.sourceBatch?.productionPlan?.product?.name ?? comp.productName ?? null;
        const itemCode = comp.bomLine?.material?.code ?? comp.bomLine?.componentProduct?.sku ?? comp.materialIssueLine?.material?.code ?? comp.materialIssueLine?.componentProduct?.sku ?? comp.itemCode ?? null;
        const uomCode = comp.uom?.code ?? comp.bomLine?.uom?.code ?? comp.bomLine?.material?.uom?.code ?? comp.uomCode ?? null;
        const sourceBatchNumber = comp.sourceBatch?.batchNumber ?? comp.sourceBatchNumber ?? null;

        return {
          ...comp,
          materialName,
          productName,
          itemCode,
          uomCode,
          sourceBatchNumber,
          noteName,
          noteSub,
        };
      })
    };
  }
}
