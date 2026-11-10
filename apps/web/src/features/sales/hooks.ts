import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesApi } from './api';
import {
  AmazonOrderImportInput,
  ConfirmDispatchInput,
  CreatePackageInput,
  CreateReturnInput,
  CreateSalesOrderInput,
  PosCheckoutInput,
  ProcessReturnDispositionInput,
  UpdateSalesOrderInput,
} from './types';

export const salesKeys = {
  all: ['sales'] as const,
  orders: (params?: object) => [...salesKeys.all, 'orders', params] as const,
  order: (id: string) => [...salesKeys.all, 'order', id] as const,
  metrics: () => [...salesKeys.all, 'metrics'] as const,
  inventoryAvailability: (warehouseLocationId?: string) =>
    [...salesKeys.all, 'inventory-availability', warehouseLocationId ?? 'enterprise'] as const,
};

export function useSalesOrders(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: any;
  channel?: any;
  paymentStatus?: string;
  allocationStatus?: string;
  customerId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery({
    queryKey: salesKeys.orders(params),
    queryFn: () => salesApi.list(params),
  });
}

export function useSalesOrder(id?: string) {
  return useQuery({
    queryKey: salesKeys.order(id || ''),
    queryFn: () => salesApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useSalesMetrics() {
  return useQuery({
    queryKey: salesKeys.metrics(),
    queryFn: () => salesApi.getMetrics(),
  });
}

export function useSalesInventoryAvailability(warehouseLocationId?: string) {
  return useQuery({
    queryKey: salesKeys.inventoryAvailability(warehouseLocationId),
    queryFn: () => salesApi.getInventoryAvailability(warehouseLocationId),
  });
}

export function useCreateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesOrderInput) => salesApi.create(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useUpdateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSalesOrderInput }) =>
      salesApi.update(id, input),
    meta: { silentError: true },
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: salesKeys.order(variables.id) });
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useSalesOrderAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      action: 'validate' | 'approve' | 'confirm' | 'hold' | 'cancel';
      reason?: string;
    }) => salesApi.transition(input.id, input.action, input.reason),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useCreditOverrideOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      overrideType: 'ONE_TIME_WAIVER' | 'INCREASE_LIMIT';
      newCreditLimit?: number;
      notes?: string;
    }) =>
      salesApi.overrideCredit(input.id, {
        overrideType: input.overrideType,
        newCreditLimit: input.newCreditLimit,
        notes: input.notes,
      }),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
      if (order.customerId) {
        client.invalidateQueries({ queryKey: ['sales', 'customer', order.customerId] });
        client.invalidateQueries({ queryKey: ['sales', 'customer-credit-exposure', order.customerId] });
      }
    },
  });
}

export function useAllocateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; lines?: Array<{ salesOrderLineId: string; quantity: number }> }) =>
      salesApi.allocate(input.id, input.lines),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useCreatePackage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; packageInput: CreatePackageInput }) =>
      salesApi.createPackage(input.id, input.packageInput),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useDispatchSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; dispatchInput: ConfirmDispatchInput }) =>
      salesApi.confirmDispatch(input.id, input.dispatchInput),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useCreateSalesReturn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; returnInput: CreateReturnInput }) =>
      salesApi.createReturn(input.id, input.returnInput),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useProcessReturnDisposition() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; dispositionInput: ProcessReturnDispositionInput }) =>
      salesApi.processReturnDisposition(input.id, input.dispositionInput),
    onSuccess: (order) => {
      client.setQueryData(salesKeys.order(order.id), order);
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function usePosCheckout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PosCheckoutInput) => salesApi.posCheckout(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useImportAmazonOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AmazonOrderImportInput) => salesApi.importAmazonOrder(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export function useSalesCustomers(params?: { search?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['sales', 'customers', params],
    queryFn: () => salesApi.listCustomers(params),
  });
}

export function useSalesCustomer(id?: string) {
  return useQuery({
    queryKey: ['sales', 'customer', id],
    queryFn: () => (id ? salesApi.getCustomer(id) : null),
    enabled: Boolean(id),
  });
}

export function useCreateSalesCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof salesApi.createCustomer>[0]) =>
      salesApi.createCustomer(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['sales', 'customers'] });
      client.invalidateQueries({ queryKey: ['master-data', 'customers'] });
    },
  });
}

export function useUpdateSalesCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof salesApi.updateCustomer>[1] }) =>
      salesApi.updateCustomer(id, input),
    onSuccess: (_, { id }) => {
      client.invalidateQueries({ queryKey: ['sales', 'customer', id] });
      client.invalidateQueries({ queryKey: ['sales', 'customers'] });
      client.invalidateQueries({ queryKey: ['sales', 'customer-credit-exposure', id] });
    },
  });
}

export function useCustomerCreditExposure(customerId?: string, excludeOrderId?: string) {
  return useQuery({
    queryKey: ['sales', 'customer-credit-exposure', customerId, excludeOrderId],
    queryFn: async () => {
      if (!customerId) return null;
      const [customer, ordersRes] = await Promise.all([
        salesApi.getCustomer(customerId),
        salesApi.list({ customerId, limit: 100 }),
      ]);

      const creditLimit = Number(customer?.creditLimit || 0);
      const orders = ordersRes?.items || [];

      let creditUtilized = 0;
      orders.forEach((o) => {
        if (o.id === excludeOrderId) return;
        if (!['CANCELLED', 'CLOSED', 'RETURNED'].includes(o.status) && o.paymentStatus !== 'PAID') {
          const grandTotal = Number(o.grandTotal || 0);
          const paid = (o.payments || [])
            .filter((p) => p.status === 'PAID')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);
          creditUtilized += Math.max(0, grandTotal - paid);
        }
      });

      const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - creditUtilized) : Infinity;
      const utilizationPercent = creditLimit > 0 ? Math.min(100, (creditUtilized / creditLimit) * 100) : 0;

      return {
        customerId,
        customer,
        creditLimit,
        creditUtilized,
        availableCredit,
        utilizationPercent,
        activeOrdersCount: orders.filter(
          (o) => !['CANCELLED', 'CLOSED', 'RETURNED'].includes(o.status) && o.paymentStatus !== 'PAID'
        ).length,
      };
    },
    enabled: Boolean(customerId),
  });
}

export function useNotifyStockShortage() {
  return useMutation({
    mutationFn: (input: Parameters<typeof salesApi.notifyStockShortage>[0]) =>
      salesApi.notifyStockShortage(input),
  });
}
