import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { publishIntelligenceEvent } from '../intelligence.events';
import { DomainEventOutboxService } from '../services/domain-event-outbox.service';
import { IntelligenceWorkerService } from '../workers/intelligence-worker.service';

const enabled = process.env.PHASE2_POSTGRES_TEST === '1';
const table = `phase2_outbox_probe_${process.pid}`;

function failAtDatabaseBoundary(tx: any, phase: 'INSERT' | 'SAVEPOINT' | 'ROLLBACK' | 'RELEASE') {
  let releaseCount = 0;
  return new Proxy(tx, {
    get(target, property) {
      if (property === '$executeRaw') {
        return async (query: TemplateStringsArray, ...values: unknown[]) => {
          const sql = query.join('').trim().toUpperCase();
          const shouldFail =
            (phase === 'SAVEPOINT' && sql.startsWith('SAVEPOINT')) ||
            (phase === 'ROLLBACK' && sql.startsWith('ROLLBACK TO SAVEPOINT')) ||
            (phase === 'RELEASE' && sql.startsWith('RELEASE SAVEPOINT') && ++releaseCount === 1);
          if (shouldFail) return target.$executeRaw`SELECT 1 / 0`;
          return target.$executeRaw(query, ...values);
        };
      }
      if (property === 'domainEventOutbox') {
        const delegate = Reflect.get(target, property, target);
        return new Proxy(delegate, {
          get(delegateTarget, delegateProperty) {
            if (delegateProperty === 'upsert' && (phase === 'INSERT' || phase === 'ROLLBACK')) {
              return () => target.$executeRaw`SELECT 1 / 0`;
            }
            const value = Reflect.get(delegateTarget, delegateProperty, delegateTarget);
            return typeof value === 'function' ? value.bind(delegateTarget) : value;
          },
        });
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function executeCase(id: string, failure?: 'INSERT' | 'SAVEPOINT' | 'ROLLBACK' | 'RELEASE', rollbackAfterPublish = false) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`INSERT INTO "${table}" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`, id);
    const publisherTx = failure ? failAtDatabaseBoundary(tx, failure) : tx;
    const result = await publishIntelligenceEvent(publisherTx as any, {
      type: 'VENDOR_CHANGED', entityType: 'Phase2Probe', entityId: id,
      correlationId: `phase2:${id}`, transitionId: id, metadata: { status: 'ACTIVE' },
    });
    if (rollbackAfterPublish) throw new Error('controlled test rollback');
    return result;
  });
}

(enabled ? describe : describe.skip)('Phase 2 PostgreSQL outbox transaction boundary', () => {
  const original = { enabled: config.intelligence.enabled, eventTriggersEnabled: config.intelligence.eventTriggersEnabled };
  const ids: string[] = [];
  let replayEventId: string | undefined;
  let replayRequestId: string | undefined;

  beforeAll(async () => {
    config.intelligence.enabled = true;
    config.intelligence.eventTriggersEnabled = true;
    await prisma.$executeRawUnsafe(`CREATE TABLE "${table}" ("id" TEXT PRIMARY KEY)`);
  });

  afterAll(async () => {
    if (ids.length) await prisma.domainEventOutbox.deleteMany({ where: { idempotencyKey: { in: ids.map((id) => `VENDOR_CHANGED:${id}:${id}`) } } });
    if (replayEventId) {
      await prisma.intelligenceJob.deleteMany({ where: { eventId: replayEventId } });
      await prisma.domainEventOutbox.deleteMany({ where: { id: replayEventId } });
    }
    if (replayRequestId) await prisma.auditLog.deleteMany({ where: { requestId: replayRequestId } });
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
    config.intelligence.enabled = original.enabled;
    config.intelligence.eventTriggersEnabled = original.eventTriggersEnabled;
    await prisma.$disconnect();
  });

  async function state(id: string) {
    const markers = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id}`);
    const events = await prisma.domainEventOutbox.count({ where: { idempotencyKey: `VENDOR_CHANGED:${id}:${id}` } });
    return { markerCount: markers.length, eventCount: events };
  }

  it('A: commits the ERP marker and exactly one outbox row when both writes succeed', async () => {
    const id = `success-${randomUUID()}`; ids.push(id);
    await executeCase(id);
    expect(await state(id)).toEqual({ markerCount: 1, eventCount: 1 });
    await executeCase(id);
    expect(await state(id)).toEqual({ markerCount: 1, eventCount: 1 });
  });

  it('B: rolls back the ERP marker and event together when the source transaction aborts', async () => {
    const id = `rollback-${randomUUID()}`; ids.push(id);
    await expect(executeCase(id, undefined, true)).rejects.toThrow('controlled test rollback');
    expect(await state(id)).toEqual({ markerCount: 0, eventCount: 0 });
  });

  it('C: propagates an outbox insert failure and rolls back the ERP marker', async () => {
    const id = `insert-fail-${randomUUID()}`; ids.push(id);
    await expect(executeCase(id, 'INSERT')).rejects.toThrow();
    expect(await state(id)).toEqual({ markerCount: 0, eventCount: 0 });
  });

  it('D: propagates savepoint creation failure and rolls back the ERP marker', async () => {
    const id = `savepoint-fail-${randomUUID()}`; ids.push(id);
    await expect(executeCase(id, 'SAVEPOINT')).rejects.toThrow();
    expect(await state(id)).toEqual({ markerCount: 0, eventCount: 0 });
  });

  it('E: propagates savepoint rollback failure and rolls back the ERP marker', async () => {
    const id = `rollback-savepoint-fail-${randomUUID()}`; ids.push(id);
    await expect(executeCase(id, 'ROLLBACK')).rejects.toThrow();
    expect(await state(id)).toEqual({ markerCount: 0, eventCount: 0 });
  });

  it('F: propagates a savepoint release failure and rolls back the ERP marker and event', async () => {
    const id = `release-fail-${randomUUID()}`; ids.push(id);
    await expect(executeCase(id, 'RELEASE')).rejects.toThrow();
    expect(await state(id)).toEqual({ markerCount: 0, eventCount: 0 });
  });

  it('replays a dead letter once, persists its audit, and creates one downstream job', async () => {
    replayRequestId = `phase2-replay:${randomUUID()}`;
    const event = await prisma.domainEventOutbox.create({ data: {
      aggregateType: 'Vendor', aggregateId: 'vendor-replay-test', eventType: 'VENDOR_CHANGED',
      payload: { eventVersion: 1, entityType: 'Vendor', entityId: 'vendor-replay-test', occurredAt: new Date().toISOString(), metadata: { status: 'ACTIVE' } },
      status: 'DEAD_LETTER', attempts: 10, idempotencyKey: `phase2-replay:${randomUUID()}`, correlationId: replayRequestId,
    } });
    replayEventId = event.id;

    const outbox = new DomainEventOutboxService(prisma);
    await expect(outbox.replay(event.id, null as any, replayRequestId)).resolves.toMatchObject({ kind: 'REPLAYED', eventId: event.id });
    await expect(outbox.replay(event.id, null as any, replayRequestId)).resolves.toMatchObject({ kind: 'NOT_DEAD_LETTER' });
    expect(await prisma.auditLog.count({ where: { requestId: replayRequestId, action: 'intelligence.event.replay', resourceId: event.id } })).toBe(1);

    const worker = new IntelligenceWorkerService(prisma, {} as any, {} as any, {} as any, 'phase2-replay-test');
    await worker.drainEvents();
    await worker.drainEvents();
    expect(await prisma.intelligenceJob.count({ where: { eventId: event.id, idempotencyKey: `event:${event.id}:PROCUREMENT` } })).toBe(1);
    expect(await prisma.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'COMPLETED' });
  });
});
