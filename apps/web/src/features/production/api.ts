import { fetchApi } from '../api/client';
import type { ProductionInventoryAvailability, ProductionPlan, ProductionPlanListResponse } from './types';

export const productionApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string; scheduleType?: string; productId?: string; scheduleDateFrom?: string; scheduleDateTo?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.scheduleType) query.set('scheduleType', params.scheduleType);
    if (params?.productId) query.set('productId', params.productId);
    if (params?.scheduleDateFrom) query.set('scheduleDateFrom', params.scheduleDateFrom);
    if (params?.scheduleDateTo) query.set('scheduleDateTo', params.scheduleDateTo);
    return fetchApi<ProductionPlanListResponse>(`/production/plans${query.toString() ? `?${query}` : ''}`);
  },
  create: (data: Record<string, unknown>) => fetchApi<ProductionPlan>('/production/plans', { method: 'POST', body: JSON.stringify(data) }),
  checkAvailability: (data: {
    scheduleDate: string;
    productId: string;
    quantityUomId?: string;
    quantity: number;
    lines: Array<{
      itemType: 'MATERIAL' | 'PRODUCT';
      itemId: string;
      parentItemId?: string;
      uomId: string;
      quantity: number;
      quantityMode?: 'FIXED' | 'SCALED';
      roundingRule?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
      roundingPrecision?: number | null;
    }>;
  }) => fetchApi<ProductionInventoryAvailability>('/production/plans/check-availability', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => fetchApi<ProductionPlan>(`/production/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  get: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}`),
  requirements: (id: string) => fetchApi<ProductionPlan['requirements']>(`/production/plans/${id}/requirements`),
  inventoryMovements: (id: string) => fetchApi<unknown[]>(`/production/plans/${id}/inventory-movements`),
  check: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/check`, { method: 'POST' }),
  submit: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/submit`, { method: 'POST' }),
  approve: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/approve`, { method: 'POST' }),
  release: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/release`, { method: 'POST' }),
  partialComplete: (id: string, data: { partialQuantity: number; reason?: string }) => fetchApi<ProductionPlan>(`/production/plans/${id}/partial-complete`, { method: 'POST', body: JSON.stringify(data) }),
  interrupt: (id: string, data: { reason: string }) => fetchApi<ProductionPlan>(`/production/plans/${id}/interrupt`, { method: 'POST', body: JSON.stringify(data) }),
  start: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/start`, { method: 'POST' }),
  cancel: (id: string, reason?: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  delete: (id: string) => fetchApi<ProductionPlan>(`/production/plans/${id}`, { method: 'DELETE' }),
  issueMaterial: (id: string, data: { requirementId: string; quantity: number; locationId?: string; lotId?: string | null; reason?: string; idempotencyKey?: string }) => fetchApi<ProductionPlan>(`/production/plans/${id}/material-issues`, { method: 'POST', body: JSON.stringify(data) }),
  reverseMaterialIssue: (id: string, issueId: string, reason?: string) => fetchApi<ProductionPlan>(`/production/plans/${id}/material-issues/${issueId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),
  recordOutput: (id: string, data: { quantity: number; rejectedQuantity?: number; damagedQuantity?: number; uomId?: string; locationId?: string; lotId?: string | null; note?: string; idempotencyKey?: string }) => fetchApi<ProductionPlan>(`/production/plans/${id}/outputs`, { method: 'POST', body: JSON.stringify(data) }),
};
