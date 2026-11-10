import { fetchApi } from '../api/client';
import type {
  LossEventDto,
  ReplacementChallanDto,
  LossAnalyticsSummaryDto,
  LossSourceType,
  LossClassification,
  LossEventStatus
} from '@synergy/types';

export interface LossEventQueryFilters {
  sourceType?: LossSourceType;
  classification?: LossClassification;
  status?: LossEventStatus;
  departmentId?: string;
  locationId?: string;
  materialId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export interface LossAnalyticsQueryFilters {
  departmentId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateLossEventPayload {
  sourceType: LossSourceType;
  sourceExceptionRecordId?: string | null;
  sourceDiscrepancyId?: string | null;
  sourceInspectionResultId?: string | null;
  materialId?: string | null;
  productId?: string | null;
  uomId: string;
  locationId?: string | null;
  departmentId?: string | null;
  quantity: number;
  reason: string;
}

export interface ClassifyLossEventPayload {
  basisQuantity?: number;
}

export interface ReviewLossEventPayload {
  reviewNotes?: string | null;
}

export interface RejectLossEventPayload {
  rejectionReason: string;
  rejectedQuantity?: number;
}

export interface InvestigateLossEventPayload {
  investigationNotes: string;
}

export interface CreateReplacementChallanPayload {
  dispatchLocationId: string;
  targetDepartmentId?: string | null;
  targetVendorId?: string | null;
  replacementQuantity?: number;
  rejectedQuantity?: number;
  rejectionReason?: string | null;
  notes?: string | null;
}

export const lossApi = {
  // 1. Plant-wide Loss Analytics Rollup
  getAnalytics: (filters?: LossAnalyticsQueryFilters) => {
    const query = new URLSearchParams();
    if (filters?.departmentId) query.set('departmentId', filters.departmentId);
    if (filters?.locationId) query.set('locationId', filters.locationId);
    if (filters?.startDate) query.set('startDate', filters.startDate);
    if (filters?.endDate) query.set('endDate', filters.endDate);
    const qs = query.toString();
    return fetchApi<LossAnalyticsSummaryDto>(`/loss-events/analytics${qs ? `?${qs}` : ''}`);
  },

  // 2. Abnormal Loss Events Review Queue
  getAbnormalQueue: (filters?: LossEventQueryFilters) => {
    const query = new URLSearchParams();
    if (filters?.sourceType) query.set('sourceType', filters.sourceType);
    if (filters?.departmentId) query.set('departmentId', filters.departmentId);
    if (filters?.locationId) query.set('locationId', filters.locationId);
    if (filters?.materialId) query.set('materialId', filters.materialId);
    if (filters?.productId) query.set('productId', filters.productId);
    if (filters?.startDate) query.set('startDate', filters.startDate);
    if (filters?.endDate) query.set('endDate', filters.endDate);
    if (filters?.skip !== undefined) query.set('skip', String(filters.skip));
    if (filters?.take !== undefined) query.set('take', String(filters.take));
    const qs = query.toString();
    return fetchApi<{ items: LossEventDto[]; total: number }>(`/loss-events/abnormal-queue${qs ? `?${qs}` : ''}`);
  },

  // 3. Loss Events List & Search
  list: (filters?: LossEventQueryFilters) => {
    const query = new URLSearchParams();
    if (filters?.sourceType) query.set('sourceType', filters.sourceType);
    if (filters?.classification) query.set('classification', filters.classification);
    if (filters?.status) query.set('status', filters.status);
    if (filters?.departmentId) query.set('departmentId', filters.departmentId);
    if (filters?.locationId) query.set('locationId', filters.locationId);
    if (filters?.materialId) query.set('materialId', filters.materialId);
    if (filters?.productId) query.set('productId', filters.productId);
    if (filters?.startDate) query.set('startDate', filters.startDate);
    if (filters?.endDate) query.set('endDate', filters.endDate);
    if (filters?.search) query.set('search', filters.search);
    if (filters?.skip !== undefined) query.set('skip', String(filters.skip));
    if (filters?.take !== undefined) query.set('take', String(filters.take));
    const qs = query.toString();
    return fetchApi<{ items: LossEventDto[]; total: number }>(`/loss-events${qs ? `?${qs}` : ''}`);
  },

  // 4. Report Loss Event (Create)
  report: (payload: CreateLossEventPayload) =>
    fetchApi<LossEventDto>('/loss-events', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 5. Get Loss Event by ID
  getById: (id: string) =>
    fetchApi<LossEventDto>(`/loss-events/${id}`),

  // 6. Classify Loss Event against WastageRule (Tolerance Comparison)
  classify: (id: string, payload?: ClassifyLossEventPayload) =>
    fetchApi<LossEventDto>(`/loss-events/${id}/classify`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),

  // 7. Review Loss Event
  review: (id: string, payload?: ReviewLossEventPayload) =>
    fetchApi<LossEventDto>(`/loss-events/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),

  // 8. Approve Loss Event
  approve: (id: string) =>
    fetchApi<LossEventDto>(`/loss-events/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  // 9. Reject Loss Event
  reject: (id: string, payload: RejectLossEventPayload) =>
    fetchApi<LossEventDto>(`/loss-events/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 10. Investigate Abnormal Loss Event
  investigate: (id: string, payload: InvestigateLossEventPayload) =>
    fetchApi<LossEventDto>(`/loss-events/${id}/investigate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 11. Post Inventory Stock Effect (Atomic StockAdjustment / StockLedgerEntry)
  postStockEffect: (id: string) =>
    fetchApi<LossEventDto>(`/loss-events/${id}/post`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  // 12. Issue Replacement Challan
  issueReplacementChallan: (id: string, payload: CreateReplacementChallanPayload) =>
    fetchApi<ReplacementChallanDto>(`/loss-events/${id}/replacement-challan`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 13. Acknowledge Replacement Challan
  acknowledgeReplacementChallan: (id: string) =>
    fetchApi<ReplacementChallanDto>(`/replacement-challans/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({})
    })
};
