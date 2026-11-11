import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fgApi, ListFgReadyOutputsParams, ListFgReceiptsParams } from './api';
import type { FgPackagingUpdateInput, FgReceiptCreateInput } from '@plinth/types';

export function useFgReadyOutputs(params?: ListFgReadyOutputsParams) {
  return useQuery({
    queryKey: ['fg-ready-outputs', params],
    queryFn: () => fgApi.listReadyOutputs(params),
    refetchInterval: 15000
  });
}

export function useFgReceipts(params?: ListFgReceiptsParams) {
  return useQuery({
    queryKey: ['fg-receipts', params],
    queryFn: () => fgApi.listReceipts(params),
    refetchInterval: 15000
  });
}

export function useFgGenealogy(receiptId?: string) {
  return useQuery({
    queryKey: ['fg-genealogy', receiptId],
    queryFn: () => fgApi.traceGenealogy(receiptId!),
    enabled: Boolean(receiptId)
  });
}

export function useUpdateFgPackaging() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ outputId, payload }: { outputId: string; payload: FgPackagingUpdateInput }) =>
      fgApi.updatePackagingStatus(outputId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fg-ready-outputs'] });
      queryClient.invalidateQueries({ queryKey: ['fg-receipts'] });
    }
  });
}

export function useReceiveFgThroughGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FgReceiptCreateInput) => fgApi.receiveThroughGate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fg-ready-outputs'] });
      queryClient.invalidateQueries({ queryKey: ['fg-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['assembly-batch'] });
      queryClient.invalidateQueries({ queryKey: ['production-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['department-execution'] });
    }
  });
}

export function useHoldFgReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ receiptId, reason }: { receiptId: string; reason: string }) =>
      fgApi.holdReceipt(receiptId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fg-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    }
  });
}

export function useReleaseFgReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ receiptId, releaseNotes }: { receiptId: string; releaseNotes?: string }) =>
      fgApi.releaseReceipt(receiptId, releaseNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fg-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    }
  });
}
