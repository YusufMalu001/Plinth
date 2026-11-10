import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentExecutionApi } from './execution-api';
import { showToast } from '../../components/toast-store';

export const executionKeys = {
  all: ['department-execution'] as const,
  queue: (deptId: string, params?: object) => [...executionKeys.all, 'queue', deptId, params] as const,
  batch: (id: string) => [...executionKeys.all, 'batch', id] as const,
  history: (id: string) => [...executionKeys.all, 'history', id] as const,
};

export function useDepartmentQueue(
  departmentId: string,
  params?: { page?: number; limit?: number; status?: string; search?: string }
) {
  return useQuery({
    queryKey: executionKeys.queue(departmentId, params),
    queryFn: () => departmentExecutionApi.getDepartmentQueue(departmentId, params),
    enabled: !!departmentId,
    refetchInterval: 10000 // Live shop floor polling
  });
}

export function useBatch(id: string) {
  return useQuery({
    queryKey: executionKeys.batch(id),
    queryFn: () => departmentExecutionApi.getBatch(id),
    enabled: !!id
  });
}

export function useBatchHistory(id: string) {
  return useQuery({
    queryKey: executionKeys.history(id),
    queryFn: () => departmentExecutionApi.getBatchHistory(id),
    enabled: !!id
  });
}

function invalidateExecution(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: executionKeys.all });
  queryClient.invalidateQueries({ queryKey: ['production-plans'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
}

export function useInitializeBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: departmentExecutionApi.initializeBatch,
    onSuccess: (batch) => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Batch Initialized', message: `Batch ${batch.batchNumber} created from released plan.` });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Initialization Failed', message: err.message || 'Could not initialize batch.' });
    }
  });
}

export function useReceiveBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, notes }: { batchId: string; notes?: string }) =>
      departmentExecutionApi.receiveBatch(batchId, { notes }),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Batch Received', message: 'Department confirmed physical receipt of the batch.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Receipt Failed', message: err.message || 'Could not receive batch.' });
    }
  });
}

export function useAssignWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, employeeId, subtaskDescription }: { batchId: string; employeeId: string; subtaskDescription?: string }) =>
      departmentExecutionApi.assignWorker(batchId, { employeeId, subtaskDescription }),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Worker Assigned', message: 'Worker attribution recorded for this batch.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Assignment Failed', message: err.message || 'Could not assign worker.' });
    }
  });
}

export function useUnassignWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, employeeId }: { batchId: string; employeeId: string }) =>
      departmentExecutionApi.unassignWorker(batchId, employeeId),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Worker Removed', message: 'Operator removed from this batch.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Action Failed', message: err.message || 'Could not remove worker.' });
    }
  });
}

export function useStartBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, employeeId, notes }: { batchId: string; employeeId: string; notes?: string }) =>
      departmentExecutionApi.startBatch(batchId, { employeeId, notes }),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Batch Started', message: 'Shop-floor execution is now active.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Start Failed', message: err.message || 'Could not start batch.' });
    }
  });
}

export function usePauseBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, employeeId, reason, notes }: { batchId: string; employeeId: string; reason: string; notes?: string }) =>
      departmentExecutionApi.pauseBatch(batchId, { employeeId, reason, notes }),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'warning', title: 'Batch Paused', message: 'Processing paused; reason logged.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Pause Failed', message: err.message || 'Could not pause batch.' });
    }
  });
}

export function useResumeBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, employeeId, notes }: { batchId: string; employeeId: string; notes?: string }) =>
      departmentExecutionApi.resumeBatch(batchId, { employeeId, notes }),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Batch Resumed', message: 'Active processing resumed.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Resume Failed', message: err.message || 'Could not resume batch.' });
    }
  });
}

export function useRecordProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...data
    }: {
      batchId: string;
      employeeId: string;
      quantityDelta?: number;
      completed_qty?: number;
      rejected_qty?: number;
      scrap_qty?: number;
      wastage_qty?: number;
      pending_qty?: number;
      eventType?: 'STARTED' | 'PAUSED' | 'RESUMED' | 'PARTIAL_RECORDED' | 'COMPLETED';
      notes?: string;
    }) => departmentExecutionApi.recordProgress(batchId, data),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Progress Logged', message: 'Quantity increment recorded.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Progress Failed', message: err.message || 'Could not record progress.' });
    }
  });
}

export function useRecordException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...data
    }: {
      batchId: string;
      type: 'REJECTION' | 'SCRAP' | 'WASTAGE' | 'PENDING' | 'INTERRUPTION';
      quantity: number;
      reason: string;
      employeeId: string;
    }) => departmentExecutionApi.recordException(batchId, data),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'warning', title: 'Exception Recorded', message: 'Defect / scrap / interruption logged with reason.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Exception Failed', message: err.message || 'Could not log exception.' });
    }
  });
}

export function useCompleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...data
    }: {
      batchId: string;
      employeeId: string;
      completed_qty: number;
      rejected_qty?: number;
      scrap_qty?: number;
      wastage_qty?: number;
      pending_qty?: number;
      notes?: string;
    }) => departmentExecutionApi.completeBatch(batchId, data),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Stage Completed', message: 'Quantities reconciled. Batch ready for handover or plan completion.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Completion Failed', message: err.message || 'Could not complete batch.' });
    }
  });
}

export function useProposeHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...data
    }: {
      batchId: string;
      incomingDepartmentId: string;
      quantity: number;
      idempotencyKey: string;
      notes?: string;
    }) => departmentExecutionApi.proposeHandover(batchId, data),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Handover Proposed', message: 'Handover transfer dispatched to incoming department.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Handover Failed', message: err.message || 'Could not propose handover.' });
    }
  });
}

export function useDecideHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      handoverId,
      ...data
    }: {
      handoverId: string;
      status: 'ACCEPTED' | 'REFUSED';
      refusalReason?: string;
      idempotencyKey?: string;
      notes?: string;
    }) => departmentExecutionApi.decideHandover(handoverId, data),
    onSuccess: (data: { status?: string; handover?: { status?: string } }) => {
      invalidateExecution(qc);
      const effectiveStatus = data?.status || data?.handover?.status;
      if (effectiveStatus === 'ACCEPTED') {
        showToast({ kind: 'success', title: 'Handover Accepted', message: 'Batch accepted into department custody.' });
      } else {
        showToast({ kind: 'warning', title: 'Handover Refused', message: 'Handover refused with reason logged.' });
      }
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Decision Failed', message: err.message || 'Could not decide handover.' });
    }
  });
}

export function useManagerialOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...data
    }: {
      batchId: string;
      action: 'OVERRIDE_STATUS' | 'OVERRIDE_SCRAP_LIMIT' | 'OVERRIDE_QUANTITY' | 'OVERRIDE_STAGE';
      reason: string;
      targetStatus?: string;
      targetStageSequence?: number;
      newScrapQuantity?: number;
      newCompletedQuantity?: number;
      notes?: string;
    }) => departmentExecutionApi.managerialOverride(batchId, data),
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'warning', title: 'Managerial Override Applied', message: 'Plant manager override recorded with audit note.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Override Failed', message: err.message || 'Could not apply managerial override.' });
    }
  });
}

export function usePostToInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...data
    }: {
      batchId: string;
      quantity?: number;
      locationId?: string;
      notes?: string;
    }) => departmentExecutionApi.postToInventory(batchId, data),
    onSuccess: (data) => {
      invalidateExecution(qc);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['production-plans'] });
      showToast({
        kind: 'success',
        title: 'Posted to Inventory & Store',
        message: data?.message || 'Finished goods successfully posted to stock ledger and inventory balance.'
      });
    },
    onError: (err: Error) => {
      showToast({
        kind: 'error',
        title: 'Inventory Posting Failed',
        message: err.message || 'Could not post finished goods to inventory.'
      });
    }
  });
}

export function useProductionSchedules(search?: string, enabled = true) {
  return useQuery({
    queryKey: [...executionKeys.all, 'schedules', search] as const,
    queryFn: () => departmentExecutionApi.listSchedules(search),
    enabled,
    refetchInterval: 12000
  });
}

export function useProductionScheduleDetail(planId: string, enabled = true) {
  return useQuery({
    queryKey: [...executionKeys.all, 'schedule-detail', planId] as const,
    queryFn: () => departmentExecutionApi.getSchedule(planId),
    enabled: !!planId && enabled,
    refetchInterval: enabled ? 10000 : false
  });
}

export function useReceiveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { assignmentId: string; quantity?: number }) => {
      const { assignmentId, quantity } = typeof input === 'string' ? { assignmentId: input, quantity: undefined } : input;
      return departmentExecutionApi.receiveAssignment(assignmentId, quantity);
    },
    onSuccess: () => {
      invalidateExecution(qc);
      showToast({ kind: 'success', title: 'Materials Received', message: 'Assigned raw materials acknowledged and received into department.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Receipt Failed', message: err.message || 'Could not receive materials.' });
    }
  });
}

export function useCreateAssemblyWave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, quantity, idempotencyKey }: { planId: string; quantity: number; idempotencyKey?: string }) =>
      departmentExecutionApi.createAssemblyWave(planId, { quantity, idempotencyKey }),
    onSuccess: () => {
      invalidateExecution(qc);
      qc.invalidateQueries({ queryKey: ['assembly-batches'] });
      showToast({ kind: 'success', title: 'Assembly Wave Created', message: 'Complete kits allocated and assembly wave created.' });
    },
    onError: (err: Error) => {
      showToast({ kind: 'error', title: 'Assembly Wave Failed', message: err.message || 'Could not create assembly wave.' });
    }
  });
}
