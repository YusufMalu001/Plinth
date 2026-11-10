import { DomainEventOutboxService } from '../services/domain-event-outbox.service';

describe('audited domain event replay', () => {
  it('resets a dead-letter event and records its audit row in the same transaction', async () => {
    const tx: any = {
      domainEventOutbox: {
        findUnique: jest.fn().mockResolvedValue({ id: 'event-1', status: 'DEAD_LETTER', attempts: 10, lastErrorCode: 'EVENT_FANOUT_FAILED', correlationId: 'corr-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const db: any = { $transaction: jest.fn((callback: (arg: any) => unknown) => callback(tx)) };
    const result = await new DomainEventOutboxService(db).replay('event-1', 'user-1', 'request-1');
    expect(result).toEqual({ kind: 'REPLAYED', eventId: 'event-1', correlationId: 'corr-1' });
    expect(tx.domainEventOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'event-1', status: 'DEAD_LETTER' }, data: expect.objectContaining({ status: 'PENDING', attempts: 0 }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', action: 'intelligence.event.replay', resourceId: 'event-1', requestId: 'request-1' }) }));
  });

  it('refuses to replay an event unless it is dead-lettered', async () => {
    const tx: any = { domainEventOutbox: { findUnique: jest.fn().mockResolvedValue({ id: 'event-1', status: 'PENDING' }) } };
    const db: any = { $transaction: jest.fn((callback: (arg: any) => unknown) => callback(tx)) };
    expect(await new DomainEventOutboxService(db).replay('event-1', 'user-1', 'request-1')).toEqual({ kind: 'NOT_DEAD_LETTER' });
  });
});
