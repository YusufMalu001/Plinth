import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../../database';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export class DomainEventOutboxService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async publish(input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
    correlationId?: string;
  }, transaction?: TransactionClient) {
    const client = transaction ?? this.db;
    return client.domainEventOutbox.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId ?? randomUUID(),
      },
      update: {},
    });
  }

  /** Reset one dead-letter event for an audited, explicitly authorized replay. */
  async replay(eventId: string, actorId: string, requestId: string) {
    return this.db.$transaction(async (tx) => {
      const event = await tx.domainEventOutbox.findUnique({ where: { id: eventId }, select: { id: true, eventType: true, payload: true, status: true, attempts: true, lastErrorCode: true, correlationId: true } });
      if (!event) return { kind: 'NOT_FOUND' as const };
      if (event.status !== 'DEAD_LETTER') return { kind: 'NOT_DEAD_LETTER' as const };
      const changed = await tx.domainEventOutbox.updateMany({ where: { id: eventId, status: 'DEAD_LETTER' }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), processedAt: null, lastError: null, lastErrorCode: null } });
      if (changed.count !== 1) return { kind: 'RACE' as const };
      await tx.auditLog.create({ data: {
        userId: actorId, action: 'intelligence.event.replay', resource: 'DomainEventOutbox', resourceId: event.id, requestId,
        before: { status: event.status, attempts: event.attempts, lastErrorCode: event.lastErrorCode },
        after: { status: 'PENDING', attempts: 0, correlationId: event.correlationId },
      } });
      return { kind: 'REPLAYED' as const, eventId: event.id, correlationId: event.correlationId };
    });
  }
}

export const domainEventOutboxService = new DomainEventOutboxService();
