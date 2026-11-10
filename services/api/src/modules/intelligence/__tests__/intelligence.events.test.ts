import { validateIntelligenceEvent } from '../intelligence.events';
import { publishIntelligenceEvent } from '../intelligence.events';
import { config } from '../../../config';
import { domainEventOutboxService } from '../services/domain-event-outbox.service';

describe('versioned intelligence event contract', () => {
  const valid = {
    eventVersion: 1,
    entityType: 'SalesOrder',
    entityId: 'order-1',
    occurredAt: '2026-09-30T12:00:00.000Z',
    metadata: { status: 'DISPATCHED', currency: 'INR' },
  };

  it('accepts a valid version 1 allowlisted payload', () => {
    expect(validateIntelligenceEvent('SALES_ORDER_FULFILLED', valid).success).toBe(true);
    expect(validateIntelligenceEvent('INVENTORY_POSTED', { eventVersion: 1, entityType: 'InventoryLedgerEntry', entityId: 'ledger-1', occurredAt: valid.occurredAt, itemType: 'PRODUCT', itemId: 'product-1', locationId: 'warehouse-1', movementType: 'ISSUE', sourceType: 'SALES_ORDER', sourceId: 'order-1' }).success).toBe(true);
  });

  it('rejects unsupported versions, unknown event types, and unsafe payload keys', () => {
    expect(validateIntelligenceEvent('SALES_ORDER_FULFILLED', { ...valid, eventVersion: 2 })).toMatchObject({ success: false, reason: 'INVALID_EVENT_PAYLOAD' });
    expect(validateIntelligenceEvent('UNREGISTERED', valid)).toMatchObject({ success: false, reason: 'UNKNOWN_EVENT_TYPE' });
    expect(validateIntelligenceEvent('SALES_ORDER_FULFILLED', { ...valid, metadata: { ...valid.metadata, customerEmail: 'private@example.invalid' } })).toMatchObject({ success: false, reason: 'PAYLOAD_KEY_NOT_ALLOWED' });
    expect(validateIntelligenceEvent('SALES_ORDER_FULFILLED', { ...valid, prompt: 'private' })).toMatchObject({ success: false, reason: 'INVALID_EVENT_PAYLOAD' });
  });

  it('accepts only versioned, allowlisted compatibility aliases after normalization', () => {
    expect(validateIntelligenceEvent('FULFILLMENT_DISPATCHED', { ...valid, metadata: { salesOrderId: 'order-1', status: 'DISPATCHED' } }).success).toBe(true);
    expect(validateIntelligenceEvent('FULFILLMENT_DISPATCHED', { ...valid, eventVersion: 3 })).toMatchObject({ success: false, reason: 'INVALID_EVENT_PAYLOAD' });
  });

  it('writes a bounded event through the source transaction with the original correlation and stable transition identity', async () => {
    const original = { enabled: config.intelligence.enabled, eventTriggersEnabled: config.intelligence.eventTriggersEnabled };
    const publish = jest.spyOn(domainEventOutboxService, 'publish').mockResolvedValue({} as any);
    config.intelligence.enabled = true;
    config.intelligence.eventTriggersEnabled = true;
    const transaction = { $executeRaw: jest.fn().mockResolvedValue(1) } as any;
    try {
      await publishIntelligenceEvent(transaction, { type: 'VENDOR_CHANGED', entityType: 'Vendor', entityId: 'vendor-1', correlationId: 'request-7', transitionId: '2026-09-30T12:00:00.000Z', metadata: { status: 'APPROVED' } });
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'VENDOR_CHANGED', correlationId: 'request-7', idempotencyKey: 'VENDOR_CHANGED:vendor-1:2026-09-30T12:00:00.000Z',
        payload: expect.objectContaining({ eventVersion: 1, entityId: 'vendor-1', metadata: { status: 'APPROVED' } }),
      }), transaction);
      expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
    } finally {
      publish.mockRestore();
      config.intelligence.enabled = original.enabled;
      config.intelligence.eventTriggersEnabled = original.eventTriggersEnabled;
    }
  });

  it.each([
    ['VENDOR_CHANGED', 'Vendor', 'vendor-2', { status: 'ACTIVE' }],
    ['PRICE_CHANGED', 'Product', 'product-2', { productId: 'product-2', status: 'ACTIVE' }],
    ['PRODUCTION_PLANNED', 'ProductionPlan', 'plan-2', { status: 'DRAFT', productId: 'product-2', quantity: 3 }],
    ['PRODUCTION_STARTED', 'ProductionPlan', 'plan-2', { fromStatus: 'RELEASED', status: 'IN_PROGRESS', productId: 'product-2', quantity: 3 }],
    ['PRODUCTION_COMPLETED', 'ProductionPlan', 'plan-2', { fromStatus: 'IN_PROGRESS', status: 'COMPLETED', productId: 'product-2', quantity: 3 }],
    ['PRODUCTION_CANCELLED', 'ProductionPlan', 'plan-2', { fromStatus: 'DRAFT', status: 'CANCELLED', productId: 'product-2', quantity: 3 }],
    ['PRODUCTION_QUANTITY_CHANGED', 'ProductionPlan', 'plan-2', { fromStatus: 'DRAFT', status: 'DRAFT', productId: 'product-2', quantity: 4 }],
    ['INVENTORY_THRESHOLD_CHANGED', 'ReplenishmentPolicy', 'policy-2', { itemType: 'PRODUCT', itemId: 'product-2', locationId: 'warehouse-2', isActive: true, reorderPoint: 4, safetyStock: 2, leadTimeDays: 5 }],
  ] as const)('publishes the %s source transition through the caller transaction', async (type, entityType, entityId, metadata) => {
    const original = { enabled: config.intelligence.enabled, eventTriggersEnabled: config.intelligence.eventTriggersEnabled };
    const publish = jest.spyOn(domainEventOutboxService, 'publish').mockResolvedValue({} as any);
    const transaction = { $executeRaw: jest.fn().mockResolvedValue(1) } as any;
    config.intelligence.enabled = true;
    config.intelligence.eventTriggersEnabled = true;
    try {
      await publishIntelligenceEvent(transaction, { type, entityType, entityId, correlationId: 'source-request', transitionId: 'transition-2', metadata: metadata as any });
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({
        eventType: type,
        aggregateType: entityType,
        aggregateId: entityId,
        correlationId: 'source-request',
        idempotencyKey: `${type}:${entityId}:transition-2`,
        payload: expect.objectContaining({ eventVersion: 1, entityType, entityId }),
      }), transaction);
    } finally {
      publish.mockRestore();
      config.intelligence.enabled = original.enabled;
      config.intelligence.eventTriggersEnabled = original.eventTriggersEnabled;
    }
  });

  it('does not publish when the feature switches are disabled', async () => {
    const original = { enabled: config.intelligence.enabled, eventTriggersEnabled: config.intelligence.eventTriggersEnabled };
    const publish = jest.spyOn(domainEventOutboxService, 'publish').mockResolvedValue({} as any);
    config.intelligence.enabled = false;
    config.intelligence.eventTriggersEnabled = false;
    try {
      await expect(publishIntelligenceEvent({} as any, { type: 'VENDOR_CHANGED', entityType: 'Vendor', entityId: 'vendor-3' })).resolves.toBeNull();
      expect(publish).not.toHaveBeenCalled();
    } finally {
      publish.mockRestore();
      config.intelligence.enabled = original.enabled;
      config.intelligence.eventTriggersEnabled = original.eventTriggersEnabled;
    }
  });

  it('rolls back a failed outbox write to its savepoint and propagates the failure to the ERP transaction', async () => {
    const original = { enabled: config.intelligence.enabled, eventTriggersEnabled: config.intelligence.eventTriggersEnabled };
    const publish = jest.spyOn(domainEventOutboxService, 'publish').mockRejectedValue(new Error('database unavailable'));
    const transaction = { $executeRaw: jest.fn().mockResolvedValue(1) } as any;
    config.intelligence.enabled = true;
    config.intelligence.eventTriggersEnabled = true;
    try {
      await expect(publishIntelligenceEvent(transaction, { type: 'VENDOR_CHANGED', entityType: 'Vendor', entityId: 'vendor-1', correlationId: 'request-8', transitionId: 'transition-1', metadata: { status: 'ACTIVE' } })).rejects.toThrow('database unavailable');
      expect(transaction.$executeRaw).toHaveBeenCalledTimes(3);
      expect(publish).toHaveBeenCalled();
    } finally {
      publish.mockRestore();
      config.intelligence.enabled = original.enabled;
      config.intelligence.eventTriggersEnabled = original.eventTriggersEnabled;
    }
  });
});
