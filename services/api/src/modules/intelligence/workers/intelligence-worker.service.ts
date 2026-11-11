import { IntelligenceJob, IntelligenceModule, Prisma, PrismaClient } from '@prisma/client';
import { config } from '../../../config';
import { prisma as defaultPrisma } from '../../../database';
import { logger } from '../../../common/utils/logger';
import { NotificationService } from '../../notifications/notification.service';
import { intelligenceOrchestratorService, IntelligenceOrchestratorService } from '../services/intelligence-orchestrator.service';
import { intelligenceControlsService, IntelligenceControlsService } from '../services/intelligence-controls.service';
import { validateIntelligenceEvent, intelligenceEventTypes } from '../intelligence.events';
import { domainEventOutboxService } from '../services/domain-event-outbox.service';
import { modernReorderEvaluatorService } from '../../inventory/services/modern-reorder-evaluator.service';

interface ClaimedEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  correlationId: string;
  createdAt: Date;
}

const EVENT_TARGETS: Record<string, IntelligenceModule[]> = {
  SALES_ORDER_CREATED: ['SALES'], SALES_ORDER_CONFIRMED: ['SALES', 'PRODUCTION'],
  SALES_ORDER_CHANGED: ['SALES', 'PRODUCTION'], SALES_ORDER_CANCELLED: ['SALES', 'PRODUCTION'],
  SALES_ORDER_FULFILLED: ['SALES', 'FULFILLMENT'], SALES_RETURN_REQUESTED: ['SALES', 'FULFILLMENT'],
  SALES_RETURN_CREDIT_COMPLETED: ['SALES'], PO_CREATED: ['PROCUREMENT'], PO_APPROVED: ['PROCUREMENT', 'INVENTORY'],
  PO_CHANGED: ['PROCUREMENT'], PO_CANCELLED: ['PROCUREMENT'], GOODS_RECEIPT_FINALIZED: ['PROCUREMENT', 'INVENTORY'],
  INVENTORY_POSTED: ['INVENTORY'], INVENTORY_THRESHOLD_CHANGED: ['INVENTORY'],
  PRODUCTION_PLANNED: ['PRODUCTION'], PRODUCTION_STARTED: ['PRODUCTION', 'INVENTORY'],
  PRODUCTION_COMPLETED: ['PRODUCTION', 'INVENTORY', 'FULFILLMENT'], PRODUCTION_CANCELLED: ['PRODUCTION'],
  PRODUCTION_QUANTITY_CHANGED: ['PRODUCTION', 'INVENTORY'], SHIPMENT_CREATED: ['FULFILLMENT'],
  SHIPMENT_DISPATCHED: ['FULFILLMENT', 'SALES'], SHIPMENT_DELIVERED: ['FULFILLMENT', 'SALES'],
  SHIPMENT_CANCELLED: ['FULFILLMENT'], FULFILLMENT_DELAYED: ['FULFILLMENT'], VENDOR_CHANGED: ['PROCUREMENT'],
  VENDOR_SCORECARD_ACTIVATED: ['PROCUREMENT'], PRICE_CHANGED: ['SALES', 'PROCUREMENT'],
  // Legacy outbox names are retained while source publishers migrate to the versioned contract.
  FULFILLMENT_DISPATCHED: ['FULFILLMENT', 'SALES'],
  INVENTORY_MOVEMENT_POSTED: ['INVENTORY'], STOCK_MOVEMENT_POSTED: ['INVENTORY'],
  INVENTORY_RECEIPT: ['INVENTORY', 'PROCUREMENT'], INVENTORY_ISSUE: ['INVENTORY'],
  INVENTORY_ADJUSTMENT: ['INVENTORY'], INVENTORY_TRANSFER: ['INVENTORY'],
  INVENTORY_RETURN: ['INVENTORY'], INVENTORY_PRODUCTION_ISSUE: ['INVENTORY', 'PRODUCTION'],
  INVENTORY_PRODUCTION_OUTPUT: ['INVENTORY', 'PRODUCTION'],
};

function moduleTargets(event: Pick<ClaimedEvent, 'aggregateType' | 'eventType' | 'payload'>): IntelligenceModule[] {
  const direct = EVENT_TARGETS[event.eventType.toUpperCase()];
  if (direct) {
    if (event.eventType.toUpperCase() === 'INVENTORY_POSTED' && event.payload && typeof event.payload === 'object') {
      const payload = event.payload as Record<string, unknown>;
      const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : payload;
      const targets = new Set(direct);
      if (metadata.movementType === 'RECEIPT') targets.add('PROCUREMENT');
      if (metadata.sourceType === 'PRODUCTION_PLAN' || metadata.sourceType === 'MATERIAL_ISSUE' || metadata.sourceType === 'PRODUCTION_MATERIAL_ISSUE') targets.add('PRODUCTION');
      return [...targets];
    }
    return direct;
  }
  // Unknown events are not guessed into a module; leaving no consumer avoids
  // accidental cross-domain exposure from regex-based routing.
  return [];
}

function indiaClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, weekday: part('weekday'), hour: Number(part('hour')) };
}

export class IntelligenceWorkerService {
  private lastHeartbeatAt = 0;
  private lastDelayedScanAt = 0;
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly orchestrator: IntelligenceOrchestratorService = intelligenceOrchestratorService,
    private readonly notifications = new NotificationService(),
    private readonly controls: IntelligenceControlsService = intelligenceControlsService,
    private readonly workerId = `intelligence-worker-${process.pid}`,
  ) {}

  async tick() {
    if (Date.now() - this.lastHeartbeatAt > 15_000) {
      await this.db.$executeRaw`
        INSERT INTO "intelligence_control_state" ("id", "workerHeartbeatAt", "workerId", "createdAt", "updatedAt")
        VALUES ('default', CURRENT_TIMESTAMP, ${this.workerId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("id") DO UPDATE SET "workerHeartbeatAt" = CURRENT_TIMESTAMP, "workerId" = ${this.workerId}
      `;
      this.lastHeartbeatAt = Date.now();
    }
    const controls = await this.controls.effective();
    if (!controls.enabled) return { disabled: true };
    await this.maintainRecommendationLifecycle();
    if (controls.schedulesEnabled) await this.enqueueSchedules(new Date(), controls.providerEnabled);
    if (controls.eventTriggersEnabled) {
      if (Date.now() - this.lastDelayedScanAt >= 60_000) {
        await this.enqueueDelayedFulfillmentEvents();
        this.lastDelayedScanAt = Date.now();
      }
      await this.drainEvents();
    }
    await this.recoverStaleClaims();
    return this.processJobs();
  }

  async drainEvents(limit = 25) {
    await this.db.$executeRaw`
      UPDATE "domain_event_outbox"
      SET "status" = CASE WHEN "attempts" + 1 >= 10 THEN 'DEAD_LETTER' ELSE 'FAILED' END,
          "attempts" = "attempts" + 1,
          "lastErrorCode" = 'STALE_EVENT_CLAIM',
          "lastError" = 'Worker stopped while processing event; claim recovered.',
          "nextAttemptAt" = CURRENT_TIMESTAMP + INTERVAL '1 minute',
          "processedAt" = CASE WHEN "attempts" + 1 >= 10 THEN CURRENT_TIMESTAMP ELSE NULL END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "status" = 'PROCESSING' AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    `;
    const events = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedEvent[]>(Prisma.sql`
        SELECT "id", "aggregateType", "aggregateId", "eventType", "payload", "attempts", "correlationId", "createdAt"
        FROM "domain_event_outbox"
        WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= CURRENT_TIMESTAMP AND "attempts" < 10
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length) {
        await tx.domainEventOutbox.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status: 'PROCESSING' } });
      }
      return rows;
    });

    for (const event of events) {
      try {
        const eventType = event.eventType.toUpperCase();
        const isLegacy = LEGACY_EVENT_TYPES.has(eventType);
        if (!isLegacy && !(intelligenceEventTypes as readonly string[]).includes(eventType)) {
          await this.markDeadLetter(event.id, 'UNKNOWN_EVENT_TYPE', 'Event type is not registered.');
          continue;
        }
        const checked = isLegacy ? validateLegacyEvent(event) : validateIntelligenceEvent(eventType, event.payload);
        if (!checked.success) {
          await this.markDeadLetter(event.id, checked.reason, 'Event payload failed version or safety validation.');
          continue;
        }
        const safeEvent = { ...event, payload: checked.data };
        if (eventType === 'INVENTORY_POSTED') {
          const payload = safeEvent.payload as Record<string, unknown>;
          if ((payload.itemType === 'PRODUCT' || payload.itemType === 'MATERIAL') && typeof payload.itemId === 'string' && typeof payload.locationId === 'string') {
            await modernReorderEvaluatorService.evaluateItem(payload.itemType, payload.itemId, payload.locationId);
          }
        }
        if (eventType === 'INVENTORY_THRESHOLD_CHANGED') {
          const payload = safeEvent.payload as Record<string, unknown>;
          const metadata = payload.metadata && typeof payload.metadata === 'object'
            ? payload.metadata as Record<string, unknown>
            : payload;
          if ((metadata.itemType === 'PRODUCT' || metadata.itemType === 'MATERIAL')
            && typeof metadata.itemId === 'string'
            && typeof metadata.locationId === 'string') {
            await modernReorderEvaluatorService.evaluateItem(metadata.itemType, metadata.itemId, metadata.locationId);
          }
        }
        const targets = moduleTargets(safeEvent);
        if (!targets.length) {
          await this.markDeadLetter(event.id, 'UNMAPPED_EVENT_TYPE', `No intelligence consumer is registered for '${event.eventType}'.`);
          continue;
        }
        await this.db.$transaction(async (tx) => {
          for (const module of targets) {
            await tx.intelligenceJob.upsert({
              where: { idempotencyKey: `event:${event.id}:${module}` },
              create: {
                eventId: event.id,
                module,
                trigger: 'EVENT',
                payload: safeEvent.payload as Prisma.InputJsonValue,
                idempotencyKey: `event:${event.id}:${module}`,
                correlationId: event.correlationId,
              },
              update: {},
            });
          }
          await tx.domainEventOutbox.update({ where: { id: event.id }, data: { status: 'COMPLETED', attempts: { increment: 1 }, processedAt: new Date(), lastError: null, lastErrorCode: null } });
        });
      } catch {
        const attempts = event.attempts + 1;
        logger.warn('Intelligence event fan-out failed.', { requestId: event.correlationId, errorCode: 'EVENT_FANOUT_FAILED', details: { eventId: event.id, attempts } });
        await this.db.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: attempts >= 10 ? 'DEAD_LETTER' : 'FAILED',
            attempts,
            lastErrorCode: 'EVENT_FANOUT_FAILED',
            lastError: 'Event fan-out failed; retry is scheduled. Inspect service logs by correlation ID.',
            nextAttemptAt: new Date(Date.now() + Math.min(360, 2 ** Math.min(attempts, 8)) * 60_000),
          },
        });
      }
    }
    return events.length;
  }

  private async markDeadLetter(id: string, code: string, message: string) {
    await this.db.domainEventOutbox.update({ where: { id }, data: { status: 'DEAD_LETTER', attempts: { increment: 1 }, processedAt: new Date(), lastErrorCode: code, lastError: message.slice(0, 300) } });
  }

  async enqueueDelayedFulfillmentEvents(now = new Date()) {
    const delayed = await this.db.salesFulfillment.findMany({
      where: { promisedShipAt: { lt: now }, status: { notIn: ['DISPATCHED', 'COMPLETED', 'CANCELLED'] } },
      select: { id: true, salesOrderId: true, status: true, promisedShipAt: true }, take: 500,
      orderBy: { promisedShipAt: 'asc' },
    });
    for (const fulfillment of delayed) {
      if (!fulfillment.promisedShipAt) continue;
      const key = `FULFILLMENT_DELAYED:${fulfillment.id}:${fulfillment.promisedShipAt.toISOString()}`;
      await domainEventOutboxService.publish({
        aggregateType: 'SalesFulfillment', aggregateId: fulfillment.id, eventType: 'FULFILLMENT_DELAYED',
        idempotencyKey: key, correlationId: `scan:${key}`,
        payload: { eventVersion: 1, entityType: 'SalesFulfillment', entityId: fulfillment.id, occurredAt: now.toISOString(), metadata: { salesOrderId: fulfillment.salesOrderId, status: fulfillment.status, promisedShipAt: fulfillment.promisedShipAt.toISOString() } },
      });
    }
    return delayed.length;
  }

  async processJobs(limit = config.intelligence.maxConcurrentRuns) {
    const jobs = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<IntelligenceJob[]>(Prisma.sql`
        SELECT *
        FROM "intelligence_jobs"
        WHERE "status" IN ('PENDING', 'FAILED') AND "scheduledAt" <= CURRENT_TIMESTAMP AND "attempts" < "maxAttempts"
        ORDER BY "scheduledAt" ASC, "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length) {
        await tx.intelligenceJob.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { status: 'PROCESSING', lockedAt: new Date(), lockedBy: this.workerId },
        });
      }
      return rows;
    });
    await Promise.all(jobs.map((job) => this.processOne(job)));
    return { claimed: jobs.length };
  }

  async enqueueSchedules(now = new Date(), providerEnabled = true) {
    const clock = indiaClock(now);
    if (clock.hour >= 7) {
      const modules: IntelligenceModule[] = ['SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT', 'EXECUTIVE'];
      await Promise.all(modules.map((module) => this.orchestrator.enqueue({
        module,
        trigger: 'DAILY',
        idempotencyKey: `daily:${clock.date}:${module}`,
        correlationId: `schedule:daily:${clock.date}`,
        payload: { schedule: 'daily-07:00-Asia/Kolkata', businessDate: clock.date },
      })));
    }
    if (clock.hour >= 8 && providerEnabled) {
      await this.orchestrator.enqueueQuestion(
        `Prepare the daily executive briefing for business date ${clock.date} from the certified Plinth metrics and saved operational findings.`,
        'EXECUTIVE',
        'system',
        `schedule:daily-insight:${clock.date}`,
        undefined,
        clock.date,
        'SCHEDULE',
      );
    }
    if (clock.weekday === 'Mon' && clock.hour >= 8) {
      const modules: IntelligenceModule[] = ['SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT', 'EXECUTIVE'];
      await Promise.all(modules.map((module) => this.orchestrator.enqueue({
        module,
        trigger: 'WEEKLY',
        idempotencyKey: `weekly:${clock.date}:${module}`,
        correlationId: `schedule:weekly:${clock.date}`,
        payload: { schedule: 'weekly-Monday-08:00-Asia/Kolkata', businessDate: clock.date },
      })));
    }
  }

  private async processOne(job: IntelligenceJob) {
    try {
      if (await this.deferExecutiveUntilModulesComplete(job)) return;
      await this.orchestrator.process(job);
      await this.db.intelligenceJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', attempts: { increment: 1 }, completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, lastErrorCode: null },
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      const deadLetter = attempts >= job.maxAttempts;
      await this.db.intelligenceRun.updateMany({
        where: { jobId: job.id, status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'FAILED', errorCode: 'JOB_EXECUTION_FAILED', errorMessage: 'The intelligence job failed before a response could be persisted.', completedAt: new Date() },
      });
      await this.db.intelligenceJob.update({
        where: { id: job.id },
        data: {
          status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
          attempts,
          scheduledAt: new Date(Date.now() + Math.min(360, 2 ** Math.min(attempts, 8)) * 60_000),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: 'JOB_EXECUTION_FAILED',
          lastError: 'Job execution failed; inspect the correlated run and provider attempt.',
        },
      });
      logger.error('Intelligence job failed.', { details: { jobId: job.id, module: job.module, attempts, deadLetter } });
    }
  }

  private async deferExecutiveUntilModulesComplete(job: IntelligenceJob) {
    if (job.module !== 'EXECUTIVE' || (job.trigger !== 'DAILY' && job.trigger !== 'WEEKLY')) return false;
    const pendingModules = await this.db.intelligenceJob.count({
      where: {
        correlationId: job.correlationId,
        module: { not: 'EXECUTIVE' },
        status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
      },
    });
    if (!pendingModules) return false;
    await this.db.intelligenceJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        scheduledAt: new Date(Date.now() + 30_000),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return true;
  }

  private async recoverStaleClaims() {
    const staleBefore = new Date(Date.now() - Math.max(config.intelligence.runtimeTimeoutMs * 2, 10 * 60_000));
    await this.db.intelligenceJob.updateMany({
      where: { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
      data: { status: 'FAILED', lockedAt: null, lockedBy: null, lastErrorCode: 'STALE_WORKER_CLAIM', lastError: 'Worker claim expired before completion.' },
    });
  }

  private async maintainRecommendationLifecycle() {
    const now = new Date();
    await this.db.recommendation.updateMany({
      where: { status: { in: ['OPEN', 'DEFERRED'] }, expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    await this.db.$executeRaw`
      UPDATE "recommendations" AS recommendation
      SET "status" = 'OPEN'::"RecommendationStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE recommendation."status" = 'DEFERRED'::"RecommendationStatus"
        AND (
          SELECT decision."deferredUntil"
          FROM "recommendation_decisions" AS decision
          WHERE decision."recommendationId" = recommendation."id"
            AND decision."decision" = 'DEFERRED'::"RecommendationDecisionType"
          ORDER BY decision."createdAt" DESC
          LIMIT 1
        ) <= CURRENT_TIMESTAMP
        AND recommendation."expiresAt" > CURRENT_TIMESTAMP
    `;

    const overdueTasks = await this.db.businessTask.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { lt: now } },
      select: { id: true, title: true, ownerId: true, creatorId: true, priority: true, dueAt: true },
      take: 250,
      orderBy: { dueAt: 'asc' },
    });
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    await Promise.all(overdueTasks.map((task) => this.notifications.notifyUsers({
      recipientIds: [task.ownerId, task.creatorId],
      type: 'WORKFLOW',
      title: 'Task overdue',
      message: task.title,
      resource: 'BusinessTask',
      resourceId: task.id,
      href: `/decision-center/tasks/${task.id}`,
      metadata: { dueAt: task.dueAt.toISOString() },
      priority: task.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      dedupeKeyPrefix: `business-task-overdue:${businessDate}:${task.id}`,
    })));
  }
}

const LEGACY_EVENT_TYPES = new Set(['FULFILLMENT_DISPATCHED', 'INVENTORY_MOVEMENT_POSTED', 'STOCK_MOVEMENT_POSTED', 'INVENTORY_RECEIPT', 'INVENTORY_ISSUE', 'INVENTORY_ADJUSTMENT', 'INVENTORY_TRANSFER', 'INVENTORY_RETURN', 'INVENTORY_PRODUCTION_ISSUE', 'INVENTORY_PRODUCTION_OUTPUT']);
function validateLegacyEvent(event: ClaimedEvent) {
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return { success: false as const, reason: 'INVALID_LEGACY_PAYLOAD' };
  const old = event.payload as Record<string, unknown>;
  if (old.eventVersion !== undefined && old.eventVersion !== 1) return { success: false as const, reason: 'INVALID_EVENT_VERSION' };
  const sourceMeta = old.metadata && typeof old.metadata === 'object' && !Array.isArray(old.metadata) ? old.metadata as Record<string, unknown> : old;
  const legacyType = event.eventType.toUpperCase();
  const allowed = legacyType === 'FULFILLMENT_DISPATCHED'
    ? new Set(['salesOrderId', 'status'])
    : new Set(['itemType', 'itemId', 'locationId', 'movementType', 'sourceType', 'sourceId']);
  const metadata = Object.fromEntries(Object.entries(sourceMeta).filter(([key, value]) => allowed.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)));
  const normalized = { eventVersion: 1, entityType: event.aggregateType, entityId: event.aggregateId, occurredAt: event.createdAt.toISOString(), ...(Object.keys(metadata).length ? { metadata } : {}) };
  const canonicalType = legacyType === 'FULFILLMENT_DISPATCHED' ? 'FULFILLMENT_DISPATCHED' : legacyType;
  const checked = validateIntelligenceEvent(canonicalType, normalized);
  return checked.success ? checked : { success: false as const, reason: 'INVALID_LEGACY_PAYLOAD' };
}

export const intelligenceWorkerService = new IntelligenceWorkerService();
