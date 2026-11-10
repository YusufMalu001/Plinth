import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productionApi } from './api';
import { fetchApi } from '../api/client';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../auth/access-control';
import type { WorkspaceUser } from './types';

export const productionKeys = {
  all: ['production-plans'] as const,
  list: (filters?: object) => [...productionKeys.all, 'list', filters] as const,
  detail: (id: string) => [...productionKeys.all, 'detail', id] as const,
};

export function useProductionPlans(params?: { page?: number; limit?: number; search?: string; status?: string; scheduleType?: string; productId?: string; scheduleDateFrom?: string; scheduleDateTo?: string }) {
  return useQuery({
    queryKey: productionKeys.list(params),
    queryFn: () => productionApi.list(params),
    refetchInterval: (query) => query.state.data?.items?.some((plan) =>
      ["RELEASED", "IN_PROGRESS", "PARTIALLY_COMPLETED"].includes(plan.status)
    ) ? 10000 : false,
  });
}

export function useProductionPlan(id: string, options?: { refreshExecution?: boolean }) {
  return useQuery({
    queryKey: productionKeys.detail(id),
    queryFn: () => productionApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      if (!options?.refreshExecution) return false;
      return ["COMPLETED", "CANCELLED"].includes(query.state.data?.status ?? "") ? false : 10000;
    },
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: productionKeys.all });
}

export function useCreateProductionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.create,
    meta: { silentError: true },
    onSuccess: (data) => {
      invalidate(qc);
      showToast({
        kind: 'success',
        title: 'Production schedule created',
        message: data.status === 'APPROVED'
          ? `${data.planNumber || 'The schedule'} was approved and is ready for release to the floor.`
          : `${data.planNumber || 'The schedule'} was created and sent to the Admin approval queue.`,
      });
    }
  });
}

export function useUpdateProductionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) => productionApi.update(id, data),
    meta: { silentError: true },
    onSuccess: (_data, variables) => {
      invalidate(qc);
      qc.setQueryData(productionKeys.detail(variables.id), _data);
      qc.invalidateQueries({ queryKey: productionKeys.detail(variables.id) });
      showToast({
        kind: 'success',
        title: 'Production schedule updated',
        message: _data.status === 'APPROVED'
          ? `${_data.planNumber || 'The schedule'} was updated and remains approved, awaiting release to the floor.`
          : `${_data.planNumber || 'The schedule'} was updated and returned to the Admin approval queue.`,
      });
    }
  });
}

export function useDeleteProductionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productionApi.delete(id),
    onSuccess: (data) => {
      invalidate(qc);
      qc.setQueryData(productionKeys.detail(data.id), data);
      showToast({ kind: 'success', title: 'Schedule cancelled', message: `${data.planNumber} was cancelled and remains available in production history.` });
    },
    onError: (err) => {
      showToast({ kind: 'error', title: 'Cancellation Failed', message: friendlyErrorMessage(err) });
    },
  });
}

export function useProductionAction(action: 'check' | 'submit' | 'approve' | 'release' | 'interrupt' | 'partialComplete' | 'start' | 'cancel') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      (productionApi[action] as (id: string, payload?: unknown) => Promise<unknown>)(id, data),
    onSuccess: () => {
      invalidate(qc);
      const actionMessage = action === 'approve'
        ? { title: 'Schedule approved', message: 'The schedule is approved and waiting for an Admin to release it to the floor.' }
        : action === 'release'
          ? { title: 'Released to floor', message: 'The schedule was released and is now available to department execution.' }
          : { title: 'Schedule updated', message: 'Production plan state changed successfully.' };
      showToast({ kind: 'success', ...actionMessage });
    },
    onError: (error) => {
      if (action === 'release') {
        showToast({ kind: 'error', title: 'Release Failed', message: friendlyErrorMessage(error) });
      }
    },
  });
}

export function useIssueProductionMaterial() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...data }: { id: string; requirementId: string; quantity: number; locationId?: string; lotId?: string | null; reason?: string; idempotencyKey?: string }) => productionApi.issueMaterial(id, data), onSuccess: (_data, variables) => { qc.invalidateQueries({ queryKey: productionKeys.detail(variables.id) }); showToast({ kind: 'success', title: 'Material issued', message: 'Inventory and production requirement were updated.' }); } });
}

export function useReverseProductionMaterialIssue() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, issueId, reason }: { id: string; issueId: string; reason?: string }) => productionApi.reverseMaterialIssue(id, issueId, reason), onSuccess: (_data, variables) => { qc.invalidateQueries({ queryKey: productionKeys.detail(variables.id) }); showToast({ kind: 'success', title: 'Issue reversed', message: 'A compensating inventory movement was posted.' }); } });
}

export function useRecordProductionOutput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; quantity: number; rejectedQuantity?: number; damagedQuantity?: number; uomId?: string; locationId?: string; lotId?: string | null; note?: string; idempotencyKey?: string }) => productionApi.recordOutput(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: productionKeys.detail(variables.id) });
      qc.invalidateQueries({ queryKey: productionKeys.all });
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
      qc.invalidateQueries({ queryKey: ['stock-balances'] });
      qc.invalidateQueries({ queryKey: ['stock-ledger'] });
      showToast({ kind: 'success', title: 'Output recorded', message: 'Finished-goods inventory and production progress were updated.' });
    }
  });
}

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ['workspace-users'],
    queryFn: () => fetchApi<{ users: WorkspaceUser[] }>('/users?page=1&limit=100').then((d) => {
      const list = (d as unknown as { users?: WorkspaceUser[] }).users ?? (d as unknown as WorkspaceUser[]);
      return Array.isArray(list) ? list : [];
    }).catch(() => []),
    staleTime: 5 * 60 * 1000,
    meta: { silentError: true },
  });
}
