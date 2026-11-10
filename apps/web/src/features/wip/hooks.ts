import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wipApi } from './api';
import type {
  WipBatchFilterParams,
  WipExceptionFilterParams,
  WipTimingFilterParams,
  RunReconciliationParams
} from './types';

export const wipKeys = {
  all: ['wip'] as const,
  overview: (params?: { departmentId?: string; productionPlanId?: string }) =>
    [...wipKeys.all, 'overview', params] as const,
  batches: (params?: WipBatchFilterParams) =>
    [...wipKeys.all, 'batches', params] as const,
  batchDetail: (id: string) =>
    [...wipKeys.all, 'batch-detail', id] as const,
  genealogy: (id: string) =>
    [...wipKeys.all, 'genealogy', id] as const,
  queue: (departmentId: string, params?: { status?: string; page?: number; limit?: number }) =>
    [...wipKeys.all, 'queue', departmentId, params] as const,
  timing: (params?: WipTimingFilterParams) =>
    [...wipKeys.all, 'timing', params] as const,
  exceptions: (params?: WipExceptionFilterParams) =>
    [...wipKeys.all, 'exceptions', params] as const,
  exceptionDetail: (id: string) =>
    [...wipKeys.all, 'exception-detail', id] as const,
};

// 1. Overview Hook
export function useWipOverview(params?: { departmentId?: string; productionPlanId?: string }) {
  return useQuery({
    queryKey: wipKeys.overview(params),
    queryFn: () => wipApi.getOverview(params),
    staleTime: 10_000,
  });
}

// 2. Batches Hook
export function useWipBatches(params?: WipBatchFilterParams) {
  return useQuery({
    queryKey: wipKeys.batches(params),
    queryFn: () => wipApi.listBatches(params),
    staleTime: 10_000,
  });
}

// 3. Batch Detail Hook
export function useWipBatchDetail(id: string) {
  return useQuery({
    queryKey: wipKeys.batchDetail(id),
    queryFn: () => wipApi.getBatchById(id),
    enabled: Boolean(id),
  });
}

// 4. Batch Genealogy Hook
export function useWipBatchGenealogy(id: string) {
  return useQuery({
    queryKey: wipKeys.genealogy(id),
    queryFn: () => wipApi.getBatchGenealogy(id),
    enabled: Boolean(id),
  });
}

// 5. Department Queue Hook
export function useWipDepartmentQueue(
  departmentId: string,
  params?: { status?: string; page?: number; limit?: number }
) {
  return useQuery({
    queryKey: wipKeys.queue(departmentId, params),
    queryFn: () => wipApi.getDepartmentQueue(departmentId, params),
    enabled: Boolean(departmentId),
    staleTime: 10_000,
  });
}

// 6. Timing Metrics Hook
export function useWipTimingMetrics(params?: WipTimingFilterParams) {
  return useQuery({
    queryKey: wipKeys.timing(params),
    queryFn: () => wipApi.getTimingMetrics(params),
    staleTime: 15_000,
  });
}

// 7. Reconciliation Check Mutation
export function useRunReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data?: RunReconciliationParams) => wipApi.runReconciliation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wipKeys.all });
    },
  });
}

// 8. Exceptions Hooks
export function useWipExceptions(params?: WipExceptionFilterParams) {
  return useQuery({
    queryKey: wipKeys.exceptions(params),
    queryFn: () => wipApi.listExceptions(params),
    staleTime: 10_000,
  });
}

export function useWipExceptionDetail(id: string) {
  return useQuery({
    queryKey: wipKeys.exceptionDetail(id),
    queryFn: () => wipApi.getExceptionById(id),
    enabled: Boolean(id),
  });
}

export function useInvestigateException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      wipApi.investigateException(id, { investigationNotes: notes }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: wipKeys.exceptions() });
      queryClient.invalidateQueries({ queryKey: wipKeys.exceptionDetail(id) });
      queryClient.invalidateQueries({ queryKey: wipKeys.overview() });
    },
  });
}

export function useResolveException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
      wipApi.resolveException(id, { resolutionNotes }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: wipKeys.exceptions() });
      queryClient.invalidateQueries({ queryKey: wipKeys.exceptionDetail(id) });
      queryClient.invalidateQueries({ queryKey: wipKeys.overview() });
    },
  });
}

export function useDismissException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
      wipApi.dismissException(id, { resolutionNotes }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: wipKeys.exceptions() });
      queryClient.invalidateQueries({ queryKey: wipKeys.exceptionDetail(id) });
      queryClient.invalidateQueries({ queryKey: wipKeys.overview() });
    },
  });
}
