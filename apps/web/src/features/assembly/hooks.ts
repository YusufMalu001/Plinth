import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  assemblyApi,
  ListAssemblyBatchesParams,
  PlanAssemblyBatchPayload,
  AllocateAssemblyComponentsPayload,
  CompleteAssemblyBatchPayload,
  QcDispositionPayload
} from './api';
import { showToast } from '../../components/toast-store';

export const assemblyKeys = {
  all: ['assembly-batches'] as const,
  list: (filters?: ListAssemblyBatchesParams) => [...assemblyKeys.all, 'list', filters] as const,
  detail: (id: string) => [...assemblyKeys.all, 'detail', id] as const,
};

export function useAssemblyBatches(params?: ListAssemblyBatchesParams) {
  return useQuery({
    queryKey: assemblyKeys.list(params),
    queryFn: () => assemblyApi.listBatches(params),
  });
}

export function useAssemblyBatch(
  id: string,
  options?: { enabled?: boolean; meta?: Record<string, unknown> }
) {
  return useQuery({
    queryKey: assemblyKeys.detail(id),
    queryFn: () => assemblyApi.getBatch(id),
    enabled: options?.enabled !== undefined ? options.enabled : !!id,
    meta: options?.meta,
  });
}

export function usePlanAssemblyBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PlanAssemblyBatchPayload) => assemblyApi.planBatch(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.all });
      queryClient.invalidateQueries({ queryKey: ['production-plans'] });
      queryClient.invalidateQueries({ queryKey: ['department-execution'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      showToast({
        title: 'Assembly Batch Planned',
        message: `Batch ${data.batchNumber} created successfully in PLANNED status.`,
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Planning Failed',
        message: err.message || 'Could not plan assembly batch.',
        kind: 'error'
      });
    }
  });
}

export function useAllocateAssemblyComponents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AllocateAssemblyComponentsPayload }) =>
      assemblyApi.allocateComponents(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.all });
      showToast({
        title: 'Components Allocated',
        message: `Kit components allocated for batch ${data.batchNumber}.`,
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Allocation Failed',
        message: err.message || 'Could not allocate components.',
        kind: 'error'
      });
    }
  });
}

export function useStartAssemblyBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actualStartDate }: { id: string; actualStartDate?: string }) =>
      assemblyApi.startBatch(id, actualStartDate ? { actualStartDate } : {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.all });
      showToast({
        title: 'Assembly Started',
        message: `Batch ${data.batchNumber} is now IN_ASSEMBLY.`,
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Execution Start Failed',
        message: err.message || 'Could not start assembly execution.',
        kind: 'error'
      });
    }
  });
}

export function useAssignAssemblyWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload
    }: {
      id: string;
      payload: { employeeId: string; subtaskDescription?: string | null };
    }) => assemblyApi.assignWorker(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.detail(vars.id) });
      showToast({
        title: 'Worker Assigned',
        message: 'Worker has been assigned to this assembly station.',
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Worker Assignment Failed',
        message: err.message || 'Could not assign worker.',
        kind: 'error'
      });
    }
  });
}

export function useUnassignAssemblyWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string }) =>
      assemblyApi.unassignWorker(id, employeeId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.detail(vars.id) });
      showToast({
        title: 'Worker Removed',
        message: 'Operator removed from this assembly station.',
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Worker Removal Failed',
        message: err.message || 'Could not unassign worker.',
        kind: 'error'
      });
    }
  });
}

export function useRecordAssemblyProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload
    }: {
      id: string;
      payload: {
        employeeId: string;
        eventType: import('@plinth/types').ProgressEventType;
        quantityDelta: number;
        notes?: string | null;
      };
    }) => assemblyApi.recordProgress(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.detail(vars.id) });
      showToast({
        title: 'Progress Recorded',
        message: 'Assembly workstation progress updated.',
        kind: 'info'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Recording Failed',
        message: err.message || 'Could not record progress event.',
        kind: 'error'
      });
    }
  });
}

export function useCompleteAssemblyBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CompleteAssemblyBatchPayload }) =>
      assemblyApi.completeBatch(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.all });
      showToast({
        title: 'Assembly Completed',
        message: `Batch ${data.batchNumber} has completed assembly and moved to QC_PENDING.`,
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'Completion Failed',
        message: err.message || 'Could not complete assembly.',
        kind: 'error'
      });
    }
  });
}

export function useQcDispositionAssemblyBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: QcDispositionPayload }) =>
      assemblyApi.qcDisposition(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assemblyKeys.all });
      queryClient.invalidateQueries({ queryKey: ['production-plans'] });
      queryClient.invalidateQueries({ queryKey: ['department-execution'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      showToast({
        title: 'QC Disposition Applied',
        message: `Batch ${data.batchNumber} updated to ${data.status}.`,
        kind: 'success'
      });
    },
    onError: (err: any) => {
      showToast({
        title: 'QC Disposition Failed',
        message: err.message || 'Could not complete QC disposition.',
        kind: 'error'
      });
    }
  });
}
