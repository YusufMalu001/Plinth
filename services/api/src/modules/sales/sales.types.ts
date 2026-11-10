export type SalesOrderChannel = 'PHYSICAL' | 'E_TRADE' | 'STORE_POS' | 'AMAZON';

export type SalesOrderStatus =
  | 'DRAFT'
  | 'IMPORTED'
  | 'VALIDATING'
  | 'VALIDATION_FAILED'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'ON_HOLD'
  | 'PARTIALLY_ALLOCATED'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PARTIALLY_PICKED'
  | 'PICKED'
  | 'PACKING'
  | 'PACKED'
  | 'READY_TO_DISPATCH'
  | 'PARTIALLY_DISPATCHED'
  | 'DISPATCHED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'CLOSED';

export type SalesPaymentStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type SalesAllocationStatus =
  | 'NOT_STARTED'
  | 'PARTIALLY_ALLOCATED'
  | 'FULLY_ALLOCATED'
  | 'BACKORDERED'
  | 'RELEASED'
  | 'CANCELLED';

export type SalesAccountingStatus =
  | 'NOT_ELIGIBLE'
  | 'PENDING_REVIEW'
  | 'READY_TO_EXPORT'
  | 'EXPORTED'
  | 'ACKNOWLEDGED'
  | 'RECONCILIATION_FAILED'
  | 'REVERSED';

export interface SalesOrderLineInput {
  productId: string;
  productVariantId?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxRate?: number;
}

export interface CreateSalesOrderInput {
  channel: SalesOrderChannel;
  channelId?: string | null;
  customerId?: string | null;
  warehouseLocationId?: string | null;
  externalOrderId?: string | null;
  currency?: string;
  promisedAt?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  billingAddress?: SalesAddressInput;
  shippingAddress: SalesAddressInput;
  lines: SalesOrderLineInput[];
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  paymentTerms?: string | null;
  salesRepresentative?: string | null;
  shippingCarrier?: string | null;
  deliveryInstructions?: string | null;
}

export interface UpdateSalesOrderInput {
  customerId?: string | null;
  warehouseLocationId?: string | null;
  promisedAt?: string | null;
  notes?: string | null;
  billingAddress?: SalesAddressInput;
  shippingAddress?: SalesAddressInput;
  lines?: SalesOrderLineInput[];
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  paymentTerms?: string | null;
  salesRepresentative?: string | null;
  shippingCarrier?: string | null;
  deliveryInstructions?: string | null;
}

export interface SalesAddressInput {
  name?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  taxNumber?: string;
}

export interface SalesOrderListParams {
  page: number;
  limit: number;
  search?: string;
  status?: SalesOrderStatus;
  channel?: SalesOrderChannel;
  paymentStatus?: SalesPaymentStatus;
  allocationStatus?: SalesAllocationStatus;
  customerId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SalesAllocationRequest {
  salesOrderLineId: string;
  quantity: number;
}

export interface CapturePaymentInput {
  idempotencyKey?: string;
  amount: number;
  method: string;
  provider?: string;
  reference?: string;
  notes?: string;
}

export interface CreatePackageItemInput {
  salesOrderLineId: string;
  quantity: number;
}

export interface CreatePackageInput {
  packageType?: string;
  weightKg?: number;
  dimensions?: string;
  carrier?: string;
  trackingNumber?: string;
  items: CreatePackageItemInput[];
}

export interface ConfirmDispatchInput {
  carrier: string;
  trackingNumber?: string;
  dispatchedAt?: string;
  notes?: string;
}

export interface ReturnLineItemInput {
  salesOrderLineId: string;
  quantity: number;
  reason?: string;
}

export interface CreateReturnInput {
  reason: string;
  items: ReturnLineItemInput[];
}

export interface ProcessReturnDispositionInput {
  disposition: 'RESTOCK' | 'QUARANTINE' | 'SCRAP';
  locationId?: string;
  notes?: string;
  creditedNetAmount?: number;
  taxCreditAmount?: number;
  sourceReference?: string;
  occurredAt?: string;
}

export interface PosCheckoutInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  warehouseLocationId: string;
  lines: Array<{
    productId: string;
    productVariantId?: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxRate?: number;
  }>;
  notes?: string;
}

export interface AmazonOrderImportInput {
  amazonOrderId: string;
  purchaseDate: string;
  orderTotal: number;
  currency?: string;
  buyerName?: string;
  buyerEmail?: string;
  shippingAddress: SalesAddressInput;
  items: Array<{
    sku: string;
    asin?: string;
    title: string;
    quantity: number;
    itemPrice: number;
    taxAmount?: number;
  }>;
}

export interface SalesMetrics {
  openOrders: number;
  awaitingApproval: number;
  allocationNeeded: number;
  fulfillmentQueue: number;
  readyToDispatch: number;
  dispatchedToday: number;
  totalRevenue: number;
  openExceptions: number;
  channelCounts: Record<SalesOrderChannel, number>;
}
