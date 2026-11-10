import { fetchApi } from '../api/client';
import type {
  DepartmentExecutionBatch,
  DepartmentQueueResponse,
  BatchHistoryResponse,
  Handover,
  ExceptionRecord,
  ProductionScheduleSummary,
  ProductionScheduleDetail
} from './types';

export const departmentExecutionApi = {
  // 1. Department Queue
  getDepartmentQueue: (
    departmentId: string,
    params?: { page?: number; limit?: number; status?: string; search?: string }
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    const targetDept = departmentId || 'all';
    return fetchApi<DepartmentQueueResponse>(
      `/production/departments/${targetDept}/queue${query.toString() ? `?${query}` : ''}`
    );
  },

  // 2. Initialize Batch
  initializeBatch: (data: {
    productionPlanId: string;
    batchNumber?: string;
    routeId?: string;
    notes?: string;
  }) =>
    fetchApi<DepartmentExecutionBatch>('/production/batches/initialize', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // 3. Batch Detail & History
  getBatch: (id: string) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${id}`),

  getBatchHistory: (id: string) =>
    fetchApi<BatchHistoryResponse>(`/production/batches/${id}/history`),

  // 4. Batch Operations
  receiveBatch: (batchId: string, data?: { notes?: string }) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/receive`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),

  assignWorker: (
    batchId: string,
    data: { employeeId: string; subtaskDescription?: string }
  ) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/assign`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  unassignWorker: (batchId: string, employeeId: string) =>
    fetchApi<{ success: boolean }>(`/production/batches/${batchId}/workers/${employeeId}`, {
      method: 'DELETE'
    }),

  startBatch: (batchId: string, data: { employeeId: string; notes?: string }) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/start`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  pauseBatch: (
    batchId: string,
    data: { employeeId: string; reason: string; notes?: string }
  ) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/pause`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  resumeBatch: (
    batchId: string,
    data: { employeeId: string; notes?: string }
  ) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/resume`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  recordProgress: (
    batchId: string,
    data: {
      employeeId: string;
      quantityDelta?: number;
      completed_qty?: number;
      rejected_qty?: number;
      scrap_qty?: number;
      wastage_qty?: number;
      pending_qty?: number;
      eventType?: 'STARTED' | 'PAUSED' | 'RESUMED' | 'PARTIAL_RECORDED' | 'COMPLETED';
      notes?: string;
    }
  ) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/progress`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  recordException: (
    batchId: string,
    data: {
      type: 'REJECTION' | 'SCRAP' | 'WASTAGE' | 'PENDING' | 'INTERRUPTION';
      quantity: number;
      reason: string;
      employeeId: string;
    }
  ) =>
    fetchApi<ExceptionRecord>(`/production/batches/${batchId}/exceptions`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  completeBatch: (
    batchId: string,
    data: {
      employeeId: string;
      completed_qty: number;
      rejected_qty?: number;
      scrap_qty?: number;
      wastage_qty?: number;
      pending_qty?: number;
      notes?: string;
    }
  ) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // 5. Handover Operations
  proposeHandover: (
    batchId: string,
    data: {
      incomingDepartmentId: string;
      quantity: number;
      idempotencyKey: string;
      notes?: string;
    }
  ) =>
    fetchApi<Handover>(`/production/batches/${batchId}/handovers`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  decideHandover: (
    handoverId: string,
    data: {
      status: 'ACCEPTED' | 'REFUSED';
      refusalReason?: string;
      idempotencyKey?: string;
      notes?: string;
    }
  ) =>
    fetchApi<Handover>(`/production/handovers/${handoverId}/decide`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // 6. Managerial Override
  managerialOverride: (
    batchId: string,
    data: {
      action: 'OVERRIDE_STATUS' | 'OVERRIDE_SCRAP_LIMIT' | 'OVERRIDE_QUANTITY' | 'OVERRIDE_STAGE';
      reason: string;
      targetStatus?: string;
      targetStageSequence?: number;
      newScrapQuantity?: number;
      newCompletedQuantity?: number;
      notes?: string;
    }
  ) =>
    fetchApi<DepartmentExecutionBatch>(`/production/batches/${batchId}/override`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // 7. Post Finished Goods to Inventory & Store
  postToInventory: (
    batchId: string,
    data?: {
      quantity?: number;
      locationId?: string;
      notes?: string;
    }
  ) =>
    fetchApi<{
      batch: DepartmentExecutionBatch;
      ledgerEntry: any;
      balance: any;
      planCompleted: boolean;
      message: string;
    }>(`/production/batches/${batchId}/post-inventory`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),

  // 8. Production Schedule Execution Overview & Graph Flow
  listSchedules: (search?: string) => {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    return fetchApi<ProductionScheduleSummary[]>(
      `/production/executions${query.toString() ? `?${query}` : ''}`
    );
  },

  getSchedule: (planId: string) =>
    fetchApi<ProductionScheduleDetail>(`/production/executions/${planId}`),

  receiveAssignment: (assignmentId: string, quantity?: number) =>
    fetchApi<any>(`/production/material-assignments/${assignmentId}/receive`, {
      method: 'POST',
      body: JSON.stringify(quantity === undefined ? {} : { quantity }),
    }),

  createAssemblyWave: (planId: string, data: { quantity: number; idempotencyKey?: string }) =>
    fetchApi<any>(`/production/executions/${planId}/assembly-waves`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
};
