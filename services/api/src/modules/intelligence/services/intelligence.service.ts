import { BusinessTaskStatus, IntelligenceModule, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { getActorCapabilities, hasCapability } from '../../../common/rbac/permission-cache';
import { DbAuditWriter } from '../../../common/audit/db-audit-writer';
import { NotificationService } from '../../notifications/notification.service';
import { intelligenceOrchestratorService, IntelligenceOrchestratorService } from './intelligence-orchestrator.service';
import { profileForModule } from '../intelligence.profiles';
import { objectivePolicyService, ObjectivePolicyService } from './objective-policy.service';
import { CertifiedSnapshotData } from './certified-metrics.service';
import { intelligenceControlsService, IntelligenceControlsService, IntelligenceControlInput } from './intelligence-controls.service';
import { outcomeEvaluatorService } from './outcome-evaluator.service';

const departmentModuleMatchers: Array<[RegExp, IntelligenceModule]> = [
  [/sales|commercial|customer/i, 'SALES'],
  [/inventory|store|warehouse|stock/i, 'INVENTORY'],
  [/procurement|purchase|sourcing/i, 'PROCUREMENT'],
  [/production|manufactur|plant|assembly/i, 'PRODUCTION'],
  [/dispatch|fulfillment|logistics|shipping/i, 'FULFILLMENT'],
  [/quality|inspection|qc/i, 'QUALITY'],
  [/finance|accounts|accounting/i, 'FINANCE'],
];

function canOwnModuleTask(user: { role: string; department: string | null; assignedDepartmentRef: { code: string; name: string } | null }, module: IntelligenceModule) {
  if (user.role === 'admin' || module === 'EXECUTIVE' || module === 'SYSTEM') return true;
  const matcher = departmentModuleMatchers.find(([, candidate]) => candidate === module)?.[0];
  const department = [user.department, user.assignedDepartmentRef?.code, user.assignedDepartmentRef?.name].filter(Boolean).join(' ');
  return Boolean(matcher?.test(department));
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function indiaBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export class IntelligenceService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly orchestrator: IntelligenceOrchestratorService = intelligenceOrchestratorService,
    private readonly policies: ObjectivePolicyService = objectivePolicyService,
    private readonly notifications = new NotificationService(),
    private readonly audit = new DbAuditWriter(),
    private readonly controls: IntelligenceControlsService = intelligenceControlsService,
  ) {}

  async overview(actorId: string) {
    const modules = await this.authorizedModules(actorId);
    const recommendationWhere: Prisma.RecommendationWhereInput = modules ? { module: { in: modules } } : {};
    const taskWhere: Prisma.BusinessTaskWhereInput = modules ? { module: { in: modules } } : {};
    const [recommendationCounts, taskCounts, latestSnapshots, recentRecommendations, realizedImpact, runtime] = await Promise.all([
      this.db.recommendation.groupBy({ by: ['status'], where: recommendationWhere, _count: { _all: true } }),
      this.db.businessTask.groupBy({ by: ['status'], where: taskWhere, _count: { _all: true } }),
      this.latestSnapshots(modules),
      this.db.recommendation.findMany({
        where: recommendationWhere,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        include: { task: { select: { id: true, status: true, ownerId: true, dueAt: true } } },
      }),
      this.db.recommendationOutcome.aggregate({ where: modules ? { recommendation: { module: { in: modules } } } : {}, _sum: { realizedValue: true }, _count: { _all: true } }),
      this.runtimeSummary(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      scope: { modules: modules ?? ['ALL'] },
      recommendationCounts: Object.fromEntries(recommendationCounts.map((row) => [row.status, row._count._all])),
      taskCounts: Object.fromEntries(taskCounts.map((row) => [row.status, row._count._all])),
      latestSnapshots,
      recentRecommendations,
      realizedImpact: { recordedOutcomeCount: realizedImpact._count._all, totalRecordedValue: Number(realizedImpact._sum.realizedValue ?? 0) },
      runtime,
    };
  }

  async listRecommendations(actorId: string, query: { module?: IntelligenceModule; status?: any; priority?: any; page: number; limit: number }) {
    const modules = await this.authorizedModules(actorId);
    if (query.module && modules && !modules.includes(query.module)) throw new ForbiddenError('The requested module is outside your intelligence scope.');
    const where: Prisma.RecommendationWhereInput = {
      ...(modules ? { module: { in: modules } } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.recommendation.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          task: { select: { id: true, status: true, ownerId: true, dueAt: true } },
          run: { select: { id: true, modelProvider: true, modelId: true, promptVersion: true, createdAt: true } },
        },
      }),
      this.db.recommendation.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getRecommendation(actorId: string, id: string) {
    const recommendation = await this.db.recommendation.findUnique({
      where: { id },
      include: {
        snapshot: { include: { metrics: true } },
        run: { select: { id: true, profileKey: true, module: true, modelProvider: true, modelId: true, promptVersion: true, schemaVersion: true, status: true, usage: true, costUsd: true, correlationId: true, createdAt: true, completedAt: true } },
        objectivePolicy: true,
        decisions: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, email: true } } } },
        task: { include: { owner: { select: { id: true, name: true, email: true } }, activities: { orderBy: { createdAt: 'asc' } } } },
        outcomes: { orderBy: { observedAt: 'desc' } },
      },
    });
    if (!recommendation) throw new NotFoundError('Recommendation not found.');
    await this.assertModuleScope(actorId, recommendation.module);
    return recommendation;
  }

  async acceptRecommendation(actorId: string, id: string, input: { assigneeId: string; dueAt: string; managerNotes?: string }, requestId: string) {
    const dueAt = new Date(input.dueAt);
    if (dueAt <= new Date()) throw new ValidationError('The task due date must be in the future.');
    const scopedRecommendation = await this.db.recommendation.findUnique({ where: { id }, select: { module: true } });
    if (!scopedRecommendation) throw new NotFoundError('Recommendation not found.');
    await this.assertModuleScope(actorId, scopedRecommendation.module);
    const existingTask = await this.db.businessTask.findUnique({ where: { recommendationId: id }, include: { owner: { select: { id: true, name: true, email: true } } } });
    if (existingTask) return existingTask;
    const task = await this.db.$transaction(async (tx) => {
      const recommendation = await tx.recommendation.findUnique({ where: { id }, include: { snapshot: true } });
      if (!recommendation) throw new NotFoundError('Recommendation not found.');
      if (!['OPEN', 'DEFERRED'].includes(recommendation.status)) throw new ConflictError(`Recommendation cannot be accepted from status '${recommendation.status}'.`);
      if (recommendation.expiresAt <= new Date()) throw new ConflictError('This recommendation has expired and must be refreshed.');
      const assignee = await tx.user.findUnique({ where: { id: input.assigneeId }, select: { id: true, isActive: true, role: true, department: true, assignedDepartmentRef: { select: { code: true, name: true } } } });
      if (!assignee?.isActive) throw new ValidationError('The selected task owner is not an active user.');
      if (!canOwnModuleTask(assignee, recommendation.module)) throw new ValidationError('The selected task owner is outside the recommendation module.');
      const snapshotData = recommendation.snapshot.data as unknown as CertifiedSnapshotData;
      const opportunity = snapshotData.opportunities.find((item) => item.id === recommendation.opportunityRef);
      const updated = await tx.recommendation.updateMany({
        where: { id, status: { in: ['OPEN', 'DEFERRED'] }, expiresAt: { gt: new Date() } },
        data: { status: 'ACCEPTED' },
      });
      if (updated.count !== 1) throw new ConflictError('Recommendation was changed by another reviewer.');
      await tx.recommendationDecision.create({ data: { recommendationId: id, decision: 'ACCEPTED', actorId, reason: input.managerNotes } });
      const created = await tx.businessTask.create({
        data: {
          recommendationId: id,
          module: recommendation.module,
          title: recommendation.title,
          description: recommendation.situation,
          ownerId: input.assigneeId,
          creatorId: actorId,
          priority: recommendation.priority,
          dueAt,
          targetResource: opportunity?.targetResource,
          targetResourceId: opportunity?.targetResourceId,
          expectedImpact: recommendation.expectedImpact as Prisma.InputJsonValue,
          managerNotes: input.managerNotes,
          idempotencyKey: `recommendation-task:${id}`,
          activities: { create: { actorId, type: 'CREATED', comment: input.managerNotes } },
        },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });
      return created;
    });
    await this.notifications.createAndDispatch({
      recipientId: task.ownerId,
      type: 'WORKFLOW',
      title: 'Recommendation accepted and assigned',
      message: task.title,
      resource: 'BusinessTask',
      resourceId: task.id,
      href: `/decision-center/tasks/${task.id}`,
      priority: task.priority === 'CRITICAL' ? 'CRITICAL' : task.priority === 'HIGH' ? 'HIGH' : 'NORMAL',
      dedupeKey: `business-task-assigned:${task.id}:${task.ownerId}`,
      metadata: { recommendationId: id, dueAt: task.dueAt.toISOString() },
    });
    await this.audit.record({ actorId, action: 'intelligence.recommendation_accept', entityType: 'Recommendation', entityId: id, after: { taskId: task.id, ownerId: task.ownerId, dueAt: task.dueAt }, requestId });
    return task;
  }

  async dismissRecommendation(actorId: string, id: string, reason: string, requestId: string) {
    const recommendation = await this.db.recommendation.findUnique({ where: { id } });
    if (!recommendation) throw new NotFoundError('Recommendation not found.');
    await this.assertModuleScope(actorId, recommendation.module);
    if (!['OPEN', 'DEFERRED'].includes(recommendation.status)) throw new ConflictError(`Recommendation cannot be dismissed from status '${recommendation.status}'.`);
    const result = await this.db.$transaction(async (tx) => {
      await tx.recommendation.update({ where: { id }, data: { status: 'DISMISSED' } });
      return tx.recommendationDecision.create({ data: { recommendationId: id, decision: 'DISMISSED', actorId, reason } });
    });
    await this.audit.record({ actorId, action: 'intelligence.recommendation_dismiss', entityType: 'Recommendation', entityId: id, after: { reason }, requestId });
    return result;
  }

  async deferRecommendation(actorId: string, id: string, reason: string, deferredUntilValue: string, requestId: string) {
    const deferredUntil = new Date(deferredUntilValue);
    const recommendation = await this.db.recommendation.findUnique({ where: { id } });
    if (!recommendation) throw new NotFoundError('Recommendation not found.');
    await this.assertModuleScope(actorId, recommendation.module);
    if (recommendation.status !== 'OPEN') throw new ConflictError(`Recommendation cannot be deferred from status '${recommendation.status}'.`);
    if (deferredUntil <= new Date() || deferredUntil >= recommendation.expiresAt) throw new ValidationError('Deferment must be in the future and before the recommendation expires.');
    const result = await this.db.$transaction(async (tx) => {
      await tx.recommendation.update({ where: { id }, data: { status: 'DEFERRED' } });
      return tx.recommendationDecision.create({ data: { recommendationId: id, decision: 'DEFERRED', actorId, reason, deferredUntil } });
    });
    await this.audit.record({ actorId, action: 'intelligence.recommendation_defer', entityType: 'Recommendation', entityId: id, after: { reason, deferredUntil }, requestId });
    return result;
  }

  async refreshRecommendation(actorId: string, id: string, requestId: string) {
    const recommendation = await this.db.recommendation.findUnique({ where: { id } });
    if (!recommendation) throw new NotFoundError('Recommendation not found.');
    await this.assertModuleScope(actorId, recommendation.module);
    return this.orchestrator.enqueue({
      module: recommendation.module,
      trigger: 'MANUAL',
      payload: { sourceRecommendationId: id, requestedBy: actorId },
      idempotencyKey: `refresh:${id}:${requestId}`,
      correlationId: requestId,
    });
  }

  async runModuleAnalysis(actorId: string, module: IntelligenceModule, requestId: string) {
    await this.assertModuleScope(actorId, module);
    const profile = profileForModule(module);
    if (!profile) throw new ValidationError(`Module '${module}' does not have an enabled AI recommendation profile.`);
    const controls = await this.controls.effective();
    if (!controls.enabled || !controls.providerEnabled) throw new ConflictError('AI recommendations are paused by the active runtime controls.');
    if (controls.pausedProfiles.includes(profile.key)) throw new ConflictError(`The '${module}' AI profile is paused.`);
    return this.orchestrator.enqueue({
      module,
      trigger: 'MANUAL',
      payload: { requestedBy: actorId, source: 'decision-center-manual-analysis' },
      idempotencyKey: `manual:${actorId}:${module}:${requestId}`,
      correlationId: requestId,
    });
  }

  async listTasks(actorId: string, query: { status?: BusinessTaskStatus; page: number; limit: number }) {
    const modules = await this.authorizedModules(actorId);
    const capabilities = await getActorCapabilities(this.db, actorId);
    const canSeeModuleTasks = capabilities.admin || hasCapability(capabilities, 'view', 'BusinessTask');
    const where: Prisma.BusinessTaskWhereInput = {
      ...(canSeeModuleTasks ? (modules ? { module: { in: modules } } : {}) : { ownerId: actorId }),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.businessTask.findMany({ where, orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit, include: { owner: { select: { id: true, name: true, email: true } }, recommendation: { select: { id: true, title: true, confidence: true, expectedImpact: true } } } }),
      this.db.businessTask.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getTask(actorId: string, id: string) {
    const task = await this.db.businessTask.findUnique({ where: { id }, include: { owner: { select: { id: true, name: true, email: true } }, creator: { select: { id: true, name: true, email: true } }, recommendation: true, activities: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true } } } }, outcomes: true } });
    if (!task) throw new NotFoundError('Business task not found.');
    const capabilities = await getActorCapabilities(this.db, actorId);
    if (task.ownerId !== actorId && !capabilities.admin && !hasCapability(capabilities, 'view', 'BusinessTask')) throw new ForbiddenError('You cannot view this task.');
    await this.assertModuleScope(actorId, task.module, task.ownerId === actorId);
    return task;
  }

  async updateTask(actorId: string, id: string, input: { status?: BusinessTaskStatus; assigneeId?: string; dueAt?: string; comment?: string }, requestId: string) {
    const existing = await this.getTask(actorId, id);
    const capabilities = await getActorCapabilities(this.db, actorId);
    const isOwner = existing.ownerId === actorId;
    if (!isOwner && !capabilities.admin && !hasCapability(capabilities, 'update', 'BusinessTask')) {
      throw new ForbiddenError('Updating another user\'s task requires task update permission.');
    }
    if (input.status === 'COMPLETED') throw new ValidationError('Use the task completion endpoint to record completion evidence.');
    if (input.status === 'CANCELLED' && !capabilities.admin && !hasCapability(capabilities, 'update', 'BusinessTask')) {
      throw new ForbiddenError('Cancelling a task requires task update permission.');
    }
    const transitions: Record<BusinessTaskStatus, BusinessTaskStatus[]> = {
      OPEN: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
      IN_PROGRESS: ['BLOCKED', 'CANCELLED'],
      BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (input.status && input.status !== existing.status && !transitions[existing.status].includes(input.status)) {
      throw new ConflictError(`Task cannot move from '${existing.status}' to '${input.status}'.`);
    }
    if (input.assigneeId && input.assigneeId !== existing.ownerId && !capabilities.admin && !hasCapability(capabilities, 'assign', 'BusinessTask')) throw new ForbiddenError('Assigning a task requires assignment permission.');
    if (input.assigneeId) {
      const assignee = await this.db.user.findUnique({ where: { id: input.assigneeId }, select: { isActive: true, role: true, department: true, assignedDepartmentRef: { select: { code: true, name: true } } } });
      if (!assignee?.isActive) throw new ValidationError('The selected task owner is not active.');
      if (!canOwnModuleTask(assignee, existing.module)) throw new ValidationError('The selected task owner is outside this task module.');
    }
    if (input.dueAt && new Date(input.dueAt) <= new Date()) throw new ValidationError('Task due date must be in the future.');
    const task = await this.db.$transaction(async (tx) => {
      const updated = await tx.businessTask.update({ where: { id }, data: { status: input.status, ownerId: input.assigneeId, dueAt: input.dueAt ? new Date(input.dueAt) : undefined } });
      await tx.businessTaskActivity.create({ data: { taskId: id, actorId, type: input.assigneeId ? 'ASSIGNED' : input.status ? 'STATUS_CHANGED' : 'COMMENT', comment: input.comment } });
      return updated;
    });
    await this.audit.record({ actorId, action: 'intelligence.task_update', entityType: 'BusinessTask', entityId: id, before: { status: existing.status, ownerId: existing.ownerId, dueAt: existing.dueAt }, after: { status: task.status, ownerId: task.ownerId, dueAt: task.dueAt }, requestId });
    return task;
  }

  async completeTask(actorId: string, id: string, input: {
    comment: string;
    evidence?: Record<string, unknown>;
    outcome?: { metricKey: string; expectedValue?: number; realizedValue: number; unit: string; currency?: string; attributionMethod: string; observedAt: string; notes?: string };
  }, requestId: string) {
    const existing = await this.getTask(actorId, id);
    const capabilities = await getActorCapabilities(this.db, actorId);
    if (existing.ownerId !== actorId && !capabilities.admin && !hasCapability(capabilities, 'update', 'BusinessTask')) {
      throw new ForbiddenError('Completing another user\'s task requires task update permission.');
    }
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') throw new ConflictError(`Task cannot be completed from status '${existing.status}'.`);
    const completed = await this.db.$transaction(async (tx) => {
      const task = await tx.businessTask.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), completionEvidence: input.evidence ? json(input.evidence) : undefined } });
      await tx.businessTaskActivity.create({ data: { taskId: id, actorId, type: 'COMPLETED', comment: input.comment, evidence: input.evidence ? json(input.evidence) : undefined } });
      if (input.outcome) {
        const evaluation = outcomeEvaluatorService.evaluate({
          expectedValue: input.outcome.expectedValue,
          actualValue: input.outcome.realizedValue,
          // User-entered completion data is not independently reconciled to ERP transactions.
          attributionMethod: 'MANAGER_ESTIMATE',
        });
        await tx.recommendationOutcome.create({
          data: {
            recommendationId: task.recommendationId,
            taskId: task.id,
            metricKey: input.outcome.metricKey,
            expectedValue: evaluation.expectedValue,
            realizedValue: evaluation.actualValue,
            unit: input.outcome.unit,
            currency: input.outcome.currency,
            attributionMethod: 'MANAGER_ESTIMATE',
            evidence: json({ completionEvidence: input.evidence ?? {}, notes: input.outcome.notes ?? null, sourceKind: 'MANUAL_ENTRY', userClaimedAttribution: input.outcome.attributionMethod, provenance: 'UNKNOWN', outcomeStatus: evaluation.status, quality: evaluation.quality }),
            observedAt: new Date(input.outcome.observedAt),
            recordedById: actorId,
            formulaVersion: evaluation.formulaVersion,
            sourceRefs: json({ kind: 'USER_REPORTED', provenance: 'UNKNOWN', attributionVerified: evaluation.attributionVerified }),
            variance: evaluation.variance,
            absolutePercentageError: evaluation.absolutePercentageError,
          },
        });
      }
      return task;
    });
    await this.audit.record({ actorId, action: 'intelligence.task_complete', entityType: 'BusinessTask', entityId: id, before: { status: existing.status }, after: { status: completed.status, completedAt: completed.completedAt }, requestId });
    return completed;
  }

  async linkTaskAction(actorId: string, id: string, input: {
    actionResourceType: 'PurchaseOrder' | 'SalesOrder' | 'ProductionPlan';
    actionResourceId: string;
  }, requestId: string) {
    const existing = await this.getTask(actorId, id);
    const capabilities = await getActorCapabilities(this.db, actorId);
    if (existing.ownerId !== actorId && !capabilities.admin && !hasCapability(capabilities, 'update', 'BusinessTask')) {
      throw new ForbiddenError('Linking an ERP action to another user\'s task requires task update permission.');
    }
    const updated = await this.db.$transaction(async (tx) => {
      const task = await tx.businessTask.update({
        where: { id },
        data: {
          actionResourceType: input.actionResourceType,
          actionResourceId: input.actionResourceId,
        },
      });
      await tx.businessTaskActivity.create({
        data: {
          taskId: id,
          actorId,
          type: 'ACTION_LINKED',
          comment: `Linked to ${input.actionResourceType} (${input.actionResourceId})`,
          evidence: json({ actionResourceType: input.actionResourceType, actionResourceId: input.actionResourceId }),
        },
      });
      return task;
    });
    await this.audit.record({
      actorId,
      action: 'intelligence.task_action_link',
      entityType: 'BusinessTask',
      entityId: id,
      after: { actionResourceType: input.actionResourceType, actionResourceId: input.actionResourceId },
      requestId,
    });
    return updated;
  }

  async objectives() {
    return { active: await this.policies.getActive(), history: await this.policies.list() };
  }

  async controlState() {
    return this.controls.effective();
  }

  async replaceControlState(actorId: string, input: IntelligenceControlInput, requestId: string) {
    const before = await this.controls.state();
    const state = await this.controls.replace(input, actorId);
    await this.audit.record({ actorId, action: 'intelligence.controls_update', entityType: 'IntelligenceControlState', entityId: state.id, before, after: state, requestId });
    return this.controls.effective();
  }

  async assignees(actorId: string, module: IntelligenceModule) {
    await this.assertModuleScope(actorId, module);
    const users = await this.db.user.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true, role: true, department: true, title: true, assignedDepartmentRef: { select: { code: true, name: true } } },
    });
    return users.filter((user) => {
      return canOwnModuleTask(user, module);
    }).map(({ assignedDepartmentRef, role: _role, ...user }) => ({ ...user, department: user.department ?? assignedDepartmentRef?.name ?? assignedDepartmentRef?.code ?? null }));
  }

  async listRuns(actorId: string, page = 1, limit = 25) {
    const modules = await this.authorizedModules(actorId);
    const where: Prisma.IntelligenceRunWhereInput = modules ? { module: { in: modules } } : {};
    const [items, total] = await Promise.all([
      this.db.intelligenceRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, module: true, trigger: true, profileKey: true, status: true, modelProvider: true, modelId: true, promptVersion: true, schemaVersion: true, usage: true, costUsd: true, errorCode: true, createdAt: true, startedAt: true, completedAt: true, correlationId: true, toolAudit: true },
      }),
      this.db.intelligenceRun.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async replaceObjectives(actorId: string, input: { weights: Record<string, number>; guardrails: Record<string, unknown>; effectiveFrom: string }, requestId: string) {
    const policy = await this.policies.replace(input, actorId);
    await this.audit.record({ actorId, action: 'intelligence.policy_replace', entityType: 'BusinessObjectivePolicy', entityId: policy.id, after: policy, requestId });
    return policy;
  }

  async getRun(actorId: string, id: string) {
    const run = await this.db.intelligenceRun.findUnique({
      where: { id },
      select: { id: true, jobId: true, snapshotId: true, parentRunId: true, profileKey: true, module: true, trigger: true, modelProvider: true, modelId: true, promptVersion: true, schemaVersion: true, status: true, structuredOutput: true, usage: true, costUsd: true, correlationId: true, errorCode: true, errorMessage: true, startedAt: true, completedAt: true, createdAt: true, toolAudit: true, providerAttempts: { orderBy: { startedAt: 'asc' } } },
    });
    if (!run) throw new NotFoundError('Intelligence run not found.');
    await this.assertModuleScope(actorId, run.module);
    const capabilities = await getActorCapabilities(this.db, actorId);
    return { ...run, providerAttempts: capabilities.admin || hasCapability(capabilities, 'view', 'IntelligenceAudit') ? run.providerAttempts : [] };
  }

  async askBusiness(actorId: string, question: string, module: IntelligenceModule, requestId: string, conversationId?: string) {
    await this.assertModuleScope(actorId, module);
    const result = await this.orchestrator.enqueueQuestion(question, module, actorId, requestId, conversationId);
    return { runId: result.run.id, status: result.run.status, requestId };
  }

  async getDailyInsightToday(actorId: string) {
    const modules = await this.authorizedModules(actorId);
    if (modules && !modules.includes('EXECUTIVE')) throw new ForbiddenError('Daily executive insights are outside your intelligence scope.');
    const businessDate = indiaBusinessDate();
    const controls = await this.controls.effective();
    const automaticScheduleEnabled = controls.enabled && controls.providerEnabled && controls.schedulesEnabled;
    const run = await this.db.intelligenceRun.findFirst({
      where: {
        module: 'EXECUTIVE', trigger: 'QUESTION',
        AND: [
          { inputSummary: { path: ['kind'], equals: 'DAILY_INSIGHT' } },
          { inputSummary: { path: ['dailyInsightDate'], equals: businessDate } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, structuredOutput: true, errorCode: true, errorMessage: true, snapshotId: true, createdAt: true, startedAt: true, completedAt: true, inputSummary: true },
    });
    if (!run) return { businessDate, automaticScheduleEnabled, run: null };
    return { businessDate, automaticScheduleEnabled, run: this.dailyInsightRun(run) };
  }

  async listDailyInsights(actorId: string, page: number, limit: number) {
    const modules = await this.authorizedModules(actorId);
    if (modules && !modules.includes('EXECUTIVE')) throw new ForbiddenError('Daily executive insights are outside your intelligence scope.');
    const where: Prisma.IntelligenceRunWhereInput = {
      module: 'EXECUTIVE', trigger: 'QUESTION',
      inputSummary: { path: ['kind'], equals: 'DAILY_INSIGHT' },
    };
    const [runs, total] = await Promise.all([
      this.db.intelligenceRun.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        select: { id: true, status: true, structuredOutput: true, errorCode: true, errorMessage: true, snapshotId: true, createdAt: true, startedAt: true, completedAt: true, inputSummary: true },
      }),
      this.db.intelligenceRun.count({ where }),
    ]);
    return { items: runs.map((run) => this.dailyInsightRun(run)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private dailyInsightRun<T extends { inputSummary: Prisma.JsonValue | null }>(run: T) {
    const summary = run.inputSummary as { dailyInsightDate?: string; dailyInsightSource?: string } | null;
    const { inputSummary: _inputSummary, ...publicRun } = run;
    return { ...publicRun, businessDate: summary?.dailyInsightDate ?? null, source: summary?.dailyInsightSource ?? 'MANUAL' };
  }

  async generateDailyInsight(actorId: string, requestId: string, refresh = false) {
    const current = await this.getDailyInsightToday(actorId);
    if (current.run && ['QUEUED', 'RUNNING'].includes(current.run.status)) return current;
    if (current.run && !refresh) return current;
    const question = `Prepare the current daily executive briefing for business date ${current.businessDate}. Review the certified one-day executive snapshot, identify only evidence-supported changes and risks, and provide concise priorities for today.`;
    const queued = await this.orchestrator.enqueueQuestion(question, 'EXECUTIVE', actorId, requestId, undefined, current.businessDate, 'MANUAL', refresh);
    const runSummary = queued.run.inputSummary as { dailyInsightSource?: string } | null;
    return {
      businessDate: current.businessDate,
      automaticScheduleEnabled: current.automaticScheduleEnabled,
      run: { id: queued.run.id, status: queued.run.status, structuredOutput: queued.run.structuredOutput, errorCode: queued.run.errorCode, errorMessage: queued.run.errorMessage, snapshotId: queued.run.snapshotId, createdAt: queued.run.createdAt, startedAt: queued.run.startedAt, completedAt: queued.run.completedAt, businessDate: current.businessDate, source: runSummary?.dailyInsightSource ?? 'MANUAL' },
    };
  }

  async authorizedModules(actorId: string): Promise<IntelligenceModule[] | null> {
    const capabilities = await getActorCapabilities(this.db, actorId);
    if (capabilities.admin || hasCapability(capabilities, 'view', 'ExecutiveIntelligence')) return null;
    if (!hasCapability(capabilities, 'view', 'ModuleIntelligence')) throw new ForbiddenError('Your role has no intelligence module access.');
    const user = await this.db.user.findUnique({ where: { id: actorId }, select: { department: true, assignedDepartmentRef: { select: { code: true, name: true } } } });
    const department = [user?.department, user?.assignedDepartmentRef?.code, user?.assignedDepartmentRef?.name].filter(Boolean).join(' ');
    const modules = departmentModuleMatchers.filter(([matcher]) => matcher.test(department)).map(([, module]) => module);
    if (!modules.length) throw new ForbiddenError('Your intelligence permission is not linked to an authorized department.');
    return [...new Set(modules)];
  }

  private async assertModuleScope(actorId: string, module: IntelligenceModule, allowOwner = false) {
    if (allowOwner) return;
    const modules = await this.authorizedModules(actorId);
    if (modules && !modules.includes(module)) throw new ForbiddenError('The requested record is outside your intelligence module scope.');
  }

  private async latestSnapshots(modules: IntelligenceModule[] | null) {
    const db = this.db as any;
    const targetModules = modules ?? (['EXECUTIVE', 'SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT'] as IntelligenceModule[]);
    const snapshots = await Promise.all(targetModules.map((module) => db.businessSnapshot.findFirst({ where: { module }, orderBy: { capturedAt: 'desc' }, select: { id: true, module: true, metricVersion: true, freshnessScore: true, costCoverageScore: true, periodStart: true, periodEnd: true, capturedAt: true, metrics: { select: { key: true, value: true, unit: true, currency: true, provenance: true, freshnessStatus: true, dataQualityScore: true } } } })));
    return snapshots.filter(Boolean);
  }

  async createProductPricingRecommendation(_actorId: string, request: { productId: string; targetMarginPercent: number }, _requestId: string) {
    const db = this.db as any;
    const product = await db.product.findUnique({ where: { id: request.productId }, select: { id: true, name: true, sku: true, metadata: true } });
    if (!product) throw new NotFoundError(`Product '${request.productId}' was not found.`);
    const now = new Date();
    const bom = await db.bomVersion.findFirst({
      where: { productId: product.id, productVariantId: null, status: 'APPROVED', effectiveDate: { lte: now } },
      orderBy: [{ effectiveDate: 'desc' }, { version: 'desc' }],
      select: { id: true, version: true, lines: { select: { id: true, materialId: true, componentProductId: true, quantity: true } } },
    });
    if (!bom || !bom.lines.length) return { status: 'UNAVAILABLE', reason: 'No currently approved base-product BOM is available.' };

    const itemRefs = bom.lines.flatMap((line: any) => line.materialId
      ? [{ itemType: 'MATERIAL', itemId: line.materialId, quantity: line.quantity }]
      : line.componentProductId ? [{ itemType: 'PRODUCT', itemId: line.componentProductId, quantity: line.quantity }] : []);
    if (itemRefs.length !== bom.lines.length) return { status: 'UNAVAILABLE', reason: 'Approved BOM contains a component without a material or product cost source.' };
    const balances = await db.inventoryBalance.findMany({
      where: { itemId: { in: [...new Set(itemRefs.map((item: any) => item.itemId))] }, itemType: { in: ['MATERIAL', 'PRODUCT'] }, condition: 'AVAILABLE', ownership: 'COMPANY', quantity: { gt: 0 } },
      select: { itemType: true, itemId: true, quantity: true, averageCost: true, updatedAt: true },
    });
    let bomMaterialCost = new Prisma.Decimal(0);
    let latestCostAt: Date | null = null;
    for (const item of itemRefs) {
      const rows = balances.filter((row: any) => row.itemType === item.itemType && row.itemId === item.itemId && new Prisma.Decimal(row.averageCost).gt(0));
      const quantity = rows.reduce((sum: Prisma.Decimal, row: any) => sum.plus(row.quantity), new Prisma.Decimal(0));
      if (quantity.lte(0)) return { status: 'UNAVAILABLE', reason: `No positive-cost inventory valuation exists for BOM component '${item.itemId}'.` };
      const value = rows.reduce((sum: Prisma.Decimal, row: any) => sum.plus(new Prisma.Decimal(row.quantity).mul(row.averageCost)), new Prisma.Decimal(0));
      bomMaterialCost = bomMaterialCost.plus(value.div(quantity).mul(item.quantity));
      for (const row of rows) if (!latestCostAt || row.updatedAt > latestCostAt) latestCostAt = row.updatedAt;
    }
    const metadata = product.metadata && typeof product.metadata === 'object' ? product.metadata as Record<string, unknown> : {};
    const sellingPrice = Number(metadata.sellingPrice ?? 0);
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { status: 'UNAVAILABLE', reason: 'Product selling price is absent or invalid in master-data metadata.' };
    const marginRatio = new Prisma.Decimal(request.targetMarginPercent).div(100);
    const targetPrice = bomMaterialCost.div(new Prisma.Decimal(1).minus(marginRatio)).toDecimalPlaces(2);
    const illustrativeMargin = new Prisma.Decimal(sellingPrice).minus(bomMaterialCost).div(sellingPrice).mul(100);
    return {
      status: 'ESTIMATE_AVAILABLE',
      product: { id: product.id, sku: product.sku, name: product.name },
      bomVersion: { id: bom.id, version: bom.version },
      currency: 'INR',
      values: {
        bomMaterialCost: { value: bomMaterialCost.toDecimalPlaces(2).toNumber(), provenance: 'ESTIMATED', asOf: latestCostAt?.toISOString() ?? null },
        sellingPrice: { value: sellingPrice, provenance: 'ASSUMPTION' },
        illustrativeGrossMarginPercent: { value: illustrativeMargin.toDecimalPlaces(2).toNumber(), provenance: 'ESTIMATED' },
        targetPrice: { value: targetPrice.toNumber(), provenance: 'ESTIMATED', targetMarginPercent: request.targetMarginPercent },
      },
      limitations: ['Uses current inventory average cost and the currently approved base BOM.', 'Excludes labor, production overhead, freight, tax, marketplace fees, and other costs.', 'Product selling price is editable master-data metadata.', 'This is a deterministic estimate, not certified profit or a persisted recommendation.'],
    };
  }

  private async runtimeSummary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [byStatus, latest, monthlyCost, controls] = await Promise.all([
      this.db.intelligenceRun.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.db.intelligenceRun.findFirst({ orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true, completedAt: true, errorCode: true } }),
      this.db.intelligenceRun.aggregate({ where: { createdAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } }, _sum: { costUsd: true } }),
      this.controls.effective(),
    ]);
    return { byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])), latest, monthlyCostUsd: Number(monthlyCost._sum.costUsd ?? 0), controls };
  }
}

export const intelligenceService = new IntelligenceService();
