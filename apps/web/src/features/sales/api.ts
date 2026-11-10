import { fetchApi } from '../api/client';
import {
  AmazonOrderImportInput,
  ConfirmDispatchInput,
  CreatePackageInput,
  CreateReturnInput,
  CreateSalesOrderInput,
  Customer,
  PosCheckoutInput,
  ProcessReturnDispositionInput,
  SalesChannel,
  SalesMetrics,
  SalesOrder,
  SalesOrderStatus,
  UpdateSalesOrderInput,
} from './types';

export interface SalesListResponse {
  items: SalesOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface SalesInventoryAvailability {
  items: Array<{
    productId: string;
    uomId: string | null;
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }>;
  scope: 'ENTERPRISE' | 'WAREHOUSE';
  warehouseLocationId: string | null;
}

export const salesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: SalesOrderStatus | '';
    channel?: SalesChannel | '';
    paymentStatus?: string;
    allocationStatus?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const query = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });
    return fetchApi<SalesListResponse>(`/sales/orders?${query.toString()}`);
  },

  getMetrics: () => fetchApi<SalesMetrics>('/sales/orders/metrics'),

  getInventoryAvailability: (warehouseLocationId?: string) => {
    const query = warehouseLocationId
      ? `?warehouseLocationId=${encodeURIComponent(warehouseLocationId)}`
      : '';
    return fetchApi<SalesInventoryAvailability>(`/sales/inventory-availability${query}`);
  },

  get: (id: string) => fetchApi<SalesOrder>(`/sales/orders/${id}`),

  create: (input: CreateSalesOrderInput) =>
    fetchApi<SalesOrder>('/sales/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: UpdateSalesOrderInput) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  updateProForma: (id: string, lines: Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>) =>
    fetchApi<{ id: string; salesOrderId: string; totalAmount: string; status: string }>(`/sales/orders/${id}/pro-forma`, {
      method: 'PUT',
      body: JSON.stringify({ lines }),
    }),

  generateProForma: (id: string) =>
    fetchApi<{ id: string; salesOrderId: string; created: boolean }>(`/sales/orders/${id}/pro-forma`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  transition: (
    id: string,
    action: 'validate' | 'approve' | 'confirm' | 'hold' | 'cancel',
    reason?: string
  ) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  overrideCredit: (
    id: string,
    input: {
      overrideType: 'ONE_TIME_WAIVER' | 'INCREASE_LIMIT';
      newCreditLimit?: number;
      notes?: string;
    }
  ) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/credit-override`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  allocate: (id: string, lines?: Array<{ salesOrderLineId: string; quantity: number }>) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/allocate`, {
      method: 'POST',
      body: JSON.stringify(lines ? { lines } : {}),
    }),

  createPackage: (id: string, input: CreatePackageInput) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/packages`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  confirmDispatch: (id: string, input: ConfirmDispatchInput) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/dispatch`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createReturn: (id: string, input: CreateReturnInput) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/returns`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  processReturnDisposition: (id: string, input: ProcessReturnDispositionInput) =>
    fetchApi<SalesOrder>(`/sales/orders/${id}/returns/disposition`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  posCheckout: (input: PosCheckoutInput) =>
    fetchApi<SalesOrder>('/sales/pos/checkout', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  importAmazonOrder: (input: AmazonOrderImportInput) =>
    fetchApi<SalesOrder>('/sales/amazon/import', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listCustomers: (params?: { search?: string; status?: string; skip?: number; take?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    query.set('limit', String(params?.limit || params?.take || 500));
    return fetchApi<{ items: Customer[]; total: number }>(`/master-data/customers?${query.toString()}`);
  },

  getCustomer: (id: string) => fetchApi<Customer>(`/master-data/customers/${id}`),

  createCustomer: (input: {
    code: string;
    name: string;
    legalName?: string;
    contactEmail?: string;
    contactPhone?: string;
    taxNumber?: string;
    taxId?: string;
    billingAddress?: any;
    shippingAddress?: any;
    currency?: string;
    creditLimit?: number;
    paymentTerms?: string;
  }) =>
    fetchApi<Customer>('/master-data/customers', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateCustomer: (id: string, input: Partial<Customer>) =>
    fetchApi<Customer>(`/master-data/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  notifyStockShortage: (input: {
    productId: string;
    productName?: string;
    requestedQuantity: number;
    availableQuantity: number;
    shortageQuantity?: number;
    customerId?: string;
    customerName?: string;
    salesOrderId?: string;
    salesOrderNumber?: string;
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    notes?: string;
  }) =>
    fetchApi<{ success: boolean; message: string; details: any }>('/sales/stock-shortage-alert', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
