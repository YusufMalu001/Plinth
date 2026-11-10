import { DomainEventOutbox, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { config } from '../../config';
import { logger } from '../../common/utils/logger';
import { domainEventOutboxService } from './services/domain-event-outbox.service';

export const intelligenceEventTypes = [
  'SALES_ORDER_CREATED', 'SALES_ORDER_CONFIRMED', 'SALES_ORDER_CHANGED', 'SALES_ORDER_CANCELLED', 'SALES_ORDER_FULFILLED',
  'SALES_RETURN_REQUESTED', 'SALES_RETURN_CREDIT_COMPLETED',
  'PO_CREATED', 'PO_APPROVED', 'PO_CHANGED', 'PO_CANCELLED', 'GOODS_RECEIPT_FINALIZED',
  'INVENTORY_POSTED', 'INVENTORY_THRESHOLD_CHANGED',
  'PRODUCTION_PLANNED', 'PRODUCTION_STARTED', 'PRODUCTION_COMPLETED', 'PRODUCTION_CANCELLED', 'PRODUCTION_QUANTITY_CHANGED',
  'SHIPMENT_CREATED', 'SHIPMENT_DISPATCHED', 'SHIPMENT_DELIVERED', 'SHIPMENT_CANCELLED',
  'VENDOR_CHANGED', 'VENDOR_SCORECARD_ACTIVATED', 'PRICE_CHANGED', 'FULFILLMENT_DELAYED',
] as const;

export type IntelligenceEventType = typeof intelligenceEventTypes[number];
type Tx = Omit<Prisma.TransactionClient, '$executeRaw' | '$executeRawUnsafe' | '$queryRaw' | '$queryRawUnsafe' | '$runCommandRaw'>;

const metadataKeys: Record<IntelligenceEventType, readonly string[]> = {
  SALES_ORDER_CREATED: ['status', 'currency'], SALES_ORDER_CONFIRMED: ['status', 'currency'], SALES_ORDER_CHANGED: ['status', 'currency'], SALES_ORDER_CANCELLED: ['status', 'currency'], SALES_ORDER_FULFILLED: ['status', 'currency'],
  SALES_RETURN_REQUESTED: ['salesOrderId', 'currency', 'status'], SALES_RETURN_CREDIT_COMPLETED: ['salesOrderId', 'currency', 'status', 'hasNetCredit'],
  PO_CREATED: ['status', 'vendorId'], PO_APPROVED: ['status', 'vendorId'], PO_CHANGED: ['status', 'vendorId'], PO_CANCELLED: ['status', 'vendorId'], GOODS_RECEIPT_FINALIZED: ['status', 'locationId'],
  INVENTORY_POSTED: ['itemType', 'itemId', 'locationId', 'movementType', 'sourceType', 'sourceId'], INVENTORY_THRESHOLD_CHANGED: ['itemType', 'itemId', 'locationId', 'isActive', 'reorderPoint', 'safetyStock', 'leadTimeDays'],
  PRODUCTION_PLANNED: ['status', 'productId', 'quantity'], PRODUCTION_STARTED: ['fromStatus', 'status', 'productId', 'quantity'], PRODUCTION_COMPLETED: ['fromStatus', 'status', 'productId', 'quantity'], PRODUCTION_CANCELLED: ['fromStatus', 'status', 'productId', 'quantity'], PRODUCTION_QUANTITY_CHANGED: ['status', 'fromStatus', 'productId', 'quantity'],
  SHIPMENT_CREATED: ['salesOrderId', 'status'], SHIPMENT_DISPATCHED: ['salesOrderId', 'status'], SHIPMENT_DELIVERED: ['salesOrderId', 'status'], SHIPMENT_CANCELLED: ['salesOrderId', 'status'], FULFILLMENT_DELAYED: ['salesOrderId', 'status', 'promisedShipAt'],
  VENDOR_CHANGED: ['status'], VENDOR_SCORECARD_ACTIVATED: ['name', 'version', 'status'], PRICE_CHANGED: ['pricingMasterId', 'productId', 'status'],
};
const primitive = z.union([z.string().max(160), z.number().finite(), z.boolean(), z.null()]);
const eventEnvelopeSchema = z.object({
  eventVersion: z.literal(1), entityType: z.string().min(1).max(80), entityId: z.string().min(1).max(160),
  occurredAt: z.string().datetime(), metadata: z.record(z.string(), primitive).optional(),
  itemType: primitive.optional(), itemId: primitive.optional(), locationId: primitive.optional(), movementType: primitive.optional(), sourceType: primitive.optional(), sourceId: primitive.optional(),
}).strict();

export function validateIntelligenceEvent(eventType: string, payload: unknown) {
  const legacyAliases: Record<string, IntelligenceEventType> = {
    FULFILLMENT_DISPATCHED: 'SHIPMENT_DISPATCHED', INVENTORY_MOVEMENT_POSTED: 'INVENTORY_POSTED', STOCK_MOVEMENT_POSTED: 'INVENTORY_POSTED', INVENTORY_RECEIPT: 'INVENTORY_POSTED', INVENTORY_ISSUE: 'INVENTORY_POSTED', INVENTORY_ADJUSTMENT: 'INVENTORY_POSTED', INVENTORY_TRANSFER: 'INVENTORY_POSTED', INVENTORY_RETURN: 'INVENTORY_POSTED', INVENTORY_PRODUCTION_ISSUE: 'INVENTORY_POSTED', INVENTORY_PRODUCTION_OUTPUT: 'INVENTORY_POSTED',
  };
  const canonicalType = legacyAliases[eventType] ?? eventType;
  if (!(intelligenceEventTypes as readonly string[]).includes(canonicalType)) return { success: false as const, reason: 'UNKNOWN_EVENT_TYPE' };
  const parsed = eventEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return { success: false as const, reason: 'INVALID_EVENT_PAYLOAD' };
  const allowed = new Set(metadataKeys[canonicalType as IntelligenceEventType]);
  const topLevelMetadata = Object.keys(parsed.data).filter((key) => !['eventVersion', 'entityType', 'entityId', 'occurredAt', 'metadata'].includes(key));
  if (Object.keys(parsed.data.metadata ?? {}).some((key) => !allowed.has(key)) || topLevelMetadata.some((key) => !allowed.has(key))) return { success: false as const, reason: 'PAYLOAD_KEY_NOT_ALLOWED' };
  return { success: true as const, data: parsed.data };
}

/** Publishes only allowlisted identifiers and state metadata in the source transaction. */
export async function publishIntelligenceEvent(
  tx: Tx,
  input: { type: IntelligenceEventType; entityType: string; entityId: string; correlationId?: string; occurredAt?: Date; transitionId?: string; metadata?: Record<string, string | number | boolean | null> },
): Promise<DomainEventOutbox | null> {
  if (!config.intelligence.enabled || !config.intelligence.eventTriggersEnabled) return null;
  const occurredAt = input.occurredAt ?? new Date();
  const metadata = input.metadata ?? {};
  if (Object.keys(metadata).some((key) => !metadataKeys[input.type].includes(key))) throw new Error('Intelligence event metadata contains a non-allowlisted key.');
  const base = { eventVersion: 1 as const, entityType: input.entityType, entityId: input.entityId, occurredAt: occurredAt.toISOString() };
  // INVENTORY_POSTED was already consumed with a flat payload by worker and
  // integration code. Preserve that contract while retaining strict schema.
  const payload = input.type === 'INVENTORY_POSTED' ? { ...base, ...metadata } : { ...base, ...(Object.keys(metadata).length ? { metadata } : {}) };
  const checked = validateIntelligenceEvent(input.type, payload);
  if (!checked.success) {
    logger.warn('Intelligence event rejected by payload validation.', { requestId: input.correlationId, errorCode: checked.reason });
    throw new Error(`Required intelligence event payload rejected: ${checked.reason}`);
  }
  // Payload fingerprint is stable across retries; source updates should supply
  // a persisted transitionId (for example updatedAt or a status-history ID).
  const identity = input.transitionId ?? createHash('sha256').update(JSON.stringify({ type: input.type, entityType: input.entityType, entityId: input.entityId, metadata })).digest('hex');
  const transaction = tx as unknown as Prisma.TransactionClient;
  await transaction.$executeRaw`SAVEPOINT synergy_intelligence_outbox`;
  try {
    const event = await domainEventOutboxService.publish({
      aggregateType: input.entityType,
      aggregateId: input.entityId,
      eventType: input.type,
      idempotencyKey: `${input.type}:${input.entityId}:${identity}`.slice(0, 180),
      correlationId: input.correlationId,
      payload,
    }, tx as unknown as Parameters<typeof domainEventOutboxService.publish>[1]);
    await transaction.$executeRaw`RELEASE SAVEPOINT synergy_intelligence_outbox`;
    return event;
  } catch (error) {
    try {
      await transaction.$executeRaw`ROLLBACK TO SAVEPOINT synergy_intelligence_outbox`;
      await transaction.$executeRaw`RELEASE SAVEPOINT synergy_intelligence_outbox`;
    } catch (recoveryError) {
      logger.error('Intelligence outbox savepoint recovery failed; aborting the source ERP transaction.', { requestId: input.correlationId, errorCode: 'INTELLIGENCE_OUTBOX_RECOVERY_FAILED' });
      throw recoveryError;
    }
    logger.error('Required intelligence outbox write failed; aborting the source ERP transaction to preserve event atomicity.', { requestId: input.correlationId, errorCode: 'INTELLIGENCE_OUTBOX_WRITE_FAILED' });
    throw error;
  }
}
