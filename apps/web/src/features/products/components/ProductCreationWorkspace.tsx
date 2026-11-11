'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BadgePercent,
  BookmarkPlus,
  Boxes,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Database,
  FileText,
  GitBranch,
  GripVertical,
  ImagePlus,
  Layers,
  Package,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  Wrench,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import clsx from 'clsx';
import { Button, Checkbox } from '@plinth/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCategories,
  useCreateProduct,
  useCreateMaterial,
  useProduct,
  useUpdateProduct,
  useUpdateMaterial,
  useHsnSacLookup,
  useHsnSacCodes,
  usePricingMasters,
  useMaterials,
  useProducts,
  useDepartments,
  useProductFamilies,
  useUoms,
  useUploadProductImages,
  useProductRoutes,
  extractProductVariants,
  extractMaterialVariants,
  isCustomSku,
} from '../../../hooks/useMasterData';
import { bomKeys, useBomVersion, useBomVersions } from '../../bom/hooks';
import { bomApi } from '../../bom/api';
import { saveInventoryBomVersion } from '../../bom/save-inventory-bom';
import { showToast } from '../../../components/toast-store';
import { friendlyErrorMessage } from '../../../features/auth/access-control';
import { InlineMasterDataDialog } from '../../../components/InlineMasterDataDialog';
import { SearchableSelector } from '../../../components/ui/SearchableSelector';
import { MultiBomSelector, type BomSelectorOption } from '../../../components/ui/MultiBomSelector';
import { fetchApi } from '../../../features/api/client';
import { ProductSpecialDialog, type ProductSpecialPreset } from './ProductSpecialDialog';
import { ItemUomRelationModal } from './ItemUomRelationModal';
import type { ItemUomRelation } from '../types';
import { formatVariantName, getVariantLabel } from '../variant-names';
import { calculateTierPrice, handleNumberInputWheel, handleNumberInputKeyDown } from '../utils/tierPricing';
import { PricingLevelModal } from './PricingLevelModal';
import { usePricingLevels } from '../../../hooks/usePricingLevels';
import { getItemAllowedUomIds, convertItemQuantityBetweenUoms, getNextIncrementedBomName } from '../../bom/utils';
import { getRouteSnapshot, isRouteReadyToSave } from '../route-snapshot';
import { isProductionExecutionDepartment, resolveAssemblyDepartment } from '../../production/types';

interface ProductFormState {
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
  additionalUomIds: string[];
  uomRelations?: ItemUomRelation[];
  initialQuantity: string;
  minStockLevel: string;
  reorderPoint: string;
  targetMaxStock: string;
  leadTimeDays: string;
}

const getItemTypeForCategory = (category?: { code?: string; name?: string } | null): 'PRODUCT' | 'MATERIAL' | null => {
  if (!category) return null;
  const identity = `${category.code || ''} ${category.name || ''}`.toLowerCase();
  if (/finished[\s_-]*(good|goods)/.test(identity) || /\b(fg|sfg|wip)\b/.test(identity) || /semi[\s_-]*finished|sub[\s_-]*assembl/.test(identity)) return 'PRODUCT';
  return 'MATERIAL';
};

const getMaterialTypeForCategory = (category?: { code?: string; name?: string } | null): 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT' => {
  const identity = `${category?.code || ''} ${category?.name || ''}`.toLowerCase();
  if (/packag/.test(identity)) return 'PACKAGING';
  if (/hardwar|fastener|fitting/.test(identity)) return 'HARDWARE';
  if (/component|sub[\s_-]*assembl|semi[\s_-]*finished/.test(identity)) return 'COMPONENT';
  return 'RAW_MATERIAL';
};

export interface ProductBomLine {
  id: string;
  /** Persisted BOM line identity used to connect a reviewed route's material allotments. */
  bomLineId?: string;
  materialId: string;
  quantity: string;
  uomId: string;
  unitCost?: string;
  lineCost?: string;
  note: string;
  quantityMode?: 'FIXED' | 'SCALED';
  roundingRule?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
  roundingPrecision?: number | null;
  materialName?: string;
  materialCode?: string;
  sourceBomVersionId?: string;
}

function cleanQuantityString(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  let s = String(val).trim().replace(/,/g, '.');
  if (s.startsWith('.')) s = '0' + s;
  return s;
}

function mergeDuplicateBomLines(lines: ProductBomLine[]): ProductBomLine[] {
  const merged: ProductBomLine[] = [];
  const indexByItem = new Map<string, number>();
  let hasDuplicates = false;

  for (const line of lines) {
    if (!line.materialId) {
      merged.push(line);
      continue;
    }
    const key = `${line.materialId}::${getBomVariantIdentity(line.note)}`;
    const existingIndex = indexByItem.get(key);
    if (existingIndex === undefined) {
      indexByItem.set(key, merged.length);
      merged.push({ ...line });
      continue;
    }

    hasDuplicates = true;
    const existing = merged[existingIndex];
    const existingQty = Number(cleanQuantityString(existing.quantity)) || 0;
    const duplicateQty = Number(cleanQuantityString(line.quantity)) || 0;
    const quantity = Math.round((existingQty + duplicateQty) * 1000000) / 1000000;
    const existingRate = Number(existing.unitCost) || 0;
    const duplicateRate = Number(line.unitCost) || 0;
    const existingTotal = Number(existing.lineCost) || (existingQty * existingRate);
    const duplicateTotal = Number(line.lineCost) || (duplicateQty * duplicateRate);
    const total = existingTotal + duplicateTotal;
    const notes = Array.from(new Set([existing.note.trim(), line.note.trim()].filter(Boolean)));

    merged[existingIndex] = {
      ...existing,
      quantity: String(quantity),
      unitCost: quantity > 0 && total > 0 ? String(Math.round((total / quantity) * 100) / 100) : existing.unitCost || line.unitCost || '',
      lineCost: total > 0 ? String(Math.round(total * 100) / 100) : '',
      note: notes.join(' · '),
    };
  }

  return hasDuplicates ? merged : lines;
}

function getNormalizedBomSnapshot(lines: ProductBomLine[]): string {
  const clean = (lines || [])
    .filter((l) => l.materialId && (Number(cleanQuantityString(l.quantity)) > 0 || String(l.quantity).trim() !== ''))
    .map((l) => ({
      m: l.materialId,
      q: Math.round((Number(cleanQuantityString(l.quantity)) || 0) * 1000000) / 1000000,
      u: l.uomId || '',
      c: Math.round((Number(l.unitCost) || 0) * 10000) / 10000,
      n: (l.note || '').trim(),
    }))
    .sort((a, b) => a.m.localeCompare(b.m));
  return JSON.stringify(clean);
}

function stripGeneratedVariantNotes(note?: string | null): string {
  return String(note || '')
    .split(/\s*·\s*/)
    .filter((part) => !/^Selected variant:/i.test(part.trim()))
    .join(' · ')
    .trim();
}

function getGeneratedVariantId(note?: string | null): string | undefined {
  return String(note || '').match(/Selected variant:.*?\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i)?.[1];
}

function getGeneratedVariantLabel(note?: string | null): string | undefined {
  const marker = String(note || '').split(/\s*·\s*/).find((part) => /^Selected variant:/i.test(part.trim()));
  return marker
    ?.replace(/^Selected variant:\s*/i, '')
    .replace(/\s*\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)\s*$/i, '')
    .trim() || undefined;
}

function resolveBomLineItemId(line: any, items: any[]): string {
  const variantId = getGeneratedVariantId(line?.note);
  if (variantId) return variantId;

  const itemId = line?.materialId || line?.componentProductId || line?.material?.id || line?.componentProduct?.id || '';
  const variantLabel = getGeneratedVariantLabel(line?.note);
  if (!itemId || !variantLabel) return itemId;

  const normalizedLabel = normalizeVariantIdentity(variantLabel);
  const matchingVariant = items.find((item) => {
    const parentId = item.parentMaterialId || item.parentProductId || item.parentOptionId;
    if (parentId !== itemId) return false;
    const parentName = item.parentMaterialName || item.parentProductName || item.parentItemName || '';
    const itemLabel = getVariantLabel(parentName, item.name, item.measurementValue || item.specs?.measurementValue || item.metadata?.measurementValue || '');
    return normalizeVariantIdentity(itemLabel) === normalizedLabel;
  });
  return matchingVariant?.id || itemId;
}

function getBomVariantIdentity(note?: string | null): string {
  const marker = String(note || '').split(/\s*·\s*/).find((part) => /^Selected variant:/i.test(part.trim()));
  if (!marker) return '';
  const variantId = getGeneratedVariantId(marker);
  if (variantId) return `id:${variantId.toLowerCase()}`;
  return marker.replace(/^Selected variant:\s*/i, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export const getMaterialCost = (mat: any): number => {
  if (!mat) return 0;
  if (mat.averageCost !== undefined && Number(mat.averageCost) > 0) return Number(mat.averageCost);
  if (mat.avgCost !== undefined && Number(mat.avgCost) > 0) return Number(mat.avgCost);
  if (mat.avgRate !== undefined && Number(mat.avgRate) > 0) return Number(mat.avgRate);
  if (mat.costPrice !== undefined && Number(mat.costPrice) > 0) return Number(mat.costPrice);
  if (mat.standardCost !== undefined && Number(mat.standardCost) > 0) return Number(mat.standardCost);
  if (mat.standardPrice !== undefined && Number(mat.standardPrice) > 0) return Number(mat.standardPrice);
  if (mat.unitCost !== undefined && Number(mat.unitCost) > 0) return Number(mat.unitCost);
  if (mat.rate !== undefined && Number(mat.rate) > 0) return Number(mat.rate);
  if (mat.price !== undefined && Number(mat.price) > 0) return Number(mat.price);
  if (mat.specs?.averageCost !== undefined && Number(mat.specs.averageCost) > 0) return Number(mat.specs.averageCost);
  if (mat.specs?.avgCost !== undefined && Number(mat.specs.avgCost) > 0) return Number(mat.specs.avgCost);
  if (mat.specs?.avgRate !== undefined && Number(mat.specs.avgRate) > 0) return Number(mat.specs.avgRate);
  if (mat.specs?.costPrice !== undefined && Number(mat.specs.costPrice) > 0) return Number(mat.specs.costPrice);
  if (mat.specs?.standardCost !== undefined && Number(mat.specs.standardCost) > 0) return Number(mat.specs.standardCost);
  if (mat.specs?.rate !== undefined && Number(mat.specs.rate) > 0) return Number(mat.specs.rate);
  if (mat.specs?.unitCost !== undefined && Number(mat.specs.unitCost) > 0) return Number(mat.specs.unitCost);
  if (mat.metadata?.averageCost !== undefined && Number(mat.metadata.averageCost) > 0) return Number(mat.metadata.averageCost);
  if (mat.metadata?.avgCost !== undefined && Number(mat.metadata.avgCost) > 0) return Number(mat.metadata.avgCost);
  if (mat.metadata?.avgRate !== undefined && Number(mat.metadata.avgRate) > 0) return Number(mat.metadata.avgRate);
  if (mat.metadata?.costPrice !== undefined && Number(mat.metadata.costPrice) > 0) return Number(mat.metadata.costPrice);
  if (mat.metadata?.standardCost !== undefined && Number(mat.metadata.standardCost) > 0) return Number(mat.metadata.standardCost);
  if (mat.metadata?.standardPrice !== undefined && Number(mat.metadata.standardPrice) > 0) return Number(mat.metadata.standardPrice);
  if (mat.metadata?.rate !== undefined && Number(mat.metadata.rate) > 0) return Number(mat.metadata.rate);

  return 0;
};

interface ProductCustomField {
  name: string;
  value: string;
}

interface PricingField {
  name: string;
  value: string;
}

export interface ProductTierPricingForm {
  tierId: string;
  tierName: string;
  level?: string;
  tierCode: string;
  masterPrice: number;
  defaultDiscountPercentage: number;
  discountPercentage: number;
  isCustomPrice: boolean;
  customPrice: string;
  calculatedPrice: number;
  enabled: boolean;
}

interface ProductionRouteStep {
  id: string;
  stepName: string;
  departmentId: string;
  durationMinutes: string;
}

function mapSavedRouteSteps(steps: any[], idPrefix: string): ProductionRouteStep[] {
  return steps
    .slice()
    .sort((a, b) => (a.sequenceNumber ?? a.sequence ?? 0) - (b.sequenceNumber ?? b.sequence ?? 0))
    .map((step, index) => ({
      id: step.id || `${idPrefix}-${index}`,
      stepName: step.stepName || `Step ${index + 1}`,
      departmentId: step.departmentId || '',
      durationMinutes: String(step.standardDurationMinutes ?? ''),
    }));
}

export interface MeasurementVariantForm {
  id: string;
  name: string;
  sku: string;
  measurementValue: string;
  uomId: string;
  openingStock: string;
  minStockLevel: string;
  reorderPoint: string;
  standardPrice: string;
  customFields: { name: string; value: string }[];
}

const PRODUCT_CREATION_DRAFT_KEY = 'plinth_product_creation_draft_v1';
const LEGACY_DRAFT_KEY = 'plinth_product_creation_draft_v1';
const isPersistedVariantId = (id?: string) => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
const normalizeVariantIdentity = (value?: string | null) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();
const createEmptyMeasurementVariant = (uomId = ''): MeasurementVariantForm => ({
  id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: '',
  sku: '',
  measurementValue: '',
  uomId,
  openingStock: '',
  minStockLevel: '',
  reorderPoint: '',
  standardPrice: '',
  customFields: [],
});

const getEditableVariantSku = (sku: unknown, parentCode?: string | null) => {
  const value = String(sku || '').trim();
  if (!value) return '';
  const normalized = value.toUpperCase();
  const parent = String(parentCode || '').trim().toUpperCase();
  if (
    (parent && normalized.startsWith(`${parent}-V`) && /-V\d+$/i.test(normalized)) ||
    (parent && normalized.startsWith(`${parent}-VAR-`) && /-VAR-\d+$/i.test(normalized)) ||
    /^(?:SKU|MAT|PROD)-[A-Z0-9]{6,12}(?:-[A-Z0-9]{1,8})?$/i.test(value)
  ) return '';
  return value;
};
interface ProductCreationDraft {
  form: ProductFormState;
  bomLines: ProductBomLine[];
  customFields: ProductCustomField[];
  technicalFields: ProductCustomField[];
  pricingMasterId: string;
  pricingFields: PricingField[];
  mrp: string;
  tierPricing: ProductTierPricingForm[];
  routeSteps: ProductionRouteStep[];
  routeName?: string;
  selectedRouteId: string;
  selectedBomVersionId: string;
  selectedBomVersionIds?: string[];
  savedAt: string;
  measurementVariants?: MeasurementVariantForm[];
  itemClassification?: 'PRODUCT' | 'MATERIAL';
  materialType?: 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT';
}

const INITIAL_FORM: ProductFormState = {
  name: '',
  partNo: '',
  sku: '',
  parentCategoryId: '',
  productFamilyId: '',
  description: '',
  steelGrade: '',
  pipeDiameter: '',
  rodThickness: '',
  loadCapacity: '',
  dimensionsUnfolded: '',
  foldedProfile: '',
  netWeight: '',
  grossWeight: '',
  surfaceFinish: '',
  dryingRails: '',
  hsnCode: '',
  taxability: 'Taxable',
  gstRate: '18',
  productType: 'Goods',
  asin: '',
  ean13: '',
  uomId: '',
  hasMultipleUoms: false,
  additionalUomIds: [],
  uomRelations: [],
  initialQuantity: '',
  minStockLevel: '',
  reorderPoint: '',
  targetMaxStock: '',
  leadTimeDays: '',
};

export interface ProductCreationWorkspaceProps {
  defaultType?: 'PRODUCT' | 'MATERIAL';
  mode?: 'create' | 'edit';
  editId?: string;
}

export function ProductCreationWorkspace({ defaultType, mode: initialMode, editId: initialEditId }: ProductCreationWorkspaceProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const isEditMode = initialMode === 'edit' || searchParams?.get('mode') === 'edit';
  const editId = initialEditId || searchParams?.get('editId') || searchParams?.get('id') || '';
  const typeParam = searchParams?.get('type')?.toUpperCase();
  const viewParam = searchParams?.get('view');
  const familyParam = searchParams?.get('familyId') || searchParams?.get('family') || searchParams?.get('subCategory');
  const categoryParam = searchParams?.get('categoryId') || searchParams?.get('category');
  const initialType: 'PRODUCT' | 'MATERIAL' = (typeParam === 'MATERIAL' || defaultType === 'MATERIAL') ? 'MATERIAL' : 'PRODUCT';

  const handleBack = () => {
    if (viewParam === 'all-items') {
      router.push('/products?view=all-items');
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else if (familyParam) {
      router.push(`/products?familyId=${familyParam}`);
    } else {
      router.push(itemClassification === 'PRODUCT' ? '/products' : '/products?type=MATERIAL');
    }
  };

  const [itemClassification, setItemClassification] = useState<'PRODUCT' | 'MATERIAL'>(initialType);
  const [materialType, setMaterialType] = useState<'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT'>('RAW_MATERIAL');
  // In edit mode, the URL identifies which persisted entity is being edited.
  // Keep category changes from switching the detail query to another table.
  // In edit mode the persisted entity type is fixed for the lifetime of this
  // form. Changing its category must not switch product queries to materials
  // (or vice versa) and make its saved BOM appear to disappear.
  const editEntityType = isEditMode ? initialType : itemClassification;

  const [form, setForm] = useState<ProductFormState>(() => ({
    ...INITIAL_FORM,
    ...(familyParam ? { productFamilyId: familyParam } : {}),
    ...(categoryParam ? { parentCategoryId: categoryParam } : {}),
  }));
  const [activeSectionTab, setActiveSectionTab] = useState<'all' | 'general' | 'pricing' | 'routing' | 'specs' | 'inventory' | 'bom' | 'variants'>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [inlineMasterData, setInlineMasterData] = useState<'category' | 'family' | 'uom' | null>(null);
  const bomEnabled = true;
  const [bomLines, setBomLines] = useState<ProductBomLine[]>([]);
  const [bomName, setBomName] = useState('');
  const [originalLoadedBomName, setOriginalLoadedBomName] = useState<string>('');
  const [savedBoms, setSavedBoms] = useState<Array<{
    id: string;
    name: string;
    originalName?: string;
    lines: ProductBomLine[];
    status?: string;
    version?: number;
    isExisting?: boolean;
    originalSnapshot?: string;
    forceCreate?: boolean;
    productVariantId?: string | null;
  }>>([]);
  const bomSaveInProgressRef = React.useRef(false);
  const [editingSavedBomId, setEditingSavedBomId] = useState<string | null>(null);
  const [appendedBomNames, setAppendedBomNames] = useState<string[]>([]);
  const [draggedBomIndex, setDraggedBomIndex] = useState<number | null>(null);
  const dragSourceIndexRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const mergedLines = mergeDuplicateBomLines(bomLines);
    if (mergedLines !== bomLines) setBomLines(mergedLines);
  }, [bomLines]);
  const [measurementVariants, setMeasurementVariants] = useState<MeasurementVariantForm[]>([createEmptyMeasurementVariant()]);
  const [customFields, setCustomFields] = useState<ProductCustomField[]>([{ name: '', value: '' }]);
  const [technicalFields, setTechnicalFields] = useState<ProductCustomField[]>([{ name: '', value: '' }]);
  const [pricingMasterId, setPricingMasterId] = useState('');
  const [pricingFields, setPricingFields] = useState<PricingField[]>([]);
  const [mrp, setMrp] = useState('');
  const [tierPricing, setTierPricing] = useState<ProductTierPricingForm[]>([]);
  const [routeSteps, setRouteSteps] = useState<ProductionRouteStep[]>([]);
  const [routeName, setRouteName] = useState('');
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeBaseline, setRouteBaseline] = useState<{ id: string; snapshot: string } | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const routeLoadRequestRef = React.useRef(0);
  const [selectedBomVersionId, setSelectedBomVersionId] = useState('');
  const [selectedBomVersionIds, setSelectedBomVersionIds] = useState<string[]>([]);
  const [loadedBomVersionId, setLoadedBomVersionId] = useState<string | null>(null);
  const [loadedBomSnapshot, setLoadedBomSnapshot] = useState<string | null>(null);
  const [isAutoFeedingBom, setIsAutoFeedingBom] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<{ file: File; url: string }[]>([]);
  const [isMediaDragging, setIsMediaDragging] = useState(false);
  const [hsnSearchTerm, setHsnSearchTerm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [isSpecialModalOpen, setIsSpecialModalOpen] = useState(false);
  const [isUomRelationModalOpen, setIsUomRelationModalOpen] = useState(false);
  const { levels: pricingLevels } = usePricingLevels();
  const [isPricingLevelModalOpen, setIsPricingLevelModalOpen] = useState(false);

  const handleApplySpecial = (special: ProductSpecialPreset) => {
    setForm((prev) => ({
      ...prev,
      hsnCode: special.hsnCode || prev.hsnCode,
      taxability: special.taxability || prev.taxability,
      uomId: special.uomId || prev.uomId,
      gstRate: special.gstRate || prev.gstRate,
      initialQuantity: special.initialQuantity !== undefined ? special.initialQuantity : prev.initialQuantity,
    }));
    clearFieldError('uomId');
  };

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const focusAndScrollToField = (fieldId: string, sectionKey?: string) => {
    if (sectionKey) {
      setActiveSectionTab((curr) => (curr === 'all' ? 'all' : (sectionKey as any)));
      setCollapsedSections((prev) => ({ ...prev, [sectionKey]: false }));
    }
    setTimeout(() => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof (el as any).focus === 'function') {
          (el as any).focus();
        }
      }
    }, 120);
  };

  const categories = useCategories();
  const selectedCategory = categories.data?.items.find((category) => category.id === form.parentCategoryId);
  const isRawMaterialCategory = /raw\s*materials?/i.test(selectedCategory?.name || '') || itemClassification === 'MATERIAL';
  const categoryItemType = getItemTypeForCategory(selectedCategory);
  React.useEffect(() => {
    // In edit mode the URL type identifies the persisted entity and must win
    // over the category. Existing catalog data can have a category/type
    // mismatch; using the category here would call the wrong update endpoint.
    if (isEditMode && (typeParam === 'PRODUCT' || typeParam === 'MATERIAL')) {
      setItemClassification(typeParam);
      if (typeParam === 'MATERIAL') {
        setMaterialType(getMaterialTypeForCategory(selectedCategory));
      }
      return;
    }
    if (!categoryItemType) return;
    setItemClassification(categoryItemType);
    if (categoryItemType === 'MATERIAL') {
      setMaterialType(getMaterialTypeForCategory(selectedCategory));
    }
  }, [categoryItemType, isEditMode, typeParam, selectedCategory]);
  const materials = useMaterials(undefined, 1, 1000, { expandVariants: true });
  // Keep raw material rows as well as expanded picker options. A projected
  // variant has a synthetic id and can otherwise be mistaken for a new row.
  const materialRecords = useMaterials(undefined, 1, 1000, { excludeVariants: true });
  const products = useProducts(undefined, 1, 1000);
  // Keep raw product records available for matching persisted variant records.
  // The default product query expands variants into UI projections and omits the
  // underlying child Product rows needed when updating them.
  const productRecords = useProducts(undefined, 1, 1000, { excludeVariants: true });
  const bomProducts = useProducts(undefined, 1, 1000, { expandVariants: true });
  const bomItems = React.useMemo(() => {
    const materialItems = (materials.data?.items || []).filter((item) => item.status !== 'INACTIVE').map((item) => {
      const parentId = item.parentMaterialId || (item as any).materialId || String(item.specs?.parentMaterialId || '') || undefined;
      const isVar = Boolean(item.isVariant || item.specs?.isVariant || parentId);
      return {
        ...item,
        isVariant: isVar,
        parentMaterialId: parentId,
        parentOptionId: parentId,
      };
    });
    const productItems = (bomProducts.data?.items || []).filter((item) => item.status !== 'INACTIVE').map((item) => {
      const parentId = item.parentProductId || (item as any).productId || (item.metadata as any)?.parentProductId;
      const isVar = Boolean(item.isVariant || (item.metadata as any)?.isVariant || parentId);
      return {
        ...item,
        isVariant: isVar,
        parentProductId: parentId || undefined,
        parentOptionId: parentId || undefined,
      };
    });
    const byId = new Map<string, any>([...materialItems, ...productItems].map((item) => [item.id, item]));
    const childrenByParent = new Map<string, any[]>();
    const rootItems = Array.from(byId.values()).filter((item) => !item.parentOptionId || !byId.has(item.parentOptionId));
    for (const item of byId.values()) {
      if (!item.parentOptionId || !byId.has(item.parentOptionId)) continue;
      const children = childrenByParent.get(item.parentOptionId) || [];
      children.push(item);
      childrenByParent.set(item.parentOptionId, children);
    }
    const ordered: any[] = [];
    for (const item of rootItems) {
      ordered.push(item);
      const children = childrenByParent.get(item.id) || [];
      ordered.push(...children.map((child) => ({
        ...child,
        isVariant: true,
        parentOptionId: item.id,
        parentItemName: item.name || child.parentItemName || child.parentProductName || child.parentMaterialName,
        parentCode: item.code || child.parentCode,
        parentSku: item.sku || child.parentSku,
        category: child.category || item.category,
      })));
    }
    return ordered;
  }, [materials.data?.items, bomProducts.data?.items]);
  const families = useProductFamilies(form.parentCategoryId);
  const uoms = useUoms();
  const allUoms = uoms.data?.items || [];
  React.useEffect(() => {
    if (!uoms.isSuccess || !form.uomId || allUoms.some((uom) => uom.id === form.uomId)) return;
    setForm((current) => current.uomId === form.uomId ? { ...current, uomId: '' } : current);
  }, [uoms.isSuccess, allUoms, form.uomId]);
  const hsnCodes = useHsnSacCodes(hsnSearchTerm);
  const hsnLookup = useHsnSacLookup(form.hsnCode);
  const pricingMasters = usePricingMasters();
  const productRoutes = useProductRoutes(
    isEditMode && itemClassification === 'PRODUCT' ? editId : undefined,
    undefined,
    { enabled: true },
    isEditMode && itemClassification === 'MATERIAL' ? editId : undefined
  );
  const departments = useDepartments();
  const productionDepartments = React.useMemo(() => {
    const items = departments.data?.items || [];
    const assemblyDepartment = resolveAssemblyDepartment(items);
    return items.filter((department) =>
      department.id !== assemblyDepartment?.id &&
      Boolean(department.name?.trim()) &&
      Boolean(department.code?.trim()) &&
      isProductionExecutionDepartment(department)
    );
  }, [departments.data?.items]);
  // All system BOMs for the dropdown selector so created BOMs are always available
  const allSystemBoms = useBomVersions({ limit: 200 });

  // Item-specific BOMs when in edit mode
  const itemBomQueryParam = isEditMode && editId
    ? (editEntityType === 'MATERIAL'
      ? { materialId: editId, limit: 100 }
      : { productId: editId, limit: 100 })
    : undefined;
  const itemBomsQuery = useBomVersions(itemBomQueryParam, { enabled: Boolean(isEditMode && editId) });

  const activeBomSummary = isEditMode && editId
    ? (itemBomsQuery.data?.items || []).find((bom) => bom.status === 'APPROVED') || itemBomsQuery.data?.items[0]
    : undefined;
  const activeBomDetail = useBomVersion(activeBomSummary?.id || '');
  const createProduct = useCreateProduct();
  const createMaterial = useCreateMaterial();
  const updateProduct = useUpdateProduct();
  const updateMaterial = useUpdateMaterial();
  const uploadImages = useUploadProductImages();

  const [existingImages, setExistingImages] = useState<Array<{ path?: string; url: string; fileName?: string }>>([]);
  const [isPopulated, setIsPopulated] = useState(false);

  React.useEffect(() => {
    if (!isEditMode || !itemBomsQuery.data?.items) return;
    // Variant labels on older BOM records may not have a persisted variant ID.
    // Wait for the expanded catalogs so those labels can resolve back to the
    // correct selectable variant instead of falling back to the parent item.
    if (materials.isLoading || bomProducts.isLoading) return;
    const items = itemBomsQuery.data.items;
    if (!items.length) {
      setSavedBoms([]);
      return;
    }

    const mappedBoms = items.map((b) => {
      const mappedLines: ProductBomLine[] = (b.lines || []).map((line: any, index: number) => ({
        id: line.id || `bom-${b.id}-${index}`,
        materialId: resolveBomLineItemId(line, bomItems),
        quantity: line.quantity !== undefined && line.quantity !== null && String(line.quantity).trim() !== '' ? cleanQuantityString(line.quantity) : '1',
        uomId: line.uomId || '',
        note: stripGeneratedVariantNotes(line.note),
        unitCost: line.unitCost != null ? String(line.unitCost) : '',
      }));
      const snapshot = getNormalizedBomSnapshot(mappedLines);
      return {
        id: b.id,
        name: b.bomNumber || `BOM v${b.version}`,
        originalName: b.bomNumber || `BOM v${b.version}`,
        status: b.status,
        version: b.version,
        lines: mappedLines,
        isExisting: true,
        originalSnapshot: snapshot,
        productVariantId: b.productVariantId || null,
      };
    });

    // Deduplicate by unique name (keeping highest version) and sort in natural sequential order
    const latestByName = new Map<string, (typeof mappedBoms)[number]>();
    for (const bom of mappedBoms) {
      const key = bom.name.trim().toLocaleLowerCase();
      const current = latestByName.get(key);
      if (!current || (bom.version ?? 0) > (current.version ?? 0)) latestByName.set(key, bom);
    }
    const uniqueMappedBoms = [...latestByName.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    setSavedBoms(uniqueMappedBoms);

    const targetBom = editingSavedBomId
      ? uniqueMappedBoms.find((b) => b.id === editingSavedBomId)
      : undefined;
    const primaryBom = targetBom || uniqueMappedBoms.find((b) => b.status === 'APPROVED') || uniqueMappedBoms[0];
    if (primaryBom && !editingSavedBomId) {
      setBomName(primaryBom.name);
      setOriginalLoadedBomName(primaryBom.name);
      setBomLines(primaryBom.lines.map((line) => ({ ...line, sourceBomVersionId: primaryBom.id })));
      setEditingSavedBomId(primaryBom.id);
      setSelectedBomVersionId(primaryBom.id);
      setLoadedBomVersionId(primaryBom.id);
      setLoadedBomSnapshot(primaryBom.originalSnapshot || getNormalizedBomSnapshot(primaryBom.lines));
    }
  }, [
    isEditMode,
    itemBomsQuery.data?.items,
    materials.isLoading,
    bomProducts.isLoading,
    bomItems,
  ]);

  // Queries for edit mode
  const editProductQuery = useProduct(isEditMode && editEntityType === 'PRODUCT' && editId ? editId : '');
  const editMaterialQuery = useQuery<any>({
    queryKey: ['materials', 'edit', editId],
    queryFn: ({ signal }) => fetchApi(`/materials/${editId}`, { signal }),
    enabled: Boolean(isEditMode && editEntityType === 'MATERIAL' && editId),
  });

  // Populate fields in edit mode
  React.useEffect(() => {
    if (!isEditMode || isPopulated || !editId) return;
    if (materials.isLoading || bomProducts.isLoading) return;
    // Product variant rows are resolved from the catalog query below. Wait for it
    // to finish so the editor can hydrate existing variants instead of treating
    // metadata variants and catalog projections as separate options.
    if (editEntityType === 'PRODUCT' && editProductQuery.data && (products.isLoading || productRecords.isLoading)) return;

    if (editEntityType === 'PRODUCT' && editProductQuery.data) {
      const prod: any = editProductQuery.data;
      const meta = prod.metadata || {};
      const specs = meta.specifications || {};

      const hasRealSku = isCustomSku(prod.sku, meta);

      setForm({
        name: prod.name || '',
        sku: hasRealSku ? prod.sku : '',
        partNo: prod.partNo || '',
        productFamilyId: prod.productFamilyId || meta.productFamilyId || '',
        parentCategoryId: prod.categoryId || '',
        description: prod.description || '',
        steelGrade: specs.steelGrade || '',
        pipeDiameter: specs.pipeDiameter || '',
        rodThickness: specs.rodThickness || '',
        loadCapacity: specs.loadCapacity || '',
        dimensionsUnfolded: specs.dimensionsUnfolded || '',
        foldedProfile: specs.foldedProfile || '',
        netWeight: specs.netWeight || '',
        grossWeight: specs.grossWeight || '',
        surfaceFinish: specs.surfaceFinish || '',
        dryingRails: specs.dryingRails || '',
        hsnCode: String(meta.hsn || meta.hsnCode || ''),
        taxability: meta.taxability || 'Taxable',
        gstRate: meta.gstRate != null ? String(meta.gstRate) : '18',
        productType: meta.productType || 'Goods',
        asin: meta.asin || '',
        ean13: meta.ean13 || meta.barcode || '',
        uomId: prod.uomId || '',
        hasMultipleUoms: Boolean(meta.hasMultipleUoms || (Array.isArray(meta.availableUomIds) && meta.availableUomIds.filter((id: string) => id !== prod.uomId).length > 0) || (Array.isArray(meta.uomRelations) && meta.uomRelations.length > 0)),
        additionalUomIds: Array.isArray(meta.availableUomIds) ? meta.availableUomIds.filter((id: string) => id !== prod.uomId) : [],
        uomRelations: Array.isArray(meta.uomRelations) ? (meta.uomRelations as ItemUomRelation[]) : [],
        initialQuantity: meta.initialQuantity != null ? String(meta.initialQuantity) : '',
        minStockLevel: prod.minStockLevel != null ? String(prod.minStockLevel) : meta.minStockLevel != null ? String(meta.minStockLevel) : '',
        reorderPoint: prod.reorderPoint != null ? String(prod.reorderPoint) : meta.reorderPoint != null ? String(meta.reorderPoint) : '',
        targetMaxStock: meta.targetMaxStock != null ? String(meta.targetMaxStock) : '',
        leadTimeDays: prod.leadTimeDays != null ? String(prod.leadTimeDays) : meta.leadTimeDays != null ? String(meta.leadTimeDays) : '',
      });
      setItemClassification('PRODUCT');

      if (meta.mrp != null) {
        setMrp(String(meta.mrp));
      } else if (prod.sellingPrice != null) {
        setMrp(String(prod.sellingPrice));
      }

      if (Array.isArray(meta.customFields) && meta.customFields.length > 0) {
        setCustomFields(meta.customFields);
      }
      if (Array.isArray(meta.technicalFields) && meta.technicalFields.length > 0) {
        setTechnicalFields(meta.technicalFields);
      }
      if (Array.isArray(meta.tierPricing)) {
        setTierPricing(meta.tierPricing);
      }
      if (meta.pricingMasterId) {
        setPricingMasterId(meta.pricingMasterId);
      }

      const extracted = extractProductVariants(prod);
      const childProducts = (productRecords.data?.items || []).filter((item: any) =>
        item.isVariant || item.metadata?.isVariant === true
      ).filter((item: any) => item.metadata?.parentProductId === prod.id);
      const sameVariantOption = (left: any, right: any) => {
        const leftMeasurement = String(left?.measurementValue || left?.metadata?.measurementValue || '').trim().toLowerCase();
        const rightMeasurement = String(right?.measurementValue || right?.metadata?.measurementValue || '').trim().toLowerCase();
        const leftName = String(left?.name || '').trim();
        const rightName = String(right?.name || '').trim();
        const leftLabel = normalizeVariantIdentity(leftName && leftName.toLowerCase() !== prod.name.toLowerCase()
          ? getVariantLabel(left?.parentProductName || prod.name, leftName, leftMeasurement)
          : left?.variantLabel || left?.metadata?.variantLabel);
        const rightLabel = normalizeVariantIdentity(rightName && rightName.toLowerCase() !== prod.name.toLowerCase()
          ? getVariantLabel(right?.parentProductName || prod.name, rightName, rightMeasurement)
          : right?.variantLabel || right?.metadata?.variantLabel);
        if (!leftLabel || leftLabel !== rightLabel) return false;
        return !leftMeasurement || !rightMeasurement || leftMeasurement === rightMeasurement;
      };
      const matchedChildIds = new Set<string>();
      const extractedWithRecords = extracted.map((variant) => {
        const record = childProducts.find((item: any) =>
          !matchedChildIds.has(item.id) && (
            item.id === (variant.metadata as any)?.productRecordId ||
            (variant.sku && item.sku === variant.sku) ||
            (variant.measurementValue && item.metadata?.measurementValue === variant.measurementValue) ||
            sameVariantOption(variant, item)
          )
        );
        if (record) matchedChildIds.add(record.id);
        return record ? {
          ...variant,
          metadata: { ...(variant.metadata || {}), productRecordId: record.id },
          sku: getEditableVariantSku(record.sku, prod.sku) || getEditableVariantSku(variant.sku, prod.sku),
          openingStock: variant.openingStock ?? record.metadata?.initialQuantity ?? 0,
          minStockLevel: record.metadata?.minStockLevel ?? variant.minStockLevel,
          reorderPoint: record.metadata?.reorderPoint ?? variant.reorderPoint,
        } : variant;
      });
      // When the parent has configured variants, that list is authoritative.
      // Only fall back to child rows for legacy products with no embedded options;
      // otherwise orphaned child products reappear as phantom options on every edit.
      if (extractedWithRecords.length === 0) {
        for (const record of childProducts) {
          extractedWithRecords.push({
            ...record,
            sku: getEditableVariantSku(record.sku, prod.sku),
            measurementValue: record.metadata?.measurementValue || '',
            openingStock: record.metadata?.initialQuantity ?? 0,
            standardPrice: record.metadata?.sellingPrice ?? 0,
          } as any);
        }
      }
      const uniqueVariantOptions = extractedWithRecords.reduce<any[]>((unique, variant) => {
        const variantName = getVariantLabel(prod.name, variant.name || (variant as any).variantLabel, variant.measurementValue || (variant.metadata as any)?.measurementValue || '');
        const identity = normalizeVariantIdentity(variantName);
        if (!identity) {
          unique.push(variant);
          return unique;
        }

        const existingIndex = unique.findIndex((candidate) => normalizeVariantIdentity(
          getVariantLabel(prod.name, candidate.name || candidate.variantLabel, candidate.measurementValue || candidate.metadata?.measurementValue || '')
        ) === identity);
        if (existingIndex < 0) {
          unique.push(variant);
          return unique;
        }

        const existing = unique[existingIndex];
        const existingHasChild = Boolean(existing.metadata?.productRecordId);
        const variantHasChild = Boolean(variant.metadata?.productRecordId);
        const preferred = !existingHasChild && variantHasChild ? variant : existing;
        const other = preferred === existing ? variant : existing;
        unique[existingIndex] = {
          ...other,
          ...preferred,
          name: preferred.name || other.name,
          variantLabel: preferred.variantLabel || other.variantLabel,
          sku: preferred.sku || other.sku,
          measurementValue: preferred.measurementValue || other.measurementValue,
          uomId: preferred.uomId || other.uomId,
          openingStock: preferred.openingStock ?? other.openingStock,
          minStockLevel: preferred.minStockLevel ?? other.minStockLevel,
          reorderPoint: preferred.reorderPoint ?? other.reorderPoint,
          standardPrice: preferred.standardPrice ?? other.standardPrice,
          metadata: {
            ...(other.metadata || {}),
            ...(preferred.metadata || {}),
            productRecordId: preferred.metadata?.productRecordId || other.metadata?.productRecordId,
          },
        };
        return unique;
      }, []);

      if (uniqueVariantOptions.length > 0) {
        setMeasurementVariants(
          uniqueVariantOptions.map((v) => ({
            id: v.id,
            productRecordId: (v.metadata as any)?.productRecordId || ((v.metadata as any)?.isVariant ? v.id : undefined),
            name: getVariantLabel(prod.name, v.name || v.variantLabel, v.measurementValue || (v.metadata as any)?.measurementValue || ''),
            sku: getEditableVariantSku(v.sku, prod.sku),
            measurementValue: v.measurementValue || (v.metadata as any)?.measurementValue || '',
            uomId: v.uomId || prod.uomId || '',
            openingStock: v.openingStock != null ? String(v.openingStock) : '',
            minStockLevel: v.minStockLevel != null ? String(v.minStockLevel) : '',
            reorderPoint: v.reorderPoint != null ? String(v.reorderPoint) : '',
            standardPrice: v.standardPrice != null ? String(v.standardPrice) : '',
            customFields: (v as any).customFields || [],
          }))
        );
      }

      if (Array.isArray(meta.images) && meta.images.length > 0) {
        setExistingImages(
          meta.images.map((img: any) =>
            typeof img === 'string' ? { url: img, path: img } : { url: img.url, path: img.path, fileName: img.fileName }
          )
        );
      }

      // The item BOM endpoint is the source of truth for attached BOMs. Product
      // metadata can contain an older snapshot (or no lines at all), so only use
      // it as a fallback while the item has no persisted BOM records.
      if (Array.isArray(meta.bomLines) && meta.bomLines.length > 0 && !(itemBomsQuery.data?.items?.length)) {
        setBomLines(
          meta.bomLines.map((line: any, index: number) => ({
            id: line.id || `bom-${index}`,
            materialId: resolveBomLineItemId(line, bomItems),
            materialName: line.materialName || '',
            materialCode: line.materialCode || '',
            quantity: line.quantity !== undefined && line.quantity !== null && String(line.quantity).trim() !== '' ? String(line.quantity) : '1',
            uomId: line.uomId || '',
            note: stripGeneratedVariantNotes(line.note),
            unitCost: line.unitCost || '',
          }))
        );
      }

      setIsPopulated(true);
    } else if (editEntityType === 'MATERIAL' && editMaterialQuery.data) {
      const mat: any = editMaterialQuery.data;
      const specs = mat.specs || {};
      const techSpecs = specs.specifications || {};

      if (Array.isArray(specs.productionRouteSteps)) {
        setRouteSteps(specs.productionRouteSteps.map((step: any, index: number) => ({
          id: step.id || `material-route-${index}`,
          stepName: step.stepName || '',
          departmentId: step.departmentId || '',
          durationMinutes: String(step.durationMinutes ?? ''),
        })));
      }
      if (specs.productionRouteId) setSelectedRouteId(specs.productionRouteId);
      // Material specs may carry a stale/empty BOM snapshot. Do not let it
      // overwrite lines hydrated from the saved BOM versions query.
      if (Array.isArray(specs.bomLines) && specs.bomLines.length > 0 && !(itemBomsQuery.data?.items?.length)) {
        setBomLines(
          specs.bomLines.map((line: any, index: number) => ({
            id: line.id || `bom-${index}`,
            materialId: resolveBomLineItemId(line, bomItems),
            materialName: line.materialName || '',
            materialCode: line.materialCode || '',
            quantity: line.quantity !== undefined && line.quantity !== null && String(line.quantity).trim() !== '' ? String(line.quantity) : '1',
            uomId: line.uomId || '',
            note: stripGeneratedVariantNotes(line.note),
            unitCost: line.unitCost || '',
          }))
        );
      }

      if (mat.materialType) {
        setMaterialType(mat.materialType);
      }

      const hasRealCode = isCustomSku(mat.code, specs);

      setForm({
        name: mat.name || '',
        sku: hasRealCode ? mat.code : '',
        partNo: specs.partNo || '',
        productFamilyId: specs.productFamilyId || mat.productFamilyId || '',
        parentCategoryId: mat.categoryId || '',
        description: mat.description || '',
        steelGrade: techSpecs.steelGrade || specs.steelGrade || specs.materialGrade || '',
        pipeDiameter: techSpecs.pipeDiameter || specs.pipeDiameter || '',
        rodThickness: techSpecs.rodThickness || specs.rodThickness || '',
        loadCapacity: techSpecs.loadCapacity || specs.loadCapacity || '',
        dimensionsUnfolded: techSpecs.dimensionsUnfolded || specs.dimensionsUnfolded || specs.extendedDimensions || '',
        foldedProfile: techSpecs.foldedProfile || specs.foldedProfile || '',
        netWeight: techSpecs.netWeight || specs.netWeight || '',
        grossWeight: techSpecs.grossWeight || specs.grossWeight || '',
        surfaceFinish: techSpecs.surfaceFinish || specs.surfaceFinish || '',
        dryingRails: techSpecs.dryingRails || specs.dryingRails || '',
        hsnCode: String(specs.hsnCode || specs.hsn || ''),
        taxability: specs.taxability || 'Taxable',
        gstRate: specs.gstRate != null ? String(specs.gstRate) : '18',
        productType: 'Goods',
        asin: specs.asin || '',
        ean13: specs.ean13 || specs.barcode || '',
        uomId: mat.uomId || '',
        hasMultipleUoms: Boolean(specs.hasMultipleUoms || (Array.isArray(specs.availableUomIds) && specs.availableUomIds.filter((id: string) => id !== mat.uomId).length > 0) || (Array.isArray(specs.uomRelations) && specs.uomRelations.length > 0)),
        additionalUomIds: Array.isArray(specs.availableUomIds) ? specs.availableUomIds.filter((id: string) => id !== mat.uomId) : [],
        uomRelations: Array.isArray(specs.uomRelations) ? (specs.uomRelations as ItemUomRelation[]) : [],
        initialQuantity: specs.initialQuantity != null ? String(specs.initialQuantity) : '',
        minStockLevel: mat.minStockLevel != null ? String(mat.minStockLevel) : specs.minStockLevel != null ? String(specs.minStockLevel) : '',
        reorderPoint: mat.reorderPoint != null ? String(mat.reorderPoint) : specs.reorderPoint != null ? String(specs.reorderPoint) : '',
        targetMaxStock: specs.targetMaxStock != null ? String(specs.targetMaxStock) : '',
        leadTimeDays: mat.leadTimeDays != null ? String(mat.leadTimeDays) : specs.leadTimeDays != null ? String(specs.leadTimeDays) : '',
      });
      setItemClassification('MATERIAL');

      if (specs.standardCost != null) {
        setMrp(String(specs.standardCost));
      } else if (specs.costPrice != null) {
        setMrp(String(specs.costPrice));
      }

      if (Array.isArray(specs.customFields) && specs.customFields.length > 0) {
        setCustomFields(specs.customFields);
      }
      if (Array.isArray(specs.technicalFields) && specs.technicalFields.length > 0) {
        setTechnicalFields(specs.technicalFields);
      }

      const extracted = extractMaterialVariants(mat);
      if (extracted.length > 0) {
        setMeasurementVariants(
          extracted.map((v) => ({
            id: v.id,
            name: getVariantLabel(mat.name, v.name, v.measurementValue),
            sku: getEditableVariantSku(v.sku || v.code, mat.code),
            measurementValue: v.measurementValue || (v.specs as any)?.measurementValue || '',
            uomId: v.uomId || mat.uomId || '',
            openingStock: v.openingStock != null ? String(v.openingStock) : '',
            minStockLevel: v.minStockLevel != null ? String(v.minStockLevel) : '',
            reorderPoint: v.reorderPoint != null ? String(v.reorderPoint) : '',
            standardPrice: v.standardCost != null ? String(v.standardCost) : '',
            customFields: (v as any).customFields || [],
          }))
        );
      }

      if (Array.isArray(specs.images) && specs.images.length > 0) {
        setExistingImages(
          specs.images.map((img: any) =>
            typeof img === 'string' ? { url: img, path: img } : { url: img.url, path: img.path, fileName: img.fileName }
          )
        );
      }

      setIsPopulated(true);
    }
  }, [isEditMode, isPopulated, editId, editEntityType, editProductQuery.data, editMaterialQuery.data, products.isLoading, products.data?.items, productRecords.isLoading, productRecords.data?.items, materials.isLoading, bomProducts.isLoading]);

  const hydratedProductionRouteForEdit = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isEditMode || !isPopulated || !editId || !productRoutes.data?.items) return;
    if (hydratedProductionRouteForEdit.current === editId) return;

    const routes = productRoutes.data.items as Array<any>;
    const attachedRoutes = routes.filter((route) => (itemClassification === 'PRODUCT'
      ? route.productId === editId
      : route.materialId === editId) && route.status !== 'SUPERSEDED')
      .sort((a, b) => Number((b as any).version || 0) - Number((a as any).version || 0));
    const selectedRoute = attachedRoutes[0]
      || routes.find((route) => route.id === selectedRouteId);
    hydratedProductionRouteForEdit.current = editId;

    if (!selectedRoute) return;

    const requestId = ++routeLoadRequestRef.current;
    setSelectedRouteId(selectedRoute.id);
    setRouteBaseline(null);
    setIsLoadingRoute(true);
    const applyRoute = (route: any) => {
      if (routeLoadRequestRef.current !== requestId) return;
      const name = route.name || selectedRoute.name || '';
      const steps = mapSavedRouteSteps(route.steps || selectedRoute.steps || [], 'saved-route');
      setRouteName(name);
      setRouteSteps(steps);
      setRouteBaseline({ id: selectedRoute.id, snapshot: getRouteSnapshot(name, steps) });
      setIsLoadingRoute(false);
    };
    void fetchApi<any>(`/master-data/routing/routes/${selectedRoute.id}`)
      .then(applyRoute)
      .catch(() => applyRoute(selectedRoute));
  }, [isEditMode, isPopulated, editId, productRoutes.data?.items, selectedRouteId, itemClassification]);

  React.useEffect(() => {
    if (!selectedRouteId || isLoadingRoute || routeBaseline?.id === selectedRouteId) return;
    const route = (productRoutes.data?.items || []).find((item) => item.id === selectedRouteId);
    if (!route) return;
    setRouteBaseline({ id: selectedRouteId, snapshot: getRouteSnapshot(route.name, mapSavedRouteSteps(route.steps || [], 'listed-route')) });
  }, [selectedRouteId, isLoadingRoute, routeBaseline?.id, productRoutes.data?.items]);

  const addMeasurementVariant = () => {
    setMeasurementVariants((prev) => [
      ...prev,
      createEmptyMeasurementVariant(form.uomId),
    ]);
  };
  const removeMeasurementVariant = (index: number) => {
    setMeasurementVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMeasurementVariant = (
    index: number,
    field: keyof Omit<MeasurementVariantForm, 'id' | 'customFields'>,
    value: string
  ) => {
    setMeasurementVariants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };


  // Prefetch product catalog list for instantaneous post-creation navigation
  React.useEffect(() => {
    router.prefetch('/products');
  }, [router]);

  // Load saved draft on initial component mount (ONLY in create mode)
  React.useEffect(() => {
    if (isEditMode) {
      setIsDraftLoaded(true);
      return;
    }
    try {
      const saved = typeof window !== 'undefined' ? (localStorage.getItem(PRODUCT_CREATION_DRAFT_KEY) ?? localStorage.getItem(LEGACY_DRAFT_KEY)) : null;
      if (saved) {
        const parsed: ProductCreationDraft = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          if (parsed.form) {
            const draftForm: Partial<ProductFormState> = { ...parsed.form };
            delete draftForm.parentCategoryId;
            delete draftForm.productFamilyId;
            setForm((prev) => ({
              ...prev,
              ...draftForm,
              parentCategoryId: categoryParam || '',
              productFamilyId: familyParam || '',
            }));
          }
          if (Array.isArray(parsed.bomLines)) setBomLines(parsed.bomLines);
          if (Array.isArray(parsed.customFields) && parsed.customFields.length > 0) setCustomFields(parsed.customFields);
          if (Array.isArray(parsed.technicalFields) && parsed.technicalFields.length > 0) setTechnicalFields(parsed.technicalFields);
          if (parsed.pricingMasterId) setPricingMasterId(parsed.pricingMasterId);
          if (Array.isArray(parsed.pricingFields)) setPricingFields(parsed.pricingFields);
          if (parsed.mrp !== undefined) setMrp(parsed.mrp);
          if (Array.isArray(parsed.tierPricing)) setTierPricing(parsed.tierPricing);
          if (Array.isArray(parsed.routeSteps)) setRouteSteps(parsed.routeSteps);
          if (typeof parsed.routeName === 'string') setRouteName(parsed.routeName);
          if (parsed.selectedRouteId) setSelectedRouteId(parsed.selectedRouteId);
          if (Array.isArray(parsed.selectedBomVersionIds)) {
            setSelectedBomVersionIds(parsed.selectedBomVersionIds);
          } else if (parsed.selectedBomVersionId) {
            setSelectedBomVersionIds([parsed.selectedBomVersionId]);
          }
          if (parsed.selectedBomVersionId) setSelectedBomVersionId(parsed.selectedBomVersionId);
          if (Array.isArray(parsed.measurementVariants)) setMeasurementVariants(parsed.measurementVariants);
          if (parsed.itemClassification && !typeParam && !defaultType) setItemClassification(parsed.itemClassification);
          if (parsed.materialType) setMaterialType(parsed.materialType);
          if (parsed.savedAt) {
            setDraftSavedAt(parsed.savedAt);
            setIsDraftRestored(true);
          }
        }
      }
    } catch (err) {
      console.warn('[ProductCreationWorkspace] Failed to parse draft from localStorage:', err);
    } finally {
      setIsDraftLoaded(true);
    }
  }, [isEditMode, categoryParam, familyParam]);

  // Auto-save draft whenever product creation details change (ONLY in create mode)
  React.useEffect(() => {
    if (!isDraftLoaded || isEditMode) return;

    const hasFormData = Object.entries(form).some(([key, val]) => {
      if (key === 'parentCategoryId' || key === 'productFamilyId') return false;
      if (key === 'taxability' && val === 'Taxable') return false;
      if (key === 'gstRate' && val === '18') return false;
      if (key === 'productType' && val === 'Goods') return false;
      return Boolean(val && String(val).trim());
    });
    const hasCustomFields = customFields.some((f) => f.name.trim() || f.value.trim());
    const hasTechFields = technicalFields.some((f) => f.name.trim() || f.value.trim());
    const hasPricing = Boolean(
      (mrp && mrp !== '0') || pricingMasterId || pricingFields.some((field) => field.name.trim() || field.value.trim()) || tierPricing.length
    );
    const hasBom = bomLines.length > 0 || selectedBomVersionIds.length > 0 || Boolean(selectedBomVersionId);
    const hasRouting = routeSteps.length > 0 || Boolean(selectedRouteId) || Boolean(routeName.trim());
    const hasVariants = measurementVariants.some((v) => v.name.trim() || Boolean(v.measurementValue && v.measurementValue.trim()));

    const isDirty = hasFormData || hasCustomFields || hasTechFields || hasPricing || hasBom || hasRouting || hasVariants;

    if (!isDirty) {
      try {
        localStorage.removeItem(PRODUCT_CREATION_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        setDraftSavedAt(null);
      } catch {
        // ignore
      }
      return;
    }

    const timer = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const draftData: ProductCreationDraft = {
          form: { ...form, parentCategoryId: '', productFamilyId: '' },
          bomLines,
          customFields,
          technicalFields,
          pricingMasterId,
          pricingFields,
          mrp,
          tierPricing,
          routeSteps,
          routeName,
          selectedRouteId,
          selectedBomVersionId: selectedBomVersionIds[0] || selectedBomVersionId,
          selectedBomVersionIds,
          measurementVariants,
          itemClassification,
          materialType,
          savedAt: now,
        };
        localStorage.setItem(PRODUCT_CREATION_DRAFT_KEY, JSON.stringify(draftData));
        setDraftSavedAt(now);
      } catch (err) {
        console.warn('[ProductCreationWorkspace] Failed to auto-save draft to localStorage:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    isDraftLoaded,
    isEditMode,
    form,
    bomLines,
    customFields,
    technicalFields,
    pricingMasterId,
    pricingFields,
    mrp,
    tierPricing,
    routeSteps,
    routeName,
    selectedRouteId,
    selectedBomVersionId,
    selectedBomVersionIds,
    measurementVariants,
    itemClassification,
    materialType,
  ]);
  // Mathematical pricing calculations
  const numMrp = parseFloat(mrp) || 0;
  const isTaxable = form.taxability.trim().toLowerCase() === 'taxable';

  // Total BOM Formulation Material Cost calculations
  const totalBomMaterialCost = bomLines.reduce((acc, line) => {
    const qty = parseFloat(line.quantity) || 0;
    const selectedMat = bomItems.find((m) => m.id === line.materialId);
    const avgRate = selectedMat ? getMaterialCost(selectedMat) : 0;
    const rate = line.unitCost !== undefined && line.unitCost !== '' ? (parseFloat(line.unitCost) || 0) : avgRate;
    return acc + (qty * rate);
  }, 0);

  const totalCostBasis = totalBomMaterialCost;

  const computeTierPrice = (tier: ProductTierPricingForm) => {
    if (tier.isCustomPrice && tier.customPrice && Number.isFinite(parseFloat(tier.customPrice))) {
      return parseFloat(tier.customPrice);
    }
    return calculateTierPrice(Number(tier.masterPrice), Number(tier.discountPercentage));
  };

  const handleChange = (field: keyof ProductFormState, value: string) => {
    setForm((prev) => {
      const next: ProductFormState = {
        ...prev,
        [field]: value,
        ...(field === 'parentCategoryId' ? { productFamilyId: '' } : {}),
      };

      if (field === 'taxability') {
        next.gstRate = value === 'Taxable'
          ? (prev.gstRate && prev.gstRate !== '0' ? prev.gstRate : '18')
          : '0';
      }

      return next;
    });
    clearFieldError(field);
    if (field === 'taxability' && value !== 'Taxable') clearFieldError('gstRate');
  };

  const updateCustomField = (index: number, field: keyof ProductCustomField, value: string) => {
    setCustomFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const addCustomField = () => setCustomFields((current) => [...current, { name: '', value: '' }]);
  const removeCustomField = (index: number) => setCustomFields((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const updateTechnicalField = (index: number, field: keyof ProductCustomField, value: string) => {
    setTechnicalFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const addTechnicalField = () => setTechnicalFields((current) => [...current, { name: '', value: '' }]);
  const removeTechnicalField = (index: number) => setTechnicalFields((current) => current.length === 1 ? [{ name: '', value: '' }] : current.filter((_, itemIndex) => itemIndex !== index));

  const updatePricingField = (index: number, value: Partial<PricingField>) => setPricingFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const removePricingField = (index: number) => setPricingFields((current) => current.length <= 1 ? [] : current.filter((_, itemIndex) => itemIndex !== index));

  const updateTierPricingItem = (index: number, patch: Partial<ProductTierPricingForm>) => {
    setTierPricing((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const addCustomTierItem = (name = '', discount: number | string = '') => {
    const selectedName = name || (pricingLevels[0] || 'Dealer');
    const defaultPrice = numMrp || '';
    setTierPricing((current) => [
      ...current,
      {
        tierId: `custom-tier-${Date.now()}`,
        tierName: selectedName,
        level: selectedName,
        tierCode: selectedName ? selectedName.toUpperCase().replace(/[^A-Z0-9]+/g, '_') : 'CUSTOM',
        masterPrice: defaultPrice as any,
        defaultDiscountPercentage: 0,
        discountPercentage: discount as any,
        isCustomPrice: false,
        customPrice: '',
        calculatedPrice: 0,
        enabled: true,
      },
    ]);
  };

  const removeTierPricingItem = (index: number) => {
    setTierPricing((current) => current.filter((_, i) => i !== index));
  };

  const handleAutoFeedRoute = async (routeId: string) => {
    if (!routeId) return;
    const listedRoute = (productRoutes.data?.items || []).find((r) => r.id === routeId);
    if (!listedRoute) return;

    const requestId = ++routeLoadRequestRef.current;
    setIsLoadingRoute(true);
    setRouteBaseline(null);
    let route = listedRoute;
    try {
      route = await fetchApi<any>(`/master-data/routing/routes/${routeId}`);
    } catch {
      // The list response still provides a usable fallback if the detail fetch fails.
    }
    if (routeLoadRequestRef.current !== requestId) return;

    const rawSteps = route.steps || [];
    const newSteps = mapSavedRouteSteps(rawSteps, 'route-autofed');
    setRouteName(route.name || listedRoute.name || '');
    setRouteSteps(newSteps);
    setSelectedRouteId(routeId);
    setRouteBaseline({ id: routeId, snapshot: getRouteSnapshot(route.name || listedRoute.name || '', newSteps) });
    setIsLoadingRoute(false);
    if (rawSteps.length === 0) {
      showToast({
        kind: 'error',
        title: 'No Steps in Route',
        message: `Route "${route.name}" does not contain any defined production steps.`,
      });
      return;
    }

    showToast({
      kind: 'success',
      title: 'Production Route Loaded',
      message: `Successfully loaded ${newSteps.length} production steps from route "${route.name}".`,
    });
  };

  const addRouteStep = () => {
    setRouteSteps((current) => [
      ...current,
      {
        id: `route-step-${Date.now()}`,
        stepName: '',
        departmentId: productionDepartments.find((department) =>
          !current.some((step) => step.departmentId === department.id)
        )?.id || '',
        durationMinutes: '',
      },
    ]);
  };

  const routeNameAlreadyExists = Boolean(routeName.trim()) && (productRoutes.data?.items || []).some(
    (route) => route.status !== 'SUPERSEDED' && route.name.trim().toLocaleLowerCase() === routeName.trim().toLocaleLowerCase()
  );
  const canSaveRoute = !isSavingRoute && !isLoadingRoute && !routeNameAlreadyExists
    && isRouteReadyToSave(routeName, routeSteps, selectedRouteId, routeBaseline);

  const handleSaveAndAddRoute = async () => {
    if (!canSaveRoute) return;
    const name = routeName.trim();
    if (!name) {
      showToast({ kind: 'error', title: 'Route name required', message: 'Enter a name before saving this production route.' });
      return;
    }
    if (routeSteps.length === 0 || routeSteps.some((step) => !step.stepName.trim() || !step.departmentId)) {
      showToast({ kind: 'error', title: 'Complete route steps', message: 'Add at least one step and provide an operation name and department for every step.' });
      return;
    }
    if (new Set(routeSteps.map((step) => step.departmentId)).size !== routeSteps.length) {
      showToast({ kind: 'error', title: 'Department selected more than once', message: 'Each department can appear only once in a production route.' });
      return;
    }

    setIsSavingRoute(true);
    try {
      const code = `ROUTE-${Date.now().toString(36).toUpperCase()}`;
      const createdRoute = await fetchApi<{ id: string }>('/master-data/routing/routes', {
        method: 'POST',
        body: JSON.stringify({ code, name, effectiveFrom: new Date().toISOString() }),
      });
      for (const [index, step] of routeSteps.entries()) {
        await fetchApi(`/master-data/routing/routes/${createdRoute.id}/steps`, {
          method: 'POST',
          body: JSON.stringify({
            routeId: createdRoute.id,
            sequenceNumber: index + 1,
            stepName: step.stepName.trim(),
            departmentId: step.departmentId,
            standardDurationMinutes: step.durationMinutes.trim() ? Number(step.durationMinutes) : null,
            isQcRequired: false,
          }),
        });
      }
      await fetchApi(`/master-data/routing/routes/${createdRoute.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus: 'APPROVED' }),
      });
      await queryClient.invalidateQueries({ queryKey: ['product-routes'] });
      setSelectedRouteId(createdRoute.id);
      setRouteBaseline({ id: createdRoute.id, snapshot: getRouteSnapshot(name, routeSteps) });
      showToast({ kind: 'success', title: 'Production route saved', message: `“${name}” is now available in the existing route selector.` });
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not save route', message: friendlyErrorMessage(error) || (error instanceof Error ? error.message : 'Please try again.') });
    } finally {
      setIsSavingRoute(false);
    }
  };

  React.useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        setActiveSectionTab('routing');
        document.getElementById('section-routing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setActiveSectionTab('routing');
        addRouteStep();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [productionDepartments]);

  const updateRouteStep = (id: string, patch: Partial<ProductionRouteStep>) => {
    if (patch.departmentId && routeSteps.some((step) => step.id !== id && step.departmentId === patch.departmentId)) {
      showToast({ kind: 'error', title: 'Department already used', message: 'Each department can appear only once in a production route.' });
      return;
    }
    setRouteSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  };
  const removeRouteStep = (id: string) => setRouteSteps((current) => current.filter((step) => step.id !== id));
  const moveRouteStep = (from: number, to: number) => setRouteSteps((current) => { const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; });
  const moveBomLine = (from: number, to: number) => setBomLines((current) => {
    if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) return current;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
  const handleAutoFeedBom = async (versionId: string) => {
    if (!versionId) return;
    setIsAutoFeedingBom(true);
    try {
      const detail = await bomApi.getVersion(versionId);
      const rawLines = (detail.lines || []) as any[];
      if (rawLines.length === 0) {
        showToast({
          kind: 'error',
          title: 'Empty BOM Version',
          message: `BOM "${detail.bomNumber}" does not contain any material formulation lines.`,
        });
        return;
      }

      const allMaterials = bomItems;
      const allProducts = bomProducts.data?.items || [];
      const allUoms = uoms.data?.items || [];

      const newLines: ProductBomLine[] = rawLines
        .slice()
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .map((line, idx) => {
          let matId = resolveBomLineItemId(line, allMaterials);
          let matName = line.material?.name || line.componentProduct?.name || line.material?.code || line.componentProduct?.sku || '';
          let matCode = line.material?.code || line.componentProduct?.sku || '';
          const lineNote = stripGeneratedVariantNotes(line.note);

          // 1. Try matching with known materials/products if matId is empty
          if (!matId && lineNote) {
            const normalize = (str: string) =>
              (str || '')
                .toLowerCase()
                .replace(/[–—]/g, '-')
                .replace(/×/g, 'x')
                .replace(/[*]/g, 'x')
                .replace(/["”]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const noteParts = lineNote.split(' — ');
            const fullTitle = (noteParts[0] || '').trim();
            const shortTitle = fullTitle.split(/[–—]/)[0].trim();
            const modelPrefix = (detail.bomNumber || '').match(/CS\d+/i)?.[0] || '';

            const candidates = [fullTitle, shortTitle].filter(Boolean);
            let matchedMat: (typeof allMaterials)[number] | undefined = undefined;
            let matchedProd: (typeof allProducts)[number] | undefined = undefined;

            for (const cand of candidates) {
              const nCand = normalize(cand);

              // 1a. Exact match
              matchedMat = allMaterials.find((m) => {
                const nm = normalize(m.name);
                const nc = normalize(m.code);
                return nm === nCand || nc === nCand;
              });
              if (matchedMat) break;

              matchedProd = allProducts.find((p) => {
                const np = normalize(p.name);
                const ns = normalize(p.sku);
                return np === nCand || ns === nCand;
              });
              if (matchedProd) break;

              // 1b. Model prefix match (e.g. CS12 - Top Rod)
              if (modelPrefix) {
                const withPrefix = normalize(`${modelPrefix} - ${cand}`);
                matchedMat = allMaterials.find((m) => {
                  const nm = normalize(m.name);
                  const nc = normalize(m.code);
                  return nm === withPrefix || nc === withPrefix || nm.startsWith(withPrefix);
                });
                if (matchedMat) break;

                matchedProd = allProducts.find((p) => {
                  const np = normalize(p.name);
                  const ns = normalize(p.sku);
                  return np === withPrefix || ns === withPrefix || np.startsWith(withPrefix);
                });
                if (matchedProd) break;
              }

              // 1c. Slash alternatives (e.g. "SS Hex Bolt 6x40 / 6x50 / ...")
              if (cand.includes('/')) {
                const alts = cand.split('/').map((s: string) => s.trim());
                for (const alt of alts) {
                  const nAlt = normalize(alt);
                  matchedMat = allMaterials.find((m) => normalize(m.name) === nAlt || normalize(m.code) === nAlt);
                  if (!matchedMat && modelPrefix) {
                    const withPref = normalize(`${modelPrefix} - ${alt}`);
                    matchedMat = allMaterials.find((m) => normalize(m.name) === withPref || normalize(m.code) === withPref);
                  }
                  if (matchedMat) break;
                }
                if (matchedMat) break;
              }
            }

            // 1d. Substring inclusion match (if >= 4 chars)
            if (!matchedMat && !matchedProd) {
              const nFull = normalize(fullTitle);
              matchedMat = allMaterials.find((m) => {
                const nm = normalize(m.name);
                const nc = normalize(m.code);
                return (nm.length >= 4 && (nFull.includes(nm) || nm.includes(nFull))) ||
                  (nc.length >= 4 && (nFull.includes(nc) || nc.includes(nFull)));
              });
            }

            // 1e. Token overlap scoring with model bonus
            if (!matchedMat && !matchedProd) {
              const nFull = normalize(fullTitle);
              const tokens = nFull.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !['with', 'without', 'and', 'or', 'various'].includes(t));
              let bestMat: (typeof allMaterials)[number] | undefined = undefined;
              let maxScore = 0;
              for (const m of allMaterials) {
                const mNorm = normalize((m.name || '') + ' ' + (m.code || ''));
                let score = 0;
                if (modelPrefix && mNorm.includes(modelPrefix.toLowerCase())) score += 4;
                for (const token of tokens) {
                  if (mNorm.includes(token)) score += 3;
                }
                if (score > maxScore && score >= 5) {
                  maxScore = score;
                  bestMat = m;
                }
              }
              if (bestMat) matchedMat = bestMat;
            }

            if (matchedMat) {
              matId = matchedMat.id;
              matName = matchedMat.name;
              matCode = matchedMat.code || '';
            } else if (matchedProd) {
              matId = matchedProd.id;
              matName = matchedProd.name;
              matCode = matchedProd.sku || '';
            }
          }

          // 2. If matId is still empty but we have a note/label, use note as the material label and generate a unique item ID
          if (!matId && lineNote) {
            matId = `bom-material-${Date.now()}-${idx}`;
            matName = lineNote.split(/[—–]/)[0].trim();
            matCode = 'CUSTOM';
          }

          // 3. Resolve matched material/product from collections if we had ID but no name
          if (matId && !matName) {
            const foundMat = allMaterials.find((m) => m.id === matId);
            const foundProd = allProducts.find((p) => p.id === matId);
            if (foundMat) {
              matName = foundMat.name;
              matCode = foundMat.code || '';
            } else if (foundProd) {
              matName = foundProd.name;
              matCode = foundProd.sku || '';
            }
          }

          // 4. Resolve UOM
          const foundMat = allMaterials.find((m) => m.id === matId);
          const foundProd = allProducts.find((p) => p.id === matId);
          let resolvedUomId =
            line.uomId ||
            line.uom?.id ||
            foundMat?.uomId ||
            (foundMat as any)?.uom?.id ||
            foundProd?.uomId ||
            (foundProd as any)?.uom?.id ||
            '';

          if (!resolvedUomId && allUoms.length > 0) {
            const uomCodeOrName = line.uom?.name || line.uom?.code || line.uom?.symbol;
            if (uomCodeOrName) {
              const matchedUom = allUoms.find((u) => u.name?.toLowerCase() === uomCodeOrName.toLowerCase() || u.code?.toLowerCase() === uomCodeOrName.toLowerCase());
              if (matchedUom) resolvedUomId = matchedUom.id;
            }
            if (!resolvedUomId) {
              resolvedUomId = allUoms[0]?.id || '';
              resolvedUomId = allUoms[0]?.id || '';
            }
          }

          const rawQty = line.quantity !== undefined && line.quantity !== null ? Number(line.quantity) : 1;
          const cleanQty = isNaN(rawQty) ? '1' : String(rawQty);
          const lineSavedCost = (line as any).unitCost != null && !isNaN(Number((line as any).unitCost))
            ? Number((line as any).unitCost)
            : ((line as any).avgRate != null && !isNaN(Number((line as any).avgRate))
              ? Number((line as any).avgRate)
              : null);

          const matUnitCost = lineSavedCost !== null && lineSavedCost > 0
            ? lineSavedCost
            : (foundMat ? getMaterialCost(foundMat) : (foundProd ? getMaterialCost(foundProd) : (line.material ? getMaterialCost(line.material) : (line.componentProduct ? getMaterialCost(line.componentProduct) : 0))));
          const numQty = isNaN(rawQty) ? 1 : rawQty;
          const lineCostVal = Math.round(matUnitCost * numQty * 100) / 100;

          return {
            id: `bom-autofed-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            materialId: matId,
            materialName: matName || 'Material Component',
            materialCode: matCode,
            quantity: cleanQty,
            uomId: resolvedUomId,
            unitCost: matUnitCost > 0 ? String(matUnitCost) : (lineSavedCost !== null ? String(lineSavedCost) : ''),
            lineCost: lineCostVal > 0 ? String(lineCostVal) : '',
            note: lineNote,
            sourceBomVersionId: versionId,
          };
        });

      setBomLines((current) => [...current, ...newLines]);
      setSelectedBomVersionId(versionId);
      setSelectedBomVersionIds((prev) => [...new Set([...prev, versionId])]);
      setAppendedBomNames((prev) => [...new Set([...prev, `${detail.bomNumber} (v${detail.version})`])]);
      setLoadedBomVersionId(versionId);
      const snapshot = getNormalizedBomSnapshot(newLines);
      setLoadedBomSnapshot(snapshot);

      // Appending a recipe while editing a saved BOM changes that selected BOM.
      // A blank composer can still use the source name as a starting point.
      if (!editingSavedBomId) {
        const autoFedName = String(detail.bomNumber || '').trim();
        setBomName(autoFedName);
        setOriginalLoadedBomName(autoFedName);
      }
      showToast({
        kind: 'success',
        title: 'BOM Formulation Appended',
        message: `Appended ${newLines.length} material lines from "${detail.bomNumber} (v${detail.version})". Total recipe items: ${bomLines.length + newLines.length}.`,
      });
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Failed to Auto-Feed BOM',
        message: err?.message || 'Could not load BOM version details.',
      });
    } finally {
      setIsAutoFeedingBom(false);
    }
  };

  const handleToggleBomVersion = async (versionId: string) => {
    if (selectedBomVersionIds.includes(versionId)) {
      setSelectedBomVersionIds((prev) => prev.filter((id) => id !== versionId));
      setBomLines((prev) => prev.filter((line) => line.sourceBomVersionId !== versionId));
      const bomObj = bomOptions.find((b) => b.id === versionId);
      if (bomObj) {
        setAppendedBomNames((prev) => prev.filter((name) => !name.startsWith(bomObj.name.split(' — ')[0])));
      }
    } else {
      await handleAutoFeedBom(versionId);
    }
  };

  const handleClearBomSelection = () => {
    setBomLines((prev) => prev.filter((line) => !line.sourceBomVersionId));
    setSelectedBomVersionIds([]);
    setSelectedBomVersionId('');
    setAppendedBomNames([]);
    setLoadedBomVersionId(null);
    setLoadedBomSnapshot(null);
  };

  /** Deduplicates BOMs by ID and name (case-insensitive), sorted in natural sequential order */
  const sortAndDeduplicateBoms = <T extends { id: string; name: string }>(boms: T[]): T[] => {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const result: T[] = [];
    for (const b of boms) {
      const idKey = b.id;
      const nameKey = (b.name || '').trim().toLowerCase();
      if (idKey && seenIds.has(idKey)) continue;
      if (nameKey && seenNames.has(nameKey)) continue;
      if (idKey) seenIds.add(idKey);
      if (nameKey) seenNames.add(nameKey);
      result.push(b);
    }
    return result.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  };

  /** Checks if a candidate BOM name collides with another existing BOM in system, item, or current workspace */
  const isBomNameAlreadyExists = (candidateName: string, excludeId?: string | null): boolean => {
    const trimmed = candidateName.trim().toLowerCase();
    if (!trimmed) return false;

    // Check saved BOMs in memory for this item/workspace
    const existsInSaved = savedBoms.some(
      (b) => (!excludeId || b.id !== excludeId) && b.name.trim().toLowerCase() === trimmed
    );
    if (existsInSaved) return true;

    // Check existing BOMs on this item
    const existsInItem = (itemBomsQuery.data?.items || []).some(
      (b: any) => (!excludeId || b.id !== excludeId) && (b.bomNumber || '').trim().toLowerCase() === trimmed
    );
    if (existsInItem) return true;

    // Check system-wide BOMs
    const existsInSystem = (allSystemBoms.data?.items || []).some(
      (b: any) => (!excludeId || b.id !== excludeId) && (b.bomNumber || '').trim().toLowerCase() === trimmed
    );
    if (existsInSystem) return true;

    return false;
  };

  /** Keep generated names for new recipes readable and unique. */
  const deriveSafeBomName = (userBomName: string, forceIncrement = false, excludeId?: string | null): string => {
    const trimmed = userBomName.trim();
    const otherSavedNames = savedBoms
      .filter((b) => !excludeId || b.id !== excludeId)
      .map((b) => b.name.trim());

    const allExistingNames = new Set([
      ...(allSystemBoms.data?.items || []).map((b: any) => String(b.bomNumber || '').trim()),
      ...(itemBomsQuery.data?.items || []).map((b: any) => String(b.bomNumber || '').trim()),
      ...otherSavedNames,
    ].filter(Boolean).map((name) => name.toLowerCase()));

    const baseName = trimmed || `${form.name.trim() || 'Item'} BOM`;
    if (!forceIncrement) {
      return baseName;
    }

    return getNextIncrementedBomName(baseName, allExistingNames);
  };

  // A copied recipe can suggest a new name. Editing a saved BOM retains its name.
  React.useEffect(() => {
    if (editingSavedBomId || !originalLoadedBomName || !loadedBomSnapshot || bomLines.length === 0) return;
    const currentSnapshot = getNormalizedBomSnapshot(bomLines);
    if (currentSnapshot !== loadedBomSnapshot) {
      if (bomName.trim().toLowerCase() === originalLoadedBomName.trim().toLowerCase()) {
        const nextName = deriveSafeBomName(originalLoadedBomName, true, editingSavedBomId);
        setBomName(nextName);
      }
    } else {
      const nextCandidate = deriveSafeBomName(originalLoadedBomName, true, editingSavedBomId);
      if (bomName.trim().toLowerCase() === nextCandidate.trim().toLowerCase()) {
        setBomName(originalLoadedBomName);
      }
    }
  }, [bomLines, loadedBomSnapshot, originalLoadedBomName, editingSavedBomId]);

  const getComposerBomName = (): string => {
    return deriveSafeBomName(bomName);
  };

  const shouldDeduplicateComposerBom = (): boolean => {
    const sourceIds = [...new Set([...selectedBomVersionIds, selectedBomVersionId].filter(Boolean))];
    if (sourceIds.length === 0) return true;
    if (sourceIds.length !== 1 || sourceIds[0] !== loadedBomVersionId || !loadedBomSnapshot) return false;
    const importedLines = bomLines.filter((line) => line.sourceBomVersionId === loadedBomVersionId);
    if (bomLines.some((line) => !line.sourceBomVersionId) || getNormalizedBomSnapshot(importedLines) !== loadedBomSnapshot) return false;
    const source = (allSystemBoms.data?.items || []).find((bom: any) => bom.id === sourceIds[0]);
    if (!source || !editId) return false;
    return itemClassification === 'MATERIAL' ? source.materialId === editId : source.productId === editId;
  };

  const handleSaveAndAddAnotherBom = async () => {
    if (bomSaveInProgressRef.current) return;
    const mergedLines = mergeDuplicateBomLines(bomLines);
    if (mergedLines !== bomLines) {
      setBomLines(mergedLines);
    }
    const validLines = mergedLines.filter((l) => l.materialId && l.uomId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      showToast({
        kind: 'error',
        title: 'BOM Lines Required',
        message: 'Please add at least one valid item line with quantity and UOM before saving this BOM.',
      });
      return;
    }

    const editingPersistedBom = savedBoms.find((b) => b.id === editingSavedBomId && b.isExisting);
    const userTypedName = bomName.trim();
    const isCurrentName = Boolean(editingPersistedBom &&
      userTypedName.toLowerCase() === (editingPersistedBom.originalName || editingPersistedBom.name).trim().toLowerCase());
    if (userTypedName && !isCurrentName && isBomNameAlreadyExists(userTypedName, editingSavedBomId)) {
      showToast({
        kind: 'error',
        title: 'BOM Name Already Exists',
        message: `A Bill of Materials named "${userTypedName}" already exists. Please choose a unique name.`,
      });
      return;
    }

    bomSaveInProgressRef.current = true;

    const currentSnapshotStr = getNormalizedBomSnapshot(validLines);

    const selectedSourceIds = [...new Set([...selectedBomVersionIds, selectedBomVersionId].filter(Boolean))];
    const hasExternalSelectedBom = selectedSourceIds.some((id) => {
      const source = (allSystemBoms.data?.items || []).find((bom) => bom.id === id);
      if (!source) return false;
      if (!isEditMode || !editId) return true;
      return itemClassification === 'MATERIAL'
        ? source.materialId !== editId
        : source.productId !== editId;
    });

    const importedLines = validLines.filter((line) => line.sourceBomVersionId === loadedBomVersionId);
    const hasAddedLines = validLines.some((line) => !line.sourceBomVersionId);
    const isSingleSourceUnchanged = Boolean(
      selectedSourceIds.length === 1 &&
      loadedBomVersionId === selectedSourceIds[0] &&
      !hasAddedLines &&
      loadedBomSnapshot &&
      getNormalizedBomSnapshot(importedLines) === loadedBomSnapshot
    );
    const sourceIsAlreadyAttached = Boolean(
      isSingleSourceUnchanged && isEditMode && editId &&
      (!editingSavedBomId || loadedBomVersionId === editingSavedBomId) &&
      (itemClassification === 'MATERIAL'
        ? [...(itemBomsQuery.data?.items || []), ...(allSystemBoms.data?.items || [])].some((bom: any) => bom.id === loadedBomVersionId && bom.materialId === editId)
        : [...(itemBomsQuery.data?.items || []), ...(allSystemBoms.data?.items || [])].some((bom: any) => bom.id === loadedBomVersionId && bom.productId === editId))
    );

    const editingNameChanged = Boolean(editingPersistedBom && bomName.trim() &&
      bomName.trim() !== (editingPersistedBom.originalName || editingPersistedBom.name).trim());
    const matchedSavedBom = selectedSourceIds.length > 0 || editingSavedBomId ? undefined : savedBoms.find((b) => {
      return getNormalizedBomSnapshot(b.lines) === currentSnapshotStr;
    });

    const matchedDbBom = isEditMode && !editingSavedBomId && selectedSourceIds.length === 0 ? (itemBomsQuery.data?.items || []).find((b: any) => {
      const bLines: ProductBomLine[] = (b.lines || []).map((l: any, idx: number) => ({
        id: l.id || `line-${idx}`,
        materialId: l.materialId || l.componentProductId || '',
        quantity: String(l.quantity),
        uomId: l.uomId || '',
        note: l.note || '',
        unitCost: l.unitCost != null ? String(l.unitCost) : '',
      }));
      return getNormalizedBomSnapshot(bLines) === currentSnapshotStr;
    }) : undefined;

    if ((sourceIsAlreadyAttached && !editingNameChanged) || (!selectedSourceIds.length && (matchedSavedBom || matchedDbBom))) {
      const existingName = matchedSavedBom?.name || matchedDbBom?.bomNumber || bomName.trim() || 'Selected BOM';
      const attachedBom = sourceIsAlreadyAttached
        ? [...(itemBomsQuery.data?.items || []), ...(allSystemBoms.data?.items || [])].find((bom: any) => bom.id === loadedBomVersionId)
        : matchedDbBom;
      if (attachedBom) {
        setSavedBoms((prev) => prev.some((bom) => bom.id === attachedBom.id)
          ? prev
          : [...prev, {
            id: attachedBom.id,
            name: attachedBom.bomNumber || `BOM v${attachedBom.version}`,
            status: attachedBom.status,
            version: attachedBom.version,
            lines: [...validLines],
            isExisting: true,
            originalSnapshot: currentSnapshotStr,
          }]);
      }
      showToast({
        kind: 'info',
        title: 'BOM Already Saved',
        message: `BOM "${existingName}" is already saved without changes. Ready to configure another BOM.`,
      });
      setEditingSavedBomId(null);
      setBomName('');
      setBomLines([]);
      setAppendedBomNames([]);
      setSelectedBomVersionIds([]);
      setSelectedBomVersionId('');
      setLoadedBomVersionId(null);
      setLoadedBomSnapshot(null);
      bomSaveInProgressRef.current = false;
      return;
    }

    // A single untouched source already attached to this item needs no write.
    // External unchanged sources retain their source name when copied. Any added
    // line or combination of sources becomes a new, distinctly named BOM.
    if (isEditMode && editId) {
      try {
        const safeName = deriveSafeBomName(bomName);
        const matchingSaved = savedBoms.find((b) => b.id === editingSavedBomId);
        const savedVersion = await persistInventoryBom(
          editId,
          itemClassification === 'MATERIAL' ? 'MATERIAL' : 'PRODUCT',
          validLines,
          safeName,
          editingPersistedBom?.id,
          selectedSourceIds.length > 0 || hasExternalSelectedBom,
          matchingSaved?.productVariantId
        );
        const updatedExistingBom = Boolean(editingPersistedBom && savedVersion?.id === editingPersistedBom.id);
        showToast(updatedExistingBom
          ? { kind: 'success', title: 'BOM Updated', message: `Your BOM "${savedVersion?.bomNumber || safeName}" was updated successfully.` }
          : { kind: 'success', title: 'BOM Saved & Added', message: `BOM "${safeName || 'Auto-generated'}" was successfully saved to this item. You can now define another BOM.` });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: bomKeys.all }),
          queryClient.invalidateQueries({ queryKey: ['materials'] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
        ]);
        const newName = safeName || `BOM #${savedBoms.length + 1}`;
        setSavedBoms((prev) => {
          let updated: typeof savedBoms;
          if (editingSavedBomId) {
            updated = prev.map((item) =>
              item.id === editingSavedBomId
                ? {
                  ...item,
                  id: savedVersion?.id || item.id,
                  name: newName,
                  originalName: newName,
                  lines: [...validLines],
                  status: savedVersion?.status || item.status,
                  version: savedVersion?.version || item.version,
                  isExisting: Boolean(savedVersion?.id),
                  originalSnapshot: savedVersion?.id ? currentSnapshotStr : item.originalSnapshot,
                }
                : item
            );
          } else {
            updated = [
              ...prev.filter((item) => (savedVersion?.id ? item.id !== savedVersion.id : true) && item.name.trim().toLowerCase() !== newName.trim().toLowerCase()),
              {
                id: savedVersion?.id || `bom-${Date.now()}`,
                name: newName,
                originalName: newName,
                status: savedVersion?.status,
                version: savedVersion?.version,
                lines: [...validLines],
                isExisting: Boolean(savedVersion?.id),
                originalSnapshot: savedVersion?.id ? currentSnapshotStr : undefined,
              },
            ];
          }
          return sortAndDeduplicateBoms(updated);
        });
        setEditingSavedBomId(null);
        setBomName('');
        setBomLines([]);
        setAppendedBomNames([]);
        setSelectedBomVersionIds([]);
        setSelectedBomVersionId('');
        setLoadedBomVersionId(null);
        setLoadedBomSnapshot(null);
      } catch (err: unknown) {
        showToast({
          kind: 'error',
          title: 'Failed to Save BOM',
          message: err instanceof Error ? err.message : 'Could not save BOM version.',
        });
      }
    } else {
      const safeName = deriveSafeBomName(bomName);
      if (editingSavedBomId) {
        setSavedBoms((prev) =>
          prev.map((item) =>
            item.id === editingSavedBomId
              ? { ...item, name: safeName, lines: [...validLines] }
              : item
          )
        );
        showToast({
          kind: 'success',
          title: 'BOM Formulation Updated',
          message: `BOM "${safeName || 'Formula'}" updated successfully (${validLines.length} items). You can now configure another BOM.`,
        });
        setEditingSavedBomId(null);
        setBomName('');
        setOriginalLoadedBomName('');
        setBomLines([]);
        setAppendedBomNames([]);
        setSelectedBomVersionIds([]);
        setSelectedBomVersionId('');
        setLoadedBomVersionId(null);
        setLoadedBomSnapshot(null);
        bomSaveInProgressRef.current = false;
        return;
      }

      setSavedBoms((prev) => {
        if (prev.some((item) => item.name.trim().toLowerCase() === safeName.trim().toLowerCase() &&
          getNormalizedBomSnapshot(item.lines) === currentSnapshotStr)) return prev;
        return [...prev, {
          id: `bom-${Date.now()}`,
          name: safeName,
          lines: [...validLines],
        }];
      });
      showToast({
        kind: 'success',
        title: 'BOM Formulation Saved',
        message: `BOM "${safeName || `Formula #${savedBoms.length + 1}`}" saved (${validLines.length} items). You can now configure another BOM.`,
      });
      setBomName('');
      setOriginalLoadedBomName('');
      setBomLines([]);
      setAppendedBomNames([]);
      setSelectedBomVersionIds([]);
      setSelectedBomVersionId('');
      setLoadedBomVersionId(null);
      setLoadedBomSnapshot(null);
    }
    bomSaveInProgressRef.current = false;
  };

  const handleStartEditSavedBom = (bomToEdit: { id: string; name: string; lines: ProductBomLine[] }) => {
    // If currently editing another BOM with lines, sync those lines first
    if (editingSavedBomId && editingSavedBomId !== bomToEdit.id && bomLines.length > 0) {
      setSavedBoms((prev) =>
        prev.map((item) =>
          item.id === editingSavedBomId
            ? { ...item, name: bomName.trim(), lines: [...bomLines] }
            : item
        )
      );
    }
    setEditingSavedBomId(bomToEdit.id);
    setBomName(bomToEdit.name);
    setOriginalLoadedBomName(bomToEdit.name);
    const savedEntry = savedBoms.find((bom) => bom.id === bomToEdit.id);
    if (savedEntry?.isExisting) {
      const linesWithSource = bomToEdit.lines.map((line) => ({ ...line, sourceBomVersionId: bomToEdit.id }));
      setBomLines(linesWithSource);
      setSelectedBomVersionId(bomToEdit.id);
      setSelectedBomVersionIds([bomToEdit.id]);
      setLoadedBomVersionId(bomToEdit.id);
      setLoadedBomSnapshot(savedEntry.originalSnapshot || getNormalizedBomSnapshot(bomToEdit.lines));
    } else {
      setBomLines([...bomToEdit.lines]);
      setSelectedBomVersionId('');
      setSelectedBomVersionIds([]);
      setLoadedBomVersionId(null);
      setLoadedBomSnapshot(savedEntry?.originalSnapshot || getNormalizedBomSnapshot(bomToEdit.lines));
    }
    clearFieldError('bom-general');
    showToast({
      kind: 'info',
      title: 'Editing Saved BOM',
      message: `Now editing "${bomToEdit.name || 'BOM'}". It remains safely in your saved list.`,
    });
  };

  const handleUpdateCurrentBom = async () => {
    if (!editingSavedBomId) return;
    const normalizedLines = bomLines.map((line) => ({
      ...line,
      quantity: cleanQuantityString(line.quantity),
    }));
    const validLines = mergeDuplicateBomLines(normalizedLines).filter((line) => line.materialId && line.uomId && Number(line.quantity) > 0);
    if (!validLines.length) {
      showToast({ kind: 'error', title: 'BOM Lines Required', message: 'Add at least one valid item line with quantity and UOM before saving.' });
      return;
    }

    const matchingSaved = savedBoms.find((b) => b.id === editingSavedBomId);
    let finalName = bomName.trim();
    // Validate if user explicitly renamed to an already existing BOM name
    const isCurrentName = Boolean(matchingSaved?.isExisting &&
      finalName.toLowerCase() === (matchingSaved.originalName || matchingSaved.name).trim().toLowerCase());
    if (finalName && !isCurrentName && isBomNameAlreadyExists(finalName, editingSavedBomId)) {
      showToast({
        kind: 'error',
        title: 'BOM Name Already Exists',
        message: `A Bill of Materials named "${finalName}" already exists. Please choose a unique name.`,
      });
      return;
    }

    finalName = finalName || matchingSaved?.originalName || matchingSaved?.name || deriveSafeBomName('');

    // In edit mode this button must persist the selected recipe immediately;
    // only updating savedBoms made the success toast misleading and left the
    // item details page showing the old BOM until the entire item form saved.
    if (isEditMode && editId) {
      try {
        const savedVersion = await persistInventoryBom(
          editId,
          editEntityType === 'MATERIAL' ? 'MATERIAL' : 'PRODUCT',
          validLines,
          finalName,
          matchingSaved?.isExisting ? editingSavedBomId : undefined,
          true,
          matchingSaved?.productVariantId
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: bomKeys.all }),
          queryClient.invalidateQueries({ queryKey: ['materials', editId] }),
          queryClient.invalidateQueries({ queryKey: ['products', editId] }),
          queryClient.invalidateQueries({ queryKey: ['materials'] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
        ]);
        const updatedBomEntry = {
          id: savedVersion?.id || editingSavedBomId,
          name: finalName,
          originalName: finalName,
          lines: [...validLines],
          status: savedVersion?.status || matchingSaved?.status,
          version: savedVersion?.version || matchingSaved?.version,
          originalSnapshot: getNormalizedBomSnapshot(validLines),
          isExisting: true,
          productVariantId: matchingSaved?.productVariantId || null,
        };

        setSavedBoms((prev) => sortAndDeduplicateBoms(
          prev.map((item) => (item.id === editingSavedBomId ? updatedBomEntry : item))
        ));
        setEditingSavedBomId(savedVersion?.id || editingSavedBomId);
        setBomName(finalName);
        setOriginalLoadedBomName(finalName);
        setLoadedBomSnapshot(getNormalizedBomSnapshot(validLines));
      } catch (error) {
        showToast({ kind: 'error', title: 'Could Not Save BOM', message: friendlyErrorMessage(error) || (error instanceof Error ? error.message : String(error)) });
        return;
      }
    } else {
      // New items do not have a server ID yet; retain the recipe in the form
      // and let the item submission persist it together with the new item.
      setSavedBoms((prev) => prev.map((item) => item.id === editingSavedBomId
        ? {
            ...item,
            name: finalName,
            lines: [...validLines],
            originalSnapshot: getNormalizedBomSnapshot(validLines),
          }
        : item));
      setBomName(finalName);
      setOriginalLoadedBomName(finalName);
      setLoadedBomSnapshot(getNormalizedBomSnapshot(validLines));
    }

    showToast(matchingSaved?.isExisting
      ? { kind: 'success', title: 'BOM Updated', message: `Your BOM "${finalName}" was updated successfully.` }
      : { kind: 'success', title: 'BOM Saved', message: `BOM "${finalName}" was saved successfully.` });
  };

  const handleCancelEditSavedBom = () => {
    if (editingSavedBomId && bomLines.length > 0) {
      setSavedBoms((prev) =>
        prev.map((item) =>
          item.id === editingSavedBomId
            ? { ...item, name: bomName.trim(), lines: [...bomLines] }
            : item
        )
      );
    }
    setEditingSavedBomId(null);
    setBomName('');
    setOriginalLoadedBomName('');
    setBomLines([]);
    setSelectedBomVersionIds([]);
    setSelectedBomVersionId('');
    setLoadedBomSnapshot(null);
    setLoadedBomVersionId(null);
  };

  const handleDeleteSavedBom = async (id: string) => {
    const savedBom = savedBoms.find((item) => item.id === id);
    if (savedBom?.isExisting) {
      try {
        await bomApi.detachFromItem(id);
        await queryClient.invalidateQueries({ queryKey: bomKeys.all });
      } catch (error) {
        const message = friendlyErrorMessage(error) || (error instanceof Error ? error.message : 'Unable to remove this BOM from the item.');
        setFieldErrors((prev) => ({ ...prev, 'bom-general': message }));
        showToast({ kind: 'error', title: 'BOM Could Not Be Removed From Item', message });
        return;
      }
    }
    setSavedBoms((prev) => prev.filter((item) => item.id !== id));
    if (editingSavedBomId === id) {
      setEditingSavedBomId(null);
      setBomName('');
      setOriginalLoadedBomName('');
      setBomLines([]);
      setSelectedBomVersionIds([]);
      setSelectedBomVersionId('');
      setLoadedBomSnapshot(null);
      setLoadedBomVersionId(null);
    }
    clearFieldError('bom-general');
    showToast({
      kind: 'success',
      title: 'BOM Removed From Item',
      message: 'The BOM record and its history are preserved; it is no longer attached to this item.',
    });
  };

  const importPricingMaster = (masterId: string) => {
    setPricingMasterId(masterId);
    if (!masterId) {
      setTierPricing([]);
      setPricingFields([]);
      return;
    }
    const mastersList = Array.isArray(pricingMasters.data) ? pricingMasters.data : pricingMasters.data?.items || [];
    const master = mastersList.find((item: any) => item.id === masterId);
    if (master) {
      setPricingFields([
        ...(master.fields || []).map((field: any) => ({ name: field.name, value: field.defaultValue || '' })),
        ...(master.columns || []).map((column: any) => ({ name: column.name, value: column.defaultValue || '' })),
      ]);
      if (master.tiers && master.tiers.length > 0) {
        setTierPricing(
          master.tiers.map((t: any) => ({
            tierId: t.id,
            tierName: t.name,
            tierCode: t.code || t.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
            masterPrice: Number(t.price) || 0,
            defaultDiscountPercentage: t.discountPercentage,
            discountPercentage: t.discountPercentage,
            isCustomPrice: false,
            customPrice: '',
            calculatedPrice: 0,
            enabled: t.isActive !== false,
          }))
        );
        showToast({
          kind: 'success',
          title: 'Pricing Master Applied',
          message: `Imported ${master.tiers.length} customer tiers and pricing rules from "${master.name}".`,
        });
      }
    }
  };

  const toggleSection = (section: string) => setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));

  const addFilesToPreviews = (files: File[]) => {
    const validImageFiles = files.filter((f) => f.type.startsWith('image/')).slice(0, 12);
    if (validImageFiles.length === 0) return;
    setImageFiles((prev) => [...prev, ...validImageFiles].slice(0, 12));
    const newPreviews = validImageFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setImagePreviews((prev) => [...prev, ...newPreviews].slice(0, 12));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFilesToPreviews(files);
  };

  const removeImage = (file: File, url: string) => {
    URL.revokeObjectURL(url);
    setImageFiles((prev) => prev.filter((f) => f !== file));
    setImagePreviews((prev) => prev.filter((p) => p.file !== file));
  };

  const setAsPrimary = (index: number) => {
    if (index <= 0 || index >= imagePreviews.length) return;
    setImagePreviews((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
    setImageFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  };

  const appendDescriptionSnippet = (snippet: string) => {
    setForm((prev) => ({
      ...prev,
      description: prev.description
        ? `${prev.description.trim()}\n${snippet}`
        : snippet,
    }));
  };

  const persistInventoryRoute = async (itemId: string, itemName: string, itemType: 'PRODUCT' | 'MATERIAL') => {
    const selectedRoute = (productRoutes.data?.items || []).find((route) => route.id === selectedRouteId);
    if (!selectedRouteId && routeSteps.length === 0) return null;
    const routeIsAttachedToItem = selectedRoute && (itemType === 'MATERIAL'
      ? (selectedRoute as any).materialId === itemId
      : (selectedRoute as any).productId === itemId);
    const savedSteps = selectedRoute?.steps || [];
    const unchanged = Boolean(routeIsAttachedToItem)
      && (routeName.trim() === '' || routeName.trim() === selectedRoute?.name)
      && savedSteps.length === routeSteps.length
      && savedSteps.every((step: any, index: number) =>
        step.stepName === routeSteps[index]?.stepName
        && step.departmentId === routeSteps[index]?.departmentId
        && String(step.standardDurationMinutes ?? '') === String(routeSteps[index]?.durationMinutes ?? '')
      );
    if (unchanged && selectedRoute) return selectedRoute.id;

    const attachedRouteCanBeEdited = Boolean(routeIsAttachedToItem)
      && ['DRAFT', 'PENDING_VALIDATION'].includes(String(selectedRoute?.status));
    const shouldSupersedeAttachedRoute = Boolean(routeIsAttachedToItem)
      && ['APPROVED', 'ACTIVE'].includes(String(selectedRoute?.status));
    let routeId: string;

    if (attachedRouteCanBeEdited && selectedRoute) {
      const updatedRoute = await fetchApi<{ id: string }>(`/master-data/routing/routes/${selectedRoute.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: routeName.trim() || selectedRoute.name }),
      });
      routeId = updatedRoute.id;
      for (const step of savedSteps) {
        if (step.id) {
          await fetchApi(`/master-data/routing/routes/${routeId}/steps/${step.id}`, { method: 'DELETE' });
        }
      }
    } else if (shouldSupersedeAttachedRoute && selectedRoute) {
      const updatedRoute = await fetchApi<{ id: string }>(`/master-data/routing/routes/${selectedRoute.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: routeName.trim() || selectedRoute.name }),
      });
      routeId = updatedRoute.id;
    } else {
      const requestedName = routeName.trim() || selectedRoute?.name || `${itemName} Standard Route`;
      const newRouteName = selectedRoute && !routeIsAttachedToItem && requestedName === selectedRoute.name
        ? `${requestedName} · ${itemName}`
        : requestedName;
      const createdRoute = await fetchApi<{ id: string }>('/master-data/routing/routes', {
        method: 'POST',
        body: JSON.stringify({
          code: `ROUTE-${itemId.slice(-8)}-${Date.now().toString(36).toUpperCase()}`.slice(0, 50),
          name: newRouteName,
          ...(itemType === 'MATERIAL' ? { materialId: itemId } : { productId: itemId }),
          effectiveFrom: new Date().toISOString(),
        }),
      });
      routeId = createdRoute.id;
    }

    for (const [index, step] of routeSteps.entries()) {
      await fetchApi(`/master-data/routing/routes/${routeId}/steps`, {
        method: 'POST',
        body: JSON.stringify({
          routeId,
          sequenceNumber: index + 1,
          stepName: step.stepName.trim() || `Step ${index + 1}`,
          departmentId: step.departmentId,
          standardDurationMinutes: Number(step.durationMinutes) || null,
          isQcRequired: false,
        }),
      });
    }
    await fetchApi(`/master-data/routing/routes/${routeId}/status`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus: 'APPROVED' }),
    });
    await queryClient.invalidateQueries({ queryKey: ['product-routes'] });
    return routeId;
  };

  const persistInventoryBom = async (
    itemId: string,
    itemType: 'PRODUCT' | 'MATERIAL',
    lines: ProductBomLine[],
    customBomName?: string,
    updateVersionId?: string,
    allowDuplicateRecipe = false,
    productVariantId?: string | null
  ) => {
    const bomDraftLines = mergeDuplicateBomLines(lines)
      .filter((line) => line.materialId && line.uomId && Number(cleanQuantityString(line.quantity)) > 0)
      .map((line, index) => {
        const selectedProduct = bomProducts.data?.items.find((product) => product.id === line.materialId);
        const selectedItem = bomItems.find((item) => item.id === line.materialId);
        const isProduct = Boolean(selectedProduct);
        const materialVariantLabel = selectedItem?.parentMaterialId
          ? getVariantLabel(selectedItem.parentMaterialName || selectedItem.parent?.name || '', selectedItem.name, selectedItem.measurementValue || selectedItem.specs?.measurementValue || '')
          : '';
        const productVariantLabel = selectedProduct?.parentProductId
          ? getVariantLabel(selectedProduct.parentProductName || '', selectedProduct.name, selectedProduct.measurementValue || (selectedProduct.metadata as any)?.measurementValue || '')
          : '';
        const selectedVariant = materialVariantLabel
          ? `Selected variant: ${materialVariantLabel}${isPersistedVariantId(selectedItem?.id) ? ` (${selectedItem.id})` : ''}`
          : productVariantLabel
            ? `Selected variant: ${productVariantLabel}${isPersistedVariantId(selectedProduct?.id) ? ` (${selectedProduct?.id})` : ''}`
            : '';
        const cleanNote = stripGeneratedVariantNotes(line.note);
        const lineNote = [cleanNote, selectedVariant].filter(Boolean).join(' · ').slice(0, 500);
        const materialId = selectedItem?.parentMaterialId && !isPersistedVariantId(selectedItem.id)
          ? selectedItem.parentMaterialId
          : line.materialId;
        const parsedQty = Number(cleanQuantityString(line.quantity));
        const cleanQty = Math.round(parsedQty * 1000000) / 1000000;
        return {
          lineType: 'COMPONENT' as const,
          materialId: isProduct ? undefined : materialId,
          // BOM lines reference Product records. Expanded variants are UI projections
          // backed by a ProductVariant ID, so persist their parent Product FK here.
          componentProductId: isProduct ? selectedProduct?.parentProductId || selectedProduct?.id : undefined,
          uomId: line.uomId,
          quantityMode: 'SCALED' as const,
          quantity: cleanQty,
          unitCost: line.unitCost !== undefined && line.unitCost !== '' && !isNaN(Number(line.unitCost)) ? Number(line.unitCost) : undefined,
          roundingRule: 'NONE' as const,
          sequence: index + 1,
          note: lineNote || undefined,
        };
      });
    if (!bomDraftLines.length) return;

    // Prevent duplicate BOM creation if identical recipe already exists for this item,
    // but only when creating a new BOM recipe (not when updating an existing version or duplicate recipe is allowed).
    const existingItemBoms = (itemBomsQuery.data?.items || []).filter((b: any) =>
      itemType === 'MATERIAL' ? b.materialId === itemId : b.productId === itemId
    );
    const draftSnapshot = getNormalizedBomSnapshot(
      bomDraftLines.map((l) => ({
        id: '',
        materialId: l.materialId || l.componentProductId || '',
        quantity: String(l.quantity),
        uomId: l.uomId,
        note: l.note || '',
        unitCost: l.unitCost !== undefined ? String(l.unitCost) : '',
      }))
    );

    if (!updateVersionId && !allowDuplicateRecipe) {
      const alreadyExists = existingItemBoms.find((b: any) => {
        const bLines: ProductBomLine[] = (b.lines || []).map((l: any, idx: number) => ({
          id: l.id || `line-${idx}`,
          materialId: l.materialId || l.componentProductId || '',
          quantity: String(l.quantity),
          uomId: l.uomId || '',
          note: l.note || '',
          unitCost: l.unitCost != null ? String(l.unitCost) : '',
        }));
        return getNormalizedBomSnapshot(bLines) === draftSnapshot;
      });
      if (alreadyExists) return;

      if (activeBomDetail.data) {
        const activeParentId = itemType === 'MATERIAL' ? activeBomDetail.data.materialId : activeBomDetail.data.productId;
        if (activeParentId === itemId) {
          const activeLines: ProductBomLine[] = (activeBomDetail.data.lines || []).map((l: any, idx: number) => ({
            id: l.id || `active-${idx}`,
            materialId: l.materialId || l.componentProductId || '',
            quantity: String(l.quantity),
            uomId: l.uomId || '',
            note: l.note || '',
            unitCost: l.unitCost != null ? String(l.unitCost) : '',
          }));
          if (getNormalizedBomSnapshot(activeLines) === draftSnapshot) return;
        }
      }
    }

    const finalBomNumber = customBomName?.trim() || undefined;
    const resolvedUpdateVersionId = updateVersionId;

    // Reuse a version only when the caller explicitly selected it for editing.
    // A matching name by itself must never turn a new recipe into an update.
    const selectedBom = resolvedUpdateVersionId
      ? existingItemBoms.find((bom: any) => bom.id === resolvedUpdateVersionId) || await bomApi.getVersion(resolvedUpdateVersionId)
      : undefined;
    if (selectedBom) {
      const selectedOwnerId = itemType === 'MATERIAL' ? selectedBom.materialId : selectedBom.productId;
      if (selectedOwnerId !== itemId) {
        throw new Error('The selected BOM does not belong to this item.');
      }
    }
    const sameItemBomWithName = existingItemBoms.find(
      (b: any) => (b.bomNumber || '').trim().toLowerCase() === (finalBomNumber || '').toLowerCase()
    );
    const nameUnchangedForUpdate = Boolean(selectedBom &&
      (selectedBom.bomNumber || '').trim().toLowerCase() === (finalBomNumber || '').toLowerCase());
    if (sameItemBomWithName && sameItemBomWithName.id !== resolvedUpdateVersionId && !nameUnchangedForUpdate) {
      throw new Error(`A Bill of Materials named "${finalBomNumber}" already exists. Please provide a unique BOM name.`);
    }

    return saveInventoryBomVersion({
      itemId,
      itemType,
      productVariantId: productVariantId ?? undefined,
      bomNumber: finalBomNumber,
      updateVersionId: resolvedUpdateVersionId,
      lines: bomDraftLines,
    });
  };

  const persistMaterialVariants = async (
    parent: { id: string; code: string; name: string; categoryId?: string | null; materialType: 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT'; uomId: string },
    variants: Array<Record<string, any>>,
  ) => {
    const persisted = [];
    for (const [index, variant] of variants.entries()) {
      const measurementValue = String(variant.measurementValue || '').trim();
      const userCode = String(variant.sku || '').trim().toUpperCase();
      const generatedCode = `${parent.code}-V${index + 1}`.trim().toUpperCase().slice(0, 50);
      const rawMaterials = materialRecords.data?.items || [];
      const childMaterials = rawMaterials.filter((item: any) =>
        (item.parentMaterialId || item.specs?.parentMaterialId) === parent.id
      );
      const wantedLabel = normalizeVariantIdentity(getVariantLabel(parent.name, String(variant.name || ''), measurementValue));
      const matchesLabel = (item: any) => {
        const itemName = String(item.name || '').trim();
        const itemLabel = itemName && itemName.toLowerCase() !== parent.name.toLowerCase()
          ? getVariantLabel(parent.name, itemName, item.specs?.measurementValue)
          : item.specs?.variantLabel;
        return Boolean(wantedLabel && normalizeVariantIdentity(itemLabel) === wantedLabel);
      };
      const existingMaterial = rawMaterials.find((item: any) => item.id === variant.id) ||
        (userCode ? childMaterials.find((item: any) => String(item.code || '').trim().toUpperCase() === userCode) : undefined) ||
        childMaterials.find(matchesLabel) ||
        childMaterials.find((item: any) => String(item.code || '').trim().toUpperCase() === generatedCode);
      const code = String(userCode || existingMaterial?.code || generatedCode).trim().toUpperCase().slice(0, 50);
      const variantLabel = getVariantLabel(parent.name, String(variant.name || ''), measurementValue || `Variant ${index + 1}`);
      const name = formatVariantName(parent.name, variantLabel);
      const specs = {
        isVariant: true,
        parentMaterialId: parent.id,
        parentMaterialName: parent.name,
        hasCustomCode: Boolean(userCode),
        userCode,
        measurementValue,
        openingStock: Number(variant.openingStock) || 0,
        initialQuantity: Number(variant.openingStock) || 0,
        minStockLevel: Number(variant.minStockLevel) || 0,
        reorderPoint: Number(variant.reorderPoint) || 0,
        standardCost: Number(variant.standardPrice) || 0,
        customFields: variant.customFields || [],
      };
      const data = {
        code,
        name,
        description: measurementValue ? `Variant of ${parent.name}: ${measurementValue}` : `Variant of ${parent.name}`,
        materialType: parent.materialType,
        categoryId: parent.categoryId || null,
        uomId: variant.uomId || parent.uomId,
        specs,
        minStockLevel: Number(variant.minStockLevel) || 0,
        reorderPoint: Number(variant.reorderPoint) || 0,
        initialQuantity: Number(variant.openingStock) || 0,
        standardCost: Number(variant.standardPrice) || 0,
      };
      const existingId = existingMaterial?.id || (isPersistedVariantId(variant.id) ? variant.id : undefined);
      const saved = existingId
        ? await updateMaterial.mutateAsync({ id: existingId, ...data })
        : await createMaterial.mutateAsync(data);
      persisted.push({ ...variant, id: saved.id, sku: userCode, code: saved.code, name: saved.name });
    }
    return persisted;
  };

  const persistProductVariantItems = async (
    parent: { id: string; sku?: string; name: string; categoryId?: string; productFamilyId?: string; uomId: string; metadata?: Record<string, unknown> },
    variants: Array<Record<string, any>>,
  ) => {
    const persisted = [];
    const knownChildren = (productRecords.data?.items || []).filter((item: any) =>
      item.metadata?.isVariant === true && item.metadata?.parentProductId === parent.id
    );
    for (const [index, variant] of variants.entries()) {
      const measurementValue = String(variant.measurementValue || '').trim();
      const userSku = String(variant.sku || '').trim().toUpperCase();
      const name = formatVariantName(parent.name, variant.name, measurementValue || `Variant ${index + 1}`);
      const variantIdentity = normalizeVariantIdentity(getVariantLabel(parent.name, variant.name, measurementValue));
      let existing = knownChildren.find((item: any) => item.id === variant.productRecordId);
      if (!existing && variantIdentity) {
        existing = knownChildren.find((item: any) => {
          const itemName = String(item.name || '').trim();
          const itemLabel = itemName && itemName.toLowerCase() !== parent.name.toLowerCase()
            ? getVariantLabel(parent.name, itemName, item.metadata?.measurementValue)
            : item.metadata?.variantLabel;
          return normalizeVariantIdentity(itemLabel) === variantIdentity;
        });
      }
      if (!existing && userSku) {
        const skuMatches = knownChildren.filter((item: any) => item.sku?.toUpperCase() === userSku);
        if (skuMatches.length === 1) existing = skuMatches[0];
      }
      const sku = String(userSku || existing?.sku || `${(parent.sku || 'ITEM').slice(0, 40)}-V${index + 1}`).trim().toUpperCase();
      const metadata = {
        ...(existing?.metadata || {}),
        isVariant: true,
        parentProductId: parent.id,
        parentProductName: parent.name,
        parentSku: parent.sku || '',
        hasCustomSku: Boolean(userSku),
        userSku,
        measurementValue,
        variantLabel: getVariantLabel(parent.name, variant.name, measurementValue || `Variant ${index + 1}`),
        // Opening stock is posted once, when the real inventory item is created.
        // Keep that original value on edits; subsequent stock changes belong in the ledger.
        initialQuantity: existing?.metadata?.initialQuantity ?? (Number(variant.openingStock) || 0),
        minStockLevel: Number(variant.minStockLevel) || 0,
        reorderPoint: Number(variant.reorderPoint) || 0,
        standardPrice: Number(variant.standardPrice) || 0,
        customFields: variant.customFields || [],
      };
      const itemData = {
        sku,
        name,
        description: `Variant of ${parent.name}${measurementValue ? `: ${measurementValue}` : ''}`,
        categoryId: parent.categoryId,
        productFamilyId: parent.productFamilyId,
        uomId: variant.uomId || parent.uomId,
        minStockLevel: Number(variant.minStockLevel) || 0,
        reorderPoint: Number(variant.reorderPoint) || 0,
        costPrice: Number(variant.standardPrice) || 0,
        sellingPrice: Number(variant.standardPrice) || 0,
        metadata,
      };
      const saved = existing
        ? await updateProduct.mutateAsync({ id: existing.id, ...itemData } as any)
        : await createProduct.mutateAsync({ ...itemData, initialQuantity: Number(variant.openingStock) || 0 } as any);
      variant.productRecordId = saved.id;
      persisted.push({ ...variant, productRecordId: saved.id, sku: userSku, displayName: name });
    }

    // Child Product rows are persisted separately for stock/BOM references.
    // Deactivate rows omitted from the parent's configured options so stale
    // variants disappear from selectors while all historical references remain.
    const keptChildIds = new Set(persisted.map((variant: any) => variant.productRecordId).filter(Boolean));
    const staleChildren = knownChildren.filter((item: any) => !keptChildIds.has(item.id));
    await Promise.all(staleChildren.map((item: any) =>
      fetchApi(`/master-data/products/${item.id}`, { method: 'DELETE' })
    ));
    return persisted;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    let bomLinesForSubmit = bomLines;
    try {
      const replacements = new Map<string, { id: string; name: string; code?: string }>();
      const parentsToPersist = new Set<string>();
      for (const line of bomLines) {
        const virtualVariant = bomItems.find((item) => item.id === line.materialId && item.parentMaterialId && !isPersistedVariantId(item.id));
        if (!virtualVariant?.parentMaterialId || parentsToPersist.has(virtualVariant.parentMaterialId)) continue;
        parentsToPersist.add(virtualVariant.parentMaterialId);
        const parent = materials.data?.items.find((item) => item.id === virtualVariant.parentMaterialId);
        if (!parent) continue;
        const variants = extractMaterialVariants(parent);
        const savedVariants = await persistMaterialVariants({
          id: parent.id,
          code: parent.code,
          name: parent.name,
          categoryId: parent.categoryId,
          materialType: (parent.materialType || 'RAW_MATERIAL') as 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT',
          uomId: parent.uomId || '',
        }, variants);
        variants.forEach((variant, index) => {
          const saved = savedVariants[index];
          if (saved?.id) replacements.set(variant.id, { id: saved.id, name: saved.name, code: saved.sku });
        });
        const parentSpecs = (parent.specs || {}) as Record<string, unknown>;
        await updateMaterial.mutateAsync({
          id: parent.id,
          specs: { ...parentSpecs, measurementVariants: savedVariants, variants: savedVariants },
        });
      }
      if (replacements.size > 0) {
        bomLinesForSubmit = bomLines.map((line) => {
          const replacement = replacements.get(line.materialId);
          return replacement
            ? {
              ...line,
              materialId: replacement.id,
              materialName: replacement.name,
              materialCode: replacement.code,
              note: stripGeneratedVariantNotes(line.note).slice(0, 500),
            }
            : line;
        });
      }
      bomLinesForSubmit = mergeDuplicateBomLines(bomLinesForSubmit);
      if (bomLinesForSubmit !== bomLines) setBomLines(bomLinesForSubmit);
    } catch (error) {
      const rawMessage = friendlyErrorMessage(error) || (error instanceof Error ? error.message : String(error));
      const duplicateCode = rawMessage.match(/material with code\s+\[([^\]]+)\]\s+already exists/i)?.[1];
      const duplicateMaterialName = duplicateCode
        ? [
          ...(materialRecords.data?.items || []),
          ...(materials.data?.items || []),
          ...bomItems,
        ].find((item: any) => String(item.code || item.sku || '').trim().toUpperCase() === duplicateCode.trim().toUpperCase())?.name
        : undefined;
      const message = duplicateCode
        ? duplicateMaterialName
          ? `Material "${duplicateMaterialName}" already exists.`
          : 'A material with this name or code already exists. Please choose a unique material name.'
        : rawMessage;
      showToast({
        kind: 'error',
        title: 'Could Not Save Variant Item',
        message,
      });
      return;
    }
    const resolvedItemType = isEditMode
      ? editEntityType
      : categoryItemType || itemClassification;
    const shouldConvertMaterialToProduct = isEditMode
      && editEntityType === 'MATERIAL'
      && categoryItemType === 'PRODUCT';

    const errors: Record<string, string> = {};
    const allUomsList = uoms.data?.items || [];
    const uomMap = new Map(allUomsList.map((uom) => [uom.id, uom]));

    if (!form.name.trim()) {
      errors.name = resolvedItemType === 'PRODUCT' ? 'Please specify an industrial product name.' : 'Please specify a material name.';
    } else {
      const normalizedName = form.name.trim().toLocaleLowerCase();
      const isSameItem = (id: string) =>
        id === editId || id.startsWith(`${editId}__var__`);
      const isCatalogVariant = (item: any) => Boolean(
        item?.isVariant ||
        item?.metadata?.isVariant === true ||
        item?.specs?.isVariant === true ||
        item?.metadata?.parentProductId ||
        item?.parentProductId ||
        item?.specs?.parentMaterialId ||
        item?.parentMaterialId
      );
      const isVariantOf = (item: any) => {
        const parentMaterialId = item?.parentMaterialId || item?.specs?.parentMaterialId;
        const parentProductId = item?.parentProductId || item?.metadata?.parentProductId;
        return parentMaterialId === editId || parentProductId === editId;
      };
      const existingNamedItem = [
        ...(products.data?.items || []).map((item) => ({ ...item, inventoryKind: 'product' as const })),
        ...(materials.data?.items || []).map((item) => ({ ...item, inventoryKind: 'material' as const })),
      ].find(
        (item) =>
          !isSameItem(item.id) &&
          !['INACTIVE', 'SUPERSEDED'].includes(String(item.status || '').toUpperCase()) &&
          !isCatalogVariant(item) &&
          !isVariantOf(item) &&
          item.name?.trim().toLocaleLowerCase() === normalizedName
      );
      if (existingNamedItem) {
        errors.name = `An inventory item with this name already exists as a ${existingNamedItem.inventoryKind}. Names must be unique across Products and Materials.`;
      }
    }
    if (!form.parentCategoryId) {
      errors.parentCategoryId = 'Select a category.';
    }
    if (form.parentCategoryId && !form.productFamilyId) {
      errors.productFamilyId = 'Select a sub category for this category.';
    }
    if (!form.uomId) {
      errors.uomId = 'Select base unit of measure (e.g. PCS, NOS, KGS).';
    } else if (!uomMap.has(form.uomId)) {
      errors.uomId = 'The selected unit of measure is no longer available. Please select an active UOM.';
    }

    if (form.hasMultipleUoms) {
      if (!form.uomRelations || form.uomRelations.length === 0) {
        errors.uomRelations = 'Please establish at least one conversion relation for Multiple UOMs.';
      } else {
        const allRelationsValid = form.uomRelations.every((r) => Number(r.factor) > 0 && r.fromUomId && r.toUomId);
        if (!allRelationsValid) {
          errors.uomRelations = 'Please ensure all conversion relations have valid values.';
        }
      }
    }
    const validateWholeQuantity = (value: string | number | undefined, field: string, label: string, uomId = form.uomId) => {
      const uom = uomMap.get(uomId);
      const normalized = String(value ?? '').trim();
      if (uom?.allowFractional === false && normalized && Number.isFinite(Number(normalized)) && !Number.isInteger(Number(normalized))) {
        errors[field] = `${label} must be a whole number because ${uom.name} does not allow decimal quantities.`;
      }
    };
    validateWholeQuantity(form.initialQuantity, 'initialQuantity', 'Opening stock');
    validateWholeQuantity(form.minStockLevel, 'minStockLevel', 'Safety buffer');
    validateWholeQuantity(form.targetMaxStock, 'targetMaxStock', 'Target maximum stock');
    validateWholeQuantity(form.reorderPoint, 'reorderPoint', 'Reorder point');
    const seenVariantNames = new Set<string>();
    measurementVariants.forEach((variant, index) => {
      const variantName = normalizeVariantIdentity(getVariantLabel(form.name, variant.name));
      if (variantName && seenVariantNames.has(variantName)) {
        errors[`variant-${index}-name`] = 'Each variant must have a unique name.';
      } else if (variantName) {
        seenVariantNames.add(variantName);
      }
      const variantUomId = variant.uomId || form.uomId;
      validateWholeQuantity(variant.openingStock, `variant-${index}-openingStock`, `Variant ${index + 1} opening stock`, variantUomId);
      validateWholeQuantity(variant.minStockLevel, `variant-${index}-minStockLevel`, `Variant ${index + 1} minimum stock`, variantUomId);
      validateWholeQuantity(variant.reorderPoint, `variant-${index}-reorderPoint`, `Variant ${index + 1} reorder point`, variantUomId);
    });
    if (!form.hsnCode.trim()) {
      errors.hsnCode = 'Select or enter an HSN / SAC code.';
    }
    if (!form.taxability.trim()) {
      errors.taxability = 'Select a taxability.';
    }
    if (isTaxable && !form.gstRate) {
      errors.gstRate = 'Select a GST rate.';
    }
    if (!form.productType.trim()) {
      errors.productType = 'Select a product type.';
    }
    if ((selectedRouteId || routeSteps.length > 0) && routeSteps.length === 0) {
      errors.routing = 'Add at least one operation to the selected production route.';
    } else if (routeSteps.some((step) => !step.stepName.trim() || !step.departmentId)) {
      errors.routing = 'Complete every production route operation with a name and department before saving.';
    }

    const allMaterialsList = bomItems;

    // Clearing a saved formula's lines is different from detaching that BOM
    // from the item. Require the user to use the saved-BOM remove action so the
    // association is persisted while the BOM record itself is retained.
    const editingPersistedBomWithComponents = savedBoms.some(
      (bom) => bom.id === editingSavedBomId && bom.isExisting && bom.lines.length > 0
    );
    if (isEditMode && editingPersistedBomWithComponents && bomLinesForSubmit.length === 0) {
      errors['bom-general'] = 'This BOM still belongs to the item. To remove the BOM association while preserving the BOM record, use the × on its saved BOM label.';
    }

    {
      bomLinesForSubmit.forEach((line, index) => {
        if (!line.materialId) {
          errors[`bom-${index}-material`] = `Line #${index + 1}: Select an item or component.`;
        } else {
          const materialItem = bomItems.find((item) => item.id === line.materialId);
          const productItem = bomProducts.data?.items.find((item) => item.id === line.materialId);
          const legacyMaterialVariant = materialItem?.parentMaterialId && isPersistedVariantId(materialItem.parentMaterialId);
          const legacyProductVariant = productItem?.parentProductId && isPersistedVariantId(productItem.parentProductId);
          if (!materialItem && !productItem && !isPersistedVariantId(line.materialId)) {
            errors[`bom-${index}-material`] = `Line #${index + 1}: This saved selection is no longer available. Choose the item again.`;
          } else if (!isPersistedVariantId(line.materialId) && !legacyMaterialVariant && !legacyProductVariant) {
            errors[`bom-${index}-material`] = `Line #${index + 1}: This variant has no valid item ID yet. Edit and save its parent item, then select it again.`;
          }
        }
        const qty = Number(line.quantity);
        if (isNaN(qty) || qty <= 0) {
          errors[`bom-${index}-qty`] = `Line #${index + 1}: Required quantity must be greater than 0.`;
        } else {
          const lineUom = uomMap.get(line.uomId);
          if (lineUom?.allowFractional === false && !Number.isInteger(qty)) {
            errors[`bom-${index}-qty`] = `Line #${index + 1}: Quantity must be a whole number because ${lineUom.name} does not allow decimal quantities.`;
          }
        }
        if (!line.uomId) {
          errors[`bom-${index}-uom`] = `Line #${index + 1}: Unit of measure is required.`;
        } else if (line.materialId) {
          const mat = allMaterialsList.find((m) => m.id === line.materialId);
          if (mat) {
            const matUom = mat.uomId ? uomMap.get(mat.uomId) : (mat as any).uom;
            const lineUom = uomMap.get(line.uomId);
            if (matUom?.dimension && lineUom?.dimension && matUom.dimension !== lineUom.dimension) {
              errors[`bom-${index}-uom`] = `UOM dimension mismatch: Item is ${matUom.dimension} (${matUom.code}), but line UOM is ${lineUom.dimension} (${lineUom.code}). Select a ${matUom.dimension} unit.`;
            }
          }
        }
      });
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      let targetId = `field-${firstKey}`;
      let targetSection = 'general';

      if (['name', 'sku', 'parentCategoryId', 'productFamilyId'].includes(firstKey)) {
        targetId = `field-${firstKey}`;
        targetSection = 'general';
      } else if (firstKey === 'uomId' || firstKey === 'uomRelations') {
        targetId = firstKey === 'uomRelations' ? 'section-multi-uom-relations' : 'field-uomId';
        targetSection = 'inventory';
      } else if (['initialQuantity', 'minStockLevel', 'targetMaxStock', 'reorderPoint'].includes(firstKey) || firstKey.startsWith('variant-')) {
        targetId = `field-${firstKey}`;
        targetSection = 'inventory';
      } else if (['hsnCode', 'taxability', 'gstRate', 'productType'].includes(firstKey)) {
        targetId = `field-${firstKey}`;
        targetSection = 'general';
      } else if (firstKey === 'routing') {
        targetId = 'section-routing';
        targetSection = 'routing';
      } else if (firstKey.startsWith('bom-')) {
        targetId = firstKey === 'bom-general' ? 'bom-table-container' : `field-${firstKey}`;
        targetSection = 'bom';
      }

      showToast({
        kind: 'error',
        title: 'Action Required',
        message: errors[firstKey],
      });

      focusAndScrollToField(targetId, targetSection);
      return;
    }

    setFieldErrors({});

    const validBomLines = bomLinesForSubmit.filter((line) => line.materialId && line.uomId && Number(line.quantity) > 0);
    let createdProductId: string | null = null;
    let createdMaterialId: string | null = null;

    try {
      let uploadedUrls: { path: string; url: string; fileName: string }[] = [];
      const cleanSku = form.sku.trim().toUpperCase();
      const resolvedSku = cleanSku;

      if (imageFiles.length > 0) {
        const uploadResult = await uploadImages.mutateAsync({
          productKey: (resolvedSku || form.name.trim() || 'product').toLowerCase().replace(/[^a-z0-9]/g, '-'),
          files: imageFiles,
        });
        uploadedUrls = (uploadResult.images || []).map((img) => ({
          path: img.path,
          url: img.url,
          fileName: img.fileName,
        }));
      }

      const resolvedTierPricing = tierPricing.map((tier) => {
        const calc = computeTierPrice(tier);
        const levelName = tier.level || tier.tierName;
        return {
          tierId: tier.tierId,
          tierName: levelName,
          level: levelName,
          tierCode: tier.tierCode,
          masterPrice: tier.masterPrice,
          defaultDiscountPercentage: tier.defaultDiscountPercentage ?? 0,
          discountPercentage: Number(tier.discountPercentage) || 0,
          isCustomPrice: Boolean(tier.isCustomPrice),
          customPrice: tier.isCustomPrice && tier.customPrice ? parseFloat(tier.customPrice) : null,
          calculatedPrice: calc,
          enabled: tier.enabled !== false,
        };
      });

      const resolvedVariants = measurementVariants
        .filter((v) => v.name.trim() || (v.sku && v.sku.trim()) || (v.openingStock && v.openingStock.trim()) || (v.measurementValue && v.measurementValue.trim()))
        .map((v, idx) => ({
          id: isPersistedVariantId(v.id) ? v.id : undefined,
          productRecordId: (v as any).productRecordId,
          sequence: idx + 1,
          name: getVariantLabel(form.name, v.name, v.measurementValue || `Variant ${idx + 1}`),
          sku: v.sku.trim() ? v.sku.trim().toUpperCase() : '',
          measurementValue: (v.measurementValue || '').trim(),
          uomId: form.uomId,
          openingStock: parseFloat(v.openingStock) || 0,
          minStockLevel: parseFloat(v.minStockLevel) || 0,
          reorderPoint: parseFloat(v.reorderPoint) || 0,
          standardPrice: parseFloat(v.standardPrice) || 0,
          customFields: [],
        }));

      const metadata = {
        hsn: form.hsnCode || '',
        hsnDescription: hsnLookup.data?.description || '',
        taxability: form.taxability,
        gstRate: form.gstRate ? parseFloat(form.gstRate) : null,
        productType: form.productType,
        mrp: isRawMaterialCategory ? null : numMrp || null,
        costPrice: isRawMaterialCategory ? numMrp || null : null,
        sellingPrice: isRawMaterialCategory ? null : numMrp || null,
        globalDiscountPercentage: 0,
        additionalDiscountPercentage: 0,
        tierPricing: resolvedTierPricing,
        customFields: customFields.filter((field) => field.name.trim() || field.value.trim()),
        technicalFields: technicalFields.filter((field) => field.name.trim() || field.value.trim()),
        pricingMasterId: pricingMasterId || null,
        pricingMasterName: pricingMasters.data?.items.find((master) => master.id === pricingMasterId)?.name || '',
        pricingFields: pricingFields.filter((field) => field.name.trim() || field.value.trim()),
        productionRouteSteps: routeSteps.map((step, index) => ({
          sequence: index + 1,
          stepName: step.stepName.trim(),
          departmentId: step.departmentId,
          durationMinutes: Number(step.durationMinutes) || 0,
        })),
        productionRouteId: selectedRouteId || null,
        bomEnabled,
        bomLines: bomLinesForSubmit,
        measurementVariants: resolvedVariants,
        variants: resolvedVariants,
        asin: form.asin || '',
        availableUomIds: form.hasMultipleUoms
          ? [...new Set([form.uomId, ...form.additionalUomIds].filter(Boolean))]
          : [form.uomId].filter(Boolean),
        hasMultipleUoms: Boolean(form.hasMultipleUoms),
        uomRelations: form.hasMultipleUoms ? form.uomRelations || [] : [],
        initialQuantity: parseFloat(form.initialQuantity) || 0,
        safetyStock: parseFloat(form.minStockLevel) || 0,
        targetMaxStock: parseFloat(form.targetMaxStock) || 0,
        specifications: {
          steelGrade: form.steelGrade,
          pipeDiameter: form.pipeDiameter,
          rodThickness: form.rodThickness,
          loadCapacity: form.loadCapacity,
          dimensionsUnfolded: form.dimensionsUnfolded,
          foldedProfile: form.foldedProfile,
          netWeight: form.netWeight,
          grossWeight: form.grossWeight,
          surfaceFinish: form.surfaceFinish,
          dryingRails: form.dryingRails,
        },
        sku: resolvedSku,
        userSku: resolvedSku,
        hasCustomSku: Boolean(resolvedSku),
        images: uploadedUrls,
      };

      const payload = {
        sku: resolvedSku,
        partNo: form.partNo.trim() || undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.parentCategoryId,
        productFamilyId: form.productFamilyId,
        uomId: form.uomId,
        minStockLevel: parseFloat(form.minStockLevel) || 0,
        reorderPoint: parseFloat(form.reorderPoint) || 0,
        leadTimeDays: parseFloat(form.leadTimeDays) || 0,
        costPrice: isRawMaterialCategory ? numMrp || 0 : 0,
        sellingPrice: isRawMaterialCategory ? 0 : numMrp || 0,
        metadata,
      };

      const finalImages = [...existingImages, ...uploadedUrls];
      (metadata as any).images = finalImages;

      if (isEditMode && editId) {
        if (resolvedItemType === 'MATERIAL') {
          const materialPayload = {
            code: resolvedSku || undefined,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            materialType: materialType,
            uomId: form.uomId,
            categoryId: form.parentCategoryId || null,
            specs: {
              ...(editMaterialQuery.data?.specs || {}),
              ...metadata,
              specifications: metadata.specifications,
              customFields: metadata.customFields,
              technicalFields: metadata.technicalFields,
              availableUomIds: metadata.availableUomIds,
              hasMultipleUoms: metadata.hasMultipleUoms,
              uomRelations: metadata.uomRelations,
              measurementVariants: resolvedVariants,
              variants: resolvedVariants,
              images: finalImages,
              productFamilyId: form.productFamilyId || null,
              hsnCode: form.hsnCode || undefined,
              taxability: form.taxability,
              gstRate: form.gstRate,
              standardCost: numMrp || 0,
              code: resolvedSku,
              userCode: resolvedSku,
              hasCustomCode: Boolean(resolvedSku),
              initialQuantity: parseFloat(form.initialQuantity) || 0,
              minStockLevel: parseFloat(form.minStockLevel) || 0,
              reorderPoint: parseFloat(form.reorderPoint) || 0,
              targetMaxStock: parseFloat(form.targetMaxStock) || 0,
              leadTimeDays: parseFloat(form.leadTimeDays) || 0,
            },
          };

          await updateMaterial.mutateAsync({
            id: editId,
            name: materialPayload.name,
            description: materialPayload.description,
            materialType: materialPayload.materialType,
            categoryId: materialPayload.categoryId,
            uomId: materialPayload.uomId,
            specs: materialPayload.specs,
          });

          const persistedVariants = await persistMaterialVariants({
            id: editId,
            code: resolvedSku || editMaterialQuery.data?.code || editId,
            name: materialPayload.name,
            categoryId: materialPayload.categoryId,
            materialType: materialPayload.materialType,
            uomId: materialPayload.uomId,
          }, resolvedVariants);
          await updateMaterial.mutateAsync({
            id: editId,
            specs: { ...materialPayload.specs, measurementVariants: persistedVariants, variants: persistedVariants },
          });

          const routeId = await persistInventoryRoute(editId, materialPayload.name, 'MATERIAL');
          if (routeId) {
            await updateMaterial.mutateAsync({ id: editId, specs: { ...materialPayload.specs, measurementVariants: persistedVariants, variants: persistedVariants, productionRouteId: routeId } });
          }
          let allMaterialBoms = [...savedBoms];
          if (editingSavedBomId) {
            allMaterialBoms = allMaterialBoms.map((b) =>
              b.id === editingSavedBomId
                ? { ...b, name: bomName.trim() || deriveSafeBomName(bomName) || b.name, lines: validBomLines }
                : b
            );
          } else if (validBomLines.length > 0) {
            const currentDraftSig = getNormalizedBomSnapshot(validBomLines);
            const alreadyInSaved = shouldDeduplicateComposerBom() && allMaterialBoms.some((b) => {
              return getNormalizedBomSnapshot(b.lines) === currentDraftSig;
            });
            if (!alreadyInSaved) {
              allMaterialBoms.push({ id: `active-${Date.now()}`, name: getComposerBomName(), lines: validBomLines, forceCreate: selectedBomVersionIds.length > 0 || Boolean(selectedBomVersionId) });
            }
          }
          for (const b of allMaterialBoms) {
            if (b.lines.length === 0) continue;
            const currentSnapshot = getNormalizedBomSnapshot(b.lines);
            if (b.isExisting && b.originalSnapshot && currentSnapshot === b.originalSnapshot &&
                b.name.trim() === (b.originalName || b.name).trim()) {
              continue;
            }
            const isCurrentName = Boolean(b.isExisting &&
              b.name.trim().toLowerCase() === (b.originalName || b.name).trim().toLowerCase());
            if (b.name && !isCurrentName && isBomNameAlreadyExists(b.name, b.id)) {
              showToast({
                kind: 'error',
                title: 'BOM Name Already Exists',
                message: `A Bill of Materials named "${b.name}" already exists. Please choose a unique name.`,
              });
              return;
            }
            const targetBomName = b.isExisting
              ? b.name.trim() || b.originalName || ''
              : deriveSafeBomName(b.name);
            await persistInventoryBom(
              editId,
              'MATERIAL',
              b.lines,
              targetBomName,
              b.isExisting ? b.id : undefined,
              b.isExisting ? true : Boolean(b.forceCreate),
              b.productVariantId
            );
          }

          // A Finished Goods category means this item belongs in the Product
          // catalog. Promote the persisted material after saving its edited
          // category, family, variants, and BOM data; the API migrates the
          // eligible stock and BOM ownership in one transaction.
          let convertedProduct: any = null;
          if (shouldConvertMaterialToProduct) {
            convertedProduct = await fetchApi(`/materials/${editId}/convert-to-product`, { method: 'POST' });
          }

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['materials'] }),
            queryClient.invalidateQueries({ queryKey: ['products'] }),
            queryClient.invalidateQueries({ queryKey: ['categories'] }),
            queryClient.invalidateQueries({ queryKey: ['product-families'] }),
            queryClient.invalidateQueries({ queryKey: ['inventory'] }),
            queryClient.invalidateQueries({ queryKey: ['materials', editId] }),
            queryClient.invalidateQueries({ queryKey: bomKeys.all }),
          ]);
          router.refresh();

          showToast({
            kind: 'success',
            title: convertedProduct ? 'Product Conversion Complete' : 'Material Updated',
            message: convertedProduct
              ? `${materialPayload.name} is now an active Product. Its eligible BOM and stock history were preserved.`
              : `${materialPayload.name}${materialPayload.code ? ` (${materialPayload.code})` : ''} updated successfully.`,
          });

          if (convertedProduct?.id) {
            router.push(`/products/${convertedProduct.id}`);
          } else if (viewParam === 'all-items') {
            router.push('/products?view=all-items');
          } else {
            router.push(`/inventory/materials/${editId}`);
          }
          return;
        } else {
          // PRODUCT update
          const updatePayload = {
            id: editId,
            sku: resolvedSku,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            categoryId: form.parentCategoryId || undefined,
            productFamilyId: form.productFamilyId || undefined,
            uomId: form.uomId || undefined,
            minStockLevel: parseFloat(form.minStockLevel) || 0,
            reorderPoint: parseFloat(form.reorderPoint) || 0,
            leadTimeDays: parseFloat(form.leadTimeDays) || 0,
            costPrice: 0,
            sellingPrice: numMrp || 0,
            metadata: {
              ...(editProductQuery.data?.metadata || {}),
              ...metadata,
              sku: resolvedSku,
              userSku: resolvedSku,
              hasCustomSku: Boolean(resolvedSku),
              images: finalImages,
              bomEnabled: validBomLines.length > 0,
              bomLines: bomLinesForSubmit,
            },
          };

          await updateProduct.mutateAsync(updatePayload as any);

          const savedProductVariants = await persistProductVariantItems({
            id: editId,
            sku: resolvedSku || editProductQuery.data?.sku,
            name: form.name.trim(),
            categoryId: form.parentCategoryId || undefined,
            productFamilyId: form.productFamilyId || undefined,
            uomId: form.uomId,
          }, resolvedVariants);
          await updateProduct.mutateAsync({
            id: editId,
            metadata: {
              ...((editProductQuery.data?.metadata || {}) as Record<string, unknown>),
              ...metadata,
              measurementVariants: savedProductVariants,
              variants: savedProductVariants,
            },
          } as any);

          for (const [variantIndex, v] of resolvedVariants.entries()) {
            const hasPersistedVariantId = isPersistedVariantId(v.id);
            const variantSku = v.sku.trim() ? v.sku.trim().toUpperCase() : '';
            const generatedVariantSku = `${(resolvedSku || editProductQuery.data?.sku || 'ITEM').slice(0, 40)}-V${variantIndex + 1}`;
            if (hasPersistedVariantId) {
              try {
                await fetchApi(`/master-data/products/variants/${v.id}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    ...(variantSku ? { sku: variantSku } : {}),
                    name: formatVariantName(editProductQuery.data?.name || form.name, v.name, v.measurementValue),
                    size: v.measurementValue || null,
                    specifications: {
                      uomId: v.uomId,
                      openingStock: v.openingStock,
                      minStockLevel: v.minStockLevel,
                      reorderPoint: v.reorderPoint,
                      standardPrice: v.standardPrice,
                      customFields: v.customFields,
                    },
                  }),
                });
              } catch (error) {
                const rawReason = friendlyErrorMessage(error) || (error instanceof Error ? error.message : String(error));
                const reason = /ProductVariant \[[^\]]+\] not found\.?/i.test(rawReason)
                  ? `Variant "${v.name}" could not be found. Refresh the catalogue and try again.`
                  : rawReason;
                throw new Error(`Variant "${v.name}" could not be saved: ${reason}`);
              }
            } else {
              try {
                const savedVariant = await fetchApi<{ id: string }>('/master-data/products/variants', {
                  method: 'POST',
                  body: JSON.stringify({
                    productId: editId,
                    sku: variantSku || generatedVariantSku,
                    name: formatVariantName(editProductQuery.data?.name || form.name, v.name, v.measurementValue),
                    size: v.measurementValue || undefined,
                    specifications: {
                      uomId: v.uomId,
                      openingStock: v.openingStock,
                      minStockLevel: v.minStockLevel,
                      reorderPoint: v.reorderPoint,
                      standardPrice: v.standardPrice,
                      customFields: v.customFields,
                    },
                  }),
                });
                v.id = savedVariant.id;
              } catch (error) {
                const rawReason = friendlyErrorMessage(error) || (error instanceof Error ? error.message : String(error));
                const reason = /ProductVariant \[[^\]]+\] not found\.?/i.test(rawReason)
                  ? `Variant "${v.name}" could not be found. Refresh the catalogue and try again.`
                  : rawReason;
                throw new Error(`Variant "${v.name}" could not be saved: ${reason}`);
              }
            }
          }

          // Retire old ProductVariant rows omitted from the parent's configured
          // list. Keeping them inactive preserves BOM and schedule references.
          const keptProductVariantIds = new Set(
            resolvedVariants.map((variant: any) => variant.id).filter((id: string) => isPersistedVariantId(id))
          );
          const staleProductVariants = ((editProductQuery.data?.variants || []) as any[]).filter(
            (variant: any) => variant.status !== 'INACTIVE' && !keptProductVariantIds.has(variant.id)
          );
          await Promise.all(staleProductVariants.map((variant: any) =>
            fetchApi(`/master-data/products/variants/${variant.id}`, { method: 'DELETE' })
          ));

          const productRouteId = await persistInventoryRoute(editId, form.name.trim(), 'PRODUCT');
          await updateProduct.mutateAsync({
            id: editId,
            metadata: {
              ...metadata,
              productionRouteId: productRouteId,
              productionRouteName: routeName.trim() || undefined,
              productionRouteSteps: routeSteps.map((step, index) => ({
                sequence: index + 1,
                stepName: step.stepName.trim(),
                departmentId: step.departmentId,
                durationMinutes: Number(step.durationMinutes) || 0,
              })),
            },
          } as any);

          let allProductBoms = [...savedBoms];
          if (editingSavedBomId) {
            allProductBoms = allProductBoms.map((b) =>
              b.id === editingSavedBomId
                ? { ...b, name: bomName.trim() || deriveSafeBomName(bomName) || b.name, lines: validBomLines }
                : b
            );
          } else if (validBomLines.length > 0) {
            const currentDraftSig = getNormalizedBomSnapshot(validBomLines);
            const alreadyInSaved = shouldDeduplicateComposerBom() && allProductBoms.some((b) => {
              return getNormalizedBomSnapshot(b.lines) === currentDraftSig;
            });
            if (!alreadyInSaved) {
              allProductBoms.push({ id: `active-${Date.now()}`, name: getComposerBomName(), lines: validBomLines, forceCreate: selectedBomVersionIds.length > 0 || Boolean(selectedBomVersionId) });
            }
          }
          const updatedBomNames: string[] = [];
          for (const b of allProductBoms) {
            if (b.lines.length === 0) continue;
            const currentSnapshot = getNormalizedBomSnapshot(b.lines);
            if (b.isExisting && b.originalSnapshot && currentSnapshot === b.originalSnapshot &&
                b.name.trim() === (b.originalName || b.name).trim()) {
              continue;
            }
            const isCurrentName = Boolean(b.isExisting &&
              b.name.trim().toLowerCase() === (b.originalName || b.name).trim().toLowerCase());
            if (b.name && !isCurrentName && isBomNameAlreadyExists(b.name, b.id)) {
              showToast({
                kind: 'error',
                title: 'BOM Name Already Exists',
                message: `A Bill of Materials named "${b.name}" already exists. Please choose a unique name.`,
              });
              return;
            }
            const targetBomName = b.isExisting
              ? b.name.trim() || b.originalName || ''
              : deriveSafeBomName(b.name);
            const savedVersion = await persistInventoryBom(
              editId,
              'PRODUCT',
              b.lines,
              targetBomName,
              b.isExisting ? b.id : undefined,
              b.isExisting ? true : Boolean(b.forceCreate),
              b.productVariantId
            );
            if (b.isExisting && savedVersion?.id === b.id) {
              updatedBomNames.push(savedVersion.bomNumber);
            }
          }

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['products'] }),
            queryClient.invalidateQueries({ queryKey: ['materials'] }),
            queryClient.invalidateQueries({ queryKey: ['categories'] }),
            queryClient.invalidateQueries({ queryKey: ['product-families'] }),
            queryClient.invalidateQueries({ queryKey: ['product-routes'] }),
            queryClient.invalidateQueries({ queryKey: ['inventory'] }),
            queryClient.invalidateQueries({ queryKey: ['products', 'detail', editId] }),
            queryClient.invalidateQueries({ queryKey: bomKeys.all }),
          ]);
          router.refresh();

          showToast({
            kind: 'success',
            title: 'Product Master Updated',
            message: `${form.name} (${resolvedSku}) updated successfully.`,
          });
          if (updatedBomNames.length > 0) {
            showToast({
              kind: 'success',
              title: 'BOM Updated',
              message: updatedBomNames.length === 1
                ? `Your BOM "${updatedBomNames[0]}" was updated successfully.`
                : `${updatedBomNames.length} BOMs were updated successfully.`,
            });
          }

          if (viewParam === 'all-items') {
            router.push('/products?view=all-items');
          } else {
            router.push(`/products/${editId}`);
          }
          return;
        }
      }

      if (resolvedItemType === 'MATERIAL') {
        const materialPayload = {
          code: resolvedSku || undefined,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          materialType: materialType,
          uomId: form.uomId,
          categoryId: form.parentCategoryId || null,
          specs: {
            ...metadata,
            specifications: metadata.specifications,
            customFields: metadata.customFields,
            technicalFields: metadata.technicalFields,
            availableUomIds: metadata.availableUomIds,
            hasMultipleUoms: metadata.hasMultipleUoms,
            uomRelations: metadata.uomRelations,
            measurementVariants: resolvedVariants,
            variants: resolvedVariants,
            images: metadata.images,
            productFamilyId: form.productFamilyId || undefined,
            hsnCode: form.hsnCode || undefined,
            taxability: form.taxability,
            gstRate: form.gstRate,
            standardCost: numMrp || 0,
            code: resolvedSku,
            userCode: resolvedSku,
            hasCustomCode: Boolean(resolvedSku),
          },
          minStockLevel: parseFloat(form.minStockLevel) || 0,
          reorderPoint: parseFloat(form.reorderPoint) || 0,
          leadTimeDays: parseFloat(form.leadTimeDays) || 0,
          standardCost: numMrp || 0,
          initialQuantity: parseFloat(form.initialQuantity) || 0,
        };

        const createdMaterial = await createMaterial.mutateAsync(materialPayload) as { id?: string; code?: string };
        if (!createdMaterial?.id) throw new Error('Material was created, but the saved material ID was not returned.');
        createdMaterialId = createdMaterial.id;
        const persistedVariants = await persistMaterialVariants({
          id: createdMaterial.id,
          code: createdMaterial.code || materialPayload.code || createdMaterial.id,
          name: materialPayload.name,
          categoryId: materialPayload.categoryId,
          materialType: materialPayload.materialType,
          uomId: materialPayload.uomId,
        }, resolvedVariants);
        if (persistedVariants.length > 0) {
          await updateMaterial.mutateAsync({
            id: createdMaterial.id,
            specs: { ...materialPayload.specs, measurementVariants: persistedVariants, variants: persistedVariants },
          });
        }
        const routeId = await persistInventoryRoute(createdMaterial.id, materialPayload.name, 'MATERIAL');
        if (routeId) {
          await updateMaterial.mutateAsync({ id: createdMaterial.id, specs: { ...materialPayload.specs, measurementVariants: persistedVariants, variants: persistedVariants, productionRouteId: routeId } });
        }
        let allMaterialBoms = [...savedBoms];
        if (editingSavedBomId) {
          allMaterialBoms = allMaterialBoms.map((b) =>
            b.id === editingSavedBomId
              ? { ...b, name: bomName.trim() || deriveSafeBomName(bomName) || b.name, lines: validBomLines }
              : b
          );
        } else if (validBomLines.length > 0) {
          allMaterialBoms.push({ id: 'active', name: getComposerBomName(), lines: validBomLines });
        }
        for (const b of allMaterialBoms) {
          await persistInventoryBom(createdMaterial.id, 'MATERIAL', b.lines, b.name);
        }
        try {
          localStorage.removeItem(PRODUCT_CREATION_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        } catch {
          // ignore
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['materials'] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
          queryClient.invalidateQueries({ queryKey: ['categories'] }),
          queryClient.invalidateQueries({ queryKey: ['product-families'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        ]);
        router.refresh();

        showToast({
          kind: 'success',
          title: 'Material created successfully',
          message: `“${materialPayload.name}” was added to the catalog${materialPayload.code?.trim() ? ` with code ${materialPayload.code.trim()}` : ''}.`,
        });
        if (viewParam === 'all-items') {
          router.push('/products?view=all-items');
        } else if (familyParam) {
          router.push(`/products?familyId=${familyParam}`);
        } else {
          router.push('/products?type=MATERIAL');
        }
        return;
      }

      const result = await createProduct.mutateAsync(payload);
      createdProductId = result.id;

      const savedProductVariants = await persistProductVariantItems({
        id: result.id,
        sku: result.sku || resolvedSku,
        name: form.name.trim(),
        categoryId: form.parentCategoryId || undefined,
        productFamilyId: form.productFamilyId || undefined,
        uomId: form.uomId,
      }, resolvedVariants);
      await updateProduct.mutateAsync({
        id: result.id,
        metadata: {
          ...((result.metadata || {}) as Record<string, unknown>),
          ...metadata,
          measurementVariants: savedProductVariants,
          variants: savedProductVariants,
        },
      } as any);

      // Persist product measurement variants to ProductVariant table
      for (const [variantIndex, v] of resolvedVariants.entries()) {
        try {
          const variantSku = v.sku.trim() ? v.sku.trim().toUpperCase() : `${result.sku.slice(0, 40)}-V${variantIndex + 1}`;
          const savedVariant = await fetchApi<{ id: string }>('/master-data/products/variants', {
            method: 'POST',
            body: JSON.stringify({
              productId: result.id,
              sku: variantSku,
              name: formatVariantName(form.name, v.name, v.measurementValue),
              size: v.measurementValue || undefined,
              specifications: {
                uomId: v.uomId,
                openingStock: v.openingStock,
                minStockLevel: v.minStockLevel,
                reorderPoint: v.reorderPoint,
                standardPrice: v.standardPrice,
                customFields: v.customFields,
              },
            }),
          });
          v.id = savedVariant.id;
        } catch (err) {
          throw new Error(`Variant "${v.name}" could not be saved: ${friendlyErrorMessage(err) || (err instanceof Error ? err.message : String(err))}`);
        }
      }

      const productRouteId = await persistInventoryRoute(result.id, payload.name, 'PRODUCT');
      await updateProduct.mutateAsync({
        id: result.id,
        metadata: {
          ...metadata,
          productionRouteId: productRouteId,
          productionRouteName: routeName.trim() || undefined,
        },
      } as any);

      let allProductBoms = [...savedBoms];
      if (editingSavedBomId) {
        allProductBoms = allProductBoms.map((b) =>
          b.id === editingSavedBomId
            ? { ...b, name: bomName.trim() || deriveSafeBomName(bomName) || b.name, lines: validBomLines }
            : b
        );
      } else if (validBomLines.length > 0) {
        const alreadyInSaved = shouldDeduplicateComposerBom() && allProductBoms.some((b) => {
          if (b.lines.length !== validBomLines.length) return false;
          return b.lines.every((l) =>
            validBomLines.some((vl) => vl.materialId === l.materialId && Number(vl.quantity) === Number(l.quantity) && vl.uomId === l.uomId)
          );
        });
        if (!alreadyInSaved) {
          allProductBoms.push({ id: 'active', name: getComposerBomName(), lines: validBomLines });
        }
      }

      for (const b of allProductBoms) {
        if (b.lines.length > 0) {
          await persistInventoryBom(result.id, 'PRODUCT', b.lines, b.name);
        }
      }

      try {
        localStorage.removeItem(PRODUCT_CREATION_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      } catch {
        // ignore
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['materials'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['product-families'] }),
        queryClient.invalidateQueries({ queryKey: ['product-routes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: bomKeys.all }),
      ]);
      router.refresh();

      showToast({
        kind: 'success',
        title: 'Item created successfully',
        message: `“${payload.name}” was added to the catalog${payload.sku?.trim() ? ` with SKU ${payload.sku.trim()}` : ''}.`,
      });
      if (viewParam === 'all-items') {
        router.push('/products?view=all-items');
      } else if (familyParam) {
        router.push(`/products?familyId=${familyParam}`);
      } else {
        router.push('/products');
      }
    } catch (err: any) {
      const rawErrMsg = friendlyErrorMessage(err) || (err instanceof Error ? err.message : String(err));
      const notFoundMatch = rawErrMsg.match(/^(Material|Product) \[[^\]]+\] not found\.?$/i);
      const errMsg = notFoundMatch
        ? `${notFoundMatch[1]} "${form.name.trim() || (resolvedItemType === 'PRODUCT' ? 'Product' : 'Material')}" could not be found. Refresh the catalog and try again.`
        : rawErrMsg;

      if (createdMaterialId) {
        try {
          localStorage.removeItem(PRODUCT_CREATION_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        } catch {
          // ignore
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['materials'] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
          queryClient.invalidateQueries({ queryKey: ['categories'] }),
          queryClient.invalidateQueries({ queryKey: ['product-families'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        ]);
        showToast({
          kind: 'error',
          title: 'Material Created — Production Setup Incomplete',
          message: `${form.name.trim()} was saved, but its production route or BOM could not be completed: ${errMsg}`,
        });
        router.push(`/products/new?editId=${encodeURIComponent(createdMaterialId)}&mode=edit&type=MATERIAL`);
        return;
      }

      // If product was created before downstream steps failed (e.g. BOM validation or route creation),
      // roll back and delete the product so the SKU remains available and clean
      if (createdProductId) {
        try {
          await fetchApi(`/master-data/products/${createdProductId}`, { method: 'DELETE' });
        } catch (cleanupErr) {
          console.warn('Rollback delete failed:', cleanupErr);
        }
      }

      if (errMsg.toLowerCase().includes('sku') && (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('taken'))) {
        setFieldErrors((prev) => ({ ...prev, sku: form.sku ? `Product SKU "${form.sku}" is already in use. Please choose a unique SKU.` : 'A unique SKU code is required.' }));
        focusAndScrollToField('field-sku', 'general');
      } else if (errMsg.toLowerCase().includes('dimension mismatch')) {
        setFieldErrors((prev) => ({ ...prev, 'bom-general': errMsg }));
        focusAndScrollToField('bom-table-container', 'bom');
      }

      showToast({
        kind: 'error',
        title: isEditMode ? 'Update Failed' : 'Catalog Registration Failed',
        message: errMsg,
      });
    }
  };

  const isSaving = createProduct.isPending || createMaterial.isPending || updateProduct.isPending || updateMaterial.isPending || uploadImages.isPending;
  const selectedHsn = hsnCodes.data?.items.find((item) => item.code === form.hsnCode);
  const selectedHsnDesc = hsnLookup.data?.description || selectedHsn?.description;
  const hsnOptions = React.useMemo(() => {
    const list = (hsnCodes.data?.items || []).map((item) => ({
      id: item.code,
      name: item.description ? `${item.code} — ${item.description}` : item.code,
      code: item.code,
      description: item.description,
      kind: item.kind,
    }));
    if (form.hsnCode && !list.some((o) => o.code === form.hsnCode)) {
      list.unshift({
        id: form.hsnCode,
        name: selectedHsnDesc ? `${form.hsnCode} — ${selectedHsnDesc}` : form.hsnCode,
        code: form.hsnCode,
        description: selectedHsnDesc || '',
        kind: hsnLookup.data?.kind || 'HSN',
      });
    }
    return list;
  }, [hsnCodes.data?.items, form.hsnCode, selectedHsnDesc, selectedHsn]);
  const hsnDescription = selectedHsnDesc || (form.hsnCode.trim() ? 'No matching HSN/SAC reference found.' : '');

  const routeOptions = (productRoutes.data?.items || []).map((route) => ({
    id: route.id,
    name: route.name,
    code: route.code,
    status: route.status,
    stepCount: (route.steps || []).length,
  }));

  const bomOptions: BomSelectorOption[] = (allSystemBoms.data?.items || []).map((bom) => ({
    id: bom.id,
    name: `${bom.bomNumber || `BOM v${bom.version}`} — ${bom.product?.name || bom.material?.name || bom.product?.sku || bom.material?.code || 'BOM'}`,
    code: `v${bom.version}`,
    status: bom.status,
    productName: bom.product?.name || bom.material?.name,
    productSku: bom.product?.sku || bom.material?.code,
  }));

  const selectedUomObj = allUoms.find((u) => u.id === form.uomId);
  const selectedBreadcrumbFamily = families.data?.items.find(
    (family) => family.id === familyParam || family.code === familyParam,
  );
  const selectedBreadcrumbCategory = categories.data?.items.find(
    (category) => category.id === categoryParam,
  );
  const hierarchyCrumb = familyParam
    ? {
      label: selectedBreadcrumbFamily?.name || 'Sub Category',
      href: `/products?${typeParam === 'MATERIAL' ? 'type=MATERIAL&' : ''}familyId=${encodeURIComponent(familyParam)}`,
    }
    : categoryParam
      ? {
        label: selectedBreadcrumbCategory?.name || 'Category',
        href: `/products?${typeParam === 'MATERIAL' ? 'type=MATERIAL&' : ''}categoryId=${encodeURIComponent(categoryParam)}`,
      }
      : null;

  return (
    <>
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-50/60 dark:bg-slate-950 min-h-screen">
        <div className="w-full max-w-[1780px] mx-auto space-y-6">

          {/* 1. COMPACT TOP HEADER & NAVIGATION */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Link href="/products" className="hover:text-primary transition-colors text-xs font-semibold">
                  Inventory
                </Link>
                {hierarchyCrumb && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <Link
                      href={hierarchyCrumb.href}
                      className="hover:text-primary transition-colors text-xs font-semibold"
                    >
                      {hierarchyCrumb.label}
                    </Link>
                  </>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-bold text-foreground text-xs bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {isEditMode ? 'Edit Inventory' : 'Create Inventory'}
                </span>
              </nav>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight font-manrope">
                  {isEditMode ? 'Edit Inventory' : 'Create Inventory'}
                </h1>
                {form.sku && isCustomSku(form.sku) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                    {form.sku}
                  </span>
                )}
                {!isEditMode && draftSavedAt && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Draft auto-saved</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="h-10 rounded-xl text-xs font-bold px-4 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                icon={ArrowLeft}
              >
                Back to Inventory
              </Button>
              {!isEditMode && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(PRODUCT_CREATION_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
                    } catch {
                      // ignore
                    }
                    setForm(INITIAL_FORM);
                    setBomLines([]);
                    setCustomFields([{ name: '', value: '' }]);
                    setTechnicalFields([{ name: '', value: '' }]);
                    setPricingMasterId('');
                    setPricingFields([]);
                    routeLoadRequestRef.current += 1;
                    setIsLoadingRoute(false);
                    setRouteBaseline(null);
                    setRouteSteps([]);
                    setRouteName('');
                    setSelectedRouteId('');
                    setTierPricing([]);
                    setImageFiles([]);
                    setImagePreviews([]);
                    setMrp('');
                    setMeasurementVariants([createEmptyMeasurementVariant()]);
                  }}
                  className="h-10 rounded-xl text-xs font-bold px-4 text-muted-foreground hover:text-foreground border-slate-200 dark:border-slate-800"
                  icon={RotateCcw}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
          {/* RESTORED DRAFT NOTICE BANNER */}
          {!isEditMode && isDraftRestored && draftSavedAt && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>
                  <strong>Resumed Product Draft:</strong> Auto-saved progress restored from{' '}
                  <span className="font-semibold">{new Date(draftSavedAt).toLocaleString('en-IN')}</span>. You can continue filling details or discard the draft.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(PRODUCT_CREATION_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
                    } catch {
                      // ignore
                    }
                    setForm(INITIAL_FORM);
                    setBomLines([]);
                    setCustomFields([{ name: '', value: '' }]);
                    setTechnicalFields([{ name: '', value: '' }]);
                    setPricingMasterId('');
                    setPricingFields([]);
                    routeLoadRequestRef.current += 1;
                    setIsLoadingRoute(false);
                    setRouteBaseline(null);
                    setRouteSteps([]);
                    setRouteName('');
                    setTierPricing([]);
                    setImageFiles([]);
                    setImagePreviews([]);
                    setMrp('');
                    setSelectedRouteId('');
                    setSelectedBomVersionId('');
                    setMeasurementVariants([createEmptyMeasurementVariant()]);
                    setDraftSavedAt(null);
                    setIsDraftRestored(false);
                    showToast({
                      kind: 'info',
                      title: 'Draft Discarded',
                      message: 'Product creation draft was cleared and form reset.',
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg font-bold text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                >
                  Discard Draft
                </button>
                <button
                  type="button"
                  onClick={() => setIsDraftRestored(false)}
                  className="px-2.5 py-1 rounded-lg font-bold text-blue-700 hover:text-blue-900 dark:text-blue-300 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* 2. SECTION FILTER TABS */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Sections', icon: Layers },
              { id: 'general', label: 'Identity & Media', icon: Package },
              { id: 'pricing', label: 'Pricing & GST', icon: Calculator, badge: numMrp > 0 ? `₹${numMrp}` : undefined },
              { id: 'routing', label: 'Routing & Schedule', icon: GitBranch, badge: routeSteps.length > 0 ? `${routeSteps.length}` : undefined },
              { id: 'specs', label: 'Technical Specs', icon: Wrench, badge: technicalFields.filter(f => f.name).length > 0 ? `${technicalFields.filter(f => f.name).length}` : undefined },
              { id: 'inventory', label: 'Inventory & Planning', icon: Database, badge: selectedUomObj?.code },
              { id: 'bom', label: 'BOM Formulation', icon: Settings2, badge: savedBoms.length > 0 ? `${savedBoms.length + (bomLines.length > 0 ? 1 : 0)} BOMs` : (bomLines.length > 0 ? `${bomLines.length}` : undefined) },
              { id: 'variants', label: 'Variants & Measurements', icon: Boxes, badge: measurementVariants.length > 0 ? `${measurementVariants.length}` : undefined },
            ].map((tab, tabIndex) => {
              const isActive = activeSectionTab === tab.id;
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSectionTab(tab.id as typeof activeSectionTab)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-2 ${isActive
                    ? 'bg-primary text-white shadow-sm shadow-primary/25'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                >
                  <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{tab.id === 'all' ? tab.label : `${tabIndex}. ${tab.label}`}</span>
                  {tab.badge && (
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* MAIN FORM CONTAINER */}
          <form
            onSubmit={handleSubmit}
            className="space-y-6 font-manrope"
          >

            {/* =========================================================================
                SECTION 01: GENERAL IDENTITY, TAXONOMY & PRODUCT MEDIA (INTEGRATED)
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'general') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-xs font-black shadow-xs ring-4 ring-primary/10 shrink-0">
                      01
                    </div>
                    <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      General Identity, Classification &amp; Media
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSpecialModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-bold transition-all cursor-pointer shadow-2xs"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                      <span>Special Presets</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleSection('general')}
                      aria-expanded={!collapsedSections.general}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {collapsedSections.general ? 'Expand' : 'Collapse'}
                      </span>
                      {collapsedSections.general ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className={collapsedSections.general ? 'hidden' : 'p-6 space-y-6'}>
                  {/* Integrated Grid: 7-Cols Form Details + 5-Cols Product Media */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* LEFT 7 COLUMNS: TEXT & TAXONOMY INPUTS */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* Row 1: Item Name */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                            {itemClassification === 'PRODUCT' ? 'Product Name' : 'Material Name'} <span className="text-destructive font-black">*</span>
                          </label>
                          <input
                            id="field-name"
                            type="text"
                            required
                            placeholder={itemClassification === 'PRODUCT' ? 'e.g. 3-Tier Heavy Duty Cloth Drying Stand' : 'e.g. Stainless Steel Pipe 10x20mm'}
                            value={form.name}
                            onChange={(e) => {
                              handleChange('name', e.target.value);
                              clearFieldError('name');
                            }}
                            className={`w-full h-11 px-4 rounded-xl border ${fieldErrors.name
                              ? 'border-destructive ring-2 ring-destructive/20 bg-destructive/5'
                              : 'border-slate-300 dark:border-slate-700'
                              } bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
                          />
                          {fieldErrors.name && (
                            <p className="mt-1 text-xs font-semibold text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {fieldErrors.name}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Catalog SKU, Parent Category & Sub Category */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                            {itemClassification === 'PRODUCT' ? 'Catalog SKU' : 'Material Code / SKU'}
                          </label>
                          <input
                            id="field-sku"
                            type="text"
                            placeholder=""
                            value={form.sku}
                            onChange={(e) => {
                              handleChange('sku', e.target.value.toUpperCase());
                              clearFieldError('sku');
                            }}
                            className={`w-full h-11 px-4 font-mono font-bold uppercase rounded-xl border ${fieldErrors.sku
                              ? 'border-destructive ring-2 ring-destructive/20 bg-destructive/5'
                              : 'border-slate-300 dark:border-slate-700'
                              } bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
                          />
                          {fieldErrors.sku && (
                            <p className="mt-1 text-xs font-semibold text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {fieldErrors.sku}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                            <span>
                              {itemClassification === 'PRODUCT' ? 'Parent Category' : 'Category'}{' '}
                              {itemClassification === 'PRODUCT' && (
                                <span className="text-destructive font-black">*</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => setInlineMasterData('category')}
                              className="text-xs font-bold text-primary hover:underline cursor-pointer"
                            >
                              + New
                            </button>
                          </label>
                          <select
                            id="field-parentCategoryId"
                            required={itemClassification === 'PRODUCT'}
                            value={form.parentCategoryId}
                            onChange={(e) => {
                              const nextCategoryId = e.target.value;
                              setForm((current) => current.parentCategoryId === nextCategoryId
                                ? current
                                : { ...current, parentCategoryId: nextCategoryId, productFamilyId: '' });
                              const chosenCategory = categories.data?.items.find((category) => category.id === nextCategoryId);
                              const nextType = getItemTypeForCategory(chosenCategory);
                              if (nextType && !isEditMode) {
                                setItemClassification(nextType);
                                if (nextType === 'MATERIAL') {
                                  setMaterialType(getMaterialTypeForCategory(chosenCategory));
                                  setActiveSectionTab((curr) => (curr === 'routing' || curr === 'bom' ? 'all' : curr));
                                }
                              }
                              clearFieldError('parentCategoryId');
                            }}
                            className={`w-full h-11 px-4 rounded-xl border ${fieldErrors.parentCategoryId
                              ? 'border-destructive ring-2 ring-destructive/20 bg-destructive/5'
                              : 'border-slate-300 dark:border-slate-700'
                              } bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
                          >
                            <option value="">
                              {categories.isLoading ? 'Loading categories...' : 'Select Category'}
                            </option>
                            {categories.data?.items.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                          {isEditMode && editEntityType === 'MATERIAL' && categoryItemType === 'PRODUCT' && (
                            <p className="mt-1.5 text-xs text-primary">
                              Saving this Finished Goods category converts the material into a Product and updates its category and subcategory fields.
                            </p>
                          )}
                          {fieldErrors.parentCategoryId && (
                            <p className="mt-1 text-xs font-semibold text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {fieldErrors.parentCategoryId}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                            <span>
                              Sub Category{' '}
                              {form.parentCategoryId && (
                                <span className="text-destructive font-black">*</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => setInlineMasterData('family')}
                              className="text-xs font-bold text-primary hover:underline cursor-pointer"
                            >
                              + New
                            </button>
                          </label>
                          <select
                            id="field-productFamilyId"
                            required={Boolean(form.parentCategoryId)}
                            value={form.productFamilyId}
                            onChange={(e) => {
                              handleChange('productFamilyId', e.target.value);
                              clearFieldError('productFamilyId');
                            }}
                            disabled={!form.parentCategoryId || families.isLoading}
                            className={`w-full h-11 px-4 rounded-xl border ${fieldErrors.productFamilyId
                              ? 'border-destructive ring-2 ring-destructive/20 bg-destructive/5'
                              : 'border-slate-300 dark:border-slate-700'
                              } bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white disabled:opacity-50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
                          >
                            <option value="">
                              {!form.parentCategoryId
                                ? 'Select category first'
                                : families.isLoading
                                  ? 'Loading sub-categories...'
                                  : 'Select Sub Category'}
                            </option>
                            {families.data?.items.map((family) => (
                              <option key={family.id} value={family.id}>
                                {family.name}
                              </option>
                            ))}
                          </select>
                          {fieldErrors.productFamilyId && (
                            <p className="mt-1 text-xs font-semibold text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {fieldErrors.productFamilyId}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Amazon ASIN & Global EAN-13 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                            Amazon ASIN
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. B08N5WRWNW"
                            value={form.asin}
                            onChange={(e) => handleChange('asin', e.target.value.toUpperCase())}
                            className="w-full h-11 px-4 font-mono text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                            Global EAN-13 Barcode
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 8901234567890"
                            value={form.ean13}
                            onChange={(e) => handleChange('ean13', e.target.value)}
                            className="w-full h-11 px-4 font-mono text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      {/* Row 4: Product / Material Description & Scope */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>{itemClassification === 'MATERIAL' ? 'Material Description & Scope' : 'Product Description & Scope'}</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                              Quick:
                            </span>
                            {[
                              { label: '+ Dimensions', snippet: '• Dimensions: ' },
                              { label: '+ Material Grade', snippet: '• Material / Grade: ' },
                              { label: '+ Key Features', snippet: '• Key Features: ' },
                            ].map((chip) => (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={() => appendDescriptionSnippet(chip.snippet)}
                                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors cursor-pointer shadow-2xs"
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          rows={4}
                          placeholder={
                            itemClassification === 'MATERIAL'
                              ? "Provide technical material specifications, physical grade, storage conditions, or usage scope..."
                              : "Provide detailed functional overview, key industrial dimensions, or manufacturing instructions..."
                          }
                          value={form.description}
                          onChange={(e) => handleChange('description', e.target.value)}
                          className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y transition-all leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* RIGHT 5 COLUMNS: COMPACT & MINIMAL PRODUCT MEDIA */}
                    <div className="lg:col-span-5 space-y-3">
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              <ImagePlus className="w-4 h-4" />
                            </span>
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                              Product Media
                            </h3>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                            {imagePreviews.length}/12 Photos
                          </span>
                        </div>

                        {/* Minimal Media Dropzone */}
                        <label
                          htmlFor="product-media-upload"
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsMediaDragging(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            setIsMediaDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsMediaDragging(false);
                            const files = Array.from(e.dataTransfer.files || []);
                            addFilesToPreviews(files);
                          }}
                          className={`group relative flex flex-col items-center justify-center py-4 px-4 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center ${isMediaDragging
                              ? 'border-primary bg-primary/10 scale-[1.01]'
                              : 'border-slate-300 dark:border-slate-700 hover:border-primary bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                        >
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mb-1.5 transition-transform shadow-2xs ${isMediaDragging
                              ? 'scale-110 bg-primary/20 border-primary text-primary'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 group-hover:scale-105'
                            }`}>
                            <UploadCloud className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {isMediaDragging ? 'Drop images here' : 'Click or Drag & Drop Images'}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            PNG, JPG, WEBP, SVG • Max 10MB per file
                          </span>
                          <input
                            id="product-media-upload"
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="sr-only"
                          />
                        </label>

                        {/* Existing Saved Catalog Images */}
                        {existingImages.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-600 dark:text-slate-400">
                                Current Catalog Images ({existingImages.length})
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Saved in Master
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {existingImages.map((img, idx) => (
                                <div
                                  key={`existing-${idx}`}
                                  className="group relative aspect-square rounded-lg border overflow-hidden bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={img.url} alt={img.fileName || 'Catalog photo'} className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => setExistingImages((prev) => prev.filter((_, i) => i !== idx))}
                                    className="absolute right-1 top-1 p-1 rounded bg-black/75 hover:bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                                    title="Remove photo"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Minimal Image Previews Grid (Only shown when new images are picked) */}
                        {imagePreviews.length > 0 ? (
                          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-600 dark:text-slate-400">
                                Newly Selected Photos ({imagePreviews.length})
                              </span>
                              <span className="text-[10px] text-slate-400">
                                First photo is cover
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {imagePreviews.map(({ file, url }, idx) => (
                                <div
                                  key={`${file.name}-${idx}`}
                                  className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-100 dark:bg-slate-800 transition-all ${idx === 0
                                      ? 'border-primary ring-2 ring-primary/20'
                                      : 'border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={file.name} className="w-full h-full object-cover" />
                                  {idx === 0 ? (
                                    <span className="absolute left-1 top-1 text-[8px] font-black bg-primary text-white px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                                      <Star className="w-2 h-2 fill-current" />
                                      COVER
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setAsPrimary(idx)}
                                      className="absolute left-1 top-1 text-[8px] font-bold bg-black/75 hover:bg-primary text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                                      title="Set as primary cover photo"
                                    >
                                      Cover
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeImage(file, url)}
                                    className="absolute right-1 top-1 p-1 rounded bg-black/75 hover:bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                                    title="Remove photo"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                  <div className="absolute inset-x-0 bottom-0 p-0.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-[8px] text-white truncate px-0.5 font-mono">
                                      {file.name}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                            <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>First uploaded image will automatically serve as catalog cover.</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Commercial Codes & Custom Identifiers (Dynamic) */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-primary" />
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                            Commercial Codes &amp; Custom Marketplace Tags
                          </label>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addCustomField}
                        className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                      >
                        <Plus className="h-4 w-4" /> Add Identifier
                      </button>
                    </div>

                    {customFields.length > 0 && (
                      <div className="space-y-2.5">
                        {customFields.map((field, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_44px] items-center gap-3"
                          >
                            <input
                              type="text"
                              value={field.name}
                              onChange={(event) => updateCustomField(index, 'name', event.target.value)}
                              placeholder="e.g. Flipkart FSN, Color Code"
                              className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                            <input
                              type="text"
                              value={field.value}
                              onChange={(event) => updateCustomField(index, 'value', event.target.value)}
                              placeholder="Enter value"
                              className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => removeCustomField(index)}
                              aria-label="Remove identifier"
                              className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 02: COMMERCIAL PRICING MATRIX, GLOBAL DISCOUNTS & CUSTOMER TIERS
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'pricing') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-xs font-black shadow-xs ring-4 ring-primary/10 shrink-0">
                      02
                    </div>
                    <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      Commercial Pricing Matrix, Customer Tiers &amp; GST
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('pricing')}
                      aria-expanded={!collapsedSections.pricing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {collapsedSections.pricing ? 'Expand' : 'Collapse'}
                      </span>
                      {collapsedSections.pricing ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className={collapsedSections.pricing ? 'hidden' : 'p-6 space-y-6'}>

                  {/* 1. BASE PRICING CONFIGURATION */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-3">
                      <Calculator className="h-4 w-4 text-primary" />
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Base Catalog Pricing
                        </h3>
                      </div>
                    </div>

                    <div className="max-w-md">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                        {isRawMaterialCategory ? 'Cost Price' : 'Maximum Retail Price (MRP)'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-sm font-bold text-slate-400">₹</span>
                        <input
                          id="field-mrp"
                          type="number"
                          min="0"
                          step="1"
                          value={!mrp || mrp === '0' ? '' : mrp}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMrp(val);
                            const parsedVal = parseFloat(val) || 0;
                            setTierPricing((current) =>
                              current.map((t) => {
                                if (!t.isCustomPrice && (t.masterPrice === 0 || t.masterPrice === numMrp)) {
                                  return { ...t, masterPrice: parsedVal };
                                }
                                return t;
                              })
                            );
                          }}
                          onWheel={(e) =>
                            handleNumberInputWheel(e, mrp, (val) => {
                              setMrp(val);
                              const parsedVal = parseFloat(val) || 0;
                              setTierPricing((current) =>
                                current.map((t) => {
                                  if (!t.isCustomPrice && (t.masterPrice === 0 || t.masterPrice === numMrp)) {
                                    return { ...t, masterPrice: parsedVal };
                                  }
                                  return t;
                                })
                              );
                            })
                          }
                          onKeyDown={(e) =>
                            handleNumberInputKeyDown(e, mrp, (val) => {
                              setMrp(val);
                              const parsedVal = parseFloat(val) || 0;
                              setTierPricing((current) =>
                                current.map((t) => {
                                  if (!t.isCustomPrice && (t.masterPrice === 0 || t.masterPrice === numMrp)) {
                                    return { ...t, masterPrice: parsedVal };
                                  }
                                  return t;
                                })
                              );
                            })
                          }
                          placeholder="0.00"
                          className="w-full h-11 pl-8 pr-4 font-mono text-sm font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. CUSTOMER PRICING TIERS MATRIX (Dealer, E-Trade, Customer, etc.) */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xs">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <BadgePercent className="h-4 w-4 text-primary" />
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            Customer Pricing Tiers Matrix
                          </h3>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <select
                          value={pricingMasterId}
                          onChange={(event) => importPricingMaster(event.target.value)}
                          className="h-10 min-w-48 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                        >
                          <option value="">Choose Pricing Master</option>
                          {(Array.isArray(pricingMasters.data) ? pricingMasters.data : pricingMasters.data?.items || []).map((master) => (
                            <option key={master.id} value={master.id}>
                              {master.name} ({master.tiers?.length || 0} tiers)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsPricingLevelModalOpen(true)}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <Tag className="h-3.5 w-3.5 text-primary" /> + Level
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push('/products/pricing-masters/new?from=product-draft')}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/50 bg-primary px-3.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
                        >
                          Open pricing master setup <ArrowUpRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full min-w-[760px] text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="px-4 py-3.5">Customer Level / Tier</th>
                            <th className="px-4 py-3.5 w-40">Price (₹)</th>
                            <th className="px-4 py-3.5 w-40">Tier Discount (%)</th>
                            <th className="px-4 py-3.5 w-52">Applied Price (₹)</th>
                            <th className="w-14 px-4 py-3.5 text-center" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {tierPricing.map((tier, index) => {
                            const calcPrice = computeTierPrice(tier);
                            return (
                              <tr key={tier.tierId || index} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-4 py-3">
                                  <select
                                    value={tier.tierName}
                                    onChange={(e) => {
                                      const newName = e.target.value;
                                      updateTierPricingItem(index, {
                                        tierName: newName,
                                        level: newName,
                                        tierCode: newName ? newName.toUpperCase().replace(/[^A-Z0-9]+/g, '_') : 'CUSTOM',
                                      });
                                    }}
                                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                                  >
                                    <option value="" disabled>Select Level...</option>
                                    {pricingLevels.map((lvl) => (
                                      <option key={lvl} value={lvl}>
                                        {lvl}
                                      </option>
                                    ))}
                                    {tier.tierName && !pricingLevels.includes(tier.tierName) && (
                                      <option value={tier.tierName}>{tier.tierName}</option>
                                    )}
                                  </select>
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={!tier.masterPrice ? '' : tier.masterPrice}
                                    onChange={(e) => updateTierPricingItem(index, { masterPrice: e.target.value === '' ? 0 : Number(e.target.value) || 0 })}
                                    onWheel={(e) => handleNumberInputWheel(e, tier.masterPrice, (val) => updateTierPricingItem(index, { masterPrice: Number(val) || 0 }))}
                                    onKeyDown={(e) => handleNumberInputKeyDown(e, tier.masterPrice, (val) => updateTierPricingItem(index, { masterPrice: Number(val) || 0 }))}
                                    placeholder="0"
                                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-sm font-black"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="1"
                                      disabled={tier.isCustomPrice}
                                      value={!tier.discountPercentage ? '' : tier.discountPercentage}
                                      onChange={(e) =>
                                        updateTierPricingItem(index, {
                                          discountPercentage: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0,
                                        })
                                      }
                                      onWheel={(e) =>
                                        handleNumberInputWheel(
                                          e,
                                          tier.discountPercentage,
                                          (val) => updateTierPricingItem(index, { discountPercentage: parseFloat(val) || 0 }),
                                          { min: 0, max: 100 }
                                        )
                                      }
                                      onKeyDown={(e) =>
                                        handleNumberInputKeyDown(
                                          e,
                                          tier.discountPercentage,
                                          (val) => updateTierPricingItem(index, { discountPercentage: parseFloat(val) || 0 }),
                                          { min: 0, max: 100 }
                                        )
                                      }
                                      placeholder="0"
                                      className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3.5 pr-7 text-sm font-black text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3"><span className="font-mono text-sm font-black text-primary">₹{calcPrice.toFixed(2)}</span></td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeTierPricingItem(index)}
                                    aria-label="Remove tier"
                                    className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors cursor-pointer mx-auto"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {tierPricing.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                                <div className="flex min-h-24 flex-col items-center justify-center gap-3">
                                  <p className="font-medium text-slate-700 dark:text-slate-300">No customer pricing tiers active in this product catalog item.</p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => addCustomTierItem(pricingLevels[0] || 'Dealer')}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                    >
                                      <Plus className="h-4 w-4" /> Add Tier
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIsPricingLevelModalOpen(true)}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                    >
                                      <Tag className="h-3.5 w-3.5 text-primary" /> + Level
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {tierPricing.length > 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => addCustomTierItem(pricingLevels[0] || 'Dealer')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <Plus className="h-4 w-4" /> Add Tier
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPricingLevelModalOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <Tag className="h-3.5 w-3.5 text-primary" /> Manage Levels
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3. CUSTOM PRICING MASTER FIELDS (If any) */}
                  {pricingFields.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-5 space-y-4">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Custom Master Pricing Attributes
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Additional pricing parameters imported from the selected pricing schema.
                        </p>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="px-4 py-3">Pricing column</th>
                              <th className="px-4 py-3">Pricing value</th>
                              <th className="w-14 px-4 py-3 text-center" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pricingFields.map((field, index) => (
                              <tr key={index}>
                                <td className="px-4 py-2.5">
                                  <input
                                    readOnly
                                    value={field.name}
                                    className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                                  />
                                </td>
                                <td className="px-4 py-2.5">
                                  <input
                                    value={field.value}
                                    onChange={(event) => updatePricingField(index, { value: event.target.value })}
                                    placeholder="Enter pricing value"
                                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-sm font-semibold text-slate-900 dark:text-white"
                                  />
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removePricingField(index)}
                                    aria-label="Remove pricing field"
                                    className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-destructive mx-auto"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 4. STATUTORY TAX COMPLIANCE & HSN */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${isTaxable ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                      <div id="field-hsnCode" aria-required="true" aria-invalid={Boolean(fieldErrors.hsnCode)}>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                          HSN / SAC Code <span className="text-red-600" aria-hidden="true">*</span>
                        </label>
                        <SearchableSelector
                          value={form.hsnCode}
                          onChange={(value) => handleChange('hsnCode', value)}
                          options={hsnOptions}
                          searchTerm={hsnSearchTerm}
                          onSearchTermChange={setHsnSearchTerm}
                          isLoading={hsnCodes.isLoading}
                          error={hsnCodes.error as Error | null}
                          placeholder="Search HSN/SAC code"
                          allowCustom
                          renderOption={(option) => (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900 dark:text-white text-xs">{option.code}</span>
                              <span className="text-[10px] text-slate-400 line-clamp-2">{option.description}</span>
                            </div>
                          )}
                        />
                        <p className={`mt-1 text-xs ${selectedHsnDesc ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                          {hsnLookup.isFetching ? 'Fetching description…' : hsnDescription}
                        </p>
                        {fieldErrors.hsnCode && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.hsnCode}</p>}
                      </div>

                      <div id="field-taxability">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                          Taxability <span className="text-red-600" aria-hidden="true">*</span>
                        </label>
                        <select
                          required
                          aria-invalid={Boolean(fieldErrors.taxability)}
                          value={form.taxability}
                          onChange={(e) => handleChange('taxability', e.target.value)}
                          className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                          <option value="Taxable">Taxable</option>
                          <option value="Exempt">Exempt</option>
                          <option value="Nil Rated">Nil Rated</option>
                          <option value="Non-GST">Non-GST</option>
                        </select>
                        {fieldErrors.taxability && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.taxability}</p>}
                      </div>

                      {isTaxable && <div id="field-gstRate">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                          GST Rate (%) <span className="text-red-600" aria-hidden="true">*</span>
                        </label>
                        <select
                          required
                          aria-invalid={Boolean(fieldErrors.gstRate)}
                          value={form.gstRate}
                          onChange={(e) => handleChange('gstRate', e.target.value)}
                          className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                          <option value="18">18% (Standard Industrial Goods)</option>
                          <option value="12">12% (Concessional Articles)</option>
                          <option value="28">28% (Luxury Classification)</option>
                          <option value="5">5% (Raw Hardware Parts)</option>
                        </select>
                        {fieldErrors.gstRate && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.gstRate}</p>}
                      </div>}

                      <div id="field-productType">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                          Product Type <span className="text-red-600" aria-hidden="true">*</span>
                        </label>
                        <select
                          required
                          aria-invalid={Boolean(fieldErrors.productType)}
                          value={form.productType}
                          onChange={(e) => handleChange('productType', e.target.value)}
                          className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                          <option value="Goods">Goods (Physical Inventory)</option>
                          <option value="Services">Services</option>
                        </select>
                        {fieldErrors.productType && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.productType}</p>}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 03: PRODUCTION ROUTING & SHOP FLOOR WORKFLOW
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'routing') && (
              <div id="section-routing" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden scroll-mt-6">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-xs font-black shadow-xs ring-4 ring-primary/10 shrink-0">
                      03
                    </div>
                    <div>
                      <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                        Production Route &amp; Operations Workflow
                      </h2>
                      <p className="mt-0.5 text-[10px] text-slate-400">Ctrl/Cmd+Alt+R: Go to route · Ctrl/Cmd+Alt+Enter: Add step</p>
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap items-end gap-2.5 xl:w-auto xl:flex-nowrap">
                    {(routeSteps.length > 0 || Boolean(selectedRouteId)) && (
                      <div className="w-full sm:w-[230px] sm:flex-none">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Production Route Name</label>
                        <input
                          value={routeName}
                          onChange={(event) => setRouteName(event.target.value)}
                          disabled={isLoadingRoute}
                          maxLength={150}
                          placeholder="e.g. Standard Assembly Route"
                          className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    )}
                    <div className="w-full sm:w-[360px] sm:flex-none">
                      <SearchableSelector
                        value={selectedRouteId}
                        onChange={(value) => {
                          setSelectedRouteId(value);
                          if (value) {
                            const route = (productRoutes.data?.items || []).find((item) => item.id === value);
                            setRouteName(route?.name || '');
                            handleAutoFeedRoute(value);
                          } else {
                            routeLoadRequestRef.current += 1;
                            setIsLoadingRoute(false);
                            setRouteBaseline(null);
                            setRouteSteps([]);
                            setRouteName('');
                          }
                        }}
                        options={routeOptions}
                        showOptionCode={false}
                        isLoading={productRoutes.isLoading}
                        error={productRoutes.error as Error | null}
                        placeholder="Search existing route..."
                        size="sm"
                        renderOption={(option) => (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">{option.name}</span>
                            <span className="text-[10px] text-slate-400">{option.stepCount} department steps</span>
                          </div>
                        )}
                      />
                    </div>
                    <Link
                      href="/inventory/routing/new?from=product-draft"
                      className="inline-flex items-center gap-2 rounded-xl border border-primary/50 bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
                    >
                      Open production route setup <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                <div className={collapsedSections.routing ? 'hidden' : 'p-6 space-y-4'}>
                  {routeSteps.length === 0 ? (
                    <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 p-8 dark:bg-slate-800/20">
                      <button
                        type="button"
                        onClick={addRouteStep}
                        title="Add a route step (Ctrl/Cmd + Alt + Enter)"
                        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Plus className="h-4 w-4" /> Add Step
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="hidden lg:grid lg:grid-cols-[48px_1.3fr_1fr_130px_44px] gap-3 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <span className="text-center">Seq</span>
                        <span>Operation / Step Name</span>
                        <span>Assigned Department</span>
                        <span>Takt Duration</span>
                        <span className="text-center">Action</span>
                      </div>

                      <div className="space-y-2.5">
                        {routeSteps.map((step, index) => (
                          <div
                            key={step.id}
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData('route-index', String(index))}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              const from = Number(event.dataTransfer.getData('route-index'));
                              if (Number.isInteger(from) && from !== index) moveRouteStep(from, index);
                            }}
                            className="grid gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-3.5 lg:grid-cols-[48px_1.3fr_1fr_130px_44px] lg:items-center hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                          >
                            <div
                              className="flex h-10 w-10 cursor-grab items-center justify-center rounded-xl bg-primary text-xs font-black text-white shadow-xs mx-auto"
                              title="Drag step to reorder sequence"
                            >
                              {index + 1}
                            </div>

                            <div>
                              <input
                                required
                                value={step.stepName}
                                onChange={(event) => updateRouteStep(step.id, { stepName: event.target.value })}
                                placeholder="e.g. Laser Cutting, Pipe Bending, Polishing"
                                className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                              />
                            </div>

                            <div>
                              <select
                                required
                                value={step.departmentId}
                                onChange={(event) => updateRouteStep(step.id, { departmentId: event.target.value })}
                                className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                              >
                                <option value="">Select Department</option>
                                {productionDepartments.map((department) => (
                                  <option
                                    key={department.id}
                                    value={department.id}
                                    disabled={department.id !== step.departmentId && routeSteps.some((other) => other.id !== step.id && other.departmentId === department.id)}
                                  >
                                    {department.code} — {department.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={!step.durationMinutes || step.durationMinutes === '0' ? '' : step.durationMinutes}
                                onChange={(event) => updateRouteStep(step.id, { durationMinutes: event.target.value })}
                                onWheel={(e) => handleNumberInputWheel(e, step.durationMinutes, (val) => updateRouteStep(step.id, { durationMinutes: val }))}
                                onKeyDown={(e) => handleNumberInputKeyDown(e, step.durationMinutes, (val) => updateRouteStep(step.id, { durationMinutes: val }))}
                                placeholder="0"
                                className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3.5 pr-8 font-mono text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                              />
                              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">min</span>
                            </div>

                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={() => removeRouteStep(step.id)}
                                aria-label="Remove step"
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-destructive/10 hover:text-destructive cursor-pointer transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={addRouteStep}
                          title="Add a route step (Ctrl/Cmd + Alt + Enter)"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <Plus className="h-4 w-4" /> Add Step
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            routeLoadRequestRef.current += 1;
                            setIsLoadingRoute(false);
                            setRouteBaseline(null);
                            setRouteSteps([]);
                            setSelectedRouteId('');
                            setRouteName('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                          title="Clear all steps"
                        >
                          <Trash2 className="h-4 w-4" /> Clear Route
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAndAddRoute}
                          disabled={!canSaveRoute}
                          title={routeNameAlreadyExists ? 'Choose a different production route name.' : undefined}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3.5 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                        >
                          <Save className="h-4 w-4" /> {isSavingRoute ? 'Saving Route…' : 'Save & Add Route'}
                        </button>
                        {routeNameAlreadyExists && <span className="text-xs text-red-600">A production route with this name already exists. Choose a different name.</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 04: TECHNICAL & ENGINEERING SPECIFICATIONS
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'specs') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-xs font-black shadow-xs ring-4 ring-primary/10 shrink-0">
                      04
                    </div>
                    <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      Engineering &amp; Technical Specifications
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleSection('specs')}
                    aria-expanded={!collapsedSections.specs}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                  >
                    <span className="text-[11px] font-medium hidden sm:inline">
                      {collapsedSections.specs ? 'Expand' : 'Collapse'}
                    </span>
                    {collapsedSections.specs ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </button>
                </div>

                <div className={collapsedSections.specs ? 'hidden' : 'p-6 space-y-4'}>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-700/80 pb-3">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Custom Technical Parameters
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={addTechnicalField}
                        className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                      >
                        <Plus className="h-4 w-4" /> Add Attribute
                      </button>
                    </div>

                    <div className="space-y-3">
                      {technicalFields.map((field, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_44px] sm:items-center"
                        >
                          <input
                            type="text"
                            value={field.name}
                            onChange={(event) => updateTechnicalField(index, 'name', event.target.value)}
                            placeholder="e.g. Steel Grade, Pipe Diameter, Load Capacity"
                            className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <input
                            type="text"
                            value={field.value}
                            onChange={(event) => updateTechnicalField(index, 'value', event.target.value)}
                            placeholder="Enter parameter value (e.g. AISI 304 High Gloss, 25mm OD)"
                            className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            type="button"
                            onClick={() => removeTechnicalField(index)}
                            aria-label="Remove technical attribute"
                            className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-destructive/10 hover:text-destructive cursor-pointer transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 05: INVENTORY & STOCK PLANNING
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'inventory') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-xs font-black shadow-xs ring-4 ring-primary/10 shrink-0">
                      05
                    </div>
                    <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      Inventory &amp; Stock Planning
                    </h2>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {form.hasMultipleUoms && (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          if (collapsedSections.inventory) {
                            toggleSection('inventory');
                          }
                          if (!form.uomId) {
                            setFieldErrors((prev) => ({ ...prev, uomId: 'Please select Primary UOM (Base) first' }));
                            return;
                          }
                          setIsUomRelationModalOpen(true);
                        }}
                        className="h-8 rounded-xl text-xs font-bold gap-1.5 border border-primary/50 bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
                        icon={form.uomRelations && form.uomRelations.length > 0 ? ArrowLeftRight : Plus}
                      >
                        {form.uomRelations && form.uomRelations.length > 0
                          ? 'Configure Relations'
                          : 'Establish Relation'}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSection('inventory')}
                      aria-expanded={!collapsedSections.inventory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {collapsedSections.inventory ? 'Expand' : 'Collapse'}
                      </span>
                      {collapsedSections.inventory ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
                <div className={collapsedSections.inventory ? 'hidden' : 'p-6 space-y-4'}>
                  {/* Multiple UOM checkbox slightly above the field */}
                  <div className="flex items-center">
                    <label
                      htmlFor="checkbox-hasMultipleUoms"
                      className="inline-flex items-center gap-2 cursor-pointer select-none group"
                    >
                      <Checkbox
                        id="checkbox-hasMultipleUoms"
                        checked={Boolean(form.hasMultipleUoms)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((current) => ({
                            ...current,
                            hasMultipleUoms: checked,
                            additionalUomIds: checked ? current.additionalUomIds : [],
                            uomRelations: checked ? current.uomRelations : [],
                          }));
                          if (!checked) {
                            clearFieldError('uomRelations');
                          }
                        }}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors">
                        Multiple UOM
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                        <span>Primary UOM (Base) <span className="text-destructive font-black">*</span></span>
                        <button
                          type="button"
                          onClick={() => setInlineMasterData('uom')}
                          className="text-xs font-bold text-primary hover:underline cursor-pointer"
                        >
                          + New
                        </button>
                      </label>
                      <div id="field-uomId" aria-required="true" aria-invalid={Boolean(fieldErrors.uomId)}>
                        <SearchableSelector
                          value={form.uomId}
                          onChange={(val) => {
                            setForm((current) => ({
                              ...current,
                              uomId: val,
                              additionalUomIds: current.additionalUomIds.filter((id) => id !== val),
                              uomRelations: (current.uomRelations || []).filter(
                                (r) => r.fromUomId !== val && r.toUomId !== val
                              ),
                            }));
                            clearFieldError('uomId');
                          }}
                          options={allUoms}
                          isLoading={uoms.isLoading}
                          error={uoms.error as Error | null}
                          placeholder="Select primary base UOM..."
                          renderOption={(uom) => <span className="font-medium text-foreground">{uom.name}{uom.symbol ? ` (${uom.symbol})` : ''}</span>}
                          className={fieldErrors.uomId ? '[&>button]:border-destructive [&>button]:ring-2 [&>button]:ring-destructive/20' : ''}
                        />
                      </div>
                      {fieldErrors.uomId && (
                        <p className="mt-1 text-xs font-semibold text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {fieldErrors.uomId}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                        Opening Stock
                      </label>
                      <input
                        id="field-initialQuantity"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={!form.initialQuantity || form.initialQuantity === '0' ? '' : form.initialQuantity}
                        onChange={(e) => { handleChange('initialQuantity', e.target.value); clearFieldError('initialQuantity'); }}
                        onWheel={(e) => handleNumberInputWheel(e, form.initialQuantity, (val) => { handleChange('initialQuantity', val); clearFieldError('initialQuantity'); })}
                        onKeyDown={(e) => handleNumberInputKeyDown(e, form.initialQuantity, (val) => { handleChange('initialQuantity', val); clearFieldError('initialQuantity'); })}
                        aria-invalid={Boolean(fieldErrors.initialQuantity)}
                        className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      {fieldErrors.initialQuantity && <p className="mt-1 text-xs font-semibold text-destructive" role="alert">{fieldErrors.initialQuantity}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                        Safety Buffer (Min)
                      </label>
                      <input
                        id="field-minStockLevel"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={!form.minStockLevel || form.minStockLevel === '0' ? '' : form.minStockLevel}
                        onChange={(e) => { handleChange('minStockLevel', e.target.value); clearFieldError('minStockLevel'); }}
                        onWheel={(e) => handleNumberInputWheel(e, form.minStockLevel, (val) => { handleChange('minStockLevel', val); clearFieldError('minStockLevel'); })}
                        onKeyDown={(e) => handleNumberInputKeyDown(e, form.minStockLevel, (val) => { handleChange('minStockLevel', val); clearFieldError('minStockLevel'); })}
                        aria-invalid={Boolean(fieldErrors.minStockLevel)}
                        className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      {fieldErrors.minStockLevel && <p className="mt-1 text-xs font-semibold text-destructive" role="alert">{fieldErrors.minStockLevel}</p>}
                    </div>

                  </div>

                  {/* Multi-Unit of Measure (UOM) Established Relations */}
                  {form.hasMultipleUoms && (
                    <div id="section-multi-uom-relations" className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      {form.uomRelations && form.uomRelations.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          {form.uomRelations.map((rel, idx) => {
                            const fromUom = allUoms.find((u) => u.id === rel.fromUomId);
                            const toUom = allUoms.find((u) => u.id === rel.toUomId);
                            const fromName = fromUom?.symbol || fromUom?.name || 'Unit';
                            const toName = toUom?.symbol || toUom?.name || 'Unit';

                            return (
                              <div
                                key={rel.id || idx}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs"
                              >
                                <span className="font-mono font-bold text-primary">
                                  {rel.fromQuantity ?? 1} {fromName} = {rel.toQuantity ?? rel.factor} {toName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (form.uomRelations || []).filter((_, i) => i !== idx);
                                    const updatedSecondary = Array.from(
                                      new Set(
                                        updated.map((r) =>
                                          r.fromUomId === form.uomId ? r.toUomId : r.fromUomId
                                        )
                                      )
                                    ).filter((id) => id && id !== form.uomId);
                                    setForm((prev) => ({
                                      ...prev,
                                      uomRelations: updated,
                                      additionalUomIds: updatedSecondary,
                                    }));
                                  }}
                                  className="text-slate-400 hover:text-destructive transition-colors cursor-pointer"
                                  title="Remove relation"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setIsUomRelationModalOpen(true)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer px-1.5 py-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Relation
                          </button>
                        </div>
                      )}

                      {fieldErrors.uomRelations && (
                        <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {fieldErrors.uomRelations}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 06: BILL OF MATERIALS (BOM FORMULATION)
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'bom') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-xs font-black shadow-xs ring-4 ring-primary/10 shrink-0">
                      06
                    </div>
                    <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      Bill of Materials (BOM Formulation Recipe)
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      href="/production/bom/new?from=product-draft"
                      className="inline-flex items-center gap-2 rounded-xl border border-primary/50 bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
                    >
                      Open BOM setup <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleSection('bom')}
                      aria-expanded={!collapsedSections.bom}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {collapsedSections.bom ? 'Expand' : 'Collapse'}
                      </span>
                      {collapsedSections.bom ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div id="bom-table-container" className={collapsedSections.bom ? 'hidden' : 'p-6'}>
                  <div className="space-y-4">
                    {fieldErrors['bom-general'] && (
                      <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{fieldErrors['bom-general']}</span>
                      </div>
                    )}

                    {/* Saved BOMs indicator */}
                    {savedBoms.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 dark:border-primary/30">
                        <span className="text-xs font-bold text-primary dark:text-primary flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Saved BOMs ({savedBoms.length}):
                        </span>
                        {savedBoms.map((b, idx) => {
                          const isEditingThis = editingSavedBomId === b.id;
                          return (
                            <div
                              key={b.id}
                              onClick={() => {
                                if (!isEditingThis) {
                                  handleStartEditSavedBom(b);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (!isEditingThis) handleStartEditSavedBom(b);
                                }
                              }}
                              className={clsx(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-2xs transition-all select-none',
                                isEditingThis
                                  ? 'bg-primary text-white border border-primary ring-2 ring-primary/30 font-bold cursor-default'
                                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10 cursor-pointer'
                              )}
                              title={isEditingThis ? 'Currently editing this BOM' : `Click to view & edit ${b.name}`}
                            >
                              <span className={clsx('font-bold', isEditingThis ? 'text-white' : 'text-primary')}>
                                {b.name || `BOM #${idx + 1}`}
                              </span>
                              <span className={clsx('text-[10px] font-mono', isEditingThis ? 'text-white/80' : 'text-slate-400')}>
                                ({b.lines.length} lines)
                              </span>
                              {isEditingThis && (
                                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-semibold ml-0.5">
                                  Editing
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSavedBom(b.id);
                                }}
                                className={clsx(
                                  'transition-colors ml-1 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer',
                                  isEditingThis ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-destructive'
                                )}
                                title="Remove this BOM from the item; preserve the BOM record"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}

                        {editingSavedBomId ? (
                          <button
                            type="button"
                            onClick={handleCancelEditSavedBom}
                            className="text-[11px] text-primary hover:underline font-semibold ml-2 cursor-pointer flex items-center gap-1"
                          >
                            + Switch to New Blank BOM
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            Will all be created when you click Create Inventory
                          </span>
                        )}
                      </div>
                    )}

                    {/* BOM Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Recipe Lines: <strong className="font-mono text-primary text-sm">{bomLines.length} Items</strong>
                        </span>
                        {editingSavedBomId && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                            Editing Saved BOM
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* BOM Name input (Purple circle area in Image 1) */}
                        <div className="w-48 sm:w-60">
                          <input
                            type="text"
                            value={bomName}
                            onChange={(e) => setBomName(e.target.value)}
                            placeholder="BOM Name (Auto-generated if empty)"
                            className="h-9 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs"
                          />
                        </div>

                        {/* Existing BOMs Multi-Selector Dropdown - Always visible and multi-select capable */}
                        <div className="min-w-[240px] sm:min-w-[280px]">
                          <MultiBomSelector
                            selectedIds={selectedBomVersionIds}
                            onToggle={(id) => {
                              handleToggleBomVersion(id);
                              clearFieldError('bom-general');
                            }}
                            onClear={handleClearBomSelection}
                            options={bomOptions}
                            isLoading={allSystemBoms.isLoading || isAutoFeedingBom}
                            disabled={isAutoFeedingBom}
                            placeholder="Auto-feed from BOM..."
                            size="sm"
                          />
                        </div>

                        {editingSavedBomId && (
                          <button
                            type="button"
                            onClick={handleUpdateCurrentBom}
                            disabled={bomLines.length === 0}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Save changes to this BOM"
                          >
                            <Check className="w-4 h-4" /> Save Changes
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleSaveAndAddAnotherBom}
                          disabled={bomLines.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                          title={editingSavedBomId ? "Save changes to this BOM and start another one" : "Save this BOM recipe and start another one"}
                        >
                          <BookmarkPlus className="w-4 h-4 text-primary" /> {editingSavedBomId ? 'Update & Add Another' : 'Save & Add Another BOM'}
                        </button>

                      </div>
                    </div>

                    {appendedBomNames.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                        <span className="text-[11px] font-semibold text-slate-500">Appended BOMs:</span>
                        {appendedBomNames.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-mono text-[11px] font-bold">
                            {name}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => setAppendedBomNames([])}
                          className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1 cursor-pointer"
                        >
                          Clear Tags
                        </button>
                      </div>
                    )}

                    {/* BOM Item Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <table className="w-full min-w-[900px] text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="px-3 py-3.5 w-16 text-center">#</th>
                            <th className="px-4 py-3.5 min-w-[240px]">Item</th>
                            <th className="px-3 py-3.5 w-28 min-w-[110px] text-right">Required Qty</th>
                            <th className="px-3 py-3.5 w-36 min-w-[140px]">Unit of Measure</th>
                            <th className="px-3 py-3.5 w-32 min-w-[120px] text-right">Avg Rate (₹)</th>
                            <th className="px-4 py-3.5 min-w-[180px]">Engineering Notes</th>
                            <th className="px-3 py-3.5 w-14 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {bomLines.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-slate-400 font-medium">
                                <div className="flex min-h-24 items-center justify-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const defaultMat = bomItems[0];
                                      const unitRate = defaultMat ? getMaterialCost(defaultMat) : 0;
                                      setBomLines((current) => [
                                        ...current,
                                        {
                                          id: `bom-${Date.now()}`,
                                          materialId: defaultMat?.id || '',
                                          materialName: defaultMat?.name || '',
                                          materialCode: defaultMat?.code || '',
                                          quantity: '1',
                                          uomId: defaultMat?.uomId || bomItems[0]?.uomId || '',
                                          unitCost: unitRate > 0 ? String(unitRate) : '',
                                          lineCost: unitRate > 0 ? String(unitRate) : '',
                                          note: '',
                                        },
                                      ]);
                                      clearFieldError('bom-general');
                                    }}
                                    className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" /> Add Item Line
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            bomLines.map((line, index) => {
                              const selectedMat = bomItems.find((m) => m.id === line.materialId);
                              const itemUomIds = getItemAllowedUomIds(selectedMat, bomItems);
                              const itemUoms = (uoms.data?.items || []).filter((uom) => itemUomIds.includes(uom.id));

                              const avgRate = selectedMat ? getMaterialCost(selectedMat) : 0;
                              const isDragging = draggedBomIndex === index;

                              return (
                                <tr
                                  key={line.id}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = 'move';
                                    const sourceIdx = dragSourceIndexRef.current;
                                    if (sourceIdx !== null && sourceIdx !== index) {
                                      moveBomLine(sourceIdx, index);
                                      dragSourceIndexRef.current = index;
                                      setDraggedBomIndex(index);
                                    }
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    dragSourceIndexRef.current = null;
                                    setDraggedBomIndex(null);
                                  }}
                                  className={`transition-all duration-200 ease-out ${isDragging
                                      ? 'opacity-40 bg-primary/10 shadow-lg scale-[1.008] z-20 relative ring-2 ring-primary/40 rounded-xl'
                                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                    }`}
                                >
                                  <td className="px-2 py-3 text-center align-top pt-3.5">
                                    <div
                                      draggable
                                      onDragStart={(event) => {
                                        dragSourceIndexRef.current = index;
                                        setDraggedBomIndex(index);
                                        event.dataTransfer.setData('text/plain', String(index));
                                        event.dataTransfer.effectAllowed = 'move';
                                        const row = event.currentTarget.closest('tr');
                                        if (row && event.dataTransfer.setDragImage) {
                                          event.dataTransfer.setDragImage(row, 20, 20);
                                        }
                                      }}
                                      onDragEnd={() => {
                                        dragSourceIndexRef.current = null;
                                        setDraggedBomIndex(null);
                                      }}
                                      className="inline-flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-primary active:scale-95 transition-all py-1.5 px-2 rounded-lg hover:bg-primary/10 active:bg-primary/20 select-none"
                                      title="Click and drag to reorder line"
                                    >
                                      <GripVertical className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-primary transition-colors" />
                                      <span className="font-bold font-mono text-xs text-slate-500 dark:text-slate-400">
                                        {index + 1}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 align-top">
                                    <div id={`field-bom-${index}-material`} className={fieldErrors[`bom-${index}-material`] ? 'ring-2 ring-destructive/40 rounded-xl' : ''}>
                                      <SearchableSelector
                                        value={line.materialId}
                                        onChange={async (value) => {
                                          const material = bomItems.find((item) => item.id === value);
                                          const catalogUnitCost = getMaterialCost(material);
                                          const currentQty = parseFloat(line.quantity) || 1;
                                          const catalogLineTotal = Math.round(catalogUnitCost * currentQty * 100) / 100;

                                          setBomLines((current) =>
                                            current.map((row) =>
                                              row.id === line.id
                                                ? {
                                                  ...row,
                                                  materialId: value,
                                                  materialName: material?.name,
                                                  materialCode: material?.code || material?.sku,
                                                  uomId: material?.uomId || material?.uom?.id || row.uomId,
                                                  unitCost: catalogUnitCost > 0 ? String(catalogUnitCost) : '',
                                                  lineCost: catalogLineTotal > 0 ? String(catalogLineTotal) : '',
                                                }
                                                : row
                                            )
                                          );
                                          clearFieldError(`bom-${index}-material`);
                                          clearFieldError(`bom-${index}-uom`);
                                          clearFieldError('bom-general');

                                          if (value && materials.data?.items.some((item) => item.id === value)) {
                                            try {
                                              const balanceData = await fetchApi<{ items?: Array<{ averageCost?: number | string; onHandQuantity?: number | string; quantity?: number | string }> }>(
                                                `/inventory/balances?materialId=${encodeURIComponent(value)}&limit=1000`
                                              );
                                              const balances = balanceData.items || [];
                                              const weighted = balances.reduce<{ quantity: number; value: number }>((total, balance) => {
                                                const quantity = Number(balance.onHandQuantity ?? balance.quantity ?? 0);
                                                const rate = Number(balance.averageCost ?? 0);
                                                if (quantity <= 0 || rate <= 0) return total;
                                                return { quantity: total.quantity + quantity, value: total.value + quantity * rate };
                                              }, { quantity: 0, value: 0 });
                                              const latestKnownRate = balances
                                                .map((balance) => Number(balance.averageCost ?? 0))
                                                .find((rate) => rate > 0) || 0;
                                              const averageRate = weighted.quantity > 0
                                                ? weighted.value / weighted.quantity
                                                : latestKnownRate || catalogUnitCost;
                                              const roundedRate = Math.round(averageRate * 100) / 100;
                                              setBomLines((current) => current.map((row) => {
                                                if (row.id !== line.id || row.materialId !== value) return row;
                                                const quantity = Number(row.quantity) || 0;
                                                return {
                                                  ...row,
                                                  unitCost: roundedRate > 0 ? String(roundedRate) : '',
                                                  lineCost: roundedRate > 0 ? String(Math.round(quantity * roundedRate * 100) / 100) : '',
                                                };
                                              }));
                                            } catch {
                                              // Keep the catalog cost if live inventory cost is unavailable.
                                            }
                                          }
                                        }}
                                        options={bomItems}
                                        showOptionCode={false}
                                        isLoading={materials.isLoading || bomProducts.isLoading}
                                        placeholder="Search items across all categories..."
                                        renderOption={(item) => (
                                          <div className={`flex min-w-0 items-center gap-2 ${item.parentOptionId ? 'ml-3 border-l-2 border-violet-300 pl-3 dark:border-violet-700' : ''}`}>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex min-w-0 items-center gap-2">
                                                <span className={`truncate ${item.isVariant ? 'text-xs font-medium text-slate-700 dark:text-slate-200' : 'text-xs font-bold text-slate-900 dark:text-white'}`}>
                                                  {item.parentOptionId ? '↳ ' : ''}{item.isVariant ? getVariantLabel(item.parentItemName, item.name) : item.name}
                                                </span>
                                                {item.isVariant && (
                                                  <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                                                    Variant
                                                  </span>
                                                )}
                                              </div>
                                              {item.category?.name && <span className="block truncate text-[10px] text-slate-400">{item.category.name}</span>}
                                            </div>
                                          </div>
                                        )}
                                      />
                                    </div>
                                    {fieldErrors[`bom-${index}-material`] && (
                                      <p className="mt-1 text-[11px] font-semibold text-destructive flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                        {fieldErrors[`bom-${index}-material`]}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <input
                                      id={`field-bom-${index}-qty`}
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={line.quantity}
                                      onChange={(e) => {
                                        const rawVal = e.target.value;
                                        setBomLines((current) =>
                                          current.map((row) =>
                                            row.id === line.id
                                              ? {
                                                ...row,
                                                quantity: rawVal,
                                                lineCost: !isNaN(Number(rawVal)) && !isNaN(Number(row.unitCost)) && Number(rawVal) > 0
                                                  ? String(Math.round(Number(rawVal) * Number(row.unitCost) * 100) / 100)
                                                  : row.lineCost,
                                              }
                                              : row
                                          )
                                        );
                                        clearFieldError(`bom-${index}-qty`);
                                      }}
                                      onBlur={(e) => {
                                        const cleaned = cleanQuantityString(e.target.value);
                                        if (cleaned !== line.quantity) {
                                          setBomLines((current) =>
                                            current.map((row) =>
                                              row.id === line.id
                                                ? {
                                                  ...row,
                                                  quantity: cleaned,
                                                  lineCost: !isNaN(Number(cleaned)) && !isNaN(Number(row.unitCost)) && Number(cleaned) > 0
                                                    ? String(Math.round(Number(cleaned) * Number(row.unitCost) * 100) / 100)
                                                    : row.lineCost,
                                                }
                                                : row
                                            )
                                          );
                                        }
                                      }}
                                      placeholder="0.00"
                                      className={`h-10 w-full rounded-xl border ${fieldErrors[`bom-${index}-qty`]
                                        ? 'border-destructive ring-2 ring-destructive/20 bg-destructive/5'
                                        : 'border-slate-300 dark:border-slate-700'
                                        } bg-white dark:bg-slate-800 px-3 text-sm font-bold text-right font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20`}
                                    />
                                    {fieldErrors[`bom-${index}-qty`] && (
                                      <p className="mt-1 text-[11px] font-semibold text-destructive flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                        {fieldErrors[`bom-${index}-qty`]}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <div>
                                      <div id={`field-bom-${index}-uom`} aria-invalid={Boolean(fieldErrors[`bom-${index}-uom`])}>
                                        <SearchableSelector
                                          value={line.uomId}
                                          onChange={(newUom) => {
                                            if (newUom === line.uomId) return;
                                            let nextQty = line.quantity;
                                            if (selectedMat && line.uomId && newUom && line.quantity) {
                                              const converted = convertItemQuantityBetweenUoms(
                                                selectedMat,
                                                line.quantity,
                                                line.uomId,
                                                newUom,
                                                bomItems
                                              );
                                              if (converted !== null) {
                                                nextQty = String(converted);
                                              }
                                            }

                                            setBomLines((current) =>
                                              current.map((row) => {
                                                if (row.id !== line.id) return row;
                                                const currentRate = parseFloat(String(row.unitCost || '')) || 0;
                                                const numQty = parseFloat(nextQty) || 0;
                                                const calculatedCost = currentRate > 0 && numQty > 0
                                                  ? String(Math.round(numQty * currentRate * 100) / 100)
                                                  : row.lineCost;
                                                return {
                                                  ...row,
                                                  uomId: newUom,
                                                  quantity: nextQty,
                                                  lineCost: calculatedCost,
                                                };
                                              })
                                            );
                                            clearFieldError(`bom-${index}-uom`);
                                            clearFieldError(`bom-${index}-qty`);
                                          }}
                                          options={itemUoms}
                                          placeholder="Search unit of measure..."
                                          size="sm"
                                          renderOption={(uom) => <span className="font-medium text-foreground">{uom.name}</span>}
                                          className={fieldErrors[`bom-${index}-uom`] ? '[&>button]:border-destructive [&>button]:ring-2 [&>button]:ring-destructive/20' : ''}
                                        />
                                      </div>
                                      {fieldErrors[`bom-${index}-uom`] && (
                                        <p className="mt-1 text-[11px] font-semibold text-destructive flex items-start gap-1 leading-tight">
                                          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                          <span>{fieldErrors[`bom-${index}-uom`]}</span>
                                        </p>
                                      )}
                                    </div>
                                  </td>
                                  {/* Editable Average Rate */}
                                  <td className="px-3 py-3 align-top">
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">₹</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder={avgRate > 0 ? avgRate.toFixed(2) : '0.00'}
                                        value={line.unitCost !== undefined && line.unitCost !== '' ? line.unitCost : (avgRate > 0 ? String(avgRate) : (line.unitCost ?? ''))}
                                        onChange={(e) => {
                                          const newRate = e.target.value;
                                          setBomLines((current) =>
                                            current.map((row) =>
                                              row.id === line.id
                                                ? {
                                                  ...row,
                                                  unitCost: newRate,
                                                  lineCost: !isNaN(Number(newRate)) && !isNaN(Number(row.quantity))
                                                    ? String(Math.round(Number(newRate) * Number(row.quantity) * 100) / 100)
                                                    : row.lineCost,
                                                }
                                                : row
                                            )
                                          );
                                        }}
                                        className="h-10 w-full pl-6 pr-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-right font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 align-top">
                                    <input
                                      value={line.note}
                                      onChange={(e) =>
                                        setBomLines((current) =>
                                          current.map((row) => (row.id === line.id ? { ...row, note: e.target.value } : row))
                                        )
                                      }
                                      placeholder="Cutting length, color code, tolerance..."
                                      className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                  </td>
                                  <td className="px-3 py-3 text-center align-top">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBomLines((current) => current.filter((row) => row.id !== line.id));
                                        clearFieldError(`bom-${index}-material`);
                                        clearFieldError(`bom-${index}-qty`);
                                        clearFieldError(`bom-${index}-uom`);
                                      }}
                                      aria-label="Remove BOM line"
                                      className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors cursor-pointer mx-auto"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {bomLines.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setBomLines((current) => [...current, {
                              id: `bom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                              materialId: '', materialName: '', materialCode: '', quantity: '1', uomId: '', note: '',
                            }]);
                            clearFieldError('bom-general');
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <Plus className="h-4 w-4" /> Add Item Line
                        </button>
                        <div className="flex min-w-[240px] items-center justify-between gap-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/70">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Cost</span>
                          <strong className="font-mono text-base font-bold text-slate-900 dark:text-white">
                            ₹{totalCostBasis.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {bomLines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setBomLines([]);
                              setSelectedBomVersionId('');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-xs font-medium text-slate-500 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer"
                            title="Clear all formulation lines"
                          >
                            <Trash2 className="h-4 w-4" /> Clear All
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 07: MEASUREMENT VARIANTS
               ========================================================================= */}
            {(activeSectionTab === 'all' || activeSectionTab === 'variants') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Section Header */}
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-xs ring-2 ring-primary/10 shrink-0">
                      07
                    </div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                      Measurement Variants
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addMeasurementVariant()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Variant
                    </button>
                    {measurementVariants.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMeasurementVariants([createEmptyMeasurementVariant(form.uomId)])}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer"
                        title="Reset to blank variant"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Clear All
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSection('variants')}
                      aria-expanded={!collapsedSections.variants}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {collapsedSections.variants ? 'Expand' : 'Collapse'}
                      </span>
                      {collapsedSections.variants ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className={collapsedSections.variants ? 'hidden' : 'p-4'}>
                  {measurementVariants.length === 0 ? (
                    <div className="py-4 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-850/50 flex flex-col sm:flex-row items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => addMeasurementVariant()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-[#003c68] transition-colors cursor-pointer shrink-0 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add First Variant
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            <th className="py-2.5 px-3">Variant Name *</th>
                            <th className="py-2.5 px-3 w-48">Specification / Type</th>
                            <th className="py-2.5 px-3 w-36">SKU Code</th>
                            <th className="py-2.5 px-3 w-32">
                              Opening Stock ({selectedUomObj?.code || 'Units'})
                            </th>
                            <th className="py-2.5 px-3 w-28">Min Stock</th>
                            <th className="py-2.5 px-3 w-32">Rate / MRP (₹)</th>
                            <th className="py-2.5 px-2 w-10 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {measurementVariants.map((variant, vIdx) => (
                            <tr key={variant.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                              <td className="py-1.5 px-3">
                                <input
                                  id={`field-variant-${vIdx}-name`}
                                  type="text"
                                  placeholder="e.g. CS-8 Raw, CS-8 Online"
                                  value={variant.name}
                                  onChange={(e) => { updateMeasurementVariant(vIdx, 'name', e.target.value); clearFieldError(`variant-${vIdx}-name`); }}
                                  aria-invalid={Boolean(fieldErrors[`variant-${vIdx}-name`])}
                                  className={`w-full h-8 px-2.5 rounded-lg border ${fieldErrors[`variant-${vIdx}-name`] ? 'border-destructive' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20`}
                                />
                                {fieldErrors[`variant-${vIdx}-name`] && <p className="mt-1 text-[10px] font-semibold text-destructive" role="alert">{fieldErrors[`variant-${vIdx}-name`]}</p>}
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  type="text"
                                  placeholder="e.g. CS-Raw with box, Online only"
                                  value={variant.measurementValue}
                                  onChange={(e) => updateMeasurementVariant(vIdx, 'measurementValue', e.target.value)}
                                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  type="text"
                                  placeholder="SKU (optional)"
                                  value={variant.sku}
                                  onChange={(e) => updateMeasurementVariant(vIdx, 'sku', e.target.value.toUpperCase())}
                                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  id={`field-variant-${vIdx}-openingStock`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                  value={!variant.openingStock || variant.openingStock === '0' ? '' : variant.openingStock}
                                  onChange={(e) => { updateMeasurementVariant(vIdx, 'openingStock', e.target.value); clearFieldError(`variant-${vIdx}-openingStock`); }}
                                  onWheel={(e) => handleNumberInputWheel(e, variant.openingStock, (val) => { updateMeasurementVariant(vIdx, 'openingStock', val); clearFieldError(`variant-${vIdx}-openingStock`); })}
                                  onKeyDown={(e) => handleNumberInputKeyDown(e, variant.openingStock, (val) => { updateMeasurementVariant(vIdx, 'openingStock', val); clearFieldError(`variant-${vIdx}-openingStock`); })}
                                  aria-invalid={Boolean(fieldErrors[`variant-${vIdx}-openingStock`])}
                                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                                {fieldErrors[`variant-${vIdx}-openingStock`] && <p className="mt-1 text-[10px] font-semibold text-destructive" role="alert">{fieldErrors[`variant-${vIdx}-openingStock`]}</p>}
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  id={`field-variant-${vIdx}-minStockLevel`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                  value={!variant.minStockLevel || variant.minStockLevel === '0' ? '' : variant.minStockLevel}
                                  onChange={(e) => { updateMeasurementVariant(vIdx, 'minStockLevel', e.target.value); clearFieldError(`variant-${vIdx}-minStockLevel`); }}
                                  onWheel={(e) => handleNumberInputWheel(e, variant.minStockLevel, (val) => { updateMeasurementVariant(vIdx, 'minStockLevel', val); clearFieldError(`variant-${vIdx}-minStockLevel`); })}
                                  onKeyDown={(e) => handleNumberInputKeyDown(e, variant.minStockLevel, (val) => { updateMeasurementVariant(vIdx, 'minStockLevel', val); clearFieldError(`variant-${vIdx}-minStockLevel`); })}
                                  aria-invalid={Boolean(fieldErrors[`variant-${vIdx}-minStockLevel`])}
                                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                                {fieldErrors[`variant-${vIdx}-minStockLevel`] && <p className="mt-1 text-[10px] font-semibold text-destructive" role="alert">{fieldErrors[`variant-${vIdx}-minStockLevel`]}</p>}
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                  value={!variant.standardPrice || variant.standardPrice === '0' ? '' : variant.standardPrice}
                                  onChange={(e) => updateMeasurementVariant(vIdx, 'standardPrice', e.target.value)}
                                  onWheel={(e) => handleNumberInputWheel(e, variant.standardPrice, (val) => updateMeasurementVariant(vIdx, 'standardPrice', val))}
                                  onKeyDown={(e) => handleNumberInputKeyDown(e, variant.standardPrice, (val) => updateMeasurementVariant(vIdx, 'standardPrice', val))}
                                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeMeasurementVariant(vIdx)}
                                  className="text-slate-400 hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                                  title="Delete variant"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================================
                BOTTOM ACTION BUTTONS
               ========================================================================= */}
            <div className="flex items-center justify-end gap-3 pt-6 pb-12">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="h-10 rounded-xl text-sm font-bold px-5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="h-10 rounded-xl text-sm font-bold px-6 bg-primary hover:bg-[#003c68] text-white shadow-sm"
                icon={Save}
              >
                {isSaving
                  ? (isEditMode ? 'Updating Inventory...' : 'Creating Inventory...')
                  : (isEditMode ? 'Update Inventory' : 'Create Inventory')}
              </Button>
            </div>

          </form>
        </div>
      </div>

      <InlineMasterDataDialog
        kind={inlineMasterData || 'uom'}
        open={inlineMasterData !== null}
        onClose={() => setInlineMasterData(null)}
        categoryId={form.parentCategoryId}
        onCreated={(createdId) => {
          if (inlineMasterData === 'category') setForm((current) => ({ ...current, parentCategoryId: createdId, productFamilyId: '' }));
          if (inlineMasterData === 'family') setForm((current) => ({ ...current, productFamilyId: createdId }));
          if (inlineMasterData === 'uom') setForm((current) => ({ ...current, uomId: createdId }));
        }}
      />

      <ProductSpecialDialog
        open={isSpecialModalOpen}
        onClose={() => setIsSpecialModalOpen(false)}
        onApplySpecial={handleApplySpecial}
        uoms={allUoms}
        hsnCodes={hsnCodes.data?.items}
      />

      <ItemUomRelationModal
        open={isUomRelationModalOpen}
        onClose={() => setIsUomRelationModalOpen(false)}
        baseUomId={form.uomId}
        additionalUomIds={form.additionalUomIds}
        allUoms={allUoms}
        relations={form.uomRelations || []}
        onSave={(newRelations) => {
          const secondaryIds = Array.from(
            new Set(
              newRelations.map((r) => (r.fromUomId === form.uomId ? r.toUomId : r.fromUomId))
            )
          ).filter((id) => id && id !== form.uomId);
          setForm((current) => ({
            ...current,
            additionalUomIds: secondaryIds,
            uomRelations: newRelations,
          }));
          clearFieldError('uomRelations');
        }}
      />

      <PricingLevelModal
        open={isPricingLevelModalOpen}
        onClose={() => setIsPricingLevelModalOpen(false)}
        onLevelCreated={(newLevel) => {
          addCustomTierItem(newLevel);
        }}
      />
    </>
  );
}
