/**
 * Module 5 — BOM / Formula Engine TanStack Query hooks
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { bomApi } from './api';
import { showToast } from '../../components/toast-store';
import { BomStatus } from '@synergy/types';
import type {
  CreateBomDraftInput,
  UpdateBomDraftInput,
  AddGoldenExampleInput,
  RunSimulationInput,
} from './types';

export const bomKeys = {
  all: ['bom-versions'] as const,
  list: (filters?: object) => [...bomKeys.all, 'list', filters] as const,
  detail: (id: string) => [...bomKeys.all, 'detail', id] as const,
  goldenExamples: (id: string) => [...bomKeys.all, 'golden-examples', id] as const,
  simulations: (id: string) => [...bomKeys.all, 'simulations', id] as const,
  diff: (fromId: string, toId: string) => [...bomKeys.all, 'diff', fromId, toId] as const,
  history: (id: string) => [...bomKeys.all, 'history', id] as const,
  calculate: (params: object) => [...bomKeys.all, 'calculate', params] as const,
};

export function useBomNameConflict(name: string, excludeId?: string) {
  const [debouncedName, setDebouncedName] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(name.trim()), 250);
    return () => clearTimeout(timer);
  }, [name]);
  const query = useQuery({
    queryKey: [...bomKeys.all, 'name-availability', debouncedName, excludeId],
    queryFn: () => bomApi.checkName(debouncedName, excludeId),
    enabled: Boolean(debouncedName) && debouncedName === name.trim(),
    staleTime: 0,
    meta: { silentError: true },
  });
  return {
    ...query,
    isConflict: Boolean(name.trim() && debouncedName === name.trim() && query.data?.exists),
  };
}

export function useBomVersions(
  params?: {
    productId?: string;
    materialId?: string;
    productVariantId?: string;
    status?: BomStatus;
    page?: number;
    limit?: number;
    search?: string;
  },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: bomKeys.list(params),
    queryFn: () => bomApi.listVersions(params),
    enabled: options?.enabled !== undefined ? options.enabled : true,
    placeholderData: keepPreviousData,
    meta: { silentError: true },
  });
}

export function useBomVersion(id: string) {
  return useQuery({
    queryKey: bomKeys.detail(id),
    queryFn: () => bomApi.getVersion(id),
    enabled: !!id && id !== 'new',
  });
}

export function useBomGoldenExamples(id: string) {
  return useQuery({
    queryKey: bomKeys.goldenExamples(id),
    queryFn: () => bomApi.listGoldenExamples(id),
    enabled: !!id,
  });
}

export function useBomSimulations(id: string) {
  return useQuery({
    queryKey: bomKeys.simulations(id),
    queryFn: () => bomApi.listSimulations(id),
    enabled: !!id,
  });
}

export function useBomDiff(fromId: string, toId: string) {
  return useQuery({
    queryKey: bomKeys.diff(fromId, toId),
    queryFn: () => bomApi.compare(fromId, toId),
    enabled: !!fromId && !!toId,
  });
}

export function useBomHistory(id: string) {
  return useQuery({
    queryKey: bomKeys.history(id),
    queryFn: () => bomApi.getHistory(id),
    enabled: !!id,
  });
}

export function useCalculateRequirements(params: {
  productId: string;
  productVariantId?: string;
  requestedQuantity: number;
  requestedUomId: string;
  date?: string;
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: bomKeys.calculate(params),
    queryFn: () => bomApi.calculate(params),
    enabled: options?.enabled !== false && !!params.productId && params.requestedQuantity > 0 && !!params.requestedUomId,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateBomDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: (data: CreateBomDraftInput) => bomApi.createDraft(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bomKeys.all });
    },
  });
}

export function useUpdateBomDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, data }: { id: string; data: UpdateBomDraftInput }) =>
      bomApi.updateDraft(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bomKeys.list() });
    },
  });
}

export function useDeleteBomDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => bomApi.deleteDraft(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.all });
      showToast({
        kind: 'success',
        title: result.action === 'RETIRED' ? 'BOM Removed from Product' : 'BOM Deleted',
        message: result.action === 'RETIRED'
          ? 'This BOM was used in production, so it was retired safely and removed from active product use.'
          : 'The BOM and its formula data were permanently removed.'
      });
    },
    onError: (err: unknown) => {
      showToast({ kind: 'error', title: 'Delete Failed', message: (err as Error)?.message || 'Unable to delete this BOM.' });
    },
  });
}

export function useDeleteBomDrafts() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: (ids: string[]) => bomApi.deleteDrafts(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bomKeys.all });
    },
  });
}

export function useValidateBom() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => bomApi.validate(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bomKeys.list() });
      showToast({
        kind: 'success',
        title: 'Validation Passed',
        message: `BOM ${data.bomNumber} is now VALIDATION_PENDING and ready for approval.`,
      });
    },
    onError: (err: unknown) => {
      showToast({
        kind: 'error',
        title: 'Validation Blocked',
        message: (err as Error)?.message || 'BOM failed validation checks.',
      });
    },
  });
}

export function useApproveBom() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: (id: string) => bomApi.approve(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bomKeys.all });
      showToast({
        kind: 'success',
        title: 'BOM Approved',
        message: `BOM ${data.bomNumber} (v${data.version}) is now APPROVED and live.`,
      });
    },
    onError: (err: unknown) => {
      showToast({
        kind: 'error',
        title: 'Approval Failed',
        message: (err as Error)?.message || 'Unable to approve BOM version.',
      });
    },
  });
}

export function useSupersedeBom() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, data }: { id: string; data: { replacementVersionId?: string } }) =>
      bomApi.supersede(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bomKeys.all });
      showToast({
        kind: 'info',
        title: 'BOM Status Changed',
        message: `BOM ${data.bomNumber} status is now ${data.status}.`,
      });
    },
    onError: (err: unknown) => {
      showToast({
        kind: 'error',
        title: 'Action Failed',
        message: (err as Error)?.message || 'Unable to supersede/retire BOM version.',
      });
    },
  });
}

export function useAddGoldenExample() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, data }: { id: string; data: AddGoldenExampleInput }) =>
      bomApi.addGoldenExample(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.goldenExamples(variables.id) });
      queryClient.invalidateQueries({ queryKey: bomKeys.detail(variables.id) });
      showToast({
        kind: 'success',
        title: 'Golden Example Added',
        message: 'New reference test fixture registered successfully.',
      });
    },
    onError: (err: unknown) => {
      showToast({
        kind: 'error',
        title: 'Failed to Add Golden Example',
        message: (err as Error)?.message || 'Could not register golden example fixture.',
      });
    },
  });
}

export function useRunSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, data }: { id: string; data: RunSimulationInput }) =>
      bomApi.runSimulation(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.simulations(variables.id) });
      showToast({
        kind: 'info',
        title: 'Simulation Executed',
        message: 'Pre-production requirement calculation completed.',
      });
    },
    onError: (err: unknown) => {
      showToast({
        kind: 'error',
        title: 'Simulation Failed',
        message: (err as Error)?.message || 'Unable to run BOM simulation.',
      });
    },
  });
}
