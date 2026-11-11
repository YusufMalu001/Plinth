/**
 * Module 18 — Finance / Tally Integration TanStack Query hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  financeApi,
  CreateMappingInput,
  ManualAcknowledgeInput,
  InternalReconcileInput,
  InvestigateRetryInput,
  ListJobsParams,
  ListJobItemsParams,
} from './api';
import { TransactionSourceType, LifecycleStatus, InternalReconciliationStatus } from '@plinth/types';

export const financeKeys = {
  all: ['finance'] as const,
  readiness: () => [...financeKeys.all, 'readiness'] as const,
  eligibility: (sourceType: TransactionSourceType) => [...financeKeys.all, 'eligibility', sourceType] as const,
  mappings: (params?: { sourceType?: TransactionSourceType; status?: LifecycleStatus }) =>
    [...financeKeys.all, 'mappings', params] as const,
  jobs: (params?: ListJobsParams) => [...financeKeys.all, 'jobs', params] as const,
  jobDetail: (id: string) => [...financeKeys.all, 'jobs', id] as const,
  jobItems: (params?: ListJobItemsParams) => [...financeKeys.all, 'jobItems', params] as const,
  jobItemDetail: (id: string) => [...financeKeys.all, 'jobItems', id] as const,
  reconciliationRecords: (status?: InternalReconciliationStatus) =>
    [...financeKeys.all, 'reconciliation', status] as const,
};

// 1. Readiness Hook
export function useIntegrationReadiness() {
  return useQuery({
    queryKey: financeKeys.readiness(),
    queryFn: financeApi.getReadiness,
    staleTime: 30_000,
  });
}

// 2. Eligibility Hook
export function useSourceEligibility(sourceType: TransactionSourceType, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: financeKeys.eligibility(sourceType),
    queryFn: () => financeApi.checkEligibility(sourceType),
    enabled: options?.enabled !== undefined ? options.enabled : Boolean(sourceType),
    staleTime: 15_000,
  });
}

// 3. Mapping Configuration Hooks
export function useMappingConfigurations(params?: { sourceType?: TransactionSourceType; status?: LifecycleStatus }) {
  return useQuery({
    queryKey: financeKeys.mappings(params),
    queryFn: () => financeApi.listMappings(params),
    staleTime: 30_000,
  });
}

export function useCreateMappingConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMappingInput) => financeApi.createMapping(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useApproveMappingConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.approveMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

// 4. Queue Mutation Hook
export function useQueueTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { sourceType: TransactionSourceType; sourceIds: string[] }) =>
      financeApi.queueTransactions(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

// 5. Trigger Export Hook
export function useExportBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => financeApi.exportBatch(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

// 6. Manual Acknowledgement Hook
export function useManualAcknowledgeItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: ManualAcknowledgeInput }) =>
      financeApi.acknowledgeItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

// 7. Internal Reconciliation Hooks
export function useReconcileItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data?: InternalReconcileInput }) =>
      financeApi.reconcileItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useReconciliationRecords(status?: InternalReconciliationStatus) {
  return useQuery({
    queryKey: financeKeys.reconciliationRecords(status),
    queryFn: () => financeApi.listReconciliationRecords(status),
    staleTime: 15_000,
  });
}

// 8. Investigate and Retry Hook
export function useInvestigateAndRetry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: InvestigateRetryInput }) =>
      financeApi.investigateAndRetry(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

// 9. Jobs & Items Query Hooks
export function useIntegrationJobs(params?: ListJobsParams) {
  return useQuery({
    queryKey: financeKeys.jobs(params),
    queryFn: () => financeApi.listJobs(params),
    staleTime: 10_000,
  });
}

export function useIntegrationJob(id: string) {
  return useQuery({
    queryKey: financeKeys.jobDetail(id),
    queryFn: () => financeApi.getJobById(id),
    enabled: Boolean(id),
  });
}

export function useIntegrationJobItems(params?: ListJobItemsParams) {
  return useQuery({
    queryKey: financeKeys.jobItems(params),
    queryFn: () => financeApi.listJobItems(params),
    staleTime: 10_000,
  });
}

export function useIntegrationJobItem(id: string) {
  return useQuery({
    queryKey: financeKeys.jobItemDetail(id),
    queryFn: () => financeApi.getJobItemById(id),
    enabled: Boolean(id),
  });
}
