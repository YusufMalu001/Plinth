import { fetchApi } from '../api/client';
import type {
  WipOverviewMetrics,
  WipBatchSummary,
  WipBatchDetail,
  WipGenealogyTrace,
  WipDepartmentQueueItem,
  WipTimingMetrics,
  WipReconciliationExceptionDto,
  WipBatchFilterParams,
  WipExceptionFilterParams,
  WipTimingFilterParams,
  RunReconciliationParams,
  ReconciliationRunResponse,
  PaginatedResponse
} from './types';

export const wipApi = {
  // 1. Overview
  getOverview: (params?: { departmentId?: string; productionPlanId?: string }) => {
    const query = new URLSearchParams();
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.productionPlanId) query.set('productionPlanId', params.productionPlanId);
    const qs = query.toString();
    return fetchApi<WipOverviewMetrics>(`/wip/overview${qs ? `?${qs}` : ''}`);
  },

  // 2. Batch Search & List
  listBatches: (params?: WipBatchFilterParams) => {
    const query = new URLSearchParams();
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.productionPlanId) query.set('productionPlanId', params.productionPlanId);
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.workCenterId) query.set('workCenterId', params.workCenterId);
    if (params?.stageSequenceNumber) query.set('stageSequenceNumber', String(params.stageSequenceNumber));
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<PaginatedResponse<WipBatchSummary>>(`/wip/batches${qs ? `?${qs}` : ''}`);
  },

  // 3. Batch Detail
  getBatchById: (id: string) =>
    fetchApi<WipBatchDetail>(`/wip/batches/${id}`),

  // 4. Batch Genealogy
  getBatchGenealogy: (id: string) =>
    fetchApi<WipGenealogyTrace>(`/wip/batches/${id}/genealogy`),

  // 5. Department Queue
  getDepartmentQueue: (
    departmentId: string,
    params?: { status?: string; page?: number; limit?: number }
  ) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<PaginatedResponse<WipDepartmentQueueItem>>(
      `/wip/departments/${departmentId}/queue${qs ? `?${qs}` : ''}`
    );
  },

  // 6. Timing Metrics
  getTimingMetrics: (params?: WipTimingFilterParams) => {
    const query = new URLSearchParams();
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.productionPlanId) query.set('productionPlanId', params.productionPlanId);
    if (params?.batchId) query.set('batchId', params.batchId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<PaginatedResponse<WipTimingMetrics>>(`/wip/timing-metrics${qs ? `?${qs}` : ''}`);
  },

  // 7. Trigger Reconciliation Check
  runReconciliation: (data?: RunReconciliationParams) =>
    fetchApi<ReconciliationRunResponse>('/wip/reconcile', {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),

  // 8. Reconciliation Exceptions List & Detail
  listExceptions: (params?: WipExceptionFilterParams) => {
    const query = new URLSearchParams();
    if (params?.batchId) query.set('batchId', params.batchId);
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.productionPlanId) query.set('productionPlanId', params.productionPlanId);
    if (params?.exceptionType) query.set('exceptionType', params.exceptionType);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<PaginatedResponse<WipReconciliationExceptionDto>>(`/wip/exceptions${qs ? `?${qs}` : ''}`);
  },

  getExceptionById: (id: string) =>
    fetchApi<WipReconciliationExceptionDto>(`/wip/exceptions/${id}`),

  // 9. Exception Actions
  investigateException: (id: string, data?: { investigationNotes?: string }) =>
    fetchApi<WipReconciliationExceptionDto>(`/wip/exceptions/${id}/investigate`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),

  resolveException: (id: string, data: { resolutionNotes: string }) =>
    fetchApi<WipReconciliationExceptionDto>(`/wip/exceptions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  dismissException: (id: string, data: { resolutionNotes: string }) =>
    fetchApi<WipReconciliationExceptionDto>(`/wip/exceptions/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
};
