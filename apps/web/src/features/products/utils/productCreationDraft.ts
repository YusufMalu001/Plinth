import type { ItemUomRelation } from '../types';

export const PRODUCT_CREATION_DRAFT_KEY = 'plinth_product_creation_draft_v1';
export const LEGACY_PRODUCT_CREATION_DRAFT_KEY = 'plinth_product_creation_draft_v1';

export interface ProductFormState {
  name: string;
  partNo: string;
  sku: string;
  parentCategoryId: string;
  productFamilyId: string;
  description: string;
  // Technical Specifications
  steelGrade: string;
  pipeDiameter: string;
  rodThickness: string;
  loadCapacity: string;
  dimensionsUnfolded: string;
  foldedProfile: string;
  netWeight: string;
  grossWeight: string;
  surfaceFinish: string;
  dryingRails: string;
  // Commercial & Pricing
  hsnCode: string;
  taxability: string;
  gstRate: string;
  productType: string;
  asin: string;
  ean13: string;
  // Inventory & Logistics
  uomId: string;
  hasMultipleUoms?: boolean;
  additionalUomIds?: string[];
  uomRelations?: ItemUomRelation[];
  initialQuantity: string;
  minStockLevel: string;
  reorderPoint: string;
  targetMaxStock: string;
  leadTimeDays: string;
}

export interface ProductBomLine {
  id: string;
  materialId: string;
  quantity: string;
  uomId: string;
  note: string;
  materialName?: string;
  materialCode?: string;
}

export interface ProductCustomField {
  name: string;
  value: string;
}

export interface PricingField {
  name: string;
  value: string;
}

export interface ProductTierPricingForm {
  tierId: string;
  tierName: string;
  tierCode: string;
  masterPrice: number;
  defaultDiscountPercentage: number;
  discountPercentage: number;
  isCustomPrice: boolean;
  customPrice: string;
  calculatedPrice: number;
  enabled: boolean;
}

export interface ProductionRouteStep {
  id: string;
  stepName: string;
  departmentId: string;
  durationMinutes: string;
}

export interface ProductCreationDraft {
  form: ProductFormState;
  bomLines: ProductBomLine[];
  customFields: ProductCustomField[];
  technicalFields: ProductCustomField[];
  pricingMasterId: string;
  pricingFields: PricingField[];
  mrp: string;
  costPrice: string;
  globalDiscount: string;
  additionalDiscount: string;
  tierPricing: ProductTierPricingForm[];
  routeSteps: ProductionRouteStep[];
  selectedRouteId: string;
  selectedBomVersionId: string;
  savedAt: string;
}

export function getProductCreationDraft(): ProductCreationDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PRODUCT_CREATION_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as ProductCreationDraft;
    }
  } catch (err) {
    console.warn('[product-creation-draft] Failed to read draft:', err);
  }
  return null;
}
