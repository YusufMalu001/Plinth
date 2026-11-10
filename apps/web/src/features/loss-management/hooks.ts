import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  lossApi,
  LossEventQueryFilters,
  LossAnalyticsQueryFilters,
  CreateLossEventPayload,
  ClassifyLossEventPayload,
  ReviewLossEventPayload,
  RejectLossEventPayload,
  InvestigateLossEventPayload,
  CreateReplacementChallanPayload
} from './api';

export const lossKeys = {
  all: ['loss-management'] as const,
  list: (filters?: LossEventQueryFilters) => [...lossKeys.all, 'list', filters] as const,
  abnormalQueue: (filters?: LossEventQueryFilters) => [...lossKeys.all, 'abnormal-queue', filters] as const,
  analytics: (filters?: LossAnalyticsQueryFilters) => [...lossKeys.all, 'analytics', filters] as const,
  detail: (id: string) => [...lossKeys.all, 'detail', id] as const,
};

export function useLossAnalytics(filters?: LossAnalyticsQueryFilters) {
  return useQuery({
    queryKey: lossKeys.analytics(filters),
    queryFn: async () => {
      const res = await lossApi.getAnalytics(filters);
      return res;
    },
    staleTime: 60_000,
  });
}

export function useAbnormalLossQueue(filters?: LossEventQueryFilters) {
  return useQuery({
    queryKey: lossKeys.abnormalQueue(filters),
    queryFn: async () => {
      const res = await lossApi.getAbnormalQueue(filters);
      return res;
    },
  });
}

export function useLossEvents(filters?: LossEventQueryFilters) {
  return useQuery({
    queryKey: lossKeys.list(filters),
    queryFn: async () => {
      const res = await lossApi.list(filters);
      return res;
    },
  });
}

export function useLossEvent(id: string) {
  return useQuery({
    queryKey: lossKeys.detail(id),
    queryFn: async () => {
      const res = await lossApi.getById(id);
      return res;
    },
    enabled: Boolean(id),
  });
}

export function useReportLossEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLossEventPayload) => lossApi.report(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function useClassifyLossEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ClassifyLossEventPayload }) =>
      lossApi.classify(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function useReviewLossEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ReviewLossEventPayload }) =>
      lossApi.review(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function useApproveLossEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lossApi.approve(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function useRejectLossEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectLossEventPayload }) =>
      lossApi.reject(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function useInvestigateLossEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InvestigateLossEventPayload }) =>
      lossApi.investigate(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function usePostLossStockEffect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lossApi.postStockEffect(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useIssueReplacementChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateReplacementChallanPayload }) =>
      lossApi.issueReplacementChallan(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: lossKeys.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}

export function useAcknowledgeReplacementChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challanId: string) => lossApi.acknowledgeReplacementChallan(challanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lossKeys.all });
    },
  });
}
