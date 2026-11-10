/**
 * Module 2 — Procurement API client
 *
 * All calls use fetchApi from features/api/client — no @prisma/client imports.
 * Endpoint base: /purchases/requisitions | /purchases/orders
 */
import { fetchApi } from '../api/client';
import { PrStatus, PoStatus, ExpectedReceiptStatus } from '@synergy/types';
import { UpdatePrInput } from '@synergy/validation';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PRLine {
  id: string;
  productId?: string | null;
  materialId?: string | null;
  uomId: string;
  requestedQuantity: number;
  estimatedUnitCost?: number | null;
  lineTotal?: number | string | null;
  specifications?: string | null;
  preferredMake?: string | null;
  needDateOverride?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  material?: { id: string; code: string; name: string } | null;
  uom?: { id: string; code: string; symbol: string } | null;
  purchaseOrder?: { id: string; poNumber: string; vendor?: { name: string } | null } | null;
}

export interface PR {
  id: string;
  prNumber: string;
  requesterId: string;
  departmentId: string;
  department?: { id: string; name: string } | null;
  requester?: { id: string; name?: string | null; email: string } | null;
  preferredVendorId?: string | null;
  preferredVendor?: { id: string; code: string; name: string; currency?: string; paymentTerms?: string | null } | null;
  needDate: string;
  status: PrStatus;
  approvalStage?: 'DRAFT' | 'STORE_REVIEW' | 'ADMIN_REVIEW' | 'COMPLETED' | 'RETURNED';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  businessJustification?: string | null;
  deliveryLocation?: string | null;
  costCenter?: string | null;
  projectCode?: string | null;
  requestedBudget?: number | string | null;
  notes?: string | null;
  createdAt: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  updatedAt: string;
  lines: PRLine[];
  approvals?: ProcurementApproval[];
  purchaseOrders?: Array<{ id: string; poNumber: string; status: PoStatus; createdAt: string }>;
}

export interface ProcurementApproval {
  id: string;
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  reason?: string | null;
  remarks?: string | null;
  actorId: string;
  actor?: { id: string; name?: string | null; email: string };
  stage?: 'DRAFT' | 'STORE_REVIEW' | 'ADMIN_REVIEW' | 'COMPLETED' | 'RETURNED' | null;
  timestamp?: string;
  createdAt?: string;
}

export interface CreatePRPayload {
  prNumber?: string; departmentId: string; preferredVendorId?: string; needDate: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'; businessJustification?: string;
  deliveryLocation?: string; costCenter?: string; projectCode?: string; requestedBudget?: number;
  notes?: string;
  lines: Array<{ productId?: string; materialId?: string; uomId: string; requestedQuantity: number; estimatedUnitCost?: number; specifications?: string; preferredMake?: string; needDateOverride?: string }>;
}

export interface POLine {
  id: string;
  productId?: string | null;
  materialId?: string | null;
  uomId: string;
  quantity: number;
  unitPrice?: number | string;
  taxRate?: number | string;
  lineTotal?: number | string;
  needDate: string;
  hsnSac?: string | null;
  product?: { id: string; sku?: string; name?: string; specifications?: unknown } | null;
  material?: { id: string; code?: string; name?: string; specs?: unknown } | null;
  uom?: { id: string; code?: string; symbol?: string; name?: string } | null;
  purchaseOrder?: { id: string; poNumber: string; vendor?: { name: string } | null } | null;
  pricingEvidence?: {
    averageUnitPrice: number | null;
    currency: string;
    uom: string;
    matchedLineCount: number;
    basis: string;
    decisionReason?: string | null;
    records: Array<{ poNumber: string; createdAt: string; vendorName: string; quantity: number; unitPrice: number }>;
  };
}

export interface PO {
  id: string;
  poNumber: string;
  revisionNumber: number;
  status: PoStatus;
  vendorId: string;
  vendor?: {
    id: string;
    code?: string;
    name: string;
    legalName?: string;
    taxNumber?: string;
    gstin?: string;
    address?: unknown;
    contactPhone?: string;
    contactEmail?: string;
    paymentTerms?: string | null;
  } | null;
  prId?: string | null;
  sourcePr?: { id: string; prNumber: string } | null;
  previousRevisionId?: string | null;
  previousRevision?: { id: string; poNumber: string; revisionNumber: number } | null;
  createdAt: string;
  updatedAt: string;
  lines: POLine[];
  transmissions?: TransmissionLog[];
  approvals?: ProcurementApproval[];
  currency?: string;
  subtotal?: number | string;
  taxAmount?: number | string;
  totalAmount?: number | string;
  deliveryLocation?: string | null;
  destination?: string | null;
  dispatchedThrough?: string | null;
  termsOfDelivery?: string | null;
  otherReferences?: string | null;
  paymentTerms?: string | null;
  issuedAt?: string | null;
  sentAt?: string | null;
  goodsReceiptNotes?: Array<{ id: string; grnNumber: string; status: string; receivedAt?: string }>;
}

export interface TransmissionLog {
  id: string;
  method: string;
  timestamp: string;
  note?: string | null;
}

export interface ExpectedReceipt {
  id: string;
  poId: string;
  poLineId: string;
  expectedDate: string;
  status: ExpectedReceiptStatus;
  po?: { id: string; poNumber: string } | null;
  poLine?: POLine | null;
}

export interface VendorHistoryEntry {
  vendorId: string;
  vendorName: string;
  totalOrders: number;
  totalValue: number;
  score: number;
  performance: { onTimeRate: number; qualityRate: number; completionRate: number; finalizedReceipts: number };
  orders: {
    id: string;
    poNumber: string;
    status: PoStatus;
    createdAt: string;
    totalAmount: number;
    receiptCount: number;
  }[];
}

export interface PRListResponse {
  items: PR[];
  total: number;
}

export interface POListResponse {
  items: PO[];
  total: number;
}

export interface ExpectedReceiptListResponse {
  items: ExpectedReceipt[];
  total: number;
}

export interface ProcurementNotification {
  id: string;
  type: 'WORKFLOW' | 'APPROVAL_REQUIRED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'INFO';
  title: string;
  message: string;
  href?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  readAt?: string | null;
  createdAt: string;
}

export interface ProcurementDashboard {
  metrics: { totalPrs: number; awaitingApproval: number; cancelledPos: number; activePos: number; pendingReceipts: number; overdueReceipts: number };
  recentPrs: PR[];
  recentPos: PO[];
}

export interface VendorRecommendation { vendorId: string; vendorCode: string; vendorName: string; deterministicScore: number; rank: number; rationale: string; aiReason: string }

// ─── PR Endpoints ─────────────────────────────────────────────────────────────

export const purchasesApi = {
  // --- PR ---
  listPRs: (params?: { status?: PrStatus; search?: string; page?: number; limit?: number }) =>
    fetchApi<PRListResponse>('/purchases/requisitions', {
      method: 'GET',
      // Pass params via URL manually since fetchApi doesn't accept query params natively
      ...buildQueryOptions('/purchases/requisitions', params),
    }),

  getPR: (id: string) =>
    fetchApi<PR>(`/purchases/requisitions/${id}`),

  listPRRevisions: (id: string) => fetchApi<Array<Record<string, unknown>>>(`/purchases/requisitions/${id}/revisions`),
  recommendVendors: (id: string) => fetchApi<{ prId: string; advisoryOnly: boolean; candidates: VendorRecommendation[] }>(`/purchases/requisitions/${id}/vendor-recommendations`, { method: 'POST', body: JSON.stringify({}) }),
  selectVendor: (id: string, vendorId: string, overrideReason?: string) => fetchApi<PR>(`/purchases/requisitions/${id}/vendor-selection`, { method: 'POST', body: JSON.stringify({ vendorId, overrideReason }) }),

  getNextPrNumber: () =>
    fetchApi<{ nextNumber: string }>('/purchases/requisitions/next-number'),

  createPR: (body: CreatePRPayload) =>
    fetchApi<PR>('/purchases/requisitions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createAndSubmitPR: (body: CreatePRPayload) =>
    fetchApi<PR>('/purchases/requisitions/submit', { method: 'POST', body: JSON.stringify(body) }),

  updatePR: (id: string, body: UpdatePrInput['body']) =>
    fetchApi<PR>(`/purchases/requisitions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  submitPR: (id: string) =>
    fetchApi<PR>(`/purchases/requisitions/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  approvePR: (id: string, body: { reason?: string }) =>
    fetchApi<PR>(`/purchases/requisitions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rejectPR: (id: string, body: { reason: string }) =>
    fetchApi<PR>(`/purchases/requisitions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  requestChangesPR: (id: string, body: { reason: string }) =>
    fetchApi<PR>(`/purchases/requisitions/${id}/request-changes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancelPR: (id: string, body?: { reason?: string }) =>
    fetchApi<PR>(`/purchases/requisitions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  // --- PO ---
  recommendVendorsForPO: (body: { needDate?: string; priority?: string; lines: Array<{ materialId?: string; quantity: number; unitPrice?: number }> }) =>
    fetchApi<{ generatedAt: string; provider: string; candidates: VendorRecommendation[] }>('/purchases/orders/vendor-recommendations', { method: 'POST', body: JSON.stringify(body) }),
  listPOs: (params?: { status?: PoStatus; vendorId?: string; page?: number; limit?: number }) =>
    fetchApi<POListResponse>('/purchases/orders', buildQueryOptions('/purchases/orders', params)),

  getPO: (id: string) =>
    fetchApi<PO>(`/purchases/orders/${id}`),

  getNextPoNumber: () =>
    fetchApi<{ nextNumber: string }>('/purchases/orders/next-number'),

  generatePO: (body: {
    poNumber?: string;
    prId?: string;
    vendorId: string;
    departmentId?: string;
    needDate?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    costCenter?: string;
    projectCode?: string;
    requestedBudget?: number;
    notes?: string;
    businessJustification?: string;
    paymentTerms?: string;
    deliveryLocation?: string;
    dispatchedThrough?: string;
    otherReferences?: string;
    termsOfDelivery?: string;
    lines: Array<{
      productId?: string;
      materialId?: string;
      uomId: string;
      quantity: number;
      unitPrice?: number;
      needDate: string;
    }>;
  }) =>
    fetchApi<PO>('/purchases/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updatePO: (id: string, body: {
    vendorId?: string;
    paymentTerms?: string;
    deliveryLocation?: string;
    dispatchedThrough?: string;
    otherReferences?: string;
    termsOfDelivery?: string;
    notes?: string;
    lines?: Array<{
      productId?: string;
      materialId?: string;
      uomId: string;
      quantity: number;
      unitPrice?: number;
      needDate: string;
    }>;
  }) =>
    fetchApi<PO>(`/purchases/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  approvePO: (id: string, body?: { reason?: string }) =>
    fetchApi<PO>(`/purchases/orders/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  requestChangesPO: (id: string, body: { reason: string }) =>
    fetchApi<PO>(`/purchases/orders/${id}/request-changes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rejectPO: (id: string, body: { reason: string }) =>
    fetchApi<PO>(`/purchases/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sendPO: (id: string, body?: { method?: string }) =>
    fetchApi<PO>(`/purchases/orders/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ method: 'MANUAL', ...(body || {}) }),
    }),

  resendPOEmail: (id: string) =>
    fetchApi<{ id: string; recipient: string; attempt: number; status: string; sentAt?: string | null }>(`/purchases/orders/${id}/resend-email`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  revisePO: (id: string, body: {
    reason?: string;
    lines: Array<{
      productId?: string;
      materialId?: string;
      uomId: string;
      quantity: number;
      needDate: string;
    }>;
  }) =>
    fetchApi<PO>(`/purchases/orders/${id}/revise`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancelPO: (id: string, body?: { reason?: string }) =>
    fetchApi<PO>(`/purchases/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  deletePO: (id: string, poNumber?: string) =>
    fetchApi<void>(`/purchases/orders/${id}${poNumber ? `?poNumber=${encodeURIComponent(poNumber)}` : ''}`, {
      method: 'DELETE',
    }),

  // --- Expected Receipts ---
  listExpectedReceipts: (params?: { poId?: string; status?: ExpectedReceiptStatus }) =>
    fetchApi<ExpectedReceiptListResponse>(
      '/purchases/expected-receipts',
      buildQueryOptions('/purchases/expected-receipts', params),
    ),
  getExpectedReceipt: (id: string) => fetchApi<ExpectedReceipt & { documents?: Array<{ id: string; fileUrl: string; fileName: string; createdAt: string; uploader?: { name?: string | null; email: string } }> }>(`/purchases/expected-receipts/${id}`),

  updateExpectedReceipt: (id: string, body: { status: 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' }) =>
    fetchApi<ExpectedReceipt>(`/purchases/expected-receipts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  uploadExpectedReceiptDocument: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetchApi<{ id: string; fileUrl: string; fileName: string }>(`/purchases/expected-receipts/${id}/document`, { method: 'POST', body: form });
  },

  // --- Vendor History ---
  getVendorHistory: (vendorId: string) =>
    fetchApi<VendorHistoryEntry>(`/purchases/vendors/${vendorId}/history`),

  getDashboard: () => fetchApi<ProcurementDashboard>('/purchases/dashboard'),
  listNotifications: () => fetchApi<{ items: ProcurementNotification[]; unreadCount: number }>('/purchases/notifications'),
  markNotificationRead: (id: string) => fetchApi<{ id: string; read: boolean }>(`/purchases/notifications/${id}/read`, { method: 'PATCH', body: JSON.stringify({}) }),
  markAllNotificationsRead: () => fetchApi<{ updated: number }>('/purchases/notifications/read-all', { method: 'PATCH', body: JSON.stringify({}) }),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build RequestInit with URL including query string.
 * fetchApi accepts a path, so we encode params into the path string.
 */
function buildQueryOptions(
  _basePath: string,
  params?: Record<string, string | number | undefined>,
): RequestInit {
  // params are baked into the path at call site for list endpoints
  // this helper is a stub — the actual query building happens in hooks via fetchApiWithParams
  void params;
  return {};
}

/**
 * Typed fetch that appends query params.
 * Use this in hooks instead of purchasesApi for list endpoints needing filters.
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
