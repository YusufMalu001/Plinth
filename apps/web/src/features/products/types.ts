import type { LifecycleStatus } from '@synergy/types';

export interface ProductImage {
  url: string;
  fileName?: string;
  isPrimary?: boolean;
  caption?: string;
  tags?: string[];
}

export interface ProductTechnicalSpecs {
  materialGrade?: string;
  frameSpecs?: string;
  rodSpecs?: string;
  surfaceFinish?: string;
  hangingSpace?: string;
  loadCapacity?: string;
  foldedDimensions?: string;
  extendedDimensions?: string;
  netWeight?: string;
  grossWeight?: string;
  packagingType?: string;
  unitsPerCarton?: string;
  warranty?: string;
  corrosionResistance?: string;
}

export interface ProductBomComponent {
  component: string;
  variant?: string;
  code?: string;
  category?: 'RAW_MATERIAL' | 'HARDWARE' | 'POLYMERS' | 'PACKAGING' | 'SUB_ASSEMBLY';
  quantity: number | string;
  uom: string;
  scrapAllowance?: number | string;
  unitCost?: number | string;
  note?: string;
}

export interface ProductCommercials {
  mrp?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
  distributorPrice?: number;
  costPrice?: number;
  hsnCode?: string;
  gstRate?: number;
  asin?: string;
  barcode?: string;
}

export interface ProductInventoryThresholds {
  minStockLevel?: number;
  safetyStock?: number;
  reorderPoint?: number;
  maxCapacity?: number;
  leadTimeDays?: number;
  warehouseLocationId?: string;
  initialQuantity?: number;
}

export interface ItemUomRelation {
  id?: string;
  fromUomId: string;
  toUomId: string;
  fromQuantity: number;
  toQuantity: number;
  factor: number;
  notes?: string;
}

export interface EnrichedProductMetadata extends ProductCommercials, ProductInventoryThresholds {
  images?: ProductImage[];
  specifications?: ProductTechnicalSpecs;
  bomFormula?: ProductBomComponent[];
  bomFormulaBasis?: string;
  source?: string;
  hasMultipleUoms?: boolean;
  availableUomIds?: string[];
  uomRelations?: ItemUomRelation[];
  [key: string]: unknown;
}

export interface DetailedProduct {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  productFamilyId: string;
  categoryId: string;
  uomId: string;
  status: LifecycleStatus;
  version: number;
  effectiveDate?: string | null;
  metadata?: EnrichedProductMetadata | null;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
  };
  productFamily?: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
  };
  uom?: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  };
  variants?: Array<{
    id: string;
    sku: string;
    name: string;
    color?: string | null;
    size?: string | null;
    status: LifecycleStatus;
  }>;
}

export interface ProductWarehouseStock {
  locationId: string;
  locationCode: string;
  locationName: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  unitCost: number;
  status: 'OPTIMAL' | 'LOW' | 'CRITICAL' | 'OVERSTOCK';
}

export interface ProductMovementRow {
  id: string;
  timestamp: string;
  movementType: 'GRN_RECEIPT' | 'PRODUCTION_ISSUE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT' | 'DISPATCH' | 'OPENING_BALANCE';
  referenceId: string;
  referenceLabel?: string;
  referenceHref?: string | null;
  direction: 'IN' | 'OUT';
  quantity: number;
  uom: string;
  balanceAfter: number;
  locationName?: string;
  actorName: string;
  notes?: string;
  grnNumber?: string;
  grnId?: string;
}

export interface ProductLinkedOrder {
  id: string;
  orderNumber: string;
  type: 'SALES_ORDER' | 'PURCHASE_ORDER' | 'WORK_ORDER';
  partyName: string;
  quantity: number;
  allocatedQuantity?: number;
  allocationStatus?: string;
  status: string;
  date: string;
  amount?: number;
}
