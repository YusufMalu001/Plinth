import type { SalesShipmentMode, SalesShipmentStatus } from './fulfillment.types';

export interface AdapterShipmentRequest {
  shipmentId: string;
  shipmentNumber: string;
  mode: SalesShipmentMode;
  recipient: { name: string; phone?: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string };
  packages: Array<{ packageNumber: string; barcode: string; grossWeightKg: number; lengthCm?: number; widthCm?: number; heightCm?: number }>;
  codAmount: number;
  pickupScheduledAt?: string;
}

export interface AdapterShipmentResult {
  externalShipmentId: string;
  awbNumber: string;
  labelUrl?: string;
  rawReference?: unknown;
}

export interface AdapterTrackingEvent {
  externalId: string;
  status: SalesShipmentStatus;
  eventAt: string;
  location?: string;
  message?: string;
  rawReference?: unknown;
}

/** Provider-specific courier implementations conform to this stable boundary. */
export interface SalesCarrierAdapter {
  readonly key: string;
  createShipment(input: AdapterShipmentRequest): Promise<AdapterShipmentResult>;
  cancelShipment(externalShipmentId: string, reason: string): Promise<void>;
  getLabel(externalShipmentId: string): Promise<{ url: string }>;
  track(externalShipmentId: string): Promise<AdapterTrackingEvent[]>;
}

/** Amazon and E-trade status push implementations use the same retryable outbox. */
export interface SalesChannelFulfillmentAdapter {
  readonly key: string;
  pushFulfillmentStatus(input: { eventType: string; aggregateId: string; payload: unknown; idempotencyKey: string }): Promise<void>;
}

export class FulfillmentAdapterRegistry {
  private readonly carrierAdapters = new Map<string, SalesCarrierAdapter>();
  private readonly channelAdapters = new Map<string, SalesChannelFulfillmentAdapter>();

  registerCarrier(adapter: SalesCarrierAdapter) { this.carrierAdapters.set(adapter.key, adapter); }
  registerChannel(adapter: SalesChannelFulfillmentAdapter) { this.channelAdapters.set(adapter.key, adapter); }
  carrier(key: string) { return this.carrierAdapters.get(key); }
  channel(key: string) { return this.channelAdapters.get(key); }
}
