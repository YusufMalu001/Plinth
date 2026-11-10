/**
 * Module 4 — Inventory & Store Management TanStack Query hooks
 */
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { showToast } from '@/components/toast-store';
import {
  inventoryApi,
  StockOwnership,
  StockIssueStatus,
  StockTransferStatus,
  StockAdjustmentStatus,
  StockReservationStatus,
  StockLedgerEntryType,
} from './api';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const inventoryKeys = {
  all: ['inventory'] as const,
  dashboard: () => [...inventoryKeys.all, 'dashboard'] as const,
  items: (filters?: object) => filters ? [...inventoryKeys.all, 'items', filters] as const : [...inventoryKeys.all, 'items'] as const,
  itemAvailability: (itemType: string, itemId: string, uomId: string) => [...inventoryKeys.all, 'item-availability', itemType, itemId, uomId] as const,
  balances: (filters?: object) => filters ? [...inventoryKeys.all, 'balances', filters] as const : [...inventoryKeys.all, 'balances'] as const,
  balanceDetail: (id: string) => [...inventoryKeys.all, 'balances', 'detail', id] as const,
  balanceMovements: (id: string) => [...inventoryKeys.all, 'balances', 'movements', id] as const,
  ledger: (filters?: object) => filters ? [...inventoryKeys.all, 'ledger', filters] as const : [...inventoryKeys.all, 'ledger'] as const,
  reorderSignals: () => [...inventoryKeys.all, 'reorder-signals'] as const,
  replenishmentPolicies: (filters?: object) => [...inventoryKeys.all, 'replenishment-policies', filters] as const,
  lots: (filters?: object) => [...inventoryKeys.all, 'lots', filters] as const,
  snapshots: (filters?: object) => [...inventoryKeys.all, 'snapshots', filters] as const,
  issues: (filters?: object) => filters ? [...inventoryKeys.all, 'issues', filters] as const : [...inventoryKeys.all, 'issues'] as const,
  issueDetail: (id: string) => [...inventoryKeys.all, 'issues', 'detail', id] as const,
  transfers: (filters?: object) => filters ? [...inventoryKeys.all, 'transfers', filters] as const : [...inventoryKeys.all, 'transfers'] as const,
  transferDetail: (id: string) => [...inventoryKeys.all, 'transfers', 'detail', id] as const,
  adjustments: (filters?: object) => filters ? [...inventoryKeys.all, 'adjustments', filters] as const : [...inventoryKeys.all, 'adjustments'] as const,
  adjustmentDetail: (id: string) => [...inventoryKeys.all, 'adjustments', 'detail', id] as const,
  reservations: (filters?: object) => filters ? [...inventoryKeys.all, 'reservations', filters] as const : [...inventoryKeys.all, 'reservations'] as const,
  reservationDetail: (id: string) => [...inventoryKeys.all, 'reservations', 'detail', id] as const,
};

function invalidateInventoryViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.dashboard() });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.items() });
  queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, 'item-availability'] });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.balances() });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.ledger() });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.reorderSignals() });
  queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
  queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', 'reorder-signals'] });
}

// ─── Balances / ledger / reorder / snapshots ─────────────────────────────────

export function useStockBalances(params?: { productId?: string; materialId?: string; locationId?: string; ownership?: StockOwnership; page?: number; limit?: number }) {
  return useQuery({
    queryKey: inventoryKeys.balances(params),
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: () => inventoryApi.listBalances(params),
  });
}

/** Unified inventory projection: one row per catalog item across all internal locations. */
export function useInventoryItems(params?: { search?: string; itemType?: 'PRODUCT' | 'MATERIAL'; status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: inventoryKeys.items(params),
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: () => inventoryApi.listItems(params),
  });
}

/** Issueable stock for one item in the selected UOM. The server applies the
 * same ownership, reservation, variant, and UOM conversion rules as posting. */
export function useInventoryItemAvailability(itemType: 'PRODUCT' | 'MATERIAL', itemId: string, uomId: string) {
  return useQuery({
    queryKey: inventoryKeys.itemAvailability(itemType, itemId, uomId),
    queryFn: () => inventoryApi.getItemAvailability(itemType, itemId, uomId),
    enabled: Boolean(itemId && uomId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useStockBalance(id: string) {
  return useQuery({
    queryKey: inventoryKeys.balanceDetail(id),
    queryFn: () => inventoryApi.getBalance(id),
    enabled: !!id,
  });
}

export function useStockBalanceMovements(id: string, params?: { productId?: string; materialId?: string }) {
  return useQuery({
    queryKey: inventoryKeys.balanceMovements(id),
    queryFn: () => inventoryApi.getBalanceMovements(id, params),
    enabled: !!id,
  });
}

export function useStockLedger(params?: {
  productId?: string;
  materialId?: string;
  locationId?: string;
  entryType?: StockLedgerEntryType;
  postedFrom?: string;
  postedTo?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: inventoryKeys.ledger(params),
    queryFn: () => inventoryApi.listLedger(params),
  });
}

export function useReorderSignals() {
  return useQuery({
    queryKey: inventoryKeys.reorderSignals(),
    queryFn: () => inventoryApi.getReorderSignals(),
  });
}

export function useReplenishmentPolicies(params?: { itemType?: 'PRODUCT' | 'MATERIAL'; itemId?: string; locationId?: string }) {
  return useQuery({
    queryKey: inventoryKeys.replenishmentPolicies(params),
    queryFn: () => inventoryApi.listReplenishmentPolicies(params),
  });
}

export function useInventoryLots(params?: { itemType?: 'PRODUCT' | 'MATERIAL'; itemId?: string; lotNumber?: string }) {
  return useQuery({ queryKey: inventoryKeys.lots(params), queryFn: () => inventoryApi.listLots(params) });
}

export function useSaveReplenishmentPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => inventoryApi.saveReplenishmentPolicy(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, 'replenishment-policies'] }),
  });
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => inventoryApi.createSnapshot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.snapshots() });
    },
  });
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export function useStockIssues(params?: { productId?: string; materialId?: string; locationId?: string; status?: StockIssueStatus; page?: number; limit?: number }) {
  return useQuery({
    queryKey: inventoryKeys.issues(params),
    queryFn: () => inventoryApi.listIssues(params),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useStockIssue(id: string) {
  return useQuery({
    queryKey: inventoryKeys.issueDetail(id),
    queryFn: () => inventoryApi.getIssue(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useCreateStockIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, idempotencyKey }: {
      data: Parameters<typeof inventoryApi.createIssue>[0];
      idempotencyKey: string;
      toastContext?: { itemName: string; quantity: number; uomLabel: string; departmentName?: string };
    }) =>
      inventoryApi.createIssue(data, idempotencyKey),
    onSuccess: (_result, { toastContext }) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.issues() });
      invalidateInventoryViews(queryClient);
      if (toastContext) {
        const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(toastContext.quantity);
        const destination = toastContext.departmentName ? ` to ${toastContext.departmentName}` : '';
        showToast({
          kind: 'success',
          title: 'Stock issued',
          message: `${quantity} ${toastContext.uomLabel} of ${toastContext.itemName} issued${destination}.`,
        });
      } else {
        showToast({ kind: 'success', title: 'Stock issued', message: 'The stock issue was posted successfully.' });
      }
    },
  });
}

export function useReverseStockIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => inventoryApi.reverseIssue(id, reason),
    onSuccess: (issue, { id }) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.issueDetail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.issues() });
      invalidateInventoryViews(queryClient);
      const variantName = issue.reason?.match(/\[Variant:\s*([^\]]+)\]/i)?.[1];
      const itemName = variantName || issue.product?.name || issue.material?.name || 'the item';
      const quantity = Number(issue.quantity ?? 0);
      const formattedQuantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(quantity);
      const uom = issue.uom?.code || issue.uom?.symbol || 'units';
      showToast({
        kind: 'success',
        title: 'Stock returned',
        message: `${formattedQuantity} ${uom} of ${itemName} returned to available stock.`,
      });
    },
  });
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export function useStockTransfers(params?: { locationId?: string; status?: StockTransferStatus; page?: number; limit?: number }) {
  return useQuery({
    queryKey: inventoryKeys.transfers(params),
    queryFn: () => inventoryApi.listTransfers(params),
  });
}

export function useStockTransfer(id: string) {
  return useQuery({
    queryKey: inventoryKeys.transferDetail(id),
    queryFn: () => inventoryApi.getTransfer(id),
    enabled: !!id && id !== 'new',
  });
}

export function useCreateStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, idempotencyKey }: { data: Parameters<typeof inventoryApi.createTransfer>[0]; idempotencyKey: string }) =>
      inventoryApi.createTransfer(data, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.transfers() });
      invalidateInventoryViews(queryClient);
    },
  });
}

function invalidateTransferQueries(queryClient: QueryClient, id: string) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.transferDetail(id) });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.transfers() });
  invalidateInventoryViews(queryClient);
}

export function useIssueStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => inventoryApi.issueTransfer(id, quantity),
    onSuccess: (_data, { id }) => invalidateTransferQueries(queryClient, id),
  });
}

export function useReceiveStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => inventoryApi.receiveTransfer(id, quantity),
    onSuccess: (_data, { id }) => invalidateTransferQueries(queryClient, id),
  });
}

export function useCancelStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.cancelTransfer(id),
    onSuccess: (_data, id) => invalidateTransferQueries(queryClient, id),
  });
}

// ─── Adjustments ──────────────────────────────────────────────────────────────

export function useStockAdjustments(params?: { locationId?: string; status?: StockAdjustmentStatus; page?: number; limit?: number }) {
  return useQuery({
    queryKey: inventoryKeys.adjustments(params),
    queryFn: () => inventoryApi.listAdjustments(params),
  });
}

export function useStockAdjustment(id: string) {
  return useQuery({
    queryKey: inventoryKeys.adjustmentDetail(id),
    queryFn: () => inventoryApi.getAdjustment(id),
    enabled: !!id && id !== 'new',
  });
}

export function useProposeStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data }: {
      data: Parameters<typeof inventoryApi.proposeAdjustment>[0];
      toastContext?: { itemName: string; quantity: number; uomLabel: string; direction: 'INCREASE' | 'DECREASE' };
    }) => inventoryApi.proposeAdjustment(data),
    onSuccess: (_result, { toastContext }) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.adjustments() });
      invalidateInventoryViews(queryClient);
      if (toastContext) {
        const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(toastContext.quantity);
        const movement = toastContext.direction === 'INCREASE' ? 'added to' : 'written off from';
        showToast({
          kind: 'success',
          title: 'Stock adjusted',
          message: `${quantity} ${toastContext.uomLabel} of ${toastContext.itemName} ${movement} inventory.`,
        });
      } else {
        showToast({ kind: 'success', title: 'Stock adjusted', message: 'The inventory adjustment was posted successfully.' });
      }
    },
  });
}

function invalidateAdjustmentQueries(queryClient: QueryClient, id: string) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.adjustmentDetail(id) });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.adjustments() });
  invalidateInventoryViews(queryClient);
}

export function useReviewStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => inventoryApi.reviewAdjustment(id, note),
    onSuccess: (_data, { id }) => invalidateAdjustmentQueries(queryClient, id),
  });
}

export function useApproveStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.approveAdjustment(id),
    onSuccess: (_data, id) => invalidateAdjustmentQueries(queryClient, id),
  });
}

export function useRejectStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => inventoryApi.rejectAdjustment(id, reason),
    onSuccess: (_data, { id }) => invalidateAdjustmentQueries(queryClient, id),
  });
}

export function usePostStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.postAdjustment(id),
    onSuccess: (_data, id) => invalidateAdjustmentQueries(queryClient, id),
  });
}

// ─── Reservations ─────────────────────────────────────────────────────────────

export function useStockReservations(params?: { productId?: string; materialId?: string; locationId?: string; status?: StockReservationStatus; page?: number; limit?: number }) {
  return useQuery({
    queryKey: inventoryKeys.reservations(params),
    queryFn: () => inventoryApi.listReservations(params),
  });
}

export function useCreateStockReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof inventoryApi.createReservation>[0]) => inventoryApi.createReservation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.reservations() });
      invalidateInventoryViews(queryClient);
    },
  });
}

function useReservationAction(action: (id: string) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => action(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.reservations() });
      invalidateInventoryViews(queryClient);
    },
  });
}

export function useReleaseStockReservation() {
  return useReservationAction(inventoryApi.releaseReservation);
}

export function useConsumeStockReservation() {
  return useReservationAction(inventoryApi.consumeReservation);
}

export function useCancelStockReservation() {
  return useReservationAction(inventoryApi.cancelReservation);
}
