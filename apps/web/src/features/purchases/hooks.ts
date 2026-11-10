/**
 * Module 2 — Procurement TanStack Query hooks
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchApiWithParams, purchasesApi, PR, PO, ExpectedReceipt } from './api';
import { PrStatus, PoStatus, ExpectedReceiptStatus } from '@synergy/types';
import { expandMaterialsWithVariants, expandProductsWithVariants, Material, Product } from '../../hooks/useMasterData';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const prKeys = {
  all: ['purchases', 'requisitions'] as const,
  list: (filters?: object) => [...prKeys.all, 'list', filters] as const,
  detail: (id: string) => [...prKeys.all, 'detail', id] as const,
};

export const poKeys = {
  all: ['purchases', 'orders'] as const,
  list: (filters?: object) => [...poKeys.all, 'list', filters] as const,
  detail: (id: string) => [...poKeys.all, 'detail', id] as const,
};

export const receiptKeys = {
  all: ['purchases', 'expected-receipts'] as const,
  list: (filters?: object) => [...receiptKeys.all, 'list', filters] as const,
};

export const procurementDashboardKey = ['purchases', 'dashboard'] as const;
export const notificationKeys = { all: ['purchases', 'notifications'] as const };

export function useProcurementDashboard() {
  return useQuery({ queryKey: procurementDashboardKey, queryFn: purchasesApi.getDashboard, staleTime: 60_000, refetchOnMount: true });
}

export function useProcurementNotifications() {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: purchasesApi.listNotifications,
    // Notifications are useful when fresh, but polling every 30s adds work to
    // every page. Keep one shared cache and only poll while the tab is visible.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: purchasesApi.markNotificationRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }) });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: purchasesApi.markAllNotificationsRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }) });
}

// ─── PR Hooks ─────────────────────────────────────────────────────────────────

export function usePRList(params?: { status?: PrStatus; search?: string; page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: prKeys.list(params),
    queryFn: () =>
      fetchApiWithParams<{ items: PR[]; total: number }>('/purchases/requisitions', {
        ...(params?.status && { status: params.status }),
        ...(params?.search && { search: params.search }),
        ...(params?.page && { page: params.page }),
        ...(params?.limit && { limit: params.limit }),
        ...(params?.sortBy && { sortBy: params.sortBy }),
        ...(params?.sortOrder && { sortOrder: params.sortOrder }),
        ...(params?.startDate && { startDate: params.startDate }),
        ...(params?.endDate && { endDate: params.endDate }),
      }),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
  });
}

export function usePRDetail(id: string) {
  return useQuery({
    queryKey: prKeys.detail(id),
    queryFn: () => purchasesApi.getPR(id),
    enabled: !!id && id !== 'new' && id !== 'undefined',
    refetchOnMount: true,
  });
}

export function useVendorRecommendations(id: string, enabled = false) {
  return useQuery({
    queryKey: [...prKeys.detail(id), 'vendor-recommendations'],
    queryFn: () => purchasesApi.recommendVendors(id),
    enabled: Boolean(id) && enabled,
    staleTime: 5 * 60_000,
    // Recommendation calls are advisory/background work. A PR can become
    // locked while this request is in flight, which is an expected 409/422
    // transition and should not produce a disruptive global error toast.
    meta: { silentError: true },
  });
}

export function useSelectVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vendorId, overrideReason }: { id: string; vendorId: string; overrideReason?: string; vendor?: { id: string; code: string; name: string } }) => purchasesApi.selectVendor(id, vendorId, overrideReason),
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(variables.id) });
      const recommendationKey = [...prKeys.detail(variables.id), 'vendor-recommendations'];
      await queryClient.cancelQueries({ queryKey: recommendationKey });
      queryClient.removeQueries({ queryKey: recommendationKey, exact: true });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(variables.id));
      if (previous) {
        queryClient.setQueryData<PR>(prKeys.detail(variables.id), {
          ...previous,
          preferredVendorId: variables.vendorId,
          preferredVendor: variables.vendor ?? previous.preferredVendor,
        });
      }
      return { previous };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(variables.id), context.previous);
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<PR>(prKeys.detail(variables.id), current => current ? {
        ...current,
        ...(data ?? {}),
        preferredVendorId: variables.vendorId,
        preferredVendor: variables.vendor ?? current.preferredVendor,
      } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.detail(variables.id), refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
    }
  });
}

export function useNextPrNumber() {
  return useQuery({
    queryKey: [...prKeys.all, 'next-number'],
    queryFn: () => purchasesApi.getNextPrNumber(),
  });
}

export function useCreatePR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: purchasesApi.createPR,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prKeys.all });
    },
  });
}

export function useCreateAndSubmitPR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: purchasesApi.createAndSubmitPR,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prKeys.all });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: procurementDashboardKey });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useUpdatePR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; data: Parameters<typeof purchasesApi.updatePR>[1] }) => purchasesApi.updatePR(params.id, params.data),
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(variables.id) });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(variables.id));
      if (previous) {
        const data = variables.data;
        queryClient.setQueryData<PR>(prKeys.detail(variables.id), current => current ? {
          ...current,
          departmentId: data.departmentId ?? current.departmentId,
          preferredVendorId: data.preferredVendorId ?? current.preferredVendorId,
          needDate: data.needDate ? new Date(data.needDate).toISOString() : current.needDate,
          priority: data.priority ?? current.priority,
          businessJustification: data.businessJustification ?? current.businessJustification,
          deliveryLocation: data.deliveryLocation ?? current.deliveryLocation,
          costCenter: data.costCenter ?? current.costCenter,
          projectCode: data.projectCode ?? current.projectCode,
          notes: data.notes ?? current.notes,
          lines: data.lines?.map((line, index) => ({
            ...current.lines[index],
            ...line,
            requestedQuantity: Number(line.requestedQuantity),
            needDateOverride: line.needDateOverride instanceof Date
              ? line.needDateOverride.toISOString()
              : line.needDateOverride,
          })) ?? current.lines,
        } : current);
      }
      return { previous };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(variables.id), context.previous);
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<PR>(prKeys.detail(variables.id), current => current ? { ...current, ...(data ?? {}) } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.detail(variables.id), refetchType: 'active' });
    },
  });
}

export function useSubmitPR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => purchasesApi.submitPR(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(id) });
      const recommendationKey = [...prKeys.detail(id), 'vendor-recommendations'];
      await queryClient.cancelQueries({ queryKey: recommendationKey });
      queryClient.removeQueries({ queryKey: recommendationKey, exact: true });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(id));
      return { previous };
    },
    onError: (_error, id, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(id), context.previous);
    },
    onSuccess: (data, id) => {
      queryClient.setQueryData<PR>(prKeys.detail(id), current => current ? { ...current, ...(data ?? {}) } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.detail(id), refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: procurementDashboardKey });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useApprovePR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      purchasesApi.approvePR(id, { reason }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(id) });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(id));
      if (previous) {
        const next = previous.preferredVendorId
          ? (previous.approvalStage === 'STORE_REVIEW'
            ? { ...previous, approvalStage: 'ADMIN_REVIEW' as const }
            : { ...previous, status: 'PO_CREATED' as PrStatus, approvalStage: 'COMPLETED' as const })
          : { ...previous, status: 'APPROVED' as PrStatus };
        queryClient.setQueryData<PR>(prKeys.detail(id), next);
      }
      return { previous };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(id), context.previous);
    },
    onSuccess: (data, { id }) => {
      queryClient.setQueryData<PR>(prKeys.detail(id), current => current ? { ...current, ...(data ?? {}) } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.detail(id), refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: procurementDashboardKey });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useRejectPR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      purchasesApi.rejectPR(id, { reason }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(id) });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(id));
      if (previous) queryClient.setQueryData<PR>(prKeys.detail(id), { ...previous, status: 'REJECTED' as PrStatus });
      return { previous };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(id), context.previous);
    },
    onSuccess: (data, { id }) => {
      queryClient.setQueryData<PR>(prKeys.detail(id), current => current ? { ...current, ...(data ?? {}) } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.detail(id), refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: procurementDashboardKey });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useRequestChangesPR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      purchasesApi.requestChangesPR(id, { reason }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(id) });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(id));
      if (previous) queryClient.setQueryData<PR>(prKeys.detail(id), { ...previous, status: 'CHANGES_REQUESTED' as PrStatus, approvalStage: 'RETURNED' });
      return { previous };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(id), context.previous);
    },
    onSuccess: (data, { id }) => {
      queryClient.setQueryData<PR>(prKeys.detail(id), current => current ? { ...current, ...(data ?? {}) } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.detail(id), refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useCancelPR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      purchasesApi.cancelPR(id, { reason }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: prKeys.detail(id) });
      const previous = queryClient.getQueryData<PR>(prKeys.detail(id));
      if (previous) queryClient.setQueryData<PR>(prKeys.detail(id), { ...previous, status: 'CANCELLED' as PrStatus });
      return { previous };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(prKeys.detail(id), context.previous);
    },
    onSuccess: (data, { id }) => {
      queryClient.setQueryData<PR>(prKeys.detail(id), current => current ? { ...current, ...(data ?? {}) } : data);
      queryClient.invalidateQueries({ queryKey: prKeys.detail(id), refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: prKeys.all, refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

// ─── PO Hooks ─────────────────────────────────────────────────────────────────

export function usePOList(params?: { status?: PoStatus; vendorId?: string; search?: string; page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: poKeys.list(params),
    queryFn: () =>
      fetchApiWithParams<{ items: PO[]; total: number }>('/purchases/orders', {
        ...(params?.status && { status: params.status }),
        ...(params?.vendorId && { vendorId: params.vendorId }),
        ...(params?.search && { search: params.search }),
        ...(params?.page && { page: params.page }),
        ...(params?.limit && { limit: params.limit }),
        ...(params?.sortBy && { sortBy: params.sortBy }),
        ...(params?.sortOrder && { sortOrder: params.sortOrder }),
        ...(params?.startDate && { startDate: params.startDate }),
        ...(params?.endDate && { endDate: params.endDate }),
      }),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
  });
}

export function usePODetail(id: string) {
  return useQuery({
    queryKey: poKeys.detail(id),
    queryFn: () => purchasesApi.getPO(id),
    enabled: !!id,
    refetchOnMount: true,
  });
}

export function useNextPoNumber() {
  return useQuery({
    queryKey: [...poKeys.all, 'next-number'],
    queryFn: () => purchasesApi.getNextPoNumber(),
  });
}

export function useGeneratePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: purchasesApi.generatePO,
    // The PO creation workspace presents a contextual error toast on failure.
    // Avoid stacking the global generic mutation toast on top of it.
    meta: { silentError: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
    },
  });
}

export function useRecommendVendorsForPO() {
  return useMutation({
    mutationFn: purchasesApi.recommendVendorsForPO,
  });
}

export function useApprovePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      purchasesApi.approvePO(id, { reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}

export function useUpdatePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        vendorId?: string;
        paymentTerms?: string;
        deliveryLocation?: string;
        dispatchedThrough?: string;
        otherReferences?: string;
        termsOfDelivery?: string;
        notes?: string;
        lines?: Array<{
          productId?: string;
          materialId?: string;
          uomId: string;
          quantity: number;
          unitPrice?: number;
          needDate: string;
        }>;
      };
    }) => purchasesApi.updatePO(id, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}

export function useRequestChangesPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      purchasesApi.requestChangesPO(id, { reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useSendPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, method }: { id: string; method?: string }) =>
      purchasesApi.sendPO(id, { method }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}

export function useResendPOEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => purchasesApi.resendPOEmail(id),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useRevisePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      lines,
    }: {
      id: string;
      reason?: string;
      lines: Array<{
        productId?: string;
        materialId?: string;
        uomId: string;
        quantity: number;
        needDate: string;
      }>;
    }) => purchasesApi.revisePO(id, { reason, lines }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}

export function useCancelPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      purchasesApi.cancelPO(id, { reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}

export function useRejectPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      purchasesApi.rejectPO(id, { reason }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: poKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}

export function useDeletePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, poNumber }: { id: string; poNumber: string }) => purchasesApi.deletePO(id, poNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: poKeys.all });
    },
    meta: { silentError: true },
  });
}

// ─── Expected Receipts Hooks ──────────────────────────────────────────────────

export function useExpectedReceipts(params?: {
  poId?: string;
  status?: ExpectedReceiptStatus | '';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
}) {
  return useQuery({
    queryKey: receiptKeys.list(params),
    queryFn: () =>
      fetchApiWithParams<{ items: ExpectedReceipt[]; total: number; page?: number; limit?: number; totalPages?: number; summary?: { total: number; pending: number; partiallyReceived: number; fullyReceived: number; overdue: number } }>('/purchases/expected-receipts', {
        ...(params?.poId && { poId: params.poId }),
        ...(params?.status && { status: params.status }),
        ...(params?.search && { search: params.search }),
        ...(params?.page && { page: params.page }),
        ...(params?.limit && { limit: params.limit }),
        ...(params?.sortBy && { sortBy: params.sortBy }),
        ...(params?.sortOrder && { sortOrder: params.sortOrder }),
        ...(params?.dateFrom && { dateFrom: params.dateFrom }),
        ...(params?.dateTo && { dateTo: params.dateTo }),
        ...(params?.overdueOnly && { overdueOnly: 'true' }),
      }),
    refetchOnMount: true,
  });
}

export function useExpectedReceiptDetail(id: string) {
  return useQuery({ queryKey: [...receiptKeys.all, 'detail', id], queryFn: () => purchasesApi.getExpectedReceipt(id), enabled: Boolean(id), refetchOnMount: true });
}

export function useUpdateExpectedReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED';
    }) => purchasesApi.updateExpectedReceipt(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
    },
  });
}

export function useUploadExpectedReceiptDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => purchasesApi.uploadExpectedReceiptDocument(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: receiptKeys.all }),
  });
}

// ─── Vendor History Hook ──────────────────────────────────────────────────────

export function useVendorHistory(vendorId: string | null) {
  return useQuery({
    queryKey: ['purchases', 'vendor-history', vendorId],
    queryFn: () => purchasesApi.getVendorHistory(vendorId!),
    enabled: !!vendorId,
  });
}

// ─── Approved-entity selector hooks (for pickers) ────────────────────────────

type SelectorList<T> = { items?: T[]; total?: number } | T[] | undefined;
const selectorItems = <T,>(result: SelectorList<T>): T[] => Array.isArray(result) ? result : (result?.items ?? []);
const selectorOptions = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false } as const;
// Legacy imports may still be in DRAFT/PENDING_VALIDATION. They are valid
// catalogue choices until explicitly retired; only terminal lifecycle states
// must be hidden from a requisition.
const isSelectableStatus = (status?: string) => !status || !['INACTIVE', 'ARCHIVED', 'SUPERSEDED', 'REJECTED'].includes(status);

type ProcurementSelectorData = {
  vendors: { items: { id: string; code: string; name: string; status?: string }[]; total: number };
  products: { items: { id: string; purchaseItemId?: string; sku: string; name: string; status?: string; uomId?: string; metadata?: any; category?: { id: string; code: string; name: string } | null; uom?: { id: string; code: string; symbol: string; name?: string } }[]; total: number };
  materials: { items: { id: string; purchaseItemId?: string; code: string; name: string; status?: string; uomId?: string; specs?: any; category?: { id: string; code: string; name: string } | null; uom?: { id: string; code: string; symbol: string; name?: string } }[]; total: number };
  uoms: { items: { id: string; code: string; symbol: string; name: string; status?: string }[]; total: number };
  departments: { items: { id: string; code: string; name: string; status?: string }[]; total: number };
  locations: { items: { id: string; code: string; name: string; status?: string }[]; total: number };
  capabilities?: { items: { id: string; vendorId: string; productId?: string | null; materialId?: string | null; categoryId?: string | null; unitPrice?: number | string | null; leadTimeDays?: number | null; moq?: number | string | null }[]; total: number };
};

/** One cached request for every selector needed by the PR workspace. */
export function useProcurementSelectors() {
  return useQuery({
    // Version the key when the selector payload changes so old cached
    // capability data does not hide vendor-item links.
    queryKey: ['master-data', 'procurement-selectors', 'v7'],
    queryFn: async () => {
      const result = await fetchApiWithParams<{
        vendors: SelectorList<ProcurementSelectorData['vendors']['items'][number]>;
        products: SelectorList<ProcurementSelectorData['products']['items'][number]>;
        materials: SelectorList<ProcurementSelectorData['materials']['items'][number]>;
        uoms: SelectorList<ProcurementSelectorData['uoms']['items'][number]>;
        departments: SelectorList<ProcurementSelectorData['departments']['items'][number]>;
        locations: SelectorList<ProcurementSelectorData['locations']['items'][number]>;
        capabilities?: SelectorList<NonNullable<ProcurementSelectorData['capabilities']>['items'][number]>;
      }>('/master-data/procurement-selectors');
      const active = <T extends { status?: string }>(list: SelectorList<T>) => selectorItems(list).filter(item => isSelectableStatus(item.status));
      const departments = active(result.departments).filter(item => !/test\s*dept/i.test(item.name) && !/^DEPT-(PROC|QA|MAINT|WH)$/i.test(item.code));
      const uoms = active(result.uoms);
      const products = active(result.products).filter(item => !/test\s*product/i.test(item.name));
      const withTotal = <T,>(items: T[]) => ({ items, total: items.length });
      // Some older API deployments return an empty vendor slice from the
      // aggregate route while the canonical vendor endpoint is populated.
      // Recover that slice without blocking the other selectors.
      let vendorItems = active(result.vendors).filter((vendor) => ['ACTIVE', 'APPROVED'].includes(vendor.status || ''));
      if (vendorItems.length === 0) {
        const fallback = await fetchApiWithParams<SelectorList<ProcurementSelectorData['vendors']['items'][number]>>('/master-data/vendors', { limit: '1000', activeOnly: 'true' });
        vendorItems = active(fallback).filter((vendor) => ['ACTIVE', 'APPROVED'].includes(vendor.status || ''));
      }
      const capabilities = withTotal(selectorItems(result.capabilities));
      const storedProductIds = new Set(products.map((product) => product.id));
      const expandedProducts = expandProductsWithVariants(products as unknown as Product[]).map((product) => {
        const metadata = product.metadata as Record<string, unknown> | null | undefined;
        const productRecordId = metadata?.productRecordId;
        const parentProductId = product.parentProductId || metadata?.parentProductId;
        const purchaseItemId = typeof productRecordId === 'string' && storedProductIds.has(productRecordId)
          ? productRecordId
          : storedProductIds.has(product.id)
            ? product.id
            : typeof parentProductId === 'string' && storedProductIds.has(parentProductId)
              ? parentProductId
              : product.id;
        return { ...product, purchaseItemId };
      }) as unknown as ProcurementSelectorData['products']['items'];
      const activeMaterials = active(result.materials);
      const storedMaterialIds = new Set(activeMaterials.map((material) => material.id));
      const expandedMaterials = expandMaterialsWithVariants(activeMaterials as unknown as Material[]).map((material) => {
        const specs = material.specs as Record<string, unknown> | null | undefined;
        const parentMaterialId = material.parentMaterialId || specs?.parentMaterialId;
        const purchaseItemId = storedMaterialIds.has(material.id)
          ? material.id
          : typeof parentMaterialId === 'string' && storedMaterialIds.has(parentMaterialId)
            ? parentMaterialId
            : material.id;
        return { ...material, purchaseItemId };
      }) as unknown as ProcurementSelectorData['materials']['items'];
      return {
        vendors: withTotal(vendorItems),
        products: withTotal(expandedProducts),
        materials: withTotal(expandedMaterials),
        uoms: withTotal(uoms),
        departments: withTotal(departments),
        locations: withTotal(active(result.locations)),
        capabilities,
      } satisfies ProcurementSelectorData;
    },
    ...selectorOptions,
  });
}

export function useApprovedVendors() {
  return useQuery({
    queryKey: ['vendors', 'approved'],
    queryFn: async () => {
      const result = await fetchApiWithParams<SelectorList<{ id: string; code: string; name: string; status?: string }>>('/master-data/vendors', { limit: '1000' });
      const items = selectorItems(result).filter(item => ['ACTIVE', 'APPROVED'].includes(item.status || ''));
      return { items, total: items.length };
    },
    ...selectorOptions,
  });
}

export function useApprovedProducts() {
  return useQuery({
    queryKey: ['products', 'approved', 'with-variants-v1'],
    queryFn: async () => {
      const result = await fetchApiWithParams<{ items: Product[] }>('/master-data/products', { limit: '1000' });
      const items = selectorItems(result).filter(product => isSelectableStatus(product.status) && !/test\s*product/i.test(product.name));
      const expanded = expandProductsWithVariants(items);
      return { items: expanded, total: expanded.length };
    },
    ...selectorOptions,
  });
}

export function useApprovedMaterials() {
  return useQuery({
    queryKey: ['materials', 'approved', 'with-variants-v1'],
    queryFn: async () => {
      const result = await fetchApiWithParams<SelectorList<Material>>('/master-data/materials', { limit: '1000' });
      const items = selectorItems(result).filter(item => isSelectableStatus(item.status));
      const expanded = expandMaterialsWithVariants(items);
      return { items: expanded, total: expanded.length };
    },
    ...selectorOptions,
  });
}

export function useActiveUOMs() {
  return useQuery({
    queryKey: ['uom', 'active'],
    queryFn: async () => {
      const result = await fetchApiWithParams<{ items: { id: string; code: string; symbol: string; name: string }[] }>('/master-data/uom', {
        status: 'ACTIVE',
        limit: '1000',
      });
      // UOM is client-managed master data. Do not restrict adjustments to a
      // fixed set of legacy codes; every active UOM must be selectable.
      return result;
    },
  });
}

export function useActiveDepartments() {
  return useQuery({
    queryKey: ['departments', 'active'],
    queryFn: async () => {
      const result = await fetchApiWithParams<SelectorList<{ id: string; code: string; name: string; status?: string }>>('/master-data/org/departments', {
        limit: '100',
      });

      // Old development fixtures can remain in the database when cleanup is
      // unavailable. They must never be offered as selectable procurement
      // master data. Keep this guard in the selector as well as the database
      // cleanup so stale rows cannot leak into PR/PO forms.
      const items = selectorItems(result).filter(department => isSelectableStatus(department.status) &&
          !/test\s*dept/i.test(department.name) &&
          !/^DEPT-(PROC|QA|MAINT|WH)$/i.test(department.code)
        );
      return { items, total: items.length };
    },
    ...selectorOptions,
  });
}

// ─── Approved PRs selector (for PO generate picker) ──────────────────────────

export function useApprovedPRs() {
  return useQuery({
    queryKey: [...prKeys.all, 'approved'],
    queryFn: () =>
      fetchApiWithParams<{ items: PR[] }>('/purchases/requisitions', { status: 'APPROVED' }),
  });
}
