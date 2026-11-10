export type SalesShipmentMode = 'COURIER' | 'TRANSPORTER' | 'OWN_FLEET' | 'CUSTOMER_PICKUP' | 'MARKETPLACE';
export type SalesShipmentStatus = 'CREATED' | 'STAGED' | 'READY' | 'HANDED_OVER' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED' | 'RTO_INITIATED' | 'RTO_RECEIVED' | 'CANCELLED';
export type SalesTrackingSource = 'MANUAL' | 'CARRIER' | 'MARKETPLACE' | 'SYSTEM';
export type SalesDispatchDocumentType = 'INVOICE' | 'PACKING_SLIP' | 'SHIPPING_LABEL' | 'MANIFEST' | 'GATE_PASS' | 'E_WAY_BILL' | 'DELIVERY_CHALLAN' | 'POD' | 'OTHER';

export interface QueueParams {
  page: number;
  limit: number;
  stage?: string;
  channel?: string;
  warehouseLocationId?: string;
  search?: string;
}

export interface PickScanInput {
  salesPickItemId: string;
  scanValue: string;
  quantity: number;
  lotId?: string;
  binCode?: string;
  overrideReason?: string;
  discrepancyReason?: string;
}

export interface PackageItemInput {
  salesOrderLineId: string;
  allocationId?: string;
  lotId?: string;
  quantity: number;
  scanValue?: string;
}

export interface PackageMaterialInput {
  materialId: string;
  uomId: string;
  plannedQuantity?: number;
  actualQuantity: number;
  overrideReason?: string;
}

export interface CreatePackageInput {
  packageType: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  netWeightKg?: number;
  tareWeightKg?: number;
  grossWeightKg?: number;
  sealNumber?: string;
  handlingInstructions?: string;
  photoUrls?: string[];
  items: PackageItemInput[];
  materials?: PackageMaterialInput[];
}

export interface CreateShipmentInput {
  packageIds: string[];
  mode: SalesShipmentMode;
  carrierId?: string;
  carrierServiceId?: string;
  awbNumber?: string;
  freightTerms?: string;
  freightAmount?: number;
  codAmount?: number;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  routeNotes?: string;
  dispatchDock?: string;
  pickupScheduledAt?: string;
  expectedDeliveryAt?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface TrackingEventInput {
  status: SalesShipmentStatus;
  source?: SalesTrackingSource;
  eventAt?: string;
  location?: string;
  message?: string;
  externalId?: string;
  payload?: unknown;
}

export interface DeliveryAttemptInput {
  outcome: 'FAILED' | 'RESCHEDULED' | 'REFUSED' | 'UNREACHABLE';
  failureReason: string;
  nextAttemptAt?: string;
  recipientName?: string;
  notes?: string;
}

export interface DeliverShipmentInput {
  method: 'OTP' | 'SIGNATURE' | 'PHOTO';
  recipientName: string;
  otpReference?: string;
  signatureUrl?: string;
  photoUrls?: string[];
  latitude?: number;
  longitude?: number;
  deliveredAt?: string;
}

export interface CreateManifestInput {
  warehouseLocationId: string;
  shipmentIds: string[];
  carrierId?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
}

export interface CreateDocumentInput {
  type: SalesDispatchDocumentType;
  documentNumber?: string;
  fileUrl?: string;
  metadata?: unknown;
  issuedAt?: string;
  expiresAt?: string;
}
