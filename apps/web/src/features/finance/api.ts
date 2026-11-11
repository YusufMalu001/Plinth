/**
 * Module 18 — Finance / Tally Integration API client
 *
 * Calls use fetchApi from features/api/client.
 * NO @prisma/client imports.
 */
import { fetchApi } from '../api/client';
import {
  TransactionSourceType,
  LifecycleStatus,
  IntegrationJobStatus,
  IntegrationJobItemStatus,
  InternalReconciliationStatus,
  MappingConfigurationDto,
  IntegrationJobDto,
  IntegrationJobItemDto,
  ReconciliationRecordDto,
} from '@plinth/types';

export interface ReadinessStatusItem {
  sourceType: TransactionSourceType;
  displayName: string;
  isSupported: boolean;
  status: 'ACTIVE' | 'NOT_YET_SUPPORTED' | 'NO_APPROVED_MAPPING';
  activeMappingVersion?: number | null;
  blockedReason?: string | null;
  dependentModules?: string[];
  validationItems?: string[];
}

export interface EligibilityResult {
  sourceType: TransactionSourceType;
  isSupported: boolean;
  eligibleCount: number;
  items: Array<{
    sourceId: string;
    referenceNumber: string;
    sourceType: TransactionSourceType;
    amount: string;
    currency: string;
    date: string;
    extra?: Record<string, unknown>;
  }>;
  message?: string;
}

export interface CreateMappingInput {
  sourceType: TransactionSourceType;
  fieldMapping: Record<string, unknown>;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface ManualAcknowledgeInput {
  externalReference?: string;
  notes?: string;
}

export interface InternalReconcileInput {
  resolutionNotes?: string;
}

export interface InvestigateRetryInput {
  action: 'INVESTIGATE' | 'RETRY' | 'REJECT' | 'HOLD';
  reason: string;
}

export interface ListJobsParams {
  sourceType?: TransactionSourceType;
  status?: IntegrationJobStatus;
  page?: number;
  limit?: number;
}

export interface ListJobItemsParams {
  jobId?: string;
  sourceType?: TransactionSourceType;
  status?: IntegrationJobItemStatus;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const financeApi = {
  // 1. Integration Readiness
  getReadiness: async (): Promise<ReadinessStatusItem[]> => {
    return fetchApi<ReadinessStatusItem[]>('/finance/readiness');
  },

  // 2. Eligibility
  checkEligibility: async (sourceType: TransactionSourceType): Promise<EligibilityResult> => {
    return fetchApi<EligibilityResult>(`/finance/eligibility?sourceType=${encodeURIComponent(sourceType)}`);
  },

  // 3. Mapping Configuration
  listMappings: async (params?: { sourceType?: TransactionSourceType; status?: LifecycleStatus }): Promise<MappingConfigurationDto[]> => {
    const query = new URLSearchParams();
    if (params?.sourceType) query.set('sourceType', params.sourceType);
    if (params?.status) query.set('status', params.status);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchApi<MappingConfigurationDto[]>(`/finance/mappings${queryString}`);
  },

  createMapping: async (data: CreateMappingInput): Promise<MappingConfigurationDto> => {
    return fetchApi<MappingConfigurationDto>('/finance/mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  approveMapping: async (id: string): Promise<MappingConfigurationDto> => {
    return fetchApi<MappingConfigurationDto>(`/finance/mappings/${id}/approve`, {
      method: 'POST',
    });
  },

  // 4. Queue Transactions
  queueTransactions: async (data: { sourceType: TransactionSourceType; sourceIds: string[] }): Promise<IntegrationJobDto> => {
    return fetchApi<IntegrationJobDto>('/finance/queue', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 5. Trigger Export
  exportBatch: async (jobId: string): Promise<IntegrationJobDto> => {
    return fetchApi<IntegrationJobDto>('/finance/export', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  },

  // 6. Manual Acknowledgement
  acknowledgeItem: async (itemId: string, data: ManualAcknowledgeInput): Promise<IntegrationJobItemDto> => {
    return fetchApi<IntegrationJobItemDto>(`/finance/items/${itemId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 7. Reconciliation Workspace
  reconcileItem: async (
    itemId: string,
    data?: InternalReconcileInput
  ): Promise<{ item: IntegrationJobItemDto; reconciliationRecord: ReconciliationRecordDto }> => {
    return fetchApi<{ item: IntegrationJobItemDto; reconciliationRecord: ReconciliationRecordDto }>(
      `/finance/items/${itemId}/reconcile`,
      {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }
    );
  },

  listReconciliationRecords: async (status?: InternalReconciliationStatus): Promise<ReconciliationRecordDto[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchApi<ReconciliationRecordDto[]>(`/finance/reconciliation-records${query}`);
  },

  // 8. Investigate & Retry
  investigateAndRetry: async (itemId: string, data: InvestigateRetryInput): Promise<IntegrationJobItemDto> => {
    return fetchApi<IntegrationJobItemDto>(`/finance/items/${itemId}/retry`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 9. Jobs and Items Query (Traceability)
  listJobs: async (params?: ListJobsParams): Promise<{ jobs: IntegrationJobDto[]; total: number }> => {
    const query = new URLSearchParams();
    if (params?.sourceType) query.set('sourceType', params.sourceType);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchApi<{ jobs: IntegrationJobDto[]; total: number }>(`/finance/jobs${queryString}`);
  },

  getJobById: async (id: string): Promise<IntegrationJobDto> => {
    return fetchApi<IntegrationJobDto>(`/finance/jobs/${id}`);
  },

  listJobItems: async (params?: ListJobItemsParams): Promise<{ items: IntegrationJobItemDto[]; total: number }> => {
    const query = new URLSearchParams();
    if (params?.jobId) query.set('jobId', params.jobId);
    if (params?.sourceType) query.set('sourceType', params.sourceType);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetchApi<{ items: IntegrationJobItemDto[]; total: number }>(`/finance/items${queryString}`);
  },

  getJobItemById: async (id: string): Promise<IntegrationJobItemDto> => {
    return fetchApi<IntegrationJobItemDto>(`/finance/items/${id}`);
  },
};
