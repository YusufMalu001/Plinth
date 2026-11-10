import { PrismaClient } from '@prisma/client';
import { PermissionChecker, AuditWriter, ConsoleAuditWriter } from '@synergy/types';
import { prisma as defaultPrisma } from '../../../database';
import { WipRepository } from '../repositories/wip.repository';
import { assertDepartmentScope, resolveActorDefaultDepartment, isGlobalDepartmentActor } from '../../../common/rbac/department-scope';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError
} from '../../../common/errors/AppError';
import {
  WipBatchFilterOptions,
  WipExceptionFilterOptions,
  RunReconciliationParams,
  ReconciliationReport,
  WipBatchSummary,
  WipBatchDetail,
  WipGenealogyTrace,
  WipGenealogyNode,
  WipDepartmentQueueItem,
  WipOverviewMetrics,
  WipTimingMetrics,
  WipReconciliationExceptionDto
} from '../wip.types';

export class WipService {
  constructor(
    private readonly repo: WipRepository = new WipRepository(),
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditWriter: AuditWriter = new ConsoleAuditWriter()
  ) {}

  private async assertCan(
    checker: PermissionChecker | undefined,
    actorId: string,
    action: string
  ): Promise<void> {
    if (actorId === 'system') return;
    if (!checker) return;
    const allowed = await checker.can(actorId, action, 'WipTracking');
    if (!allowed) {
      throw new ForbiddenError(`Actor is not authorized to ${action} WIP and batch tracking.`);
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

  private calculateBatchTiming(
    createdAt: Date,
    progressEvents: Array<{ eventType: string; timestamp: Date }>,
    status: string,
    updatedAt: Date
  ): WipTimingMetrics {
    const sortedEvents = [...progressEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const firstStart = sortedEvents.find(e => e.eventType === 'STARTED')?.timestamp;
    const completedEvent = sortedEvents.find(e => e.eventType === 'COMPLETED')?.timestamp;
    const terminalTime = (status === 'COMPLETE' || status === 'NEXT_STAGE_ACCEPTED') ? (completedEvent || updatedAt) : new Date();

    // Queue duration: time from creation until first STARTED (or until now if never started)
    let queueDurationSeconds = 0;
    if (firstStart) {
      queueDurationSeconds = Math.max(0, Math.floor((firstStart.getTime() - createdAt.getTime()) / 1000));
    } else {
      queueDurationSeconds = Math.max(0, Math.floor((terminalTime.getTime() - createdAt.getTime()) / 1000));
    }

    // Calculate active vs paused execution time from events
    let activeExecutionDurationSeconds = 0;
    let pausedDurationSeconds = 0;

    let currentSegmentStart: Date | null = firstStart || null;
    let isPaused = false;

    for (let i = 0; i < sortedEvents.length; i++) {
      const ev = sortedEvents[i];
      if (ev.eventType === 'STARTED' || ev.eventType === 'RESUMED') {
        if (isPaused && currentSegmentStart) {
          pausedDurationSeconds += Math.max(0, Math.floor((ev.timestamp.getTime() - currentSegmentStart.getTime()) / 1000));
        }
        currentSegmentStart = ev.timestamp;
        isPaused = false;
      } else if (ev.eventType === 'PAUSED') {
        if (!isPaused && currentSegmentStart) {
          activeExecutionDurationSeconds += Math.max(0, Math.floor((ev.timestamp.getTime() - currentSegmentStart.getTime()) / 1000));
        }
        currentSegmentStart = ev.timestamp;
        isPaused = true;
      } else if (ev.eventType === 'COMPLETED') {
        if (!isPaused && currentSegmentStart) {
          activeExecutionDurationSeconds += Math.max(0, Math.floor((ev.timestamp.getTime() - currentSegmentStart.getTime()) / 1000));
        }
        currentSegmentStart = ev.timestamp;
        break;
      }
    }

    // If still in progress and not finished, add duration up to current time
    if (currentSegmentStart && status !== 'COMPLETE' && status !== 'NEXT_STAGE_ACCEPTED' && status !== 'REJECTED') {
      const now = new Date();
      const delta = Math.max(0, Math.floor((now.getTime() - currentSegmentStart.getTime()) / 1000));
      if (isPaused) {
        pausedDurationSeconds += delta;
      } else {
        activeExecutionDurationSeconds += delta;
      }
    }

    const totalStageDurationSeconds = Math.max(0, Math.floor((terminalTime.getTime() - createdAt.getTime()) / 1000));

    return {
      batchId: '',
      batchNumber: '',
      createdAt: createdAt.toISOString(),
      startedAt: firstStart ? firstStart.toISOString() : null,
      completedAt: completedEvent ? completedEvent.toISOString() : null,
      queueDurationSeconds,
      activeExecutionDurationSeconds,
      pausedDurationSeconds,
      totalStageDurationSeconds
    };
  }

  private mapBatchToSummary(b: any): WipBatchSummary {
    const received = Number(b.received_qty);
    const completed = Number(b.completed_qty);
    const rejected = Number(b.rejected_qty);
    const scrap = Number(b.scrap_qty);
    const wastage = Number(b.wastage_qty);
    const pending = Number(b.pending_qty);
    const wipQuantity = pending + completed; // Total active work at this stage

    const now = new Date();
    const currentStageDurationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(b.createdAt).getTime()) / 1000));

    return {
      id: b.id,
      batchNumber: b.batchNumber,
      productionPlanId: b.productionPlanId,
      productionPlanNumber: b.productionPlan?.planNumber,
      productId: b.productionPlan?.productId,
      productCode: b.productionPlan?.product?.sku,
      productName: b.productionPlan?.product?.name,
      departmentId: b.departmentId,
      departmentCode: b.department?.code,
      departmentName: b.department?.name,
      workCenterId: b.workCenterId,
      workCenterCode: b.workCenter?.code,
      routeStepId: b.routeStepId,
      stageSequenceNumber: b.stageSequenceNumber,
      status: b.status,
      receivedQty: received,
      completedQty: completed,
      rejectedQty: rejected,
      scrapQty: scrap,
      wastageQty: wastage,
      pendingQty: pending,
      wipQuantity,
      currentStageDurationSeconds,
      sourceHandoverId: b.sourceHandoverId,
      createdByActorId: b.createdByActorId,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString()
    };
  }

  private mapExceptionToDto(ex: any): WipReconciliationExceptionDto {
    return {
      id: ex.id,
      batchId: ex.batchId,
      batchNumber: ex.batch?.batchNumber,
      productionPlanId: ex.productionPlanId || ex.batch?.productionPlanId,
      departmentId: ex.departmentId || ex.batch?.departmentId,
      departmentName: ex.batch?.department?.name,
      exceptionType: ex.exceptionType,
      severity: ex.severity,
      description: ex.description,
      details: ex.details,
      status: ex.status,
      detectedAt: ex.detectedAt.toISOString(),
      investigatedByActorId: ex.investigatedByActorId,
      investigatedAt: ex.investigatedAt ? ex.investigatedAt.toISOString() : null,
      investigationNotes: ex.investigationNotes,
      resolvedByActorId: ex.resolvedByActorId,
      resolvedAt: ex.resolvedAt ? ex.resolvedAt.toISOString() : null,
      resolutionNotes: ex.resolutionNotes,
      createdAt: ex.createdAt.toISOString(),
      updatedAt: ex.updatedAt.toISOString()
    };
  }

  // 1. Overview
  async getWipOverview(
    actorId: string,
    filters?: { departmentId?: string; productionPlanId?: string },
    checker?: PermissionChecker
  ): Promise<WipOverviewMetrics> {
    await this.assertCan(checker, actorId, 'view');

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    let targetDepartmentId = filters?.departmentId;

    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      if (!assignedDept) {
        throw new ForbiddenError('Actor has no assigned department.');
      }
      if (filters?.departmentId && filters.departmentId !== assignedDept) {
        throw new ForbiddenError(`Actor is restricted to department [${assignedDept}] and cannot view overview for [${filters.departmentId}].`);
      }
      targetDepartmentId = assignedDept;
    } else if (targetDepartmentId) {
      await this.checkDeptScope(actorId, targetDepartmentId, checker);
    }

    const { batches, departments, openExceptionsCount } = await this.repo.getOverviewData(targetDepartmentId);

    const statusBreakdown: Record<string, number> = {};
    let totalWipQuantity = 0;
    let totalActiveBatches = 0;

    const deptMap = new Map<string, {
      departmentId: string;
      departmentCode: string;
      departmentName: string;
      batchCount: number;
      totalWipQty: number;
      activeBatches: number;
      pendingHandovers: number;
    }>();

    for (const d of departments) {
      deptMap.set(d.id, {
        departmentId: d.id,
        departmentCode: d.code,
        departmentName: d.name,
        batchCount: 0,
        totalWipQty: 0,
        activeBatches: 0,
        pendingHandovers: 0
      });
    }

    for (const b of batches) {
      const st = b.status;
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;

      const received = Number(b.received_qty);
      const rejected = Number(b.rejected_qty);
      const scrap = Number(b.scrap_qty);
      const wastage = Number(b.wastage_qty);
      const wipQty = Math.max(0, received - rejected - scrap - wastage);

      const isActive = st !== 'NEXT_STAGE_ACCEPTED' && st !== 'REJECTED';
      if (isActive) {
        totalActiveBatches += 1;
        totalWipQuantity += wipQty;
      }

      const dEntry = deptMap.get(b.departmentId);
      if (dEntry) {
        dEntry.batchCount += 1;
        if (isActive) {
          dEntry.activeBatches += 1;
          dEntry.totalWipQty += wipQty;
        }
        if (st === 'HANDOVER_PENDING') {
          dEntry.pendingHandovers += 1;
        }
      }
    }

    return {
      totalActiveBatches,
      totalWipQuantity,
      departmentBreakdown: Array.from(deptMap.values()),
      statusBreakdown,
      openExceptionsCount
    };
  }

  // 2. List Batches
  async listWipBatches(
    query: WipBatchFilterOptions,
    actorId: string,
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'view');
    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    const effectiveQuery = { ...query };

    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      if (!assignedDept) {
        throw new ForbiddenError('Actor has no assigned department.');
      }
      if (query.departmentId && query.departmentId !== assignedDept) {
        throw new ForbiddenError(`Actor is restricted to department [${assignedDept}] and cannot view batches for [${query.departmentId}].`);
      }
      effectiveQuery.departmentId = assignedDept;
    } else if (query.departmentId) {
      await this.checkDeptScope(actorId, query.departmentId, checker);
    }

    const { items, total, page, limit } = await this.repo.listBatches(effectiveQuery);

    return {
      items: items.map(b => this.mapBatchToSummary(b)),
      total,
      page,
      limit
    };
  }

  // 3. Batch Detail & Real Timings
  async getBatchWipDetail(
    batchId: string,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<WipBatchDetail> {
    await this.assertCan(checker, actorId, 'view');

    const batch = await this.repo.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundError(`Batch [${batchId}] not found.`);
    }

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      const isDirectDept = batch.departmentId === assignedDept;
      const isSourceDept = batch.sourceHandover?.outgoingDepartmentId === assignedDept;
      const isOutgoingDept = batch.outgoingHandovers?.some((h: any) => h.incomingDepartmentId === assignedDept);

      if (!isDirectDept && !isSourceDept && !isOutgoingDept) {
        throw new ForbiddenError(`Actor cannot access batch [${batch.batchNumber}] belonging to department [${batch.department?.name || batch.departmentId}].`);
      }
    }

    const summary = this.mapBatchToSummary(batch);
    const timings = this.calculateBatchTiming(
      batch.createdAt,
      batch.progressEvents,
      batch.status,
      batch.updatedAt
    );
    timings.batchId = batch.id;
    timings.batchNumber = batch.batchNumber;

    const assignedWorkers = batch.workerAssignments.map(w => ({
      id: w.id,
      employeeId: w.employeeId,
      employeeName: `${w.employee.firstName} ${w.employee.lastName}`,
      subtaskDescription: w.subtaskDescription,
      assignedByActorId: w.assignedByActorId,
      assignedAt: w.assignedAt.toISOString()
    }));

    const progressEvents = batch.progressEvents.map(p => ({
      id: p.id,
      eventType: p.eventType,
      quantityDelta: Number(p.quantityDelta),
      notes: p.notes,
      employeeId: p.employeeId,
      employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
      timestamp: p.timestamp.toISOString()
    }));

    const exceptionRecords = batch.exceptionRecords.map(e => ({
      id: e.id,
      type: e.type,
      quantity: Number(e.quantity),
      reason: e.reason,
      employeeId: e.employeeId,
      employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
      timestamp: e.timestamp.toISOString()
    }));

    const sourceHandover = batch.sourceHandover ? {
      id: batch.sourceHandover.id,
      outgoingBatchId: batch.sourceHandover.outgoingBatchId,
      outgoingBatchNumber: batch.sourceHandover.outgoingBatch?.batchNumber,
      outgoingDepartmentId: batch.sourceHandover.outgoingDepartmentId,
      outgoingDepartmentName: batch.sourceHandover.outgoingDepartment?.name,
      quantity: Number(batch.sourceHandover.quantity),
      status: batch.sourceHandover.status,
      proposedAt: batch.sourceHandover.proposedAt.toISOString(),
      decidedAt: batch.sourceHandover.decidedAt ? batch.sourceHandover.decidedAt.toISOString() : null
    } : null;

    const outgoingHandovers = batch.outgoingHandovers.map(h => ({
      id: h.id,
      incomingDepartmentId: h.incomingDepartmentId,
      incomingDepartmentName: h.incomingDepartment?.name,
      createdBatchId: h.createdBatch?.id || null,
      createdBatchNumber: h.createdBatch?.batchNumber || null,
      quantity: Number(h.quantity),
      status: h.status,
      proposedAt: h.proposedAt.toISOString(),
      decidedAt: h.decidedAt ? h.decidedAt.toISOString() : null
    }));

    // Calculate rework loops: either status is REWORK or has scrap/rework exceptions
    const reworkCount = batch.status === 'REWORK' ? 1 : batch.exceptionRecords.filter(e => e.type === 'REJECTION' || e.type === 'SCRAP').length;

    return {
      batch: summary,
      timings,
      assignedWorkers,
      progressEvents,
      exceptionRecords,
      sourceHandover,
      outgoingHandovers,
      reworkCount
    };
  }

  // 4. Genealogy Trace (Backward & Forward Walk)
  async getBatchGenealogy(
    batchId: string,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<WipGenealogyTrace> {
    await this.assertCan(checker, actorId, 'trace');

    const targetBatch = await this.repo.findBatchById(batchId);
    if (!targetBatch) {
      throw new NotFoundError(`Batch [${batchId}] not found.`);
    }

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      const planBatches = await this.repo.getAllBatchesForPlan(targetBatch.productionPlanId);
      const hasDeptBatch = planBatches.some(b => b.departmentId === assignedDept);
      if (!hasDeptBatch && targetBatch.departmentId !== assignedDept) {
        throw new ForbiddenError(`Actor cannot trace batch [${targetBatch.batchNumber}] outside their assigned department workflow.`);
      }
    }

    // Retrieve all batches for this plan to assemble the lineage graph
    const planBatches = await this.repo.getAllBatchesForPlan(targetBatch.productionPlanId);
    const batchMap = new Map<string, any>();
    for (const b of planBatches) {
      batchMap.set(b.id, b);
    }

    // 1. Walk backward from targetBatch to root batch
    const backwardChain: any[] = [];
    let current: any = targetBatch;

    while (current) {
      backwardChain.unshift(current);
      if (current.sourceHandover?.outgoingBatchId) {
        current = batchMap.get(current.sourceHandover.outgoingBatchId) || null;
      } else {
        current = null;
      }
    }

    // 2. Walk forward from targetBatch to terminal batches
    const forwardChain: any[] = [];
    current = targetBatch;

    while (current) {
      const acceptedHandover = current.outgoingHandovers?.find((h: any) => h.status === 'ACCEPTED' && h.createdBatch);
      if (acceptedHandover?.createdBatch) {
        const nextBatch = batchMap.get(acceptedHandover.createdBatch.id);
        if (nextBatch && !forwardChain.some(b => b.id === nextBatch.id)) {
          forwardChain.push(nextBatch);
          current = nextBatch;
        } else {
          current = null;
        }
      } else {
        current = null;
      }
    }

    // Combine backwardChain + forwardChain (avoiding duplicate targetBatch)
    const combinedBatches = [...backwardChain];
    for (const fb of forwardChain) {
      if (!combinedBatches.some(b => b.id === fb.id)) {
        combinedBatches.push(fb);
      }
    }

    // Sort by stage sequence number
    combinedBatches.sort((a, b) => a.stageSequenceNumber - b.stageSequenceNumber);

    const rootBatch = combinedBatches[0];
    let totalLeadTimeSeconds = 0;

    const stages: WipGenealogyNode[] = combinedBatches.map(b => {
      const completedEvent = b.progressEvents?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp;
      const terminalTime = (b.status === 'COMPLETE' || b.status === 'NEXT_STAGE_ACCEPTED') ? (completedEvent || b.updatedAt) : new Date();

      const durationSeconds = Math.max(0, Math.floor((terminalTime.getTime() - b.createdAt.getTime()) / 1000));
      totalLeadTimeSeconds += durationSeconds;

      const incomingHandover = b.sourceHandover ? {
        handoverId: b.sourceHandover.id,
        fromBatchId: b.sourceHandover.outgoingBatchId,
        fromBatchNumber: b.sourceHandover.outgoingBatch?.batchNumber,
        fromDepartmentId: b.sourceHandover.outgoingDepartmentId,
        fromDepartmentName: b.sourceHandover.outgoingDepartment?.name,
        quantity: Number(b.sourceHandover.quantity),
        status: b.sourceHandover.status,
        decidedAt: b.sourceHandover.decidedAt ? b.sourceHandover.decidedAt.toISOString() : null
      } : null;

      const outgoingHandovers = (b.outgoingHandovers || []).map((h: any) => ({
        handoverId: h.id,
        toBatchId: h.createdBatch?.id || null,
        toBatchNumber: h.createdBatch?.batchNumber || null,
        toDepartmentId: h.incomingDepartmentId,
        toDepartmentName: h.incomingDepartment?.name,
        quantity: Number(h.quantity),
        status: h.status,
        decidedAt: h.decidedAt ? h.decidedAt.toISOString() : null
      }));

      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        productionPlanId: b.productionPlanId,
        departmentId: b.departmentId,
        departmentCode: b.department?.code,
        departmentName: b.department?.name,
        stageSequenceNumber: b.stageSequenceNumber,
        status: b.status,
        receivedQty: Number(b.received_qty),
        completedQty: Number(b.completed_qty),
        rejectedQty: Number(b.rejected_qty),
        scrapQty: Number(b.scrap_qty),
        wastageQty: Number(b.wastage_qty),
        pendingQty: Number(b.pending_qty),
        createdAt: b.createdAt.toISOString(),
        completedAt: completedEvent ? completedEvent.toISOString() : null,
        durationSeconds,
        incomingHandover,
        outgoingHandovers
      };
    });

    const isComplete = stages.every(s => s.status === 'COMPLETE' || s.status === 'NEXT_STAGE_ACCEPTED');

    return {
      rootBatchId: rootBatch.id,
      currentBatchId: targetBatch.id,
      productionPlanId: targetBatch.productionPlanId,
      productName: targetBatch.productionPlan?.product?.name,
      stages,
      totalStages: stages.length,
      totalLeadTimeSeconds,
      isComplete
    };
  }

  // 5. Department WIP Queue
  async getDepartmentQueue(
    departmentId: string,
    actorId: string,
    query?: { status?: string; page?: number; limit?: number },
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'view');
    await this.checkDeptScope(actorId, departmentId, checker);

    const page = query?.page || 1;
    const limit = query?.limit || 20;

    const { items, total } = await this.repo.getDepartmentQueue(departmentId, query?.status, page, limit);

    const now = new Date();
    const queueItems: WipDepartmentQueueItem[] = items.map(b => {
      const firstStart = b.progressEvents?.find((e: any) => e.eventType === 'STARTED')?.timestamp;
      const queueDurationSeconds = firstStart
        ? Math.max(0, Math.floor((firstStart.getTime() - b.createdAt.getTime()) / 1000))
        : Math.max(0, Math.floor((now.getTime() - b.createdAt.getTime()) / 1000));

      const activeDurationSeconds = firstStart
        ? Math.max(0, Math.floor((now.getTime() - firstStart.getTime()) / 1000))
        : 0;

      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        productionPlanId: b.productionPlanId,
        productionPlanNumber: b.productionPlan?.planNumber,
        productId: b.productionPlan?.productId,
        productName: b.productionPlan?.product?.name,
        stageSequenceNumber: b.stageSequenceNumber,
        status: b.status,
        receivedQty: Number(b.received_qty),
        completedQty: Number(b.completed_qty),
        pendingQty: Number(b.pending_qty),
        assignedWorkersCount: b._count.workerAssignments,
        queueDurationSeconds,
        activeDurationSeconds,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString()
      };
    });

    return { items: queueItems, total, page, limit };
  }

  // 6. Timing Metrics (Raw Durations)
  async getTimingMetrics(
    query: WipBatchFilterOptions,
    actorId: string,
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'view');
    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    const effectiveQuery = { ...query };

    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      if (!assignedDept) {
        throw new ForbiddenError('Actor has no assigned department.');
      }
      if (query.departmentId && query.departmentId !== assignedDept) {
        throw new ForbiddenError(`Actor is restricted to department [${assignedDept}] and cannot view metrics for [${query.departmentId}].`);
      }
      effectiveQuery.departmentId = assignedDept;
    } else if (query.departmentId) {
      await this.checkDeptScope(actorId, query.departmentId, checker);
    }

    const { items, total, page, limit } = await this.repo.listBatches(effectiveQuery);

    const metricsList = await Promise.all(
      items.map(async b => {
        const fullBatch = await this.repo.findBatchById(b.id);
        if (!fullBatch) return null;
        const timing = this.calculateBatchTiming(
          fullBatch.createdAt,
          fullBatch.progressEvents,
          fullBatch.status,
          fullBatch.updatedAt
        );
        timing.batchId = fullBatch.id;
        timing.batchNumber = fullBatch.batchNumber;
        return timing;
      })
    );

    return {
      items: metricsList.filter(Boolean) as WipTimingMetrics[],
      total,
      page,
      limit
    };
  }

  // 7. Reconciliation Check & Anomaly Detection
  async runReconciliationCheck(
    params: RunReconciliationParams,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<ReconciliationReport> {
    await this.assertCan(checker, actorId, 'reconcile');
    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    const effectiveParams = { ...params };

    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      if (!assignedDept) {
        throw new ForbiddenError('Actor has no assigned department.');
      }
      if (params.departmentId && params.departmentId !== assignedDept) {
        throw new ForbiddenError(`Actor is restricted to department [${assignedDept}] and cannot reconcile for [${params.departmentId}].`);
      }
      effectiveParams.departmentId = assignedDept;
    } else if (params.departmentId) {
      await this.checkDeptScope(actorId, params.departmentId, checker);
    }

    const filter: WipBatchFilterOptions = {
      limit: 500
    };
    if (effectiveParams.productionPlanId) filter.productionPlanId = effectiveParams.productionPlanId;
    if (effectiveParams.departmentId) filter.departmentId = effectiveParams.departmentId;

    const { items: batches } = await this.repo.listBatches(filter);

    let checkedBatchesCount = 0;
    let anomaliesDetectedCount = 0;
    const createdExceptions: WipReconciliationExceptionDto[] = [];

    for (const bItem of batches) {
      if (effectiveParams.batchId && bItem.id !== effectiveParams.batchId) continue;
      checkedBatchesCount++;

      const b = await this.repo.findBatchById(bItem.id);
      if (!b) continue;

      const received = Number(b.received_qty);
      const completed = Number(b.completed_qty);
      const rejected = Number(b.rejected_qty);
      const scrap = Number(b.scrap_qty);
      const wastage = Number(b.wastage_qty);
      const pending = Number(b.pending_qty);

      // Anomaly 1: Negative Quantity
      if (received < 0 || completed < 0 || rejected < 0 || scrap < 0 || wastage < 0 || pending < 0) {
        anomaliesDetectedCount++;
        const existing = await this.repo.findExistingException(b.id, 'NEGATIVE_QUANTITY');
        if (!existing) {
          const ex = await this.repo.createException({
            batchId: b.id,
            productionPlanId: b.productionPlanId,
            departmentId: b.departmentId,
            exceptionType: 'NEGATIVE_QUANTITY',
            severity: 'CRITICAL',
            description: `Batch [${b.batchNumber}] contains negative quantity: received=${received}, completed=${completed}, rejected=${rejected}, scrap=${scrap}, wastage=${wastage}, pending=${pending}.`,
            details: { received, completed, rejected, scrap, wastage, pending }
          });
          createdExceptions.push(this.mapExceptionToDto(ex));
        }
      }

      // Anomaly 2: Conservation Mismatch
      const sum = completed + rejected + scrap + wastage + pending;
      if (Math.abs(sum - received) > 0.0001) {
        anomaliesDetectedCount++;
        const existing = await this.repo.findExistingException(b.id, 'CONSERVATION_MISMATCH');
        if (!existing) {
          const ex = await this.repo.createException({
            batchId: b.id,
            productionPlanId: b.productionPlanId,
            departmentId: b.departmentId,
            exceptionType: 'CONSERVATION_MISMATCH',
            severity: 'HIGH',
            description: `Quantity conservation invariant violated on batch [${b.batchNumber}]: received_qty (${received}) != sum of outputs (${sum}).`,
            details: { received, completed, rejected, scrap, wastage, pending, difference: sum - received }
          });
          createdExceptions.push(this.mapExceptionToDto(ex));
        }
      }

      // Anomaly 3: Broken Genealogy Chain
      // A) Source handover does not exist, or points to an unaccepted handover while batch is already executing/completed
      if (b.sourceHandoverId) {
        if (!b.sourceHandover) {
          anomaliesDetectedCount++;
          const existing = await this.repo.findExistingException(b.id, 'BROKEN_GENEALOGY_CHAIN');
          if (!existing) {
            const ex = await this.repo.createException({
              batchId: b.id,
              productionPlanId: b.productionPlanId,
              departmentId: b.departmentId,
              exceptionType: 'BROKEN_GENEALOGY_CHAIN',
              severity: 'HIGH',
              description: `Batch [${b.batchNumber}] references sourceHandoverId [${b.sourceHandoverId}] which does not exist in the system.`,
              details: { sourceHandoverId: b.sourceHandoverId }
            });
            createdExceptions.push(this.mapExceptionToDto(ex));
          }
        } else if (b.sourceHandover.status !== 'ACCEPTED' && b.status !== 'AWAITING_RECEIPT') {
          anomaliesDetectedCount++;
          const existing = await this.repo.findExistingException(b.id, 'BROKEN_GENEALOGY_CHAIN');
          if (!existing) {
            const ex = await this.repo.createException({
              batchId: b.id,
              productionPlanId: b.productionPlanId,
              departmentId: b.departmentId,
              exceptionType: 'BROKEN_GENEALOGY_CHAIN',
              severity: 'HIGH',
              description: `Batch [${b.batchNumber}] is in active execution (${b.status}) but its sourceHandover [${b.sourceHandoverId}] is still in ${b.sourceHandover.status} state.`,
              details: { sourceHandoverId: b.sourceHandoverId, handoverStatus: b.sourceHandover.status, batchStatus: b.status }
            });
            createdExceptions.push(this.mapExceptionToDto(ex));
          }
        }
      }

      // B) Outgoing handover marked ACCEPTED but createdBatch is missing
      for (const oh of b.outgoingHandovers) {
        if (oh.status === 'ACCEPTED' && !oh.createdBatch) {
          anomaliesDetectedCount++;
          const existing = await this.repo.findExistingException(b.id, 'BROKEN_GENEALOGY_CHAIN');
          if (!existing) {
            const ex = await this.repo.createException({
              batchId: b.id,
              productionPlanId: b.productionPlanId,
              departmentId: b.departmentId,
              exceptionType: 'BROKEN_GENEALOGY_CHAIN',
              severity: 'CRITICAL',
              description: `Handover [${oh.id}] on batch [${b.batchNumber}] is marked ACCEPTED but has no associated downstream createdBatch.`,
              details: { handoverId: oh.id, incomingDepartmentId: oh.incomingDepartmentId }
            });
            createdExceptions.push(this.mapExceptionToDto(ex));
          }
        }
      }

      // Anomaly 4: Double Presence
      // If batch has an accepted outgoing handover and downstream batch is active/completed,
      // but upstream batch status is still active (e.g. IN_PROGRESS or RECEIVED) instead of NEXT_STAGE_ACCEPTED.
      const acceptedHandoverWithActiveChild = b.outgoingHandovers.find(
        (oh: any) => oh.status === 'ACCEPTED' && oh.createdBatch && oh.createdBatch.status !== 'AWAITING_RECEIPT'
      );
      if (acceptedHandoverWithActiveChild && (b.status === 'IN_PROGRESS' || b.status === 'RECEIVED' || b.status === 'ASSIGNED')) {
        anomaliesDetectedCount++;
        const existing = await this.repo.findExistingException(b.id, 'DOUBLE_PRESENCE');
        if (!existing) {
          const ex = await this.repo.createException({
            batchId: b.id,
            productionPlanId: b.productionPlanId,
            departmentId: b.departmentId,
            exceptionType: 'DOUBLE_PRESENCE',
            severity: 'CRITICAL',
            description: `Double presence detected: Batch [${b.batchNumber}] at department [${b.department?.name}] is still in status [${b.status}] while accepted downstream batch [${acceptedHandoverWithActiveChild.createdBatch?.batchNumber}] is already active in department [${acceptedHandoverWithActiveChild.incomingDepartment?.name}].`,
            details: {
              upstreamBatchNumber: b.batchNumber,
              upstreamStatus: b.status,
              downstreamBatchNumber: acceptedHandoverWithActiveChild.createdBatch?.batchNumber,
              downstreamStatus: acceptedHandoverWithActiveChild.createdBatch?.status
            }
          });
          createdExceptions.push(this.mapExceptionToDto(ex));
        }
      }
    }

    await this.auditWriter.record({
      entityType: 'WipReconciliation',
      entityId: actorId,
      action: 'RECONCILIATION_RUN',
      actorId,
      metadata: {
        checkedBatchesCount,
        anomaliesDetectedCount,
        exceptionsCreatedCount: createdExceptions.length,
        params: effectiveParams as any
      }
    });

    return {
      checkedBatchesCount,
      anomaliesDetectedCount,
      exceptionsCreatedCount: createdExceptions.length,
      exceptions: createdExceptions,
      timestamp: new Date().toISOString()
    };
  }

  // 8. Reconciliation Exceptions Listing & Detail
  async listExceptions(
    options: WipExceptionFilterOptions,
    actorId: string,
    checker?: PermissionChecker
  ) {
    await this.assertCan(checker, actorId, 'view');
    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    const effectiveOptions = { ...options };

    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      if (!assignedDept) {
        throw new ForbiddenError('Actor has no assigned department.');
      }
      if (options.departmentId && options.departmentId !== assignedDept) {
        throw new ForbiddenError(`Actor is restricted to department [${assignedDept}] and cannot view exceptions for [${options.departmentId}].`);
      }
      effectiveOptions.departmentId = assignedDept;
    } else if (options.departmentId) {
      await this.checkDeptScope(actorId, options.departmentId, checker);
    }

    const { items, total, page, limit } = await this.repo.listExceptions(effectiveOptions);

    return {
      items: items.map(ex => this.mapExceptionToDto(ex)),
      total,
      page,
      limit
    };
  }

  async getExceptionById(
    id: string,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<WipReconciliationExceptionDto> {
    await this.assertCan(checker, actorId, 'view');

    const ex = await this.repo.findExceptionById(id);
    if (!ex) {
      throw new NotFoundError(`Reconciliation exception [${id}] not found.`);
    }

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      const exDept = ex.departmentId || ex.batch?.departmentId;
      if (exDept && exDept !== assignedDept) {
        throw new ForbiddenError(`Actor cannot access exception [${id}] belonging to department [${ex.batch?.department?.name || exDept}].`);
      }
    }

    return this.mapExceptionToDto(ex);
  }

  // 9. Investigate Exception
  async investigateException(
    id: string,
    notes: string | undefined,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<WipReconciliationExceptionDto> {
    await this.assertCan(checker, actorId, 'manage_exception');

    const ex = await this.repo.findExceptionById(id);
    if (!ex) {
      throw new NotFoundError(`Reconciliation exception [${id}] not found.`);
    }

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      const exDept = ex.departmentId || ex.batch?.departmentId;
      if (exDept && exDept !== assignedDept) {
        throw new ForbiddenError(`Actor cannot investigate exception [${id}] belonging to department [${ex.batch?.department?.name || exDept}].`);
      }
    }

    const updated = await this.repo.updateException(id, {
      status: 'INVESTIGATING',
      investigatedByActorId: actorId,
      investigatedAt: new Date(),
      investigationNotes: notes || ex.investigationNotes
    });

    await this.auditWriter.record({
      entityType: 'WipReconciliationException',
      entityId: id,
      action: 'INVESTIGATE_EXCEPTION',
      actorId,
      metadata: { previousStatus: ex.status, newStatus: 'INVESTIGATING', notes }
    });

    return this.mapExceptionToDto(updated);
  }

  // 10. Resolve Exception
  async resolveException(
    id: string,
    resolutionNotes: string,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<WipReconciliationExceptionDto> {
    await this.assertCan(checker, actorId, 'manage_exception');

    if (!resolutionNotes || resolutionNotes.trim().length < 3) {
      throw new ValidationError('Resolution notes are required to resolve an exception.');
    }

    const ex = await this.repo.findExceptionById(id);
    if (!ex) {
      throw new NotFoundError(`Reconciliation exception [${id}] not found.`);
    }

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      const exDept = ex.departmentId || ex.batch?.departmentId;
      if (exDept && exDept !== assignedDept) {
        throw new ForbiddenError(`Actor cannot resolve exception [${id}] belonging to department [${ex.batch?.department?.name || exDept}].`);
      }
    }
    // If the exception is a CONSERVATION_MISMATCH, automatically rebalance pending/scrap on the batch
    if (ex.exceptionType === 'CONSERVATION_MISMATCH' && ex.batchId) {
      try {
        const batch = await this.repo.findBatchById(ex.batchId);
        if (batch) {
          const rec = Number(batch.received_qty);
          const comp = Number(batch.completed_qty);
          const rej = Number(batch.rejected_qty);
          const scr = Number(batch.scrap_qty);
          const wst = Number(batch.wastage_qty);
          const accounted = comp + rej + scr + wst;
          
          // Re-balance pending_qty so received_qty == completed + rejected + scrap + wastage + pending
          const adjustedPending = Math.max(0, rec - accounted);
          await this.prisma.departmentExecutionBatch.update({
            where: { id: ex.batchId },
            data: { pending_qty: adjustedPending }
          });
        }
      } catch (patchErr) {
        // Non-blocking warning if batch update fails
        console.warn(`[WipService] Could not auto-balance batch [${ex.batchId}] during exception resolution:`, patchErr);
      }
    }
    const updated = await this.repo.updateException(id, {
      status: 'RESOLVED',
      resolvedByActorId: actorId,
      resolvedAt: new Date(),
      resolutionNotes: resolutionNotes.trim()
    });

    await this.auditWriter.record({
      entityType: 'WipReconciliationException',
      entityId: id,
      action: 'RESOLVE_EXCEPTION',
      actorId,
      metadata: { previousStatus: ex.status, newStatus: 'RESOLVED', resolutionNotes }
    });

    return this.mapExceptionToDto(updated);
  }

  // 11. Dismiss Exception
  async dismissException(
    id: string,
    resolutionNotes: string,
    actorId: string,
    checker?: PermissionChecker
  ): Promise<WipReconciliationExceptionDto> {
    await this.assertCan(checker, actorId, 'manage_exception');

    if (!resolutionNotes || resolutionNotes.trim().length < 3) {
      throw new ValidationError('Dismissal notes/reason are required to dismiss an exception.');
    }

    const ex = await this.repo.findExceptionById(id);
    if (!ex) {
      throw new NotFoundError(`Reconciliation exception [${id}] not found.`);
    }

    const isGlobal = await isGlobalDepartmentActor(actorId, checker, this.prisma);
    if (!isGlobal) {
      const assignedDept = await resolveActorDefaultDepartment(actorId, this.prisma);
      const exDept = ex.departmentId || ex.batch?.departmentId;
      if (exDept && exDept !== assignedDept) {
        throw new ForbiddenError(`Actor cannot dismiss exception [${id}] belonging to department [${ex.batch?.department?.name || exDept}].`);
      }
    }

    const updated = await this.repo.updateException(id, {
      status: 'DISMISSED',
      resolvedByActorId: actorId,
      resolvedAt: new Date(),
      resolutionNotes: resolutionNotes.trim()
    });

    await this.auditWriter.record({
      entityType: 'WipReconciliationException',
      entityId: id,
      action: 'DISMISS_EXCEPTION',
      actorId,
      metadata: { previousStatus: ex.status, newStatus: 'DISMISSED', resolutionNotes }
    });

    return this.mapExceptionToDto(updated);
  }
}
