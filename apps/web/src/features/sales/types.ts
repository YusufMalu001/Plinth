export type SalesChannel = 'PHYSICAL' | 'E_TRADE' | 'STORE_POS' | 'AMAZON';

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

export interface SalesOrderLine {
  id: string;
  salesOrderId?: string;
  productId: string;
  productVariantId?: string | null;
  sku: string;
  description: string;
  uomId: string;
  orderedQuantity: number | string;
  allocatedQuantity: number | string;
  pickedQuantity: number | string;
  packedQuantity: number | string;
  shippedQuantity: number | string;
  returnedQuantity?: number | string;
  cancelledQuantity?: number | string;
  unitPrice: number | string;
  discountAmount?: number | string;
  taxRate?: number | string;
  taxAmount: number | string;
  lineTotal: number | string;
  status: string;
  promisedAt?: string | null;
}

export interface SalesOrderAddress {
  id?: string;
  kind: 'SHIPPING' | 'BILLING';
  name?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  taxNumber?: string | null;
}

export interface SalesOrderCharge {
  id?: string;
  code: string;
  label: string;
  amount: number | string;
  taxAmount?: number | string;
}

export interface SalesOrderTax {
  id?: string;
  code: string;
  rate: number | string;
  taxableAmount: number | string;
  amount: number | string;
}

export interface SalesOrderPayment {
  id?: string;
  method: string;
  provider?: string | null;
  reference?: string | null;
  amount: number | string;
  status: SalesPaymentStatus;
  paidAt?: string | null;
  failureReason?: string | null;
}

export interface SalesOrderAllocation {
  id: string;
  salesOrderId: string;
  salesOrderLineId: string;
  productId: string;
  uomId: string;
  locationId: string;
  quantity: number | string;
  reservationId?: string | null;
  lotId?: string | null;
  status: string;
  createdAt: string;
}

export interface SalesOrderStatusHistory {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  actorId: string;
  reason?: string | null;
  createdAt: string;
}

export interface SalesOrderExternalReference {
  id: string;
  channel: SalesChannel;
  externalId: string;
  payload?: any;
  createdAt: string;
}

export interface SalesOrderException {
  id: string;
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
  resolvedById?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
}

export interface SalesOrderFulfillment {
  id: string;
  fulfillmentNumber: string;
  status: string;
  promisedShipAt?: string | null;
  warehouseLocation: { id: string; code: string; name: string };
  pickLists: Array<{ id: string; pickListNumber: string; status: string; items: Array<{ id: string; expectedQuantity: number | string; pickedQuantity: number | string }> }>;
  packages: Array<{ id: string; packageNumber: string; status: string; grossWeightKg?: number | string | null; items: Array<{ id: string; quantity: number | string }> }>;
  shipments: Array<{ id: string; shipmentNumber: string; status: string; awbNumber?: string | null; carrier?: { id: string; name: string } | null; trackingEvents?: Array<{ id: string; status: string; eventAt: string }>; documents?: Array<{ id: string; type: string }> }>;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  channel: SalesChannel;
  channelId?: string | null;
  customerId?: string | null;
  warehouseLocationId?: string | null;
  externalOrderId?: string | null;
  status: SalesOrderStatus;
  paymentStatus: SalesPaymentStatus;
  allocationStatus: SalesAllocationStatus;
  accountingStatus: SalesAccountingStatus;
  currency: string;
  subtotal: number | string;
  discountTotal: number | string;
  taxTotal: number | string;
  chargeTotal?: number | string;
  grandTotal: number | string;
  orderedAt: string;
  promisedAt?: string | null;
  confirmedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  notes?: string | null;
  createdByActorId?: string;
  lines: SalesOrderLine[];
  addresses: SalesOrderAddress[];
  charges?: SalesOrderCharge[];
  taxes?: SalesOrderTax[];
  payments: SalesOrderPayment[];
  allocations?: SalesOrderAllocation[];
  statusHistory: SalesOrderStatusHistory[];
  externalReferences?: SalesOrderExternalReference[];
  exceptions: SalesOrderException[];
  fulfillments?: SalesOrderFulfillment[];
}

export interface CreateSalesOrderInput {
  channel: SalesChannel;
  channelId?: string | null;
  customerId?: string | null;
  warehouseLocationId?: string | null;
  externalOrderId?: string | null;
  currency?: string;
  promisedAt?: string | null;
  notes?: string | null;
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  paymentTerms?: string | null;
  salesRepresentative?: string | null;
  shippingCarrier?: string | null;
  deliveryInstructions?: string | null;
  shippingAddress: {
    name?: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
    taxNumber?: string;
  };
  billingAddress?: {
    name?: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
    taxNumber?: string;
  };
  lines: Array<{
    productId: string;
    productVariantId?: string | null;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    discountAmount?: number;
  }>;
}

export interface UpdateSalesOrderInput {
  customerId?: string | null;
  warehouseLocationId?: string | null;
  promisedAt?: string | null;
  notes?: string | null;
  customerPoNumber?: string | null;
  customerPoDate?: string | null;
  paymentTerms?: string | null;
  salesRepresentative?: string | null;
  shippingCarrier?: string | null;
  deliveryInstructions?: string | null;
  shippingAddress?: {
    name?: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
    taxNumber?: string;
  };
  billingAddress?: {
    name?: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
    taxNumber?: string;
  };
  lines?: Array<{
    productId: string;
    productVariantId?: string | null;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    discountAmount?: number;
  }>;
}

export type CustomerType = 'DEALER' | 'DISTRIBUTOR' | 'RETAIL' | 'CORPORATE' | 'INSTITUTIONAL';

export interface Customer {
  id: string;
  code: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxNumber?: string | null;
  billingAddress?: any;
  shippingAddress?: any;
  currency?: string;
  creditLimit?: number | string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  customerType?: CustomerType;
  paymentTerms?: string;
  priceTier?: string;
  panNumber?: string;
  contactPerson?: string;
  creditPeriodDays?: number;
}

export interface CapturePaymentInput {
  idempotencyKey?: string;
  amount: number;
  method: string;
  provider?: string;
  reference?: string;
  notes?: string;
}

export interface CreatePackageInput {
  packageType?: string;
  weightKg?: number;
  dimensions?: string;
  carrier?: string;
  trackingNumber?: string;
  items: Array<{
    salesOrderLineId: string;
    quantity: number;
  }>;
}

export interface ConfirmDispatchInput {
  carrier: string;
  trackingNumber?: string;
  dispatchedAt?: string;
  notes?: string;
}

export interface CreateReturnInput {
  reason: string;
  items: Array<{
    salesOrderLineId: string;
    quantity: number;
    reason?: string;
  }>;
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
  lines: Array<{
    productId: string;
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
  shippingAddress: {
    name?: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
  };
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
  channelCounts: Record<SalesChannel, number>;
}
