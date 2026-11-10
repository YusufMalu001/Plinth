import { IntelligenceWorkerService } from '../workers/intelligence-worker.service';
import { domainEventOutboxService } from '../services/domain-event-outbox.service';
import { modernReorderEvaluatorService } from '../../inventory/services/modern-reorder-evaluator.service';

describe('intelligence event fan-out', () => {
  const event = {
    id: 'event-1', aggregateType: 'PurchaseOrder', aggregateId: 'po-1', eventType: 'PO_CREATED',
    payload: { eventVersion: 1, entityType: 'PurchaseOrder', entityId: 'po-1', occurredAt: '2026-09-30T12:00:00.000Z', metadata: { status: 'DRAFT', vendorId: 'vendor-1' } },
    attempts: 0, correlationId: 'request-1', createdAt: new Date('2026-09-30T12:00:00.000Z'),
  };

  function setup(rows = [event]) {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue(rows),
      domainEventOutbox: { updateMany: jest.fn().mockResolvedValue({ count: rows.length }), update: jest.fn().mockResolvedValue({}) },
      intelligenceJob: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const db: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn((callback: (arg: any) => unknown) => callback(tx)),
      domainEventOutbox: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new IntelligenceWorkerService(db, {} as any, {} as any, {} as any);
    return { service, db, tx };
  }

  it('fans out a valid event with the originating correlation ID and stable downstream key', async () => {
    const { service, tx } = setup();
    await service.drainEvents();
    expect(tx.intelligenceJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'event:event-1:PROCUREMENT' },
      create: expect.objectContaining({ correlationId: 'request-1', eventId: 'event-1' }),
    }));
  });

  it('marks malformed and unknown event types dead letter without creating jobs', async () => {
    const malformed = { ...event, payload: { ...event.payload, eventVersion: 9 } };
    const { service, db, tx } = setup([malformed]);
    await service.drainEvents();
    expect(db.domainEventOutbox.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'event-1' }, data: expect.objectContaining({ status: 'DEAD_LETTER', lastErrorCode: 'INVALID_EVENT_PAYLOAD' }) }));
    expect(tx.intelligenceJob.upsert).not.toHaveBeenCalled();
  });

  it('normalizes the legacy fulfillment event alias without forwarding unrelated payload fields', async () => {
    const legacy: any = { ...event, eventType: 'FULFILLMENT_DISPATCHED', aggregateType: 'SalesShipment', aggregateId: 'shipment-1', payload: { shipmentId: 'shipment-1', status: 'HANDED_OVER', customerEmail: 'private@example.invalid' } };
    const { service, tx } = setup([legacy]);
    await service.drainEvents();
    const forwarded = tx.intelligenceJob.upsert.mock.calls[0][0].create.payload;
    expect(forwarded).toMatchObject({ eventVersion: 1, entityType: 'SalesShipment', entityId: 'shipment-1', metadata: { status: 'HANDED_OVER' } });
    expect(JSON.stringify(forwarded)).not.toContain('private@example.invalid');
  });

  it('uses the same downstream idempotency identity when an event is delivered twice', async () => {
    const { service, tx } = setup();
    await service.drainEvents();
    await service.drainEvents();
    const keys = tx.intelligenceJob.upsert.mock.calls.map(([arg]: any[]) => arg.where.idempotencyKey);
    expect(keys).toEqual(['event:event-1:PROCUREMENT', 'event:event-1:PROCUREMENT']);
  });

  it('evaluates replenishment after every committed modern inventory posting event', async () => {
    const inventoryEvent: any = {
      ...event,
      aggregateType: 'InventoryLedgerEntry',
      aggregateId: 'ledger-1',
      eventType: 'INVENTORY_POSTED',
      payload: {
        eventVersion: 1,
        entityType: 'InventoryLedgerEntry',
        entityId: 'ledger-1',
        occurredAt: '2026-09-30T12:00:00.000Z',
        itemType: 'MATERIAL',
        itemId: 'material-1',
        locationId: 'warehouse-1',
        movementType: 'ISSUE',
        sourceType: 'PRODUCTION',
        sourceId: 'plan-1',
      },
    };
    const evaluate = jest.spyOn(modernReorderEvaluatorService, 'evaluateItem').mockResolvedValue(undefined);
    const { service } = setup([inventoryEvent]);

    await service.drainEvents();

    expect(evaluate).toHaveBeenCalledWith('MATERIAL', 'material-1', 'warehouse-1');
  });

  it('bounds fan-out retry attempts and dead-letters the final failure', async () => {
    const lastAttempt = { ...event, attempts: 9 };
    const { service, db, tx } = setup([lastAttempt]);
    tx.intelligenceJob.upsert.mockRejectedValue(new Error('sensitive database detail'));
    await service.drainEvents();
    expect(db.domainEventOutbox.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event-1' },
      data: expect.objectContaining({ status: 'DEAD_LETTER', attempts: 10, lastErrorCode: 'EVENT_FANOUT_FAILED' }),
    }));
    expect(db.domainEventOutbox.update.mock.calls[0][0].data.lastError).not.toContain('sensitive database detail');
  });

  it('runs stale event claim recovery before claiming pending events after a worker restart', async () => {
    const { service, db } = setup([]);
    await service.drainEvents();
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('generates one deterministic delayed-fulfillment event per fulfillment promise', async () => {
    const promisedShipAt = new Date('2026-09-30T10:00:00.000Z');
    const db: any = { salesFulfillment: { findMany: jest.fn().mockResolvedValue([{ id: 'fulfillment-1', salesOrderId: 'order-1', status: 'PICKING', promisedShipAt }]) } };
    const publish = jest.spyOn(domainEventOutboxService, 'publish').mockResolvedValue({} as any);
    try {
      const service = new IntelligenceWorkerService(db, {} as any, {} as any, {} as any);
      await service.enqueueDelayedFulfillmentEvents(new Date('2026-09-30T12:00:00.000Z'));
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'FULFILLMENT_DELAYED', idempotencyKey: `FULFILLMENT_DELAYED:fulfillment-1:${promisedShipAt.toISOString()}`,
        correlationId: `scan:FULFILLMENT_DELAYED:fulfillment-1:${promisedShipAt.toISOString()}`,
      }));
    } finally {
      publish.mockRestore();
    }
  });
});
