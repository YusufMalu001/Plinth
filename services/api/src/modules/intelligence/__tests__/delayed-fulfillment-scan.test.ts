import { randomUUID } from 'crypto';
import { IntelligenceWorkerService } from '../workers/intelligence-worker.service';
import { IntelligenceCaseService } from '../services/intelligence-case.service';
import { domainEventOutboxService } from '../services/domain-event-outbox.service';

describe('Delayed Fulfillment Scheduled / Background Scan', () => {
  const store = {
    fulfillments: new Map<string, any>(),
    outbox: new Map<string, any>(),
    jobs: new Map<string, any>(),
    cases: new Map<string, any>(),
    caseObservations: new Map<string, any>(),
  };

  const db: any = {
    $transaction: async (fn: any) => fn(db),

    salesFulfillment: {
      findMany: async (args: any) => {
        const res: any[] = [];
        for (const row of store.fulfillments.values()) {
          if (args.where?.promisedShipAt?.lt && row.promisedShipAt >= args.where.promisedShipAt.lt) continue;
          if (args.where?.status?.notIn && args.where.status.notIn.includes(row.status)) continue;
          res.push(row);
        }
        return res;
      },
    },

    domainEventOutbox: {
      upsert: async (args: any) => {
        let row = null;
        for (const r of store.outbox.values()) {
          if (args.where?.idempotencyKey && r.idempotencyKey === args.where.idempotencyKey) {
            row = r;
            break;
          }
        }
        if (!row) {
          const id = `ev-${randomUUID()}`;
          row = { id, attempts: 0, status: 'PENDING', nextAttemptAt: new Date(), ...args.create, createdAt: new Date() };
          store.outbox.set(id, row);
        } else if (args.update) {
          Object.assign(row, args.update);
        }
        return row;
      },
      create: async (args: any) => {
        const id = `ev-${randomUUID()}`;
        const row = { id, attempts: 0, status: 'PENDING', nextAttemptAt: new Date(), ...args.data, createdAt: new Date() };
        store.outbox.set(id, row);
        return row;
      },
      findUnique: async (args: any) => {
        for (const row of store.outbox.values()) {
          if (args.where?.idempotencyKey && row.idempotencyKey === args.where.idempotencyKey) return row;
        }
        return null;
      },
      update: async (args: any) => {
        const row = store.outbox.get(args.where.id);
        if (row) Object.assign(row, args.data);
        return row;
      },
      updateMany: async (args: any) => {
        for (const id of args.where.id.in) {
          const row = store.outbox.get(id);
          if (row) Object.assign(row, args.data);
        }
        return { count: args.where.id.in.length };
      },
    },

    intelligenceJob: {
      upsert: async (args: any) => {
        const existing = store.jobs.get(args.where.idempotencyKey);
        if (existing) return existing;
        const id = `job-${randomUUID()}`;
        const row = { id, ...args.create, attempts: 0, status: 'PENDING', createdAt: new Date() };
        store.jobs.set(args.where.idempotencyKey, row);
        return row;
      },
    },

    intelligenceCase: {
      upsert: async (args: any) => {
        let row = store.cases.get(args.where.dedupeKey);
        if (!row) {
          row = { id: `case-${randomUUID()}`, ...args.create, status: 'OPEN', createdAt: new Date() };
          store.cases.set(args.where.dedupeKey, row);
          store.cases.set(row.id, row);
        } else {
          Object.assign(row, args.update);
        }
        return row;
      },
    },
  };

  // Wire domainEventOutboxService to use this db
  (domainEventOutboxService as any).db = db;

  const mockOrchestrator: any = {
    enqueue: jest.fn(),
    process: jest.fn(),
  };

  const worker = new IntelligenceWorkerService(db, mockOrchestrator);

  it('scans overdue shipments, generates FULFILLMENT_DELAYED events, and fans out to jobs', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const pastPromised = new Date('2026-09-30T10:00:00.000Z');
    const futurePromised = new Date('2026-10-02T10:00:00.000Z');

    // 1. Overdue shipment (should trigger)
    store.fulfillments.set('ful-1', {
      id: 'ful-1',
      salesOrderId: 'so-1',
      status: 'ALLOCATED',
      promisedShipAt: pastPromised,
    });

    // 2. Completed shipment (should NOT trigger)
    store.fulfillments.set('ful-2', {
      id: 'ful-2',
      salesOrderId: 'so-2',
      status: 'COMPLETED',
      promisedShipAt: pastPromised,
    });

    // 3. Future shipment (should NOT trigger)
    store.fulfillments.set('ful-3', {
      id: 'ful-3',
      salesOrderId: 'so-3',
      status: 'ALLOCATED',
      promisedShipAt: futurePromised,
    });

    // Execute scan
    const scannedCount = await worker.enqueueDelayedFulfillmentEvents(now);
    expect(scannedCount).toBe(1);

    // Verify outbox entry
    const outboxEvents = Array.from(store.outbox.values());
    expect(outboxEvents.length).toBe(1);
    expect(outboxEvents[0].eventType).toBe('FULFILLMENT_DELAYED');
    expect(outboxEvents[0].aggregateId).toBe('ful-1');
    expect(outboxEvents[0].payload.metadata.salesOrderId).toBe('so-1');

    // Process outbox events
    db.$queryRaw = async () => [
      {
        id: outboxEvents[0].id,
        aggregateType: outboxEvents[0].aggregateType,
        aggregateId: outboxEvents[0].aggregateId,
        eventType: outboxEvents[0].eventType,
        payload: outboxEvents[0].payload,
        attempts: 0,
        correlationId: outboxEvents[0].correlationId,
        createdAt: outboxEvents[0].createdAt,
      },
    ];

    db.$executeRaw = async () => 0;
    await worker.drainEvents();

    // Verify job created for FULFILLMENT module
    const jobs = Array.from(store.jobs.values());
    expect(jobs.length).toBe(1);
    expect(jobs[0].module).toBe('FULFILLMENT');
    expect(jobs[0].trigger).toBe('EVENT');

    // Now verify detector creates IntelligenceCase for DELAYED_FULFILLMENT
    const caseService = new IntelligenceCaseService(db);
    const snapshot: any = {
      id: 'snap-ful-1',
      module: 'FULFILLMENT',
      metricVersion: 'v1.0',
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date(),
      data: {
        module: 'FULFILLMENT',
        metricVersion: 'v1.0',
        periodStart: now.toISOString(),
        periodEnd: now.toISOString(),
        metrics: [
          {
            key: 'fulfillment.on_time_dispatch_rate',
            value: 0.82,
            unit: 'RATE',
            provenance: 'CALCULATED',
            freshnessStatus: 'FRESH',
            dataQualityScore: 1,
            sourceRefs: [{ resource: 'SalesFulfillment' }],
          },
        ],
        opportunities: [
          {
            id: 'fulfillment-late:ful-1',
            category: 'DELAYED_FULFILLMENT',
            actionCode: 'fulfillment.remedy_delay_action',
            title: 'Overdue shipment pending dispatch',
            situation: 'Shipment promised on 2026-09-30 is delayed past SLA.',
            targetResource: 'SalesFulfillment',
            targetResourceId: 'ful-1',
            delayedShipmentCount: 14,
            averageDelayDays: 2.8,
            customerImpactCount: 10,
            slaBreachExposure: 17500,
            metricKeys: ['fulfillment.on_time_dispatch_rate'],
            expectedImpact: { low: 10000, base: 17500, high: 25000, unit: 'INR', horizonDays: 7 },
          },
        ],
        notices: [],
      },
    };

    const caseResults = await caseService.detect(snapshot);
    const delayedFinding = caseResults.find((r) => r.detectorKey === 'DELAYED_FULFILLMENT');
    expect(delayedFinding).toBeDefined();
    expect(delayedFinding?.createdOrUpdated).toBe(1);

    // Verify persisted case
    const createdCases = Array.from(store.cases.values());
    const caseRecord = createdCases.find((c) => c.detectorKey === 'DELAYED_FULFILLMENT');
    expect(caseRecord).toBeDefined();
    expect(caseRecord.entityType).toBe('SalesFulfillment');
    expect(caseRecord.entityId).toBe('ful-1');
    expect(caseRecord.evidence.delayedShipmentCount).toBe(14);
    expect(caseRecord.evidence.slaBreachExposure).toBe(17500);
    expect(caseRecord.evidence.averageDelayDays).toBe(2.8);
  });
});
