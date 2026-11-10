/**
 * Module 3 — Goods Receipt (GRN) API client
 *
 * All calls use fetchApi from features/api/client — no @prisma/client imports.
 * Endpoint base: /goods-receipts
 */
import { API_URL, ApiError, fetchApi } from '../api/client';
import {
  GrnStatus,
  GrnLineStatus,
  MeasurementType,
  DiscrepancyType,
  DiscrepancyStatus,
  DiscrepancyResolutionType,
  DebitNoteStatus,
  ExpectedReceiptStatus,
} from '@synergy/types';
import type { ExpectedReceipt, ExpectedReceiptListResponse } from '../purchases/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GrnMeasurement {
  id: string;
  grnLineId: string;
  measuredByActorId: string;
  type: MeasurementType;
  value: number;
  unitLabel: string;
  note?: string | null;
  recordedAt: string;
}

export interface GrnDiscrepancy {
  id: string;
  grnLineId: string;
  type: DiscrepancyType;
  quantity: number;
  status: DiscrepancyStatus;
  resolutionType?: DiscrepancyResolutionType | null;
  acceptanceJustification?: string | null;
  returnReference?: string | null;
  resolutionNotes?: string | null;
  resolvedByActorId?: string | null;
  resolvedAt?: string | null;
  debitNoteStatus?: DebitNoteStatus | null;
  debitNoteNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrnLabelPrintEvent {
  id: string;
  labelId: string;
  printedByActorId: string;
  printedAt: string;
  reason?: string | null;
}

export interface GrnLabel {
  id: string;
  grnLineId: string;
  labelCode: string;
  generatedAt: string;
  printEvents: GrnLabelPrintEvent[];
}

export interface GrnDocument {
  id: string;
  grnId: string;
  fileUrl: string;
  fileName: string;
  documentType?: string;
  uploadedBy: string;
  createdAt: string;
}

export interface GrnLine {
  id: string;
  grnId: string;
  poLineId?: string | null;
  poLine?: { id: string; quantity: number; needDate: string; unitPrice?: number | string; taxRate?: number | string; lineTotal?: number | string } | null;
  productId?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  materialId?: string | null;
  material?: { id: string; code: string; name: string } | null;
  uomId: string;
  uom?: { id: string; code: string; symbol: string } | null;
  expectedQuantity?: number | null;
  invoiceUnitPrice?: number | string | null;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  damagedQuantity: number;
  shortQuantity: number;
  excessQuantity: number;
  status: GrnLineStatus;
  createdAt: string;
  updatedAt: string;
  measurements: GrnMeasurement[];
  discrepancies: GrnDiscrepancy[];
  label?: GrnLabel | null;
}

export interface Grn {
  id: string;
  grnNumber: string;
  poId?: string | null;
  po?: { id: string; poNumber: string } | null;
  vendorId?: string | null;
  vendor?: { id: string; code: string; name: string } | null;
  locationId?: string | null;
  location?: { id: string; code: string; name: string } | null;
  isUnreferenced: boolean;
  unreferencedJustification?: string | null;
  status: GrnStatus;
  receivedByActorId: string;
  documents: GrnDocument[];
  receivedAt: string;
  verifiedByActorId?: string | null;
  verifiedAt?: string | null;
  signedOffByActorId?: string | null;
  signedOffAt?: string | null;
  finalizedByActorId?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lines: GrnLine[];
}

export interface GrnListResponse {
  items: Grn[];
  total: number;
}

export interface GrnCapabilities {
  receive: boolean;
  update: boolean;
  verify: boolean;
  signOff: boolean;
  finalize: boolean;
  uploadDocument: boolean;
  reprintLabel: boolean;
  resolveDiscrepancy: boolean;
  returnToVendor: boolean;
  export: boolean;
  createDebitNote?: boolean;
  allLocations: boolean;
  locationId: string | null;
}

export interface ReceivingDashboard {
  metrics: {
    arrived: number;
    verifying: number;
    discrepancies: number;
    awaitingSignOff: number;
    awaitingFinalize: number;
    finalizedToday: number;
  };
  actionQueue: Array<Pick<Grn, 'id' | 'grnNumber' | 'status' | 'updatedAt' | 'isUnreferenced'> & {
    vendor?: Grn['vendor']; location?: Grn['location']; po?: Grn['po']; lines: Array<{ id: string; status: GrnLineStatus }>;
  }>;
  recentFinalized: Array<Pick<Grn, 'id' | 'grnNumber' | 'status' | 'finalizedAt'> & {
    vendor?: Grn['vendor']; location?: Grn['location']; po?: Grn['po']; lines: Array<{ acceptedQuantity: number }>;
  }>;
  capabilities: GrnCapabilities;
  scope: { allLocations: boolean; locationId: string | null };
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const grnApi = {
  getDashboard: () => fetchApi<ReceivingDashboard>('/goods-receipts/dashboard'),

  getCapabilities: () => fetchApi<GrnCapabilities>('/goods-receipts/capabilities'),

  exportCsv: async () => {
    const response = await fetch(`${API_URL}/goods-receipts/export`, { method: 'POST', credentials: 'include', headers: { Accept: 'text/csv' } });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ApiError(response.status, error?.error?.message || 'Could not export goods receipts.', error);
    }
    return response.blob();
  },

  listExpected: (params?: { status?: ExpectedReceiptStatus; poId?: string }) =>
    fetchApiWithParams<ExpectedReceiptListResponse>('/goods-receipts/expected', {
      ...(params?.status && { status: params.status }),
      ...(params?.poId && { poId: params.poId }),
    }),

  listGrns: (params?: { status?: GrnStatus; poId?: string; search?: string; page?: number; limit?: number }) =>
    fetchApiWithParams<GrnListResponse>('/goods-receipts', {
      ...(params?.status && { status: params.status }),
      ...(params?.poId && { poId: params.poId }),
      ...(params?.search && { search: params.search }),
      ...(params?.page && { page: params.page }),
      ...(params?.limit && { limit: params.limit }),
    }),

  getGrn: (id: string) => fetchApi<Grn>(`/goods-receipts/${id}`, { cache: 'no-store' }),

  getGrnHistory: (id: string) => fetchApi<Grn>(`/goods-receipts/${id}/history`),

  createFromPo: (
    body: { poId: string; locationId?: string; lines: Array<{ poLineId: string; receivedQuantity?: number }> },
    idempotencyKey: string,
  ) =>
    fetchApi<Grn>('/goods-receipts', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  createUnreferenced: (
    body: {
      vendorId: string;
      locationId?: string;
      justification: string;
      lines: Array<{ productId?: string; materialId?: string; uomId: string; receivedQuantity?: number }>;
    },
    idempotencyKey: string,
  ) =>
    fetchApi<Grn>('/goods-receipts/unreferenced', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  updateGrn: (
    id: string,
    body: {
      lines: Array<{
        id: string;
        receivedQuantity?: number;
        acceptedQuantity?: number;
        rejectedQuantity?: number;
        damagedQuantity?: number;
        invoiceUnitPrice?: number;
        putAwayLocationId?: string;
        lotId?: string;
        lotNumber?: string;
        lotManufacturedAt?: string;
        lotExpiresAt?: string;
        inventoryCondition?: 'AVAILABLE' | 'QUARANTINED' | 'DAMAGED' | 'REJECTED';
        inventoryOwnership?: 'COMPANY' | 'VENDOR_HELD';
      }>;
    },
  ) =>
    fetchApi<Grn>(`/goods-receipts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  recordMeasurement: (
    grnId: string,
    lineId: string,
    body: {
      type: MeasurementType;
      value: number;
      unitLabel: string;
      note?: string;
      acceptedQuantity?: number;
      rejectedQuantity?: number;
      damagedQuantity?: number;
    },
  ) =>
    fetchApi<Grn>(`/goods-receipts/${grnId}/lines/${lineId}/measurements`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reprintLabel: (grnId: string, lineId: string, body?: { reason?: string }) =>
    fetchApi<GrnLabel>(`/goods-receipts/${grnId}/lines/${lineId}/label/reprint`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  resolveDiscrepancy: (
    grnId: string,
    discrepancyId: string,
    body:
      | { resolutionType: 'ACCEPT_EXCESS'; acceptanceJustification: string }
      | { resolutionType: 'RETURN_TO_VENDOR'; returnReference: string; acceptanceJustification: string },
  ) =>
    fetchApi<{ discrepancy: GrnDiscrepancy; grn: Grn }>(
      `/goods-receipts/${grnId}/discrepancies/${discrepancyId}/resolve`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  signOff: (id: string, body?: { note?: string }) =>
    fetchApi<Grn>(`/goods-receipts/${id}/sign-off`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  finalize: (id: string, body?: { note?: string }) =>
    fetchApi<Grn>(`/goods-receipts/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  uploadDocument: (grnId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchApi<GrnDocument>(`/goods-receipts/${grnId}/documents`, {
      method: 'POST',
      body: formData,
    });
  },

  listDocuments: (grnId: string) => fetchApi<GrnDocument[]>(`/goods-receipts/${grnId}/documents`),
  verifyLines: (grnId: string, body: { lines: Array<{ lineId: string; receivedQuantity: number; acceptedQuantity: number; rejectedQuantity?: number; damagedQuantity?: number; invoiceUnitPrice?: number; notes?: string }>; overallNotes?: string }) => fetchApi<Grn>(`/goods-receipts/${grnId}/verify-lines`, { method: 'POST', body: JSON.stringify(body) }),
  notifyAccountantForDebitNote: (grnId: string, body: { reason: string; reasonCategory?: string; discrepancyIds?: string[]; responsiblePersonId?: string }) => fetchApi<{ success: boolean; message: string; grnNumber: string; discrepancyCount: number }>(`/goods-receipts/${grnId}/notify-accountant`, { method: 'POST', body: JSON.stringify(body) }),
  createDebitNoteFromGrn: (grnId: string, reason: string, options?: { discrepancyIds?: string[]; reasonCategory?: string; responsiblePersonId?: string }) => fetchApi<Record<string, unknown>>(`/debit-notes/from-grn/${grnId}`, { method: 'POST', body: JSON.stringify({ reason, ...options }) }),
};

export type { ExpectedReceipt };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Typed fetch that appends query params (mirrors features/purchases/api.ts).
 */
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
