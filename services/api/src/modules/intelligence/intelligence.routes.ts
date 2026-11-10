import { NextFunction, Request, Response, Router } from 'express';
import { BusinessTaskStatus } from '@prisma/client';
import { z, ZodSchema } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../../database';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { ConflictError, NotFoundError, ServiceUnavailableError, ValidationError } from '../../common/errors/AppError';
import { config } from '../../config';
import {
  acceptRecommendationSchema,
  askBusinessSchema,
  completeTaskSchema,
  deferRecommendationSchema,
  dismissRecommendationSchema,
  listRecommendationsQuerySchema,
  productPricingAnalysisSchema,
  updateObjectivePolicySchema,
  updateIntelligenceControlsSchema,
  updateTaskSchema,
  linkTaskActionSchema,
} from './intelligence.contracts';
import { intelligenceService } from './services/intelligence.service';
import { intelligenceHealthService } from './services/intelligence-health.service';
import { modelCandidates, modelVerificationService } from './services/model-verification.service';
import { intelligenceCaseService } from './services/intelligence-case.service';
import { intelligenceConversationService } from './services/conversation.service';
import { impactScenarioService } from './services/impact-scenario.service';
import { outcomeEvaluatorService } from './services/outcome-evaluator.service';
import { validateIntelligenceEvent } from './intelligence.events';
import { domainEventOutboxService } from './services/domain-event-outbox.service';

const router = Router();
const permissionChecker = new DbPermissionChecker();
const actor = (req: Request) => req.user!.id;
const respond = (res: Response, req: Request, data: unknown, status = 200) => res.status(status).json({ success: true, data, requestId: req.id });
const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { void handler(req, res, next).catch(next); };
const parse = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ValidationError('Request validation failed.', parsed.error.flatten());
  return parsed.data;
};
const viewIntelligence = authorize('view', ['ExecutiveIntelligence', 'ModuleIntelligence'], permissionChecker);
const viewAudit = authorize('view', 'IntelligenceAudit', permissionChecker);
const viewOutcomes = authorize('view', 'IntelligenceOutcome', permissionChecker);
const requireConversationsEnabled = () => {
  if (!config.intelligence.conversationsEnabled) throw new ServiceUnavailableError('Persistent intelligence conversations are disabled pending an approved retention policy.', 'CONVERSATIONS_DISABLED');
};
const requireCasesEnabled = () => {
  if (!config.intelligence.casesEnabled) throw new ServiceUnavailableError('Intelligence cases are disabled until the Phase 3 gate passes.', 'CASES_DISABLED');
};
const requireScenariosEnabled = () => {
  if (!config.intelligence.scenariosEnabled) throw new ServiceUnavailableError('Impact scenarios are disabled until the Phase 4 gate passes.', 'SCENARIOS_DISABLED');
};
const modelCheckLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false });
const caseQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED', 'SUPPRESSED']).optional() }).strict();
const caseTransitionSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
const conversationSchema = z.object({ module: z.enum(['EXECUTIVE', 'SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT']), title: z.string().trim().max(160).optional() }).strict();
const conversationMessageSchema = z.object({ content: z.string().trim().min(1).max(4000) }).strict();
const scenarioCreateSchema = z.object({
  caseId: z.string().uuid(),
  scenarioType: z.enum(['BUY_MORE', 'BUY_LATER', 'PRICE_CHANGE', 'PRODUCTION_INCREASE', 'PRODUCTION_DECREASE', 'DO_NOTHING']).optional(),
  assumptions: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().trim().min(8).max(180),
  expiresAt: z.string().datetime().optional(),
}).strict();

router.use(authenticate);

router.get('/health', viewIntelligence, asyncRoute(async (req, res) => respond(res, req, await intelligenceHealthService.read())));
router.get('/provider-attempts', viewAudit, asyncRoute(async (req, res) => {
  const query = parse(z.object({ runId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict(), req.query);
  const where = query.runId ? { runId: query.runId } : {};
  const [items, total] = await Promise.all([
    prisma.providerAttempt.findMany({ where, orderBy: { startedAt: 'desc' }, skip: ((query.page ?? 1) - 1) * (query.limit ?? 25), take: query.limit ?? 25 }),
    prisma.providerAttempt.count({ where }),
  ]);
  respond(res, req, { items, total, page: query.page, limit: query.limit });
}));
router.post('/model-checks', authorize('manage', 'IntelligencePolicy', permissionChecker), viewAudit, modelCheckLimiter, asyncRoute(async (req, res) => {
  const body = parse(z.object({ model: z.enum(modelCandidates) }).strict(), req.body);
  respond(res, req, await modelVerificationService.check(body.model, req.id));
}));
router.get('/events/dead-letters', viewAudit, asyncRoute(async (req, res) => {
  const query = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict(), req.query);
  const where = { status: 'DEAD_LETTER' };
  const [items, total] = await Promise.all([
    prisma.domainEventOutbox.findMany({ where, select: { id: true, aggregateType: true, aggregateId: true, eventType: true, status: true, attempts: true, lastErrorCode: true, correlationId: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, skip: ((query.page ?? 1) - 1) * (query.limit ?? 25), take: query.limit ?? 25 }),
    prisma.domainEventOutbox.count({ where }),
  ]);
  respond(res, req, { items, total, page: query.page, limit: query.limit });
}));
router.post('/events/:eventId/replay', authorize('manage', 'IntelligencePolicy', permissionChecker), viewAudit, asyncRoute(async (req, res) => {
  const { eventId } = parse(z.object({ eventId: z.string().uuid() }).strict(), req.params);
  const event = await prisma.domainEventOutbox.findUnique({ where: { id: eventId }, select: { eventType: true, payload: true, status: true } });
  if (!event) throw new NotFoundError('Dead-letter event not found.');
  if (event.status !== 'DEAD_LETTER') throw new ConflictError('Only dead-letter events can be replayed.');
  const checked = validateIntelligenceEvent(event.eventType, event.payload);
  if (!checked.success) throw new ValidationError('This legacy or invalid event cannot be replayed until its payload is reconciled.', { code: checked.reason });
  const result = await domainEventOutboxService.replay(eventId, actor(req), req.id);
  if (result.kind === 'NOT_FOUND') throw new NotFoundError('Dead-letter event not found.');
  if (result.kind !== 'REPLAYED') throw new ConflictError('Event state changed before replay; refresh and retry.');
  respond(res, req, { eventId: result.eventId, status: 'PENDING', correlationId: result.correlationId, idempotentDownstream: true }, 202);
}));

router.get('/cases', viewIntelligence, asyncRoute(async (req, res) => {
  requireCasesEnabled();
  const query = parse(caseQuerySchema, req.query);
  const modules = await intelligenceService.authorizedModules(actor(req));
  respond(res, req, await intelligenceCaseService.list(modules, { page: query.page ?? 1, limit: query.limit ?? 25, status: query.status }));
}));

router.get('/conversations', viewIntelligence, asyncRoute(async (req, res) => {
  requireConversationsEnabled();
  const query = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict(), req.query);
  respond(res, req, await intelligenceConversationService.list(actor(req), query.page ?? 1, query.limit ?? 25));
}));
router.get('/scenarios', viewIntelligence, asyncRoute(async (req, res) => {
  requireScenariosEnabled();
  const query = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict(), req.query);
  const modules = await intelligenceService.authorizedModules(actor(req));
  respond(res, req, await impactScenarioService.list(modules, query.page ?? 1, query.limit ?? 25));
}));
router.post('/scenarios', authorize('simulate', 'ImpactScenario', permissionChecker), asyncRoute(async (req, res) => {
  requireScenariosEnabled();
  const body = parse(scenarioCreateSchema, req.body);
  const modules = await intelligenceService.authorizedModules(actor(req));
  if (modules) {
    const scopedCase = await intelligenceCaseService.get(body.caseId, modules);
    if (!scopedCase) throw new NotFoundError('Intelligence case not found.');
  }
  respond(res, req, await impactScenarioService.create({ ...body, actorId: actor(req), correlationId: req.id }), 201);
}));
router.get('/scenarios/:id', viewIntelligence, asyncRoute(async (req, res) => {
  requireScenariosEnabled();
  const modules = await intelligenceService.authorizedModules(actor(req));
  const result = await impactScenarioService.get(req.params.id, modules);
  if (!result) throw new NotFoundError('Impact scenario not found.');
  respond(res, req, result);
}));
router.post('/conversations', viewIntelligence, asyncRoute(async (req, res) => {
  requireConversationsEnabled();
  const body = parse(conversationSchema, req.body);
  await intelligenceService.authorizedModules(actor(req)).then((modules) => { if (modules && !modules.includes(body.module)) throw new ValidationError('Conversation module is outside your intelligence scope.'); });
  respond(res, req, await intelligenceConversationService.create(actor(req), body.module, body.title), 201);
}));
router.get('/conversations/:id', viewIntelligence, asyncRoute(async (req, res) => {
  requireConversationsEnabled();
  respond(res, req, await intelligenceConversationService.get(actor(req), req.params.id));
}));
router.post('/conversations/:id/messages', viewIntelligence, asyncRoute(async (req, res) => {
  requireConversationsEnabled();
  const body = parse(conversationMessageSchema, req.body);
  const accepted = await intelligenceConversationService.send(actor(req), req.params.id, body.content, req.id);
  const queued = await intelligenceService.askBusiness(actor(req), accepted.message, accepted.module, req.id, req.params.id);
  respond(res, req, queued, 202);
}));
router.get('/cases/:id', viewIntelligence, asyncRoute(async (req, res) => {
  requireCasesEnabled();
  const modules = await intelligenceService.authorizedModules(actor(req));
  const result = await intelligenceCaseService.get(req.params.id, modules);
  if (!result) throw new NotFoundError('Intelligence case not found.');
  respond(res, req, result);
}));
for (const action of ['acknowledge', 'resolve', 'suppress'] as const) {
  router.post(`/cases/:id/${action}`, authorize('manage', 'IntelligenceCase', permissionChecker), asyncRoute(async (req, res) => {
    requireCasesEnabled();
    const body = parse(caseTransitionSchema, req.body);
    const modules = await intelligenceService.authorizedModules(actor(req));
    const status = action === 'acknowledge' ? 'ACKNOWLEDGED' : action === 'resolve' ? 'RESOLVED' : 'SUPPRESSED';
    const updated = await intelligenceCaseService.transition(req.params.id, modules, actor(req), status, body.reason);
    if (!updated) throw new NotFoundError('Intelligence case not found.');
    respond(res, req, updated);
  }));
}

router.post('/product-pricing-analysis', authorize('update', 'PricingMaster', permissionChecker), asyncRoute(async (req, res) => {
  const body = parse(productPricingAnalysisSchema, req.body);
  respond(res, req, await intelligenceService.createProductPricingRecommendation(actor(req), { ...body, targetMarginPercent: body.targetMarginPercent ?? 45 }, req.id), 201);
}));

router.get('/overview', viewIntelligence, asyncRoute(async (req, res) => respond(res, req, await intelligenceService.overview(actor(req)))));

router.get('/daily-insights/today', viewIntelligence, asyncRoute(async (req, res) => {
  respond(res, req, await intelligenceService.getDailyInsightToday(actor(req)));
}));
router.get('/daily-insights', viewIntelligence, asyncRoute(async (req, res) => {
  const query = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(30).default(10) }).strict(), req.query);
  respond(res, req, await intelligenceService.listDailyInsights(actor(req), query.page ?? 1, query.limit ?? 10));
}));
router.post('/daily-insights/today', viewIntelligence, asyncRoute(async (req, res) => {
  const body = parse(z.object({ refresh: z.boolean().optional().default(false) }).strict(), req.body);
  respond(res, req, await intelligenceService.generateDailyInsight(actor(req), req.id, body.refresh), 202);
}));

router.get('/recommendations', viewIntelligence, asyncRoute(async (req, res) => {
  const query = parse(listRecommendationsQuerySchema, req.query);
  respond(res, req, await intelligenceService.listRecommendations(actor(req), { ...query, page: query.page ?? 1, limit: query.limit ?? 25 }));
}));
router.get('/recommendations/:id/outcomes', viewOutcomes, asyncRoute(async (req, res) => {
  await intelligenceService.getRecommendation(actor(req), req.params.id);
  const items = await prisma.recommendationOutcome.findMany({ where: { recommendationId: req.params.id }, orderBy: { observedAt: 'desc' } });
  respond(res, req, { items, provenance: items.map((item) => ({ id: item.id, provenance: (item.evidence as { provenance?: string } | null)?.provenance ?? 'UNKNOWN', attributionMethod: item.attributionMethod })) });
}));
router.get('/outcomes', viewOutcomes, asyncRoute(async (req, res) => {
  const query = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict(), req.query);
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const modules = await intelligenceService.authorizedModules(actor(req));
  const where = modules ? { recommendation: { module: { in: modules } } } : {};
  const [rows, total] = await Promise.all([
    prisma.recommendationOutcome.findMany({ where, orderBy: { observedAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { recommendation: { select: { id: true, module: true, title: true } }, task: { select: { id: true, status: true } } } }),
    prisma.recommendationOutcome.count({ where }),
  ]);
  const items = rows.map((item) => {
    const metadata = item.evidence as { provenance?: string; outcomeStatus?: string; quality?: string } | null;
    return { ...item, provenance: metadata?.provenance ?? 'UNKNOWN', outcomeStatus: metadata?.outcomeStatus ?? 'UNKNOWN', quality: metadata?.quality ?? 'UNKNOWN' };
  });
  respond(res, req, { items, total, page, limit });
}));
router.get('/outcomes/:id', viewOutcomes, asyncRoute(async (req, res) => {
  const modules = await intelligenceService.authorizedModules(actor(req));
  const outcome = await prisma.recommendationOutcome.findFirst({ where: { id: req.params.id, ...(modules ? { recommendation: { module: { in: modules } } } : {}) }, include: { recommendation: { select: { id: true, module: true, title: true } }, task: { select: { id: true, status: true } } } });
  if (!outcome) throw new NotFoundError('Recommendation outcome not found.');
  respond(res, req, { ...outcome, provenance: (outcome.evidence as { provenance?: string } | null)?.provenance ?? 'UNKNOWN' });
}));
router.get('/recommendations/:id', viewIntelligence, asyncRoute(async (req, res) => respond(res, req, await intelligenceService.getRecommendation(actor(req), req.params.id))));
router.post('/recommendations/:id/accept', authorize('accept', 'Recommendation', permissionChecker), authorize('create', 'BusinessTask', permissionChecker), authorize('assign', 'BusinessTask', permissionChecker), asyncRoute(async (req, res) => {
  const body = parse(acceptRecommendationSchema, req.body);
  respond(res, req, await intelligenceService.acceptRecommendation(actor(req), req.params.id, body, req.id), 201);
}));
router.post('/recommendations/:id/dismiss', authorize('dismiss', 'Recommendation', permissionChecker), asyncRoute(async (req, res) => {
  const body = parse(dismissRecommendationSchema, req.body);
  respond(res, req, await intelligenceService.dismissRecommendation(actor(req), req.params.id, body.reason, req.id));
}));
router.post('/recommendations/:id/defer', authorize('review', 'Recommendation', permissionChecker), asyncRoute(async (req, res) => {
  const body = parse(deferRecommendationSchema, req.body);
  respond(res, req, await intelligenceService.deferRecommendation(actor(req), req.params.id, body.reason, body.deferredUntil, req.id));
}));
router.post('/recommendations/:id/refresh', authorize('review', 'Recommendation', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await intelligenceService.refreshRecommendation(actor(req), req.params.id, req.id), 202)));

const taskQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

// Task access is enforced in the service so an assigned employee can work on
// their own task even when they do not have module-wide task visibility.
router.get('/tasks', asyncRoute(async (req, res) => {
  const query = parse(taskQuerySchema, req.query);
  respond(res, req, await intelligenceService.listTasks(actor(req), { ...query, page: query.page ?? 1, limit: query.limit ?? 25, status: query.status as BusinessTaskStatus | undefined }));
}));
router.get('/assignees', authorize('assign', 'BusinessTask', permissionChecker), asyncRoute(async (req, res) => {
  const module = parse(z.object({ module: z.enum(['EXECUTIVE', 'SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT', 'QUALITY', 'FINANCE', 'SYSTEM']) }).strict(), req.query).module;
  respond(res, req, await intelligenceService.assignees(actor(req), module));
}));
router.get('/tasks/:id', asyncRoute(async (req, res) => respond(res, req, await intelligenceService.getTask(actor(req), req.params.id))));
router.patch('/tasks/:id', asyncRoute(async (req, res) => {
  const body = parse(updateTaskSchema, req.body);
  respond(res, req, await intelligenceService.updateTask(actor(req), req.params.id, { ...body, status: body.status as BusinessTaskStatus | undefined }, req.id));
}));
router.post('/tasks/:id/complete', asyncRoute(async (req, res) => {
  const body = parse(completeTaskSchema, req.body);
  respond(res, req, await intelligenceService.completeTask(actor(req), req.params.id, body, req.id));
}));
router.post('/tasks/:id/action-link', asyncRoute(async (req, res) => {
  const body = parse(linkTaskActionSchema, req.body);
  respond(res, req, await intelligenceService.linkTaskAction(actor(req), req.params.id, body, req.id));
}));
router.post('/tasks/:id/reconcile-outcome', viewOutcomes, asyncRoute(async (req, res) => {
  respond(res, req, await outcomeEvaluatorService.reconcileTaskOutcome(req.params.id, actor(req)));
}));

router.get('/objectives', viewIntelligence, asyncRoute(async (req, res) => respond(res, req, await intelligenceService.objectives())));
router.put('/objectives', authorize('manage', 'IntelligencePolicy', permissionChecker), asyncRoute(async (req, res) => {
  const body = parse(updateObjectivePolicySchema, req.body);
  respond(res, req, await intelligenceService.replaceObjectives(actor(req), body, req.id), 201);
}));

router.get('/controls', authorize('manage', 'IntelligencePolicy', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await intelligenceService.controlState())));
router.put('/controls', authorize('manage', 'IntelligencePolicy', permissionChecker), asyncRoute(async (req, res) => {
  const body = parse(updateIntelligenceControlsSchema, req.body);
  respond(res, req, await intelligenceService.replaceControlState(actor(req), body, req.id));
}));

router.get('/runs', authorize('view', 'IntelligenceAudit', permissionChecker), asyncRoute(async (req, res) => {
  const query = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict(), req.query);
  respond(res, req, await intelligenceService.listRuns(actor(req), query.page ?? 1, query.limit ?? 25));
}));
router.post('/runs', viewIntelligence, asyncRoute(async (req, res) => {
  const body = parse(z.object({ module: z.enum(['EXECUTIVE', 'SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT']) }).strict(), req.body);
  respond(res, req, await intelligenceService.runModuleAnalysis(actor(req), body.module, req.id), 202);
}));
router.get('/runs/:id', authorize('view', 'IntelligenceAudit', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await intelligenceService.getRun(actor(req), req.params.id))));
router.get('/runs/:id/delegations', authorize('view', 'IntelligenceAudit', permissionChecker), asyncRoute(async (req, res) => {
  const run = await intelligenceService.getRun(actor(req), req.params.id);
  const items = await (prisma as any).advisorDelegation.findMany({ where: { parentRunId: run.id }, orderBy: { requestedAt: 'asc' }, include: { childRun: { select: { id: true, module: true, profileKey: true, status: true, modelProvider: true, modelId: true, startedAt: true, completedAt: true, errorCode: true } } } });
  respond(res, req, { items, total: items.length });
}));
router.post('/questions', viewIntelligence, asyncRoute(async (req, res) => {
  const body = parse(askBusinessSchema, req.body);
  respond(res, req, await intelligenceService.askBusiness(actor(req), body.question, body.module ?? 'EXECUTIVE', req.id), 202);
}));
router.get('/questions/:runId/events', viewIntelligence, asyncRoute(async (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  let closed = false;
  req.on('close', () => { closed = true; });
  let lastStatus = '';
  const deadline = Date.now() + 10 * 60_000;
  while (!closed && Date.now() < deadline) {
    const run = await intelligenceService.getRun(actor(req), req.params.runId);
    if (run.status !== lastStatus) {
      res.write(`event: status\ndata: ${JSON.stringify({ runId: run.id, requestId: run.correlationId, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt, errorCode: run.errorCode })}\n\n`);
      lastStatus = run.status;
    } else {
      res.write(': keepalive\n\n');
    }
    if (['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'INTERRUPTED'].includes(run.status)) {
      const output = run.status === 'COMPLETED' && run.structuredOutput && typeof run.structuredOutput === 'object' && !Array.isArray(run.structuredOutput)
        ? run.structuredOutput as { answer?: unknown; evidence?: unknown; limitations?: unknown; dailyBriefing?: unknown } : undefined;
      res.write(`event: complete\ndata: ${JSON.stringify({
        runId: run.id,
        requestId: run.correlationId,
        status: run.status,
        answer: typeof output?.answer === 'string' ? output.answer : undefined,
        evidence: Array.isArray(output?.evidence) ? output.evidence : [],
        limitations: Array.isArray(output?.limitations) ? output.limitations : [],
        dailyBriefing: output?.dailyBriefing,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      })}\n\n`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  res.end();
}));

export default router;
