export type FulfillmentStage = 'allocation' | 'picking' | 'packing' | 'staging' | 'dispatched';
export type ShipmentMode = 'COURIER' | 'TRANSPORTER' | 'OWN_FLEET' | 'CUSTOMER_PICKUP' | 'MARKETPLACE';

export interface FulfillmentOverview {
  allocationBacklog: number;
  pickBacklog: number;
  packagesStaged: number;
  readyShipments: number;
  dispatchedToday: number;
  deliveryExceptions: number;
  slaBreaches: number;
  channelCounts: Record<string, number>;
  recentShipments: Shipment[];
}

export interface FulfillmentLine {
  id: string;
  sku: string;
  barcode?: string | null;
  description: string;
  productId: string;
  uomId?: string;
  orderedQuantity: number | string;
  allocatedQuantity: number | string;
  pickedQuantity: number | string;
  packedQuantity: number | string;
  shippedQuantity: number | string;
}

export interface PickItem {
  id: string;
  salesOrderLineId: string;
  expectedQuantity: number | string;
  pickedQuantity: number | string;
  lotId?: string | null;
  binCode?: string | null;
  salesOrderLine?: FulfillmentLine;
}

export interface PickList {
  id: string;
  pickListNumber: string;
  status: string;
  assignedToActorId?: string | null;
  items: PickItem[];
}

export interface PackageItem {
  id: string;
  salesOrderLineId: string;
  quantity: number | string;
}

export interface ShipmentPackage {
  id: string;
  package: SalesPackage;
}

export interface SalesPackage {
  id: string;
  packageNumber: string;
  packageType: string;
  barcode: string;
  status: string;
  lengthCm?: number | string | null;
  widthCm?: number | string | null;
  heightCm?: number | string | null;
  grossWeightKg?: number | string | null;
  netWeightKg?: number | string | null;
  tareWeightKg?: number | string | null;
  sealNumber?: string | null;
  items: PackageItem[];
  shipmentLinks?: Array<{ id: string; shipmentId: string }>;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  status: string;
  mode: ShipmentMode;
  awbNumber?: string | null;
  freightTerms?: string | null;
  freightAmount?: number | string | null;
  codAmount?: number | string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  routeNotes?: string | null;
  dispatchDock?: string | null;
  pickupScheduledAt?: string | null;
  dispatchedAt?: string | null;
  expectedDeliveryAt?: string | null;
  handedOverAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  carrier?: { id: string; name: string; code?: string; contactPhone?: string; trackingUrlTemplate?: string | null } | null;
  carrierService?: { id: string; name: string; serviceCode?: string } | null;
  salesOrder?: {
    id?: string;
    orderNumber: string;
    channel: string;
    grandTotal?: number | string;
    currency?: string;
    orderedAt?: string;
    confirmedAt?: string;
    promisedAt?: string;
    dispatchedAt?: string;
    deliveredAt?: string;
    status?: string;
    paymentStatus?: string;
    notes?: string;
    addresses?: Array<{
      kind: string;
      name?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
    }>;
  };
  packages?: ShipmentPackage[];
  trackingEvents?: Array<{
    id: string;
    status: string;
    eventAt: string;
    message?: string | null;
    location?: string | null;
    createdBy?: string | null;
  }>;
  documents?: Array<{
    id: string;
    type: string;
    documentNumber?: string | null;
    fileUrl?: string | null;
    issuedAt?: string;
    createdAt?: string;
  }>;
  lines?: Array<{
    id: string;
    quantity: number | string;
    salesOrderLine?: FulfillmentLine;
  }>;
  deliveryAttempts?: Array<{
    id: string;
    outcome?: string;
    failureReason?: string;
    attemptedAt: string;
    nextAttemptAt?: string | null;
    notes?: string;
  }>;
  proofOfDelivery?: {
    id: string;
    method: string;
    recipientName: string;
    recipientPhone?: string | null;
    deliveredAt: string;
    otpReference?: string | null;
    signatureUrl?: string | null;
    photoUrls?: string[];
  } | null;
  fulfillment?: {
    id: string;
    fulfillmentNumber: string;
    status?: string;
    stage?: string;
    allocatedAt?: string;
    pickedAt?: string;
    packedAt?: string;
    stagedAt?: string;
    warehouseLocation?: { id: string; name: string; code: string; address?: string };
  };
  manifestLinks?: Array<{
    id: string;
    manifest: {
      id: string;
      manifestNumber: string;
      status: string;
      vehicleNumber?: string | null;
      driverName?: string | null;
      driverPhone?: string | null;
      createdAt: string;
      closedAt?: string | null;
    };
  }>;
}

export interface Fulfillment {
  id: string;
  fulfillmentNumber: string;
  status: string;
  priority: string;
  promisedShipAt?: string | null;
  warehouseLocation: { id: string; code: string; name: string };
  salesOrder: {
    id: string;
    orderNumber: string;
    channel: string;
    status: string;
    paymentStatus: string;
    grandTotal: number | string;
    promisedAt?: string | null;
    lines: FulfillmentLine[];
    addresses: Array<{ kind: string; name?: string; city: string; state: string; postalCode: string }>;
    exceptions: Array<{ id: string; code: string; message: string; severity: string; status: string }>;
  };
  pickLists: PickList[];
  packages: SalesPackage[];
  shipments: Shipment[];
}

export interface Carrier {
  id: string;
  code: string;
  name: string;
  mode: ShipmentMode;
  trackingUrlTemplate?: string | null;
  adapterKey?: string | null;
  status: string;
  services: Array<{ id: string; code: string; name: string; supportsCod: boolean }>;
}
