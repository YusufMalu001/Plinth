import { fetchApi } from '../api/client';
import type { Carrier, Fulfillment, FulfillmentOverview, FulfillmentStage, Shipment, ShipmentMode } from './types';

export const fulfillmentApi = {
  overview: () => fetchApi<FulfillmentOverview>('/fulfillment/overview'),
  list: (params: { page?: number; limit?: number; stage?: FulfillmentStage; channel?: string; warehouseLocationId?: string; search?: string }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => value !== undefined && value !== '' && query.set(key, String(value)));
    return fetchApi<{ items: Fulfillment[]; total: number; page: number; limit: number }>(`/fulfillment?${query}`);
  },
  get: (id: string) => fetchApi<Fulfillment>(`/fulfillment/${id}`),
  getShipment: (id: string) => fetchApi<Shipment>(`/fulfillment/shipments/${id}`),
  ensureForOrder: (orderId: string) => fetchApi<Fulfillment>(`/fulfillment/orders/${orderId}`, { method: 'POST', body: '{}' }),
  allocate: (id: string) => fetchApi<Fulfillment>(`/fulfillment/${id}/allocate`, { method: 'POST', body: '{}' }),
  startPick: (id: string) => fetchApi(`/fulfillment/pick-lists/${id}/start`, { method: 'POST', body: '{}' }),
  scanPick: (id: string, input: { salesPickItemId: string; scanValue: string; quantity: number; lotId?: string; binCode?: string; overrideReason?: string; discrepancyReason?: string }) => fetchApi(`/fulfillment/pick-lists/${id}/scan`, { method: 'POST', body: JSON.stringify(input) }),
  completePick: (id: string) => fetchApi<Fulfillment>(`/fulfillment/pick-lists/${id}/complete`, { method: 'POST', body: '{}' }),
  createPackage: (id: string, input: unknown) => fetchApi(`/fulfillment/${id}/packages`, { method: 'POST', body: JSON.stringify(input) }),
  sealPackage: (id: string) => fetchApi(`/fulfillment/packages/${id}/seal`, { method: 'POST', body: '{}' }),
  reopenPackage: (id: string) => fetchApi(`/fulfillment/packages/${id}/reopen`, { method: 'POST', body: '{}' }),
  createShipment: (id: string, input: { packageIds: string[]; mode: ShipmentMode; carrierId?: string; carrierServiceId?: string; awbNumber?: string; freightTerms?: string; freightAmount?: number; codAmount?: number; vehicleNumber?: string; driverName?: string; driverPhone?: string; routeNotes?: string; dispatchDock?: string; pickupScheduledAt?: string; expectedDeliveryAt?: string; notes?: string }) => fetchApi<Shipment>(`/fulfillment/${id}/shipments`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(input) }),
  validateShipment: (id: string) => fetchApi<{ ready: boolean; errors: string[]; shipment: Shipment }>(`/fulfillment/shipments/${id}/validate`),
  dispatchShipment: (id: string) => fetchApi<Shipment>(`/fulfillment/shipments/${id}/dispatch`, { method: 'POST', body: '{}' }),
  cancelShipment: (id: string, reason: string) => fetchApi<Shipment>(`/fulfillment/shipments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  addTracking: (id: string, input: unknown) => fetchApi(`/fulfillment/shipments/${id}/events`, { method: 'POST', body: JSON.stringify(input) }),
  deliveryAttempt: (id: string, input: unknown) => fetchApi(`/fulfillment/shipments/${id}/delivery-attempts`, { method: 'POST', body: JSON.stringify(input) }),
  deliver: (id: string, input: unknown) => fetchApi<Shipment>(`/fulfillment/shipments/${id}/deliver`, { method: 'POST', body: JSON.stringify(input) }),
  carriers: () => fetchApi<Carrier[]>('/fulfillment/carriers'),
  createCarrier: (input: Partial<Carrier>) => fetchApi<Carrier>('/fulfillment/carriers', { method: 'POST', body: JSON.stringify(input) }),
  createManifest: (input: unknown) => fetchApi('/fulfillment/manifests', { method: 'POST', body: JSON.stringify(input) }),
  manifests: (page = 1, limit = 5) => fetchApi<{ items: Array<{ id: string; manifestNumber: string; status: string; packageCount: number; totalWeightKg: number | string; vehicleNumber?: string | null; driverName?: string | null; createdAt: string; warehouseLocation: { name: string; code: string }; carrier?: { name: string } | null; shipments: Array<{ shipment: Shipment }> }>; total: number }>(`/fulfillment/manifests/list?page=${page}&limit=${limit}`),
  closeManifest: (id: string) => fetchApi(`/fulfillment/manifests/${id}/close`, { method: 'POST', body: '{}' }),
};
