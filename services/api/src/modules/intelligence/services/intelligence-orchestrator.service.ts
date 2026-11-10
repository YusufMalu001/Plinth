import { createHash } from 'crypto';
import { IntelligenceJob, IntelligenceModule, Prisma, PrismaClient } from '@prisma/client';
import { config } from '../../../config';
import { prisma as defaultPrisma } from '../../../database';
import { logger } from '../../../common/utils/logger';
import { NotificationService } from '../../notifications/notification.service';
import { agentRuntimeClient, IntelligenceRuntimeAdapter, RuntimeCallError, runtimeHttpStatus } from '../integrations/agent-runtime.client';
import { profileForModule } from '../intelligence.profiles';
import {
  QUESTION_PROMPT_VERSION,
  RECOMMENDATION_PROMPT_VERSION,
  RECOMMENDATION_SCHEMA_VERSION,
  questionInstructions,
  dailyInsightInstructions,
  recommendationInput,
  recommendationInstructions,
} from '../intelligence.prompts';
import { CertifiedSnapshotData, certifiedMetricsService, CertifiedMetricsService } from './certified-metrics.service';
import { objectivePolicyService, ObjectivePolicyService } from './objective-policy.service';
import { recommendationValidatorService, RecommendationValidatorService } from './recommendation-validator.service';
import { intelligenceControlsService, IntelligenceControlsService } from './intelligence-controls.service';
import { errorCategory } from './provider-telemetry.service';
import { caseDedupeKeyForOpportunity, IntelligenceCaseService } from './intelligence-case.service';

function safeError(error: unknown) {
  if (error instanceof RuntimeCallError) {
    const code = errorCategory(error);
    const messages: Record<string, string> = {
      PROVIDER_BUDGET_EXCEEDED: 'The AI provider could not cover this request. Check account credit and the output limit.',
      RATE_LIMIT: 'The AI provider is rate limited. Retry after capacity is available.',
      MODEL_UNAVAILABLE: 'The selected AI model is unavailable.',
      RUNTIME_UNAVAILABLE: 'The AI advisor runtime is unavailable.',
      MCP_PERMISSION_DENIED: 'The advisor could not read its approved Synergy evidence.',
      OUTPUT_TRUNCATED: 'The AI response exceeded the configured output limit.',
      TIMEOUT: 'The AI advisor timed out.',
    };
    return messages[code] ?? 'The AI advisor request failed. Check the restricted run trace.';
  }
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object'
      ? ('message' in error && typeof error.message === 'string'
        ? error.message
        : 'error' in error && typeof error.error === 'string'
          ? error.error
          : (JSON.stringify(error) ?? 'Unknown intelligence processing error.'))
      : typeof error === 'string'
        ? error
        : 'Unknown intelligence processing error.';
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 1000);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function sanitizeQuestion(question: string) {
  return question
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[contact number removed]')
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, '[sensitive number removed]')
    .trim();
}

export function classifyQuestionDomains(question: string): IntelligenceModule[] {
  const q = question.toLowerCase();
  const domains: IntelligenceModule[] = [];
  if (/profit|margin|revenue|sale|growth|customer|ebitda|income/.test(q)) {
    domains.push('SALES');
    if (/profit|margin|cost|ebitda|decline|loss/.test(q)) {
      domains.push('PROCUREMENT', 'PRODUCTION');
    }
  }
  if (/material|price|supplier|vendor|purchase|cost|procure|buy/.test(q)) {
    domains.push('PROCUREMENT');
    if (/material|price|purchase|buy|increase|hike/.test(q)) {
      domains.push('INVENTORY');
    }
  }
  if (/inventory|stock|dead|slow|warehouse|holding|replenish/.test(q)) {
    domains.push('INVENTORY');
  }
  if (/production|capacity|bottleneck|workorder|manufacturing|machine/.test(q)) {
    domains.push('PRODUCTION');
  }
  if (/fulfillment|dispatch|shipment|delivery|late|sla|carrier/.test(q)) {
    domains.push('FULFILLMENT');
    if (/shipment|delivery|order|late/.test(q)) {
      domains.push('SALES');
    }
  }
  if (!domains.length) {
    domains.push('SALES', 'PROCUREMENT', 'INVENTORY');
  }
  return [...new Set(domains)];
}

export class IntelligenceOrchestratorService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly metrics: CertifiedMetricsService = certifiedMetricsService,
    private readonly policies: ObjectivePolicyService = objectivePolicyService,
    private readonly runtime: IntelligenceRuntimeAdapter = agentRuntimeClient,
    private readonly validator: RecommendationValidatorService = recommendationValidatorService,
    private readonly notifications = new NotificationService(),
    private readonly controls: IntelligenceControlsService = intelligenceControlsService,
    private readonly cases?: IntelligenceCaseService,
  ) {}

  async enqueue(input: {
    module: IntelligenceModule;
    trigger: IntelligenceJob['trigger'];
    payload?: Record<string, unknown>;
    idempotencyKey: string;
    correlationId: string;
    eventId?: string;
    scheduledAt?: Date;
  }) {
    return this.db.intelligenceJob.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        eventId: input.eventId,
        module: input.module,
        trigger: input.trigger,
        payload: json(input.payload ?? {}),
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        scheduledAt: input.scheduledAt,
      },
      update: {},
    });
  }

  async enqueueQuestion(question: string, module: IntelligenceModule, actorId: string, correlationId: string, conversationId?: string, dailyInsightDate?: string, dailyInsightSource: 'MANUAL' | 'SCHEDULE' = 'MANUAL', refresh = false) {
    const sanitizedQuestion = sanitizeQuestion(question);
    const idempotencyKey = dailyInsightDate
      ? `daily-insight:${dailyInsightDate}:${refresh ? `refresh:${correlationId}` : 'initial'}`
      : `question:${actorId}:${hash(`${sanitizedQuestion}:${Date.now()}`)}`;
    return this.db.$transaction(async (tx) => {
      const jobData = {
          module,
          trigger: 'QUESTION' as const,
          payload: json({ question: sanitizedQuestion, requestedBy: actorId, ...(conversationId ? { conversationId } : {}), ...(dailyInsightDate ? { dailyInsightDate, dailyInsightSource } : {}) }),
          idempotencyKey,
          correlationId,
      };
      const job = dailyInsightDate && !refresh
        ? await tx.intelligenceJob.upsert({ where: { idempotencyKey }, create: jobData, update: {} })
        : await tx.intelligenceJob.create({ data: jobData });
      const existingRun = await tx.intelligenceRun.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: 'asc' } });
      if (existingRun) return { job, run: existingRun };
      const profile = profileForModule(module);
      if (!profile) throw new Error(`No intelligence profile exists for '${module}'.`);
      const run = await tx.intelligenceRun.create({
        data: {
          jobId: job.id,
          profileKey: profile.key,
          module,
          trigger: 'QUESTION',
          promptVersion: QUESTION_PROMPT_VERSION,
          schemaVersion: 'question-1.0',
          status: 'QUEUED',
          toolAudit: json([{ stage: 'API_QUEUED', at: new Date().toISOString(), status: 'VERIFIED' }]),
          inputSummary: json({ questionLength: sanitizedQuestion.length, requestedBy: actorId, ...(dailyInsightDate ? { dailyInsightDate, dailyInsightSource, kind: 'DAILY_INSIGHT' } : {}) }),
          correlationId,
        },
      });
      return { job, run };
    });
  }

  async process(job: IntelligenceJob) {
    if (job.trigger === 'QUESTION') return this.processQuestion(job);
    const snapshot = await this.metrics.capture(job.module);
    const profile = profileForModule(job.module);
    if (!profile) throw new Error(`No intelligence profile exists for '${job.module}'.`);
    const policy = await this.policies.getActive();
    const moduleSummaries = job.module === 'EXECUTIVE'
      ? await this.moduleSummariesForExecutive(job)
      : [];
    const run = await this.db.intelligenceRun.create({
      data: {
        jobId: job.id,
        snapshotId: snapshot.id,
        profileKey: profile.key,
        module: job.module,
        trigger: job.trigger,
        modelProvider: config.intelligence.provider,
        modelId: job.module === 'EXECUTIVE' ? config.intelligence.executiveModel : config.intelligence.moduleModel,
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
        schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
        status: 'RUNNING',
        toolAudit: json([{ stage: 'WORKER_STARTED', at: new Date().toISOString(), status: 'VERIFIED' }]),
        inputSummary: json({
          snapshotId: snapshot.id,
          metricCount: snapshot.metrics?.length ?? (snapshot.data as any)?.metrics?.length ?? 0,
          policyVersion: policy.version,
          moduleRunIds: moduleSummaries.map((summary) => summary.runId),
        }),
        correlationId: job.correlationId,
        startedAt: new Date(),
      },
    });
    if (config.intelligence.delegationEnabled && job.module === 'EXECUTIVE' && moduleSummaries.length) {
      await Promise.all(moduleSummaries.map((summary) => (this.db as any).advisorDelegation.upsert({
        where: { parentRunId_requestedModule: { parentRunId: run.id, requestedModule: summary.module } },
        create: { parentRunId: run.id, childRunId: summary.runId, requestedModule: summary.module, snapshotId: summary.snapshotId, status: 'COMPLETED', deadlineAt: run.startedAt ?? new Date(), completedAt: summary.completedAt ?? new Date(), correlationId: job.correlationId },
        update: { childRunId: summary.runId, snapshotId: summary.snapshotId, status: 'COMPLETED', completedAt: summary.completedAt ?? new Date() },
      })));
    }

    try {
      const caseScan = config.intelligence.casesEnabled ? await (this.cases ?? new IntelligenceCaseService(this.db)).detect(snapshot) : { status: 'DISABLED' };
      const snapshotData = snapshot.data as unknown as CertifiedSnapshotData;
      const dataQualityScore = Math.min(Number(snapshot.freshnessScore), Number(snapshot.costCoverageScore));
      const runtimeSnapshot = {
        ...snapshotData,
        snapshotId: snapshot.id,
        metricVersion: snapshot.metricVersion,
        freshnessScore: Number(snapshot.freshnessScore),
        costCoverageScore: Number(snapshot.costCoverageScore),
        dataQualityScore,
        objectivePolicy: { version: policy.version, weights: policy.weights, guardrails: policy.guardrails },
        evidenceCatalog: snapshotData.metrics.filter((metric) => metric.value !== null).map((metric) => ({
          metricKey: metric.key,
          metricVersion: snapshot.metricVersion,
          value: metric.value,
          unit: metric.unit,
          currency: metric.currency,
          provenance: metric.provenance,
          freshness: metric.freshnessStatus,
          dataQualityScore: metric.dataQualityScore,
          sourceRefs: metric.sourceRefs,
          sourceResource: metric.sourceRefs[0]?.resource ?? 'CertifiedMetric',
          periodStart: snapshotData.periodStart,
          periodEnd: snapshotData.periodEnd,
          dataTimestamp: snapshotData.sourceLatestAt ?? snapshotData.generatedAt,
        })),
        unavailableMetrics: snapshotData.metrics.filter((metric) => metric.value === null).map((metric) => ({ key: metric.key, reason: metric.dimensions?.reason ?? metric.sourceRefs[0]?.filter ?? 'Required source coverage is unavailable.' })),
        validatedModuleSummaries: moduleSummaries,
      };
      if (!snapshotData.opportunities.length) {
        if (moduleSummaries.length) {
          await this.db.intelligenceRun.updateMany({
            where: { id: { in: moduleSummaries.map((summary) => summary.runId) }, parentRunId: null },
            data: { parentRunId: run.id },
          });
        }
        await this.db.intelligenceRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            toolAudit: json([{ stage: 'WORKER_STARTED', at: run.startedAt?.toISOString() ?? run.createdAt.toISOString(), status: 'VERIFIED' }, { stage: 'CASE_SCAN', at: new Date().toISOString(), status: 'VERIFIED', detectors: caseScan }, { stage: 'MODEL_NOT_INVOKED', reason: 'NO_OPPORTUNITY', at: new Date().toISOString(), status: 'VERIFIED' }, { stage: 'PERSISTED', at: new Date().toISOString(), status: 'VERIFIED' }]),
            structuredOutput: json({ schemaVersion: RECOMMENDATION_SCHEMA_VERSION, promptVersion: RECOMMENDATION_PROMPT_VERSION, module: job.module, recommendations: [] }),
            usage: json({ input_tokens: 0, output_tokens: 0 }),
            costUsd: new Prisma.Decimal(0),
            completedAt: new Date(),
          },
        });
        return { runId: run.id, recommendations: 0, rejected: false };
      }
      const providerControls = await this.controls.effective();
      if (!providerControls.providerEnabled) {
        const disabledTrace = [
          { stage: 'WORKER_STARTED', at: run.startedAt?.toISOString() ?? run.createdAt.toISOString(), status: 'VERIFIED' },
          { stage: 'CASE_SCAN', at: new Date().toISOString(), status: 'VERIFIED', detectors: caseScan },
          { stage: 'MODEL_NOT_INVOKED', at: new Date().toISOString(), status: 'VERIFIED', reason: 'PROVIDER_DISABLED' },
        ];
        await this.db.intelligenceRun.update({ where: { id: run.id }, data: {
          status: 'FAILED', errorCode: 'PROVIDER_DISABLED', errorMessage: 'AI provider execution is disabled.',
          toolAudit: json(disabledTrace), completedAt: new Date(),
        } });
        return { runId: run.id, recommendations: 0, rejected: false, disabled: true };
      }
      const result = await this.runtime.run({
        module: job.module,
        runId: run.id,
        requestId: job.correlationId,
        correlationId: job.correlationId,
        retryNumber: job.attempts,
        instructions: recommendationInstructions(job.module),
        content: recommendationInput(runtimeSnapshot),
        idempotencyKey: `synergy-run:${run.id}`,
      });
      const costUsd = this.runtime.estimateCost(result.usage);
      if (result.status !== 'completed' || typeof result.output !== 'string') {
        throw new Error(`Runtime ended with status '${result.status}'.`);
      }
      let envelope;
      try {
        envelope = this.validator.validate(result.output, snapshot, job.module);
      } catch (error) {
        await this.db.intelligenceRun.update({
          where: { id: run.id },
          data: {
            externalRunId: result.run_id,
            status: 'REJECTED',
            toolAudit: json([{ stage: 'WORKER_STARTED', at: run.startedAt?.toISOString() ?? run.createdAt.toISOString(), status: 'VERIFIED' }, { stage: 'ADVISOR_RETURNED', at: new Date().toISOString(), status: 'VERIFIED' }, { stage: 'VALIDATION_REJECTED', at: new Date().toISOString(), status: 'VERIFIED' }]),
            usage: json(result.usage ?? {}),
            costUsd: new Prisma.Decimal(costUsd.toFixed(6)),
            modelProvider: result.runtime?.provider ?? config.intelligence.provider,
            modelId: result.runtime?.model ?? run.modelId,
            errorCode: 'OUTPUT_POLICY_REJECTED',
            errorMessage: safeError(error),
            completedAt: new Date(),
          },
        });
        logger.warn('Intelligence output rejected by policy validation.', { details: { runId: run.id, module: job.module, error: safeError(error) } });
        return { runId: run.id, recommendations: 0, rejected: true };
      }

      const created = await this.db.$transaction(async (tx) => {
        if (moduleSummaries.length) {
          await tx.intelligenceRun.updateMany({
            where: { id: { in: moduleSummaries.map((summary) => summary.runId) }, parentRunId: null },
            data: { parentRunId: run.id },
          });
        }
        await tx.intelligenceRun.update({
          where: { id: run.id },
          data: {
            externalRunId: result.run_id,
            status: 'COMPLETED',
            toolAudit: json([{ stage: 'WORKER_STARTED', at: run.startedAt?.toISOString() ?? run.createdAt.toISOString(), status: 'VERIFIED' }, { stage: 'ADVISOR_RETURNED', at: new Date().toISOString(), status: 'VERIFIED' }, { stage: 'VALIDATED', at: new Date().toISOString(), status: 'VERIFIED' }, { stage: 'PERSISTED', at: new Date().toISOString(), status: 'VERIFIED' }]),
            structuredOutput: json(envelope),
            usage: json(result.usage ?? {}),
            costUsd: new Prisma.Decimal(costUsd.toFixed(6)),
            modelProvider: result.runtime?.provider ?? config.intelligence.provider,
            modelId: result.runtime?.model ?? run.modelId,
            completedAt: new Date(),
          },
        });
        const recommendations = [];
        for (const item of envelope.recommendations) {
          const existing = await tx.recommendation.findFirst({
            where: { opportunityRef: item.opportunityRef, status: { in: ['OPEN', 'DEFERRED'] }, expiresAt: { gt: new Date() } },
            select: { id: true },
          });
          if (existing) continue;
          const sourceOpportunity = snapshotData.opportunities.find((opportunity) => opportunity.id === item.opportunityRef);
          const caseDedupeKey = config.intelligence.casesEnabled && sourceOpportunity ? caseDedupeKeyForOpportunity(snapshot, snapshotData, sourceOpportunity) : null;
          const intelligenceCase = caseDedupeKey ? await (tx as any).intelligenceCase.findUnique({ where: { dedupeKey: caseDedupeKey }, select: { id: true } }) : null;
          const impactScenario = intelligenceCase ? await (tx as any).impactScenario.findFirst({ where: { caseId: intelligenceCase.id }, orderBy: { createdAt: 'desc' }, select: { id: true } }) : null;
          recommendations.push(await tx.recommendation.create({
            data: {
              runId: run.id,
              snapshotId: snapshot.id,
              objectivePolicyId: policy.id,
              module: job.module,
              caseId: intelligenceCase?.id,
              scenarioId: impactScenario?.id,
              opportunityRef: item.opportunityRef,
              category: item.category,
              status: 'OPEN',
              priority: item.priority,
              title: item.title,
              situation: item.situation,
              rationale: item.rationale,
              proposedActionCode: item.proposedAction.code,
              evidence: json(item.evidence),
              expectedImpact: json(item.expectedImpact),
              assumptions: json(item.assumptions),
              risks: json(item.risks),
              dependencies: json(item.dependencies),
              alternatives: json(item.alternatives),
              confidence: new Prisma.Decimal(item.confidence.toFixed(4)),
              confidenceExplanation: item.confidenceExplanation,
              suggestedOwnerRole: item.suggestedOwnerRole,
              urgency: item.urgency,
              recommendedDueAt: new Date(item.recommendedDueAt),
              expiresAt: new Date(item.expiresAt),
              requiredApprovalPermission: item.requiredApprovalPermission,
              costCoverageScore: new Prisma.Decimal(item.costCoverageScore.toFixed(4)),
              dataQualityScore: new Prisma.Decimal(item.dataQualityScore.toFixed(4)),
              dedupeKey: hash(`${snapshot.id}:${item.opportunityRef}:${item.proposedAction.code}`),
            } as any,
          }));
        }
        return recommendations;
      });
      const controls = await this.controls.effective();
      if (!controls.shadowMode && controls.notificationsEnabled && created.length) {
        if (job.trigger === 'DAILY' || job.trigger === 'WEEKLY') {
          await this.notifyDigest(job.module, created, job.trigger);
        } else {
          await Promise.all(created.filter((item) => item.priority === 'HIGH' || item.priority === 'CRITICAL').map((item) => this.notifyReviewers(item)));
        }
      }
      return { runId: run.id, recommendations: created.length, rejected: false };
    } catch (error) {
      await this.db.intelligenceRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorCode: errorCategory(error), errorMessage: safeError(error), completedAt: new Date() },
      }).catch(() => undefined);
      throw error;
    }
  }

  private async moduleSummariesForExecutive(job: IntelligenceJob) {
    const moduleRuns = await this.db.intelligenceRun.findMany({
      where: {
        correlationId: job.correlationId,
        module: { not: 'EXECUTIVE' },
        status: 'COMPLETED',
        structuredOutput: { not: Prisma.JsonNull },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true, module: true, snapshotId: true, structuredOutput: true, completedAt: true },
    });
    return moduleRuns.map((run) => {
      const output = (run.structuredOutput ?? {}) as { recommendations?: Array<Record<string, unknown>> };
      return {
        runId: run.id,
        module: run.module,
        snapshotId: run.snapshotId,
        completedAt: run.completedAt,
        recommendations: Array.isArray(output.recommendations)
          ? output.recommendations.slice(0, 10).map((recommendation) => ({
            opportunityRef: recommendation.opportunityRef,
            category: recommendation.category,
            title: recommendation.title,
            priority: recommendation.priority,
            proposedAction: recommendation.proposedAction,
            evidence: recommendation.evidence,
            expectedImpact: recommendation.expectedImpact,
          }))
          : [],
      };
    });
  }

  async analyzeCase(caseId: string, actorId: string, correlationId: string) {
    const c = await (this.db as any).intelligenceCase.findUnique({
      where: { id: caseId },
      include: { snapshot: true },
    });
    if (!c) throw new Error('Intelligence case not found.');

    const snapshot = c.snapshot ?? await this.metrics.capture(c.module);
    const snapshotData = snapshot.data as unknown as CertifiedSnapshotData;
    const profile = profileForModule(c.module);
    if (!profile) throw new Error(`No intelligence profile exists for '${c.module}'.`);

    const run = await this.db.intelligenceRun.create({
      data: {
        snapshotId: snapshot.id,
        profileKey: profile.key,
        module: c.module,
        trigger: 'MANUAL',
        promptVersion: QUESTION_PROMPT_VERSION,
        schemaVersion: 'question-1.0',
        status: 'RUNNING',
        toolAudit: json([{ stage: 'CASE_ANALYSIS_STARTED', at: new Date().toISOString(), status: 'VERIFIED' }]),
        inputSummary: json({ caseId: c.id, detectorKey: c.detectorKey, requestedBy: actorId }),
        correlationId,
        startedAt: new Date(),
      },
    });

    const evidenceCatalog = (snapshotData.metrics ?? []).filter((m) => m.value !== null).map((m) => ({
      metricKey: m.key,
      metricVersion: snapshot.metricVersion,
      value: m.value,
      unit: m.unit,
      currency: m.currency,
      provenance: m.provenance,
      freshness: m.freshnessStatus,
      dataQualityScore: m.dataQualityScore,
      sourceRefs: m.sourceRefs,
      sourceResource: m.sourceRefs[0]?.resource ?? 'CertifiedMetric',
      periodStart: snapshot.periodStart.toISOString(),
      periodEnd: snapshot.periodEnd.toISOString(),
      dataTimestamp: snapshotData.sourceLatestAt ?? snapshotData.generatedAt,
    }));

    const questionText = `Analyze case ${c.detectorKey} on ${c.entityType} ${c.entityId} with priority ${c.priority}. Case situation: ${(c.evidence as any)?.situation ?? c.detectorKey}`;

    const runtimeResult = await this.runtime.run({
      module: c.module,
      runId: run.id,
      requestId: correlationId,
      correlationId,
      instructions: questionInstructions(c.module),
      content: JSON.stringify({
        question: questionText,
        caseId: c.id,
        detectorKey: c.detectorKey,
        snapshotId: snapshot.id,
        certifiedSnapshot: snapshot.data,
        evidenceCatalog,
      }),
      idempotencyKey: `case-analysis:${run.id}`,
      sessionId: `case-analysis-${run.id}`,
    });

    if (runtimeResult.status !== 'completed' || typeof runtimeResult.output !== 'string') {
      throw new Error(`Specialist analysis ended with status '${runtimeResult.status}'.`);
    }

    const validatedAnswer = this.validator.validateQuestion(runtimeResult.output, snapshot);
    const costUsd = this.runtime.estimateCost(runtimeResult.usage);

    await this.db.intelligenceRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        structuredOutput: json(validatedAnswer),
        usage: json(runtimeResult.usage ?? {}),
        costUsd: new Prisma.Decimal(costUsd.toFixed(6)),
        completedAt: new Date(),
        toolAudit: json([{ stage: 'CASE_ANALYSIS_COMPLETED', at: new Date().toISOString(), status: 'VERIFIED' }]),
      },
    });

    return { runId: run.id, status: 'COMPLETED', output: validatedAnswer };
  }

  private async processQuestion(job: IntelligenceJob) {
    const payload = job.payload as { question?: string; requestedBy?: string; conversationId?: string; dailyInsightDate?: string; dailyInsightSource?: 'MANUAL' | 'SCHEDULE' };
    if (!payload.question) throw new Error('Question job payload is invalid.');
    const run = await this.db.intelligenceRun.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: 'asc' } });
    if (!run) throw new Error('Question run record was not created.');
    const trace: Array<Record<string, unknown>> = [{ stage: 'API_QUEUED', at: run.createdAt.toISOString(), status: 'VERIFIED' }, { stage: 'WORKER_STARTED', at: new Date().toISOString(), status: 'VERIFIED' }];
    const providerControls = await this.controls.effective();
    if (!providerControls.providerEnabled) {
      trace.push({ stage: 'MODEL_NOT_INVOKED', at: new Date().toISOString(), status: 'VERIFIED', reason: 'PROVIDER_DISABLED' });
      await this.db.intelligenceRun.update({ where: { id: run.id }, data: {
        status: 'FAILED', errorCode: 'PROVIDER_DISABLED', errorMessage: 'AI provider execution is disabled.',
        toolAudit: json(trace), completedAt: new Date(),
      } });
      return { runId: run.id, recommendations: 0, rejected: false, disabled: true };
    }
    await this.db.intelligenceRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date(), toolAudit: json(trace) } });
    let runtimeResult: Awaited<ReturnType<IntelligenceRuntimeAdapter['run']>> | undefined;
    let phase = 'SNAPSHOT';
    const attempt = job.attempts + 1;
    try {
      const dailyPeriodStart = payload.dailyInsightDate ? new Date(`${payload.dailyInsightDate}T00:00:00+05:30`) : undefined;
      const snapshot = await this.metrics.capture(job.module, payload.dailyInsightDate ? 1 : 30, dailyPeriodStart);
      trace.push({ stage: 'SNAPSHOT_CAPTURED', at: new Date().toISOString(), status: 'VERIFIED' });
      await this.db.intelligenceRun.update({ where: { id: run.id }, data: { snapshotId: snapshot.id, toolAudit: json(trace) } });

      const specialistSummaries: Array<{ module: IntelligenceModule; runId: string; answer: string; evidence: any[] }> = [];
      let reconciledSnapshot = snapshot;
      const snapshotData = snapshot.data as unknown as CertifiedSnapshotData;
      const allMetrics = [...(snapshotData.metrics ?? [])];

      if (job.module === 'EXECUTIVE' && !payload.dailyInsightDate) {
        const selectedDomains = classifyQuestionDomains(payload.question);
        trace.push({ stage: 'DOMAINS_CLASSIFIED', at: new Date().toISOString(), status: 'VERIFIED', domains: selectedDomains });

        const seenMetricKeys = new Set(allMetrics.map((m) => m.key));

        for (const domainModule of selectedDomains) {
          let specRun: any;
          try {
            const specSnapshot = await this.metrics.capture(domainModule);
            const specSnapshotData = specSnapshot.data as unknown as CertifiedSnapshotData;
            const specProfile = profileForModule(domainModule);

            for (const m of specSnapshotData.metrics ?? []) {
              if (m.value !== null && !seenMetricKeys.has(m.key)) {
                seenMetricKeys.add(m.key);
                allMetrics.push(m);
              }
            }

            specRun = await this.db.intelligenceRun.create({
              data: {
                jobId: job.id,
                parentRunId: run.id,
                snapshotId: specSnapshot.id,
                profileKey: specProfile?.key ?? `${domainModule.toLowerCase()}-advisor`,
                module: domainModule,
                trigger: 'QUESTION',
                promptVersion: QUESTION_PROMPT_VERSION,
                schemaVersion: 'question-1.0',
                status: 'RUNNING',
                toolAudit: json([{ stage: 'SPECIALIST_STARTED', at: new Date().toISOString(), status: 'VERIFIED' }]),
                inputSummary: json({ question: payload.question, domain: domainModule }),
                correlationId: job.correlationId,
                startedAt: new Date(),
              },
            });

            const specEvidenceCatalog = (specSnapshotData.metrics ?? []).filter((m) => m.value !== null).map((m) => ({
              metricKey: m.key,
              metricVersion: specSnapshot.metricVersion,
              value: m.value,
              unit: m.unit,
              currency: m.currency,
              provenance: m.provenance,
              freshness: m.freshnessStatus,
              dataQualityScore: m.dataQualityScore,
              sourceRefs: m.sourceRefs,
              sourceResource: m.sourceRefs[0]?.resource ?? 'CertifiedMetric',
              periodStart: specSnapshot.periodStart.toISOString(),
              periodEnd: specSnapshot.periodEnd.toISOString(),
              dataTimestamp: specSnapshotData.sourceLatestAt ?? specSnapshotData.generatedAt,
            }));

            const specRuntimeResult = await this.runtime.run({
              module: domainModule,
              runId: specRun.id,
              requestId: job.correlationId,
              correlationId: job.correlationId,
              instructions: questionInstructions(domainModule),
              content: JSON.stringify({
                question: payload.question,
                snapshotId: specSnapshot.id,
                certifiedSnapshot: specSnapshot.data,
                evidenceCatalog: specEvidenceCatalog,
              }),
              idempotencyKey: `spec:${specRun.id}`,
              sessionId: `spec-${specRun.id}`,
            });

            if (specRuntimeResult.status === 'completed' && typeof specRuntimeResult.output === 'string') {
              const specValidated = this.validator.validateQuestion(specRuntimeResult.output, specSnapshot);
              const specCost = this.runtime.estimateCost(specRuntimeResult.usage);

              await this.db.intelligenceRun.update({
                where: { id: specRun.id },
                data: {
                  status: 'COMPLETED',
                  structuredOutput: json(specValidated),
                  usage: json(specRuntimeResult.usage ?? {}),
                  costUsd: new Prisma.Decimal(specCost.toFixed(6)),
                  completedAt: new Date(),
                  toolAudit: json([{ stage: 'SPECIALIST_COMPLETED', at: new Date().toISOString(), status: 'VERIFIED' }]),
                },
              });

              if (config.intelligence.delegationEnabled) {
                await (this.db as any).advisorDelegation.upsert({
                  where: { parentRunId_requestedModule: { parentRunId: run.id, requestedModule: domainModule } },
                  create: {
                    parentRunId: run.id,
                    childRunId: specRun.id,
                    requestedModule: domainModule,
                    snapshotId: specSnapshot.id,
                    status: 'COMPLETED',
                    deadlineAt: new Date(Date.now() + 60000),
                    completedAt: new Date(),
                    correlationId: job.correlationId,
                  },
                  update: {
                    childRunId: specRun.id,
                    snapshotId: specSnapshot.id,
                    status: 'COMPLETED',
                    completedAt: new Date(),
                  },
                });
              }

              specialistSummaries.push({
                module: domainModule,
                runId: specRun.id,
                answer: specValidated.answer,
                evidence: specValidated.evidence,
              });
            } else if (specRun) {
              await this.db.intelligenceRun.update({
                where: { id: specRun.id },
                data: {
                  status: 'FAILED',
                  errorCode: 'SPECIALIST_FAILED',
                  errorMessage: `Specialist runtime ended with status '${specRuntimeResult.status}'.`,
                  completedAt: new Date(),
                },
              }).catch(() => undefined);
            }
          } catch (specErr) {
            if (specRun?.id) {
              await this.db.intelligenceRun.update({
                where: { id: specRun.id },
                data: {
                  status: 'FAILED',
                  errorCode: 'SPECIALIST_FAILED',
                  errorMessage: safeError(specErr),
                  completedAt: new Date(),
                },
              }).catch(() => undefined);
            }
            trace.push({ stage: `SPECIALIST_${domainModule}_SKIPPED`, at: new Date().toISOString(), status: 'FAILED' });
          }
        }

        reconciledSnapshot = {
          ...snapshot,
          data: {
            ...(snapshot.data as any),
            metrics: allMetrics,
          } as any,
        };
        trace.push({ stage: 'SPECIALISTS_RECONCILED', at: new Date().toISOString(), status: 'VERIFIED', specialistCount: specialistSummaries.length });
      }

      phase = 'ADVISOR';
      const reconciledData = reconciledSnapshot.data as unknown as CertifiedSnapshotData;
      const reconciledEvidenceCatalog = (reconciledData.metrics ?? []).filter((metric) => metric.value !== null).map((metric) => ({
        metricKey: metric.key,
        metricVersion: snapshot.metricVersion,
        value: metric.value,
        unit: metric.unit,
        currency: metric.currency,
        provenance: metric.provenance,
        freshness: metric.freshnessStatus,
        dataQualityScore: metric.dataQualityScore,
        sourceRefs: metric.sourceRefs,
        sourceResource: metric.sourceRefs[0]?.resource ?? 'CertifiedMetric',
        periodStart: snapshot.periodStart.toISOString(),
        periodEnd: snapshot.periodEnd.toISOString(),
        dataTimestamp: reconciledData.sourceLatestAt ?? reconciledData.generatedAt,
      }));
      const savedFindings = payload.dailyInsightDate
        ? await this.db.recommendation.findMany({
          where: { module: { in: ['SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT'] }, status: { in: ['OPEN', 'DEFERRED', 'ACCEPTED'] }, expiresAt: { gt: new Date() } },
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          take: 8,
          select: { id: true, module: true, status: true, priority: true, title: true, createdAt: true },
        })
        : [];

      runtimeResult = await this.runtime.run({
        module: job.module,
        runId: run.id,
        requestId: job.correlationId,
        correlationId: job.correlationId,
        retryNumber: job.attempts,
        instructions: payload.dailyInsightDate ? dailyInsightInstructions() : questionInstructions(job.module),
        content: JSON.stringify({
          question: payload.question,
          snapshotId: snapshot.id,
          certifiedSnapshot: reconciledSnapshot.data,
          evidenceCatalog: reconciledEvidenceCatalog,
          ...(payload.dailyInsightDate ? { savedOperationalFindings: savedFindings } : {}),
          specialistSummaries: specialistSummaries.length ? specialistSummaries : undefined,
          unavailableMetrics: reconciledData.metrics.filter((metric) => metric.value === null).map((metric) => ({ key: metric.key, reason: metric.dimensions?.reason ?? metric.sourceRefs[0]?.filter ?? 'Required source coverage is unavailable.' })),
        }),
        idempotencyKey: `synergy-question:${run.id}:attempt:${attempt}`,
        sessionId: `synergy-question-${run.id}-${attempt}`,
      });
      const result = runtimeResult;
      if (result.status !== 'completed' || typeof result.output !== 'string') {
        const httpStatus = runtimeHttpStatus(result);
        const providerMessage = result.error?.trim().slice(0, 1600);
        if (httpStatus === 402) {
          throw new RuntimeCallError(
            `LLM request could not be completed because the configured output-token budget exceeds the available provider budget. Provider status: HTTP 402.${providerMessage ? ` Provider detail: ${providerMessage}` : ''}`,
            httpStatus,
            providerMessage,
          );
        }
        throw new RuntimeCallError(
          providerMessage ?? `Runtime ended with status '${result.status}'.`,
          httpStatus,
          providerMessage,
        );
      }
      trace.push({ stage: 'ADVISOR_RETURNED', at: new Date().toISOString(), status: 'VERIFIED' });
      phase = 'VALIDATION';
      const validatedAnswer = this.validator.validateQuestion(result.output, reconciledSnapshot);
      if (payload.dailyInsightDate && !validatedAnswer.dailyBriefing) {
        throw new Error('The model response did not include the required structured daily briefing.');
      }
      trace.push({ stage: 'VALIDATED', at: new Date().toISOString(), status: 'VERIFIED' });
      const costUsd = this.runtime.estimateCost(result.usage);
      phase = 'PERSISTENCE';
      trace.push({ stage: 'PERSISTED', at: new Date().toISOString(), status: 'VERIFIED' });
      await this.db.$transaction(async (tx) => {
        await tx.intelligenceRun.update({
          where: { id: run.id },
          data: {
          externalRunId: result.run_id,
          status: 'COMPLETED',
          toolAudit: json(trace),
          structuredOutput: json(validatedAnswer),
          usage: json(result.usage ?? {}),
          costUsd: new Prisma.Decimal(costUsd.toFixed(6)),
          modelProvider: result.runtime?.provider ?? config.intelligence.provider,
          modelId: result.runtime?.model ?? result.requestedModel,
            completedAt: new Date(),
          },
        });
        if (payload.conversationId) {
          const txDb = tx as any;
          await txDb.conversationMessage.create({ data: {
            conversationId: payload.conversationId, runId: run.id, role: 'ASSISTANT',
            content: JSON.stringify(validatedAnswer), modelProvider: result.runtime?.provider ?? config.intelligence.provider,
            modelId: result.runtime?.model ?? result.requestedModel, evidenceRefs: json(validatedAnswer.evidence ?? []),
            correlationId: job.correlationId,
          } });
          await txDb.conversation.update({ where: { id: payload.conversationId }, data: { updatedAt: new Date() } });
        }
      });
      if (payload.dailyInsightDate) await this.notifyDailyInsight({
        date: payload.dailyInsightDate,
        source: payload.dailyInsightSource ?? 'MANUAL',
        requestedBy: payload.requestedBy,
        runId: run.id,
        succeeded: true,
        message: validatedAnswer.dailyBriefing?.headline ?? 'Today’s business brief is ready to review.',
      });
      return { runId: run.id, recommendations: 0, rejected: false };
    } catch (error) {
      if (trace.at(-1)?.stage === 'PERSISTED') trace.pop();
      trace.push({ stage: `${phase}_FAILED`, at: new Date().toISOString(), status: 'FAILED' });
      if (runtimeResult && (phase === 'VALIDATION' || phase === 'PERSISTENCE')) {
        await this.db.providerAttempt.updateMany({
          where: { runId: run.id, operation: { in: ['ADVISOR_RUN', 'HERMES_RUN'] }, status: 'SUCCEEDED' },
          data: { status: 'FAILED', errorCategory: phase === 'VALIDATION' ? 'VALIDATION_ERROR' : 'PERSISTENCE_ERROR' },
        }).catch(() => undefined);
      }
      await this.db.intelligenceRun.update({ where: { id: run.id }, data: {
        status: 'FAILED',
        errorCode: phase === 'PERSISTENCE' ? 'PERSISTENCE_ERROR' : phase === 'VALIDATION' ? 'VALIDATION_ERROR' : errorCategory(error),
        toolAudit: json(trace),
        errorMessage: phase === 'VALIDATION' ? 'The runtime response failed certified evidence validation.'
          : phase === 'PERSISTENCE' ? 'The validated response could not be persisted.'
          : phase === 'SNAPSHOT' ? 'The certified snapshot could not be captured.'
          : safeError(error),
        completedAt: new Date(),
        ...(runtimeResult ? {
          externalRunId: runtimeResult.run_id,
          modelProvider: runtimeResult.runtime?.provider ?? config.intelligence.provider,
          modelId: runtimeResult.runtime?.model ?? runtimeResult.requestedModel,
          usage: json(runtimeResult.usage ?? {}),
        } : {}),
      } });
      if (payload.dailyInsightDate) await this.notifyDailyInsight({
        date: payload.dailyInsightDate,
        source: payload.dailyInsightSource ?? 'MANUAL',
        requestedBy: payload.requestedBy,
        runId: run.id,
        succeeded: false,
        message: phase === 'VALIDATION' ? 'The response did not pass evidence validation.' : safeError(error),
      });
      if (payload.conversationId) {
        await (this.db as any).conversationMessage.create({ data: { conversationId: payload.conversationId, runId: run.id, role: 'SYSTEM', content: `Request failed at ${phase}.`, correlationId: job.correlationId } }).catch(() => undefined);
      }
      throw error;
    }
  }

  private async notifyReviewers(recommendation: { id: string; module: IntelligenceModule; title: string; priority: string; expiresAt: Date }) {
    const users = await this.reviewersForModule(recommendation.module);
    await this.notifications.notifyUsers({
      recipientIds: users,
      type: 'APPROVAL_REQUIRED',
      title: recommendation.module === 'INVENTORY' ? 'Inventory action suggested' : 'System recommendation',
      message: recommendation.title,
      resource: 'Recommendation',
      resourceId: recommendation.id,
      href: `/decision-center/recommendations/${recommendation.id}`,
      metadata: { module: recommendation.module },
      priority: recommendation.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      expiresAt: recommendation.expiresAt,
      dedupeKeyPrefix: `recommendation-review:${recommendation.id}`,
    });
  }

  private async notifyDailyInsight(input: {
    date: string;
    source: 'MANUAL' | 'SCHEDULE';
    requestedBy?: string;
    runId: string;
    succeeded: boolean;
    message: string;
  }) {
    try {
      const controls = await this.controls.effective();
      if (controls.shadowMode || !controls.notificationsEnabled) return;
      const recipients = input.source === 'SCHEDULE'
        ? await this.reviewersForModule('EXECUTIVE')
        : input.requestedBy ? [input.requestedBy] : [];
      await this.notifications.notifyUsers({
        recipientIds: recipients,
        type: input.succeeded ? 'INFO' : 'WORKFLOW',
        title: input.succeeded ? 'Daily AI insights ready' : 'Daily AI insights need attention',
        message: input.message,
        resource: 'IntelligenceRun',
        resourceId: input.runId,
        href: '/intelligence/insights',
        metadata: { businessDate: input.date, source: input.source, succeeded: input.succeeded },
        priority: input.succeeded ? 'NORMAL' : 'HIGH',
        dedupeKeyPrefix: `daily-insight:${input.source}:${input.date}:${input.runId}:${input.succeeded ? 'ready' : 'failed'}`,
      });
    } catch (notificationError) {
      logger.warn('Daily insight was saved but its notification failed.', { details: safeError(notificationError) });
    }
  }

  private async notifyDigest(module: IntelligenceModule, recommendations: Array<{ id: string; title: string; priority: string }>, trigger: 'DAILY' | 'WEEKLY') {
    const users = await this.reviewersForModule(module);
    const ordered = [...recommendations].sort((left, right) => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(right.priority) - ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(left.priority));
    const top = ordered.slice(0, 3).map((item) => item.title).join('; ');
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    await this.notifications.notifyUsers({
      recipientIds: users,
      type: 'INFO',
      title: trigger === 'WEEKLY' ? 'Weekly strategic review ready' : 'Daily business review ready',
      message: `${recommendations.length} ${module.toLowerCase()} recommendation${recommendations.length === 1 ? '' : 's'} require review${top ? `: ${top}` : ''}`,
      resource: 'Recommendation',
      href: `/decision-center/recommendations?module=${module}`,
      metadata: { module, trigger, recommendationIds: recommendations.map((item) => item.id) },
      priority: ordered.some((item) => item.priority === 'CRITICAL') ? 'CRITICAL' : ordered.some((item) => item.priority === 'HIGH') ? 'HIGH' : 'NORMAL',
      dedupeKeyPrefix: `recommendation-digest:${trigger}:${businessDate}:${module}`,
    });
  }

  private async reviewersForModule(module: IntelligenceModule) {
    const users = await this.db.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: 'admin' },
          { userRoles: { some: { role: { permissions: { some: { permission: { action: 'review', resource: 'Recommendation' } } } } } } },
        ],
      },
      select: { id: true, role: true, department: true, assignedDepartmentRef: { select: { code: true, name: true } } },
    });
    const matcher: Partial<Record<IntelligenceModule, RegExp>> = {
      SALES: /sales|commercial|customer/i,
      INVENTORY: /inventory|store|warehouse|stock/i,
      PROCUREMENT: /procurement|purchase|sourcing/i,
      PRODUCTION: /production|manufactur|plant|assembly/i,
      FULFILLMENT: /dispatch|fulfillment|logistics|shipping/i,
      QUALITY: /quality|inspection|qc/i,
      FINANCE: /finance|accounts|accounting/i,
    };
    return users.filter((user) => {
      if (user.role === 'admin' || module === 'EXECUTIVE' || module === 'SYSTEM') return true;
      const department = [user.department, user.assignedDepartmentRef?.code, user.assignedDepartmentRef?.name].filter(Boolean).join(' ');
      return matcher[module]?.test(department) ?? false;
    }).map((user) => user.id);
  }
}

export const intelligenceOrchestratorService = new IntelligenceOrchestratorService();
