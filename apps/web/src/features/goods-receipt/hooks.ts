/**
 * Module 3 — Goods Receipt (GRN) TanStack Query hooks
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { grnApi, fetchApiWithParams, Grn, GrnListResponse } from './api';
import type { ExpectedReceiptListResponse } from '../purchases/api';
import { notificationKeys, poKeys, receiptKeys } from '../purchases/hooks';
import { GrnStatus, ExpectedReceiptStatus } from '@synergy/types';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const grnKeys = {
  all: ['goods-receipts'] as const,
  dashboard: ['goods-receipts', 'dashboard'] as const,
  capabilities: ['goods-receipts', 'capabilities'] as const,
  list: (filters?: object) => [...grnKeys.all, 'list', filters] as const,
  detail: (id: string) => [...grnKeys.all, 'detail', id] as const,
  history: (id: string) => [...grnKeys.all, 'history', id] as const,
  documents: (id: string) => [...grnKeys.all, 'documents', id] as const,
};

function invalidateWorkflowInbox(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useReceivingDashboard() {
  return useQuery({ queryKey: grnKeys.dashboard, queryFn: grnApi.getDashboard });
}

export function useGrnCapabilities() {
  return useQuery({
    queryKey: grnKeys.capabilities,
    queryFn: grnApi.getCapabilities,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export const grnExpectedKeys = {
  all: ['goods-receipts', 'expected'] as const,
  list: (filters?: object) => [...grnExpectedKeys.all, 'list', filters] as const,
};

// ─── Expected receipts queue ──────────────────────────────────────────────────

export function useGrnExpectedQueue(params?: { status?: ExpectedReceiptStatus; poId?: string }) {
  return useQuery({
    queryKey: grnExpectedKeys.list(params),
    queryFn: () =>
      fetchApiWithParams<ExpectedReceiptListResponse>('/goods-receipts/expected', {
        ...(params?.status && { status: params.status }),
        ...(params?.poId && { poId: params.poId }),
      }),
  });
}

// ─── GRN list / detail / history ──────────────────────────────────────────────

export function useGrnList(params?: { status?: GrnStatus; poId?: string; search?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: grnKeys.list(params),
    queryFn: () =>
      fetchApiWithParams<GrnListResponse>('/goods-receipts', {
        ...(params?.status && { status: params.status }),
        ...(params?.poId && { poId: params.poId }),
        ...(params?.search && { search: params.search }),
        ...(params?.page && { page: params.page }),
        ...(params?.limit && { limit: params.limit }),
      }),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
  });
}

export function useGrnDetail(id: string) {
  return useQuery({
    queryKey: grnKeys.detail(id),
    queryFn: () => grnApi.getGrn(id),
    enabled: !!id && id !== 'new',
  });
}

export function useGrnHistory(id: string) {
  return useQuery({
    queryKey: grnKeys.history(id),
    queryFn: () => grnApi.getGrnHistory(id),
    enabled: !!id && id !== 'new',
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateGrnFromPo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      idempotencyKey,
    }: {
      data: { poId: string; locationId?: string; lines: Array<{ poLineId: string; receivedQuantity?: number }> };
      idempotencyKey: string;
    }) => grnApi.createFromPo(data, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: grnKeys.all });
      queryClient.invalidateQueries({ queryKey: grnExpectedKeys.all });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useCreateUnreferencedGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      idempotencyKey,
    }: {
      data: {
        vendorId: string;
        locationId?: string;
        justification: string;
        lines: Array<{ productId?: string; materialId?: string; uomId: string; receivedQuantity?: number }>;
      };
      idempotencyKey: string;
    }) => grnApi.createUnreferenced(data, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: grnKeys.all });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useUpdateGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof grnApi.updateGrn>[1] }) =>
      grnApi.updateGrn(id, data),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(grnKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: grnKeys.all });
    },
  });
}

export function useRecordMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      grnId,
      lineId,
      data,
    }: {
      grnId: string;
      lineId: string;
      data: Parameters<typeof grnApi.recordMeasurement>[2];
    }) => grnApi.recordMeasurement(grnId, lineId, data),
    onSuccess: (_data, { grnId }) => {
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
      queryClient.invalidateQueries({ queryKey: grnKeys.history(grnId) });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useReprintLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grnId, lineId, reason }: { grnId: string; lineId: string; reason?: string }) =>
      grnApi.reprintLabel(grnId, lineId, { reason }),
    onSuccess: (_data, { grnId }) => {
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
    },
  });
}

export function useResolveDiscrepancy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      grnId,
      discrepancyId,
      body,
    }: {
      grnId: string;
      discrepancyId: string;
      body: Parameters<typeof grnApi.resolveDiscrepancy>[2];
    }) => grnApi.resolveDiscrepancy(grnId, discrepancyId, body),
    onSuccess: (data, { grnId }) => {
      // Apply the server's returned GRN immediately so resolved rows disappear
      // from the action list without waiting for another round trip.
      if (data?.grn) queryClient.setQueryData(grnKeys.detail(grnId), data.grn);
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
      queryClient.invalidateQueries({ queryKey: grnKeys.history(grnId) });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useSignOffGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => grnApi.signOff(id, { note }),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(grnKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: grnKeys.all });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useFinalizeGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => grnApi.finalize(id, { note }),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(grnKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: grnKeys.all });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export function useGrnDocuments(grnId: string) {
  return useQuery({
    queryKey: grnKeys.documents(grnId),
    queryFn: () => grnApi.listDocuments(grnId),
    enabled: !!grnId && grnId !== 'new',
  });
}

export function useUploadGrnDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grnId, file }: { grnId: string; file: File }) => grnApi.uploadDocument(grnId, file),
    onSuccess: (_data, { grnId }) => {
      queryClient.invalidateQueries({ queryKey: grnKeys.documents(grnId) });
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
    },
  });
}

export function useVerifyGrnLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grnId, data }: { grnId: string; data: Parameters<typeof grnApi.verifyLines>[1] }) =>
      grnApi.verifyLines(grnId, data),
    onSuccess: (data, { grnId }) => {
      queryClient.setQueryData(grnKeys.detail(grnId), data);
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
      queryClient.invalidateQueries({ queryKey: grnKeys.all });
      queryClient.invalidateQueries({ queryKey: ['vendor-scoring'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      queryClient.invalidateQueries({ queryKey: ['purchases', 'vendor-history'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useNotifyAccountantForDebitNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grnId, data }: { grnId: string; data: Parameters<typeof grnApi.notifyAccountantForDebitNote>[1] }) =>
      grnApi.notifyAccountantForDebitNote(grnId, data),
    onSuccess: (_data, { grnId }) => {
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export function useCreateDebitNoteFromGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grnId, reason, reasonCategory }: { grnId: string; reason: string; reasonCategory?: string }) => grnApi.createDebitNoteFromGrn(grnId, reason, { reasonCategory }),
    onSuccess: (_data, { grnId }) => {
      queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) });
      queryClient.invalidateQueries({ queryKey: ['vendor-scoring'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
      queryClient.invalidateQueries({ queryKey: ['purchases', 'vendor-history'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
      void invalidateWorkflowInbox(queryClient);
    },
  });
}

export type { Grn };
