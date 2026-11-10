/**
 * Module 4 — Inventory & Store Management API client
 *
 * All calls use fetchApi from features/api/client — no @prisma/client imports.
 * Endpoint base: /inventory
 */
import { fetchApi } from '../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StockOwnership = 'OWNED' | 'VENDOR_HELD';
export type StockDirection = 'IN' | 'OUT';
export type StockLedgerEntryType =
  | 'GRN_RECEIPT'
  | 'ISSUE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_INCREASE'
  | 'ADJUSTMENT_DECREASE'
  | 'RETURN_TO_VENDOR'
  | 'STOCK_REVERTED'
  | 'REVERSAL';
export type StockIssueStatus = 'ISSUED' | 'REVERSED';
export type StockTransferStatus = 'REQUESTED' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';
export type StockAdjustmentDirection = 'INCREASE' | 'DECREASE';
export type StockAdjustmentStatus = 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'POSTED';
export type StockReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'CANCELLED';

interface ItemRef {
  isVariant?: boolean;
  parentProductId?: string | null;
  parentMaterialId?: string | null;
  metadata?: Record<string, unknown> | null;
  specs?: Record<string, unknown> | null;
  id: string;
}
interface ProductRef extends ItemRef {
  sku: string;
  name: string;
  description?: string | null;
  status?: string;
  category?: CategoryRef | null;
  uom?: UomRef | null;
}
interface MaterialRef extends ItemRef {
  code: string;
  name: string;
  description?: string | null;
  materialType?: string;
  status?: string;
  category?: CategoryRef | null;
  uom?: UomRef | null;
}
interface UomRef extends ItemRef {
  code: string;
  symbol: string;
}
interface LocationRef extends ItemRef {
  code: string;
  name: string;
}
interface CategoryRef extends ItemRef {
  code: string;
  name: string;
}
interface ActorRef {
  id: string;
  name?: string | null;
  email: string;
}

export interface StockBalance {
  id: string;
  itemType?: 'PRODUCT' | 'MATERIAL' | string;
  itemId?: string;
  itemKey: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  uomId: string;
  uom?: UomRef | null;
  locationId: string;
  location?: LocationRef | null;
  lotId?: string | null;
  lot?: InventoryLot | null;
  condition?: string;
  ownership: StockOwnership;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity?: number;
  available?: number;
  quantity?: number | string;
  reserved?: number | string;
  averageCost?: number | string;
  value?: number | string;
  createdAt: string;
  updatedAt: string;
}

export interface StockLedgerEntry {
  id: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  uomId: string;
  uom?: UomRef | null;
  locationId?: string | null;
  location?: LocationRef | null;
  lotId?: string | null;
  ownership: StockOwnership;
  direction?: StockDirection;
  quantity?: number | string | null;
  /** Legacy ledger shape. Modern inventory rows expose movementType instead. */
  entryType: StockLedgerEntryType;
  movementType?: string;
  quantityDelta?: number | string | null;
  quantityBefore?: number | string | null;
  quantityAfter?: number | string | null;
  totalBalanceBefore?: number | null;
  totalBalanceAfter?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  postedBy?: string | null;
  correlationId?: string | null;
  note?: string | null;
  postedByActorId: string;
  postedByActor?: ActorRef | null;
  postedAt: string;
  grnId?: string | null;
  issueId?: string | null;
  transferId?: string | null;
  adjustmentId?: string | null;
  materialIssueLineId?: string | null;
  reversalOfId?: string | null;
  productionPlan?: {
    id: string;
    planNumber: string;
    status: string;
    quantity: number | string;
    batchIdentity?: string | null;
    product?: ProductRef | null;
  } | null;
  assemblyBatch?: {
    id: string;
    batchNumber: string;
    status: string;
    targetOutputQuantity?: number | string | null;
    product?: ProductRef | null;
  } | null;
  fgReceipt?: {
    id: string;
    receiptNumber: string;
    status: string;
    quantity?: number | string | null;
    product?: ProductRef | null;
  } | null;
  goodsReceipt?: {
    id: string;
    grnNumber: string;
    status?: string | null;
    purchaseOrder?: { id: string; poNumber: string } | null;
  } | null;
  jobWorkChallan?: {
    id: string;
    challanNumber: string;
    vendorId?: string;
    vendor?: { id: string; code: string; name: string } | null;
    jobWorkOrder?: { id: string; orderNumber: string } | null;
  } | null;
  jobWorkReturn?: {
    id: string;
    returnNumber: string;
    goodsReceiptId?: string | null;
    vendorId?: string;
    vendor?: { id: string; code: string; name: string } | null;
    jobWorkOrder?: { id: string; orderNumber: string } | null;
  } | null;
}

export interface StockIssue {
  id: string;
  issueNumber: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  uomId: string;
  uom?: UomRef | null;
  locationId: string;
  location?: LocationRef | null;
  lotId?: string | null;
  ownership: StockOwnership;
  quantity: number;
  reason: string;
  status: StockIssueStatus;
  issuedByActorId: string;
  issuedByActor?: ActorRef | null;
  issuedAt: string;
  reversedByActorId?: string | null;
  reversedByActor?: ActorRef | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  uomId: string;
  uom?: UomRef | null;
  fromLocationId: string;
  fromLocation?: LocationRef | null;
  toLocationId: string;
  toLocation?: LocationRef | null;
  ownership: StockOwnership;
  requestedQuantity: number;
  issuedQuantity?: number | null;
  receivedQuantity?: number | null;
  status: StockTransferStatus;
  requestedByActorId: string;
  requestedByActor?: ActorRef | null;
  requestedAt: string;
  issuedAt?: string | null;
  receivedAt?: string | null;
  cancelledAt?: string | null;
  note?: string | null;
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  uomId: string;
  uom?: UomRef | null;
  locationId: string;
  location?: LocationRef | null;
  ownership: StockOwnership;
  direction: StockAdjustmentDirection;
  quantity: number;
  reason: string;
  status: StockAdjustmentStatus;
  proposedByActorId: string;
  proposedByActor?: ActorRef | null;
  proposedAt: string;
  reviewedByActorId?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  approvedByActorId?: string | null;
  approvedAt?: string | null;
  rejectedByActorId?: string | null;
  rejectedAt?: string | null;
  postedAt?: string | null;
}

export interface StockReservation {
  id: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  uomId: string;
  uom?: UomRef | null;
  locationId: string;
  location?: LocationRef | null;
  ownership: StockOwnership;
  quantity: number;
  reason: string;
  sourceReference?: string | null;
  status: StockReservationStatus;
  reservedByActorId: string;
  reservedByActor?: ActorRef | null;
  reservedAt: string;
  releasedByActorId?: string | null;
  releasedAt?: string | null;
  consumedAt?: string | null;
}

export interface ReorderSignal {
  balanceId: string;
  itemKey: string;
  productId: string | null;
  product?: ProductRef | null;
  materialId: string | null;
  material?: MaterialRef | null;
  locationId: string;
  onHandQuantity: number;
  availableQuantity: number;
  avgDailyConsumption: number;
  daysOfCover: number | null;
  configuredSafetyBuffer: number | null;
  belowSafetyBuffer: boolean | null;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface InventoryItemSummary {
  itemKey: string;
  itemType: 'PRODUCT' | 'MATERIAL';
  itemId: string;
  productId?: string | null;
  product?: ProductRef | null;
  materialId?: string | null;
  material?: MaterialRef | null;
  catalogStatus?: string;
  category?: CategoryRef | null;
  uom?: UomRef | null;
  condition?: string;
  conditions?: string[];
  ownership?: StockOwnership;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  inventoryValue: number;
  unconvertibleBalanceCount?: number;
}

export interface InventoryItemAvailability {
  itemType: 'PRODUCT' | 'MATERIAL';
  itemId: string;
  uom: UomRef | null;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unconvertibleBalanceCount: number;
}

export interface InventoryLot {
  id: string;
  itemType: 'PRODUCT' | 'MATERIAL';
  itemId: string;
  lotNumber: string;
  supplierLot?: string | null;
  manufacturedAt?: string | null;
  expiresAt?: string | null;
  condition: 'AVAILABLE' | 'QUARANTINED' | 'DAMAGED' | 'REJECTED';
  sourceType?: string | null;
  sourceId?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function fetchApiWithParams<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(path, 'http://placeholder');
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    });
  }
  const fullPath = url.pathname + (url.search ? url.search : '');
  return fetchApi<T>(fullPath, options);
}

function idempotencyHeaders(idempotencyKey?: string): HeadersInit | undefined {
  return idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const inventoryApi = {
  // Compact dashboard/ledger helpers used by the inventory overview screen.
  dashboard: async () => {
    return fetchApi<{
      totalSkus: number;
      stockedSkus?: number;
      availableQuantity: number;
      reservedQuantity: number;
      inventoryValue: number;
      quarantinedQuantity: number;
      damagedQuantity: number;
      rejectedQuantity: number;
      inTransit: number;
      openReservations: number;
    }>('/inventory/dashboard');
  },
  ledger: (page = 1, limit = 25) => fetchApi<{ items: Array<StockLedgerEntry & { itemId?: string; itemType?: string; quantityDelta?: number; sourceType?: string; sourceId?: string; grn?: { grnNumber: string } }>; total: number; page: number; limit: number }>(`/inventory/ledger?page=${page}&limit=${limit}`),
  listItems: (params?: { search?: string; itemType?: 'PRODUCT' | 'MATERIAL'; status?: string; page?: number; limit?: number }) => fetchApiWithParams<ListResponse<InventoryItemSummary>>('/inventory/items', params),
  getItem: (itemType: 'PRODUCT' | 'MATERIAL', itemId: string) => fetchApi<InventoryItemSummary>(`/inventory/items/${itemType}/${itemId}`),
  getItemAvailability: (itemType: 'PRODUCT' | 'MATERIAL', itemId: string, uomId: string) =>
    fetchApiWithParams<InventoryItemAvailability>(`/inventory/items/${itemType}/${encodeURIComponent(itemId)}/availability`, { uomId }),
  listLots: (params?: { itemType?: 'PRODUCT' | 'MATERIAL'; itemId?: string; lotNumber?: string }) => fetchApiWithParams<ListResponse<InventoryLot>>('/inventory/lots', params),
  // Balances / ledger / reorder / snapshots
  listBalances: (params?: { productId?: string; materialId?: string; locationId?: string; ownership?: StockOwnership; search?: string; page?: number; limit?: number }) =>
    fetchApiWithParams<ListResponse<StockBalance>>('/inventory/balances', params),

  getBalance: (id: string) => fetchApi<StockBalance>(`/inventory/balances/${id}`),

  getBalanceMovements: (id: string, params?: { productId?: string; materialId?: string }) =>
    fetchApiWithParams<{ movements: StockLedgerEntry[]; lastMovementAt: string | null; agingDays: number | null }>(
      `/inventory/balances/${id}/movements`,
      params,
    ),

  listLedger: (params?: {
    productId?: string;
    materialId?: string;
    locationId?: string;
    entryType?: StockLedgerEntryType;
    postedFrom?: string;
    postedTo?: string;
    page?: number;
    limit?: number;
  }) => fetchApiWithParams<ListResponse<StockLedgerEntry>>('/inventory/ledger', params),

  getLedgerEntry: (id: string) => fetchApi<StockLedgerEntry>(`/inventory/ledger/${id}`),

  getReorderSignals: () => fetchApi<ReorderSignal[]>('/inventory/reorder-signals'),
  listReplenishmentPolicies: (params?: { itemType?: 'PRODUCT' | 'MATERIAL'; itemId?: string; locationId?: string }) =>
    fetchApiWithParams<ListResponse<unknown>>('/inventory/replenishment/policies', params),
  saveReplenishmentPolicy: (body: Record<string, unknown>) =>
    fetchApi<unknown>('/inventory/replenishment/policies', { method: 'PUT', body: JSON.stringify(body) }),

  createSnapshot: () => fetchApi<{ asOfDate: string; count: number }>('/inventory/snapshots', { method: 'POST' }),

  listSnapshots: (params?: { asOfDate?: string; locationId?: string }) =>
    fetchApiWithParams<ListResponse<unknown>>('/inventory/snapshots', params),

  // Issues
  listIssues: (params?: { productId?: string; materialId?: string; locationId?: string; status?: StockIssueStatus; page?: number; limit?: number }) =>
    fetchApiWithParams<ListResponse<StockIssue>>('/inventory/issues', params),

  getIssue: (id: string) => fetchApi<StockIssue>(`/inventory/issues/${id}`),

  createIssue: (
    body: { productId?: string; materialId?: string; uomId: string; locationId?: string; ownership?: StockOwnership; quantity: number; reason: string },
    idempotencyKey: string,
  ) => fetchApi<StockIssue>('/inventory/issues', { method: 'POST', body: JSON.stringify(body), headers: idempotencyHeaders(idempotencyKey) }),

  reverseIssue: (id: string, reason: string) =>
    fetchApi<StockIssue>(`/inventory/issues/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Transfers
  listTransfers: (params?: { locationId?: string; status?: StockTransferStatus; page?: number; limit?: number }) =>
    fetchApiWithParams<ListResponse<StockTransfer>>('/inventory/transfers', params),

  getTransfer: (id: string) => fetchApi<StockTransfer>(`/inventory/transfers/${id}`),

  createTransfer: (
    body: {
      productId?: string;
      materialId?: string;
      uomId: string;
      fromLocationId: string;
      toLocationId: string;
      ownership?: StockOwnership;
      requestedQuantity: number;
      note?: string;
    },
    idempotencyKey: string,
  ) => fetchApi<StockTransfer>('/inventory/transfers', { method: 'POST', body: JSON.stringify(body), headers: idempotencyHeaders(idempotencyKey) }),

  issueTransfer: (id: string, quantity: number) =>
    fetchApi<StockTransfer>(`/inventory/transfers/${id}/issue`, { method: 'POST', body: JSON.stringify({ quantity }) }),

  receiveTransfer: (id: string, quantity: number) =>
    fetchApi<StockTransfer>(`/inventory/transfers/${id}/receive`, { method: 'POST', body: JSON.stringify({ quantity }) }),

  cancelTransfer: (id: string) => fetchApi<StockTransfer>(`/inventory/transfers/${id}/cancel`, { method: 'POST' }),

  // Adjustments
  listAdjustments: (params?: { locationId?: string; status?: StockAdjustmentStatus; page?: number; limit?: number }) =>
    fetchApiWithParams<ListResponse<StockAdjustment>>('/inventory/adjustments', params),

  getAdjustment: (id: string) => fetchApi<StockAdjustment>(`/inventory/adjustments/${id}`),

  proposeAdjustment: (body: {
    productId?: string;
    materialId?: string;
    uomId: string;
    locationId?: string;
    ownership?: StockOwnership;
    condition?: string;
    lotId?: string;
    sourceType?: string;
    direction: StockAdjustmentDirection;
    quantity: number;
    reason: string;
  }) => fetchApi<StockAdjustment>('/inventory/adjustments', { method: 'POST', body: JSON.stringify(body) }),

  reviewAdjustment: (id: string, note?: string) =>
    fetchApi<StockAdjustment>(`/inventory/adjustments/${id}/review`, { method: 'POST', body: JSON.stringify({ note }) }),

  approveAdjustment: (id: string) => fetchApi<StockAdjustment>(`/inventory/adjustments/${id}/approve`, { method: 'POST' }),

  rejectAdjustment: (id: string, reason: string) =>
    fetchApi<StockAdjustment>(`/inventory/adjustments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  postAdjustment: (id: string) => fetchApi<StockAdjustment>(`/inventory/adjustments/${id}/post`, { method: 'POST' }),

  // Reservations
  listReservations: (params?: { productId?: string; materialId?: string; locationId?: string; status?: StockReservationStatus; page?: number; limit?: number }) =>
    fetchApiWithParams<ListResponse<StockReservation>>('/inventory/reservations', params),

  getReservation: (id: string) => fetchApi<StockReservation>(`/inventory/reservations/${id}`),

  createReservation: (body: {
    productId?: string;
    materialId?: string;
    uomId: string;
    locationId?: string;
    ownership?: StockOwnership;
    quantity: number;
    reason: string;
    sourceReference?: string;
  }) => fetchApi<StockReservation>('/inventory/reservations', { method: 'POST', body: JSON.stringify(body) }),

  releaseReservation: (id: string) => fetchApi<StockReservation>(`/inventory/reservations/${id}/release`, { method: 'POST' }),

  consumeReservation: (id: string) => fetchApi<StockReservation>(`/inventory/reservations/${id}/consume`, { method: 'POST' }),

  cancelReservation: (id: string) => fetchApi<StockReservation>(`/inventory/reservations/${id}/cancel`, { method: 'POST' }),
};
