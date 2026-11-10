import { fetchApi } from '../api/client';
import type {
  AssemblyBatchDto,
  AssemblyWorkerAssignmentDto,
  AssemblyProgressEventDto,
  AssemblyBatchStatus,
  ProgressEventType
} from '@synergy/types';

export interface ListAssemblyBatchesParams {
  productId?: string;
  productionPlanId?: string;
  status?: AssemblyBatchStatus;
  skip?: number;
  take?: number;
}

export interface ListAssemblyBatchesResponse {
  items: AssemblyBatchDto[];
  total: number;
  skip: number;
  take: number;
}

export interface PlanAssemblyBatchPayload {
  productId: string;
  productVariantId?: string | null;
  productionPlanId?: string | null;
  bomVersionId: string;
  productRouteId?: string | null;
  targetOutputQuantity: number;
  plannedStartDate?: string | null;
  notes?: string | null;
}

export interface AllocateAssemblyComponentsPayload {
  allocations: Array<{
    bomLineId?: string | null;
    componentType: 'BATCH_SOURCED' | 'ISSUE_LINE_SOURCED';
    sourceBatchId?: string | null;
    materialIssueLineId?: string | null;
    uomId: string;
    unitRatio: number;
    requiredQuantity: number;
  }>;
}

export interface CompleteAssemblyBatchPayload {
  actualOutputQuantity: number;
  scrapQuantity?: number;
  idempotencyKey: string;
  componentConsumptions: Array<{
    componentId: string;
    consumedQuantity: number;
    scrapQuantity?: number;
  }>;
  notes?: string | null;
}

export interface QcDispositionPayload {
  disposition: 'PASSED_TO_FG' | 'REWORK' | 'REJECTED';
  inspectionNotes?: string | null;
  rejectionReason?: string | null;
  defectTypeId?: string | null;
  locationId?: string | null;
  costImpact?: number | null;
}

export const assemblyApi = {
  listBatches: (params?: ListAssemblyBatchesParams) => {
    const query = new URLSearchParams();
    if (params?.productId) query.set('productId', params.productId);
    if (params?.productionPlanId) query.set('productionPlanId', params.productionPlanId);
    if (params?.status) query.set('status', params.status);
    if (params?.skip !== undefined) query.set('skip', String(params.skip));
    if (params?.take !== undefined) query.set('take', String(params.take));
    return fetchApi<ListAssemblyBatchesResponse>(
      `/assembly/batches${query.toString() ? `?${query.toString()}` : ''}`
    );
  },

  getBatch: (id: string) =>
    fetchApi<AssemblyBatchDto>(`/assembly/batches/${id}`),

  planBatch: (payload: PlanAssemblyBatchPayload) =>
    fetchApi<AssemblyBatchDto>('/assembly/batches', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  allocateComponents: (id: string, payload: AllocateAssemblyComponentsPayload) =>
    fetchApi<AssemblyBatchDto>(`/assembly/batches/${id}/allocate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startBatch: (id: string, payload?: { actualStartDate?: string }) =>
    fetchApi<AssemblyBatchDto>(`/assembly/batches/${id}/start`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  assignWorker: (
    id: string,
    payload: { employeeId: string; subtaskDescription?: string | null }
  ) =>
    fetchApi<AssemblyWorkerAssignmentDto>(`/assembly/batches/${id}/workers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  unassignWorker: (id: string, employeeId: string) =>
    fetchApi<{ success: boolean; unassignedEmployeeId: string }>(
      `/assembly/batches/${id}/workers/${employeeId}`,
      {
        method: 'DELETE',
      }
    ),

  recordProgress: (
    id: string,
    payload: {
      employeeId: string;
      eventType: ProgressEventType;
      quantityDelta: number;
      notes?: string | null;
    }
  ) =>
    fetchApi<AssemblyProgressEventDto>(`/assembly/batches/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  completeBatch: (id: string, payload: CompleteAssemblyBatchPayload) =>
    fetchApi<AssemblyBatchDto>(`/assembly/batches/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  qcDisposition: (id: string, payload: QcDispositionPayload) =>
    fetchApi<AssemblyBatchDto>(`/assembly/batches/${id}/qc-disposition`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
