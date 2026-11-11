'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Save,
  Plus,
  Trash2,
  BookmarkPlus,
  X,
  GitBranch,
  GripVertical,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  GripHorizontal,
  XCircle,
  PackageCheck,
} from 'lucide-react';
import { Button, PageHeader } from '@plinth/ui';
import {
  useCreateProductionPlan,
  useUpdateProductionPlan,
} from '@/features/production/hooks';
import { productionApi } from '@/features/production/api';
import { ProductionInventoryAvailabilityLine, ProductionPlan, isProductionExecutionDepartment, resolveAssemblyDepartment } from '@/features/production/types';
import { fetchApi } from '@/features/api/client';
import {
  useProducts,
  useMaterials,
  useUoms,
  useProductRoutes,
  useDepartments,
} from '@/hooks/useMasterData';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { MultiBomSelector, type BomSelectorOption } from '@/components/ui/MultiBomSelector';
import { useBomVersions } from '@/features/bom/hooks';
import { bomApi } from '@/features/bom/api';
import { showToast } from '@/components/toast-store';
import { friendlyErrorMessage } from '@/features/auth/access-control';
import { ReturnToProductDraftBanner } from '@/components/ReturnToProductDraftBanner';
import { getMaterialCost, type ProductBomLine } from '@/features/products/components/ProductCreationWorkspace';

interface SavedBomItem {
  id: string;
  name: string;
  lines: ProductBomLine[];
}

interface RawBomLinePayload {
  id?: string;
  materialId?: string | null;
  componentProductId?: string | null;
  material?: { id?: string; name?: string; code?: string } | null;
  componentProduct?: { id?: string; name?: string; sku?: string } | null;
  uomId?: string | null;
  uom?: { id?: string; name?: string; symbol?: string; dimension?: string } | null;
  quantity?: number | string | null;
  quantityMode?: 'FIXED' | 'SCALED' | null;
  roundingRule?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST' | null;
  roundingPrecision?: number | null;
  sequence?: number | null;
  note?: string | null;
}

interface RouteAllocationPayload {
  bomLineId: string;
  routeStepId?: string | null;
  quantity: number | string;
}

interface RouteStepDisplay {
  id: string;
  branchKey?: string | null;
  stepOrder?: number | null;
  parentStepId?: string | null;
  stepName?: string | null;
  departmentId?: string | null;
  department?: { id?: string; name?: string; code?: string } | null;
  nextDepartmentId?: string | null;
  nextDepartment?: { id?: string; name?: string; code?: string } | null;
  standardDurationMinutes?: number | null;
  isQcRequired?: boolean;
  workCenterId?: string | null;
  outputItemType?: 'MATERIAL' | 'PRODUCT';
  outputItemId?: string | null;
  outputUomId?: string | null;
  outputQuantityPerUnit?: number | string | null;
}

interface EditableRouteStep extends RouteStepDisplay {
  id: string;
  branchKey: string;
  stepOrder: number;
  stepName: string;
  departmentId: string;
  outputItemType: 'MATERIAL' | 'PRODUCT';
  outputItemId: string;
  outputUomId: string;
  outputQuantityPerUnit: number;
  department?: { id?: string; name?: string; code?: string } | null;
}

interface EditableRouteDraft {
  sourceRouteId: string;
  steps: EditableRouteStep[];
  allocations: Array<{ bomLineId: string; stepKey: string | null; quantity: number }>;
  assemblyDepartmentId: string;
  changed: boolean;
}

interface CatalogItemWithHierarchy {
  id: string;
  name: string;
  code?: string;
  sku?: string;
  uomId?: string;
  uom?: { id?: string; name?: string; dimension?: string } | null;
  category?: { name?: string; code?: string } | null;
  isVariant?: boolean;
  parentMaterialId?: string | null;
  parentProductId?: string | null;
  parentOptionId?: string;
  parentItemName?: string;
  parentProductName?: string | null;
  parentMaterialName?: string | null;
  parentCode?: string | null;
  parentSku?: string | null;
  measurementValue?: string;
  materialId?: string | null;
  productId?: string | null;
  specs?: { parentMaterialId?: string; isVariant?: boolean } | null;
  metadata?: { parentProductId?: string; isVariant?: boolean } | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function selectedVariantIdFromNote(note?: string | null): string | undefined {
  return String(note || '').match(/Selected variant:.*?\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i)?.[1];
}

function selectedVariantLabelFromNote(note?: string | null): string | undefined {
  const marker = String(note || '').split(/\s*·\s*/).find((part) => /^Selected variant:/i.test(part.trim()));
  return marker?.replace(/^Selected variant:\s*/i, '')
    .replace(/\s*\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)\s*$/i, '')
    .trim() || undefined;
}

function stripSelectedVariantNote(note?: string | null): string {
  return String(note || '').split(/\s*·\s*/).filter((part) => !/^Selected variant:/i.test(part.trim())).join(' · ').trim();
}

function resolveBomComponentId(line: RawBomLinePayload, items: CatalogItemWithHierarchy[]): string {
  const baseId = line.materialId || line.componentProductId || line.material?.id || line.componentProduct?.id || '';
  const savedVariantId = selectedVariantIdFromNote(line.note);
  if (savedVariantId) return savedVariantId;
  const label = selectedVariantLabelFromNote(line.note);
  if (!baseId || !label) return baseId;
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const normalizedLabel = normalize(label);
  const variant = items.find((item) => {
    const parentId = item.parentMaterialId || item.parentProductId || item.parentOptionId;
    if (parentId !== baseId) return false;
    const metadata = item.metadata as Record<string, unknown> | null | undefined;
    return [item.name, item.measurementValue, typeof metadata?.measurementValue === 'string' ? metadata.measurementValue : '']
      .filter(Boolean)
      .some((candidate) => {
        const normalizedCandidate = normalize(String(candidate));
        return normalizedCandidate === normalizedLabel || normalizedCandidate.endsWith(` ${normalizedLabel}`);
      });
  });
  return variant?.id || baseId;
}

interface BomVersionOptionalMaterial {
  material?: { name?: string; code?: string } | null;
}

interface RouteWithOptionalProduct {
  id?: string;
  code?: string;
  name?: string;
  productId?: string | null;
  product?: { id?: string } | null;
  bomVersionId?: string | null;
  graphReviewedAt?: string | null;
  materialAllocations?: RouteAllocationPayload[];
  steps?: RouteStepDisplay[];
  assemblyDepartment?: { id?: string; name?: string; code?: string } | null;
  assemblyDepartmentId?: string | null;
  status?: string;
}
const SCHEDULE_TYPES = [
  { value: 'DAY', label: 'Day Shift (08:00 — 16:30)', badge: 'STANDARD' },
  { value: 'NIGHT', label: 'Night Shift (20:00 — 04:30)', badge: 'OVERNIGHT' },
  { value: 'URGENT', label: 'Urgent Priority Run (Rush)', badge: 'HIGH PRIORITY' },
  { value: 'BUFFER', label: 'Buffer Stock Replenishment', badge: 'STOCKING' },
  { value: 'GROUPED', label: 'Grouped Batch Campaign', badge: 'CAMPAIGN' },
  { value: 'REWORK', label: 'Rework / Quality Correction', badge: 'QC REWORK' },
  { value: 'CARRY_FORWARD', label: 'Carry Forward from Previous Shift', badge: 'CONTINUATION' },
];

export default function NewProductionSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('editId') || '';
  const cloneId = searchParams.get('cloneFrom') || '';
  const isEditMode = Boolean(editId);

  const createMutation = useCreateProductionPlan();
  const updateMutation = useUpdateProductionPlan();
  const [submitAction, setSubmitAction] = useState<'draft' | 'schedule' | null>(null);
  const submitInProgressRef = useRef(false);

  const { data: productsData, isLoading: isLoadingProducts } = useProducts(undefined, 1, 500);
  const products = useMemo(
    () => (productsData?.items || []).filter((item) => item.status !== 'INACTIVE' && item.status !== 'SUPERSEDED'),
    [productsData?.items]
  );
  const { data: materialsData, isLoading: isLoadingMaterials } = useMaterials(undefined, 1, 1000);
  const rawMaterials = useMemo(
    () => (materialsData?.items || []).filter((item) => item.status !== 'INACTIVE' && item.status !== 'SUPERSEDED'),
    [materialsData?.items]
  );
  const { data: uomsData, isLoading: isLoadingUoms } = useUoms();
  const uoms = useMemo(
    () => uomsData?.items || [],
    [uomsData?.items]
  );
  const [form, setForm] = useState({
    scheduleDate: new Date().toISOString().slice(0, 10),
    productId: '',
    bomVersionId: '',
    routeId: '',
    scheduleType: 'DAY',
    quantity: 0,
    priority: 0,
    batchReference: `BATCH-${new Date().getFullYear()}-${new Date().getMonth() + 1}`,
  });
  const [autoFedProductId, setAutoFedProductId] = useState<string>('');
  const [existingPlanNumber, setExistingPlanNumber] = useState<string>('');
  const [isDraftEdit, setIsDraftEdit] = useState(false);
  // BOM State matching ProductCreationWorkspace (Image #1)
  const [bomLines, setBomLines] = useState<ProductBomLine[]>([]);
  const [selectedBomVersionIds, setSelectedBomVersionIds] = useState<string[]>([]);
  const [selectedBomVersionId, setSelectedBomVersionId] = useState<string>('');
  const [appendedBomNames, setAppendedBomNames] = useState<string[]>([]);
  const [bomName, setBomName] = useState('');
  const [savedBoms, setSavedBoms] = useState<SavedBomItem[]>([]);
  const [editingSavedBomId, setEditingSavedBomId] = useState<string | null>(null);
  const [isAutoFeedingBom, setIsAutoFeedingBom] = useState(false);
  const [isBomCollapsed, setIsBomCollapsed] = useState(false);
  const [draggedBomIndex, setDraggedBomIndex] = useState<number | null>(null);
  const dragSourceIndexRef = useRef<number | null>(null);
  const loadedPlanIdRef = useRef<string>('');
  const autoFedRouteKeyRef = useRef<string>('');
  const targetQuantityInputRef = useRef<HTMLInputElement>(null);
  const [quantityError, setQuantityError] = useState(false);

  // Production Route State matching ProductCreationWorkspace (Image #3)
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [routeDraft, setRouteDraft] = useState<EditableRouteDraft | null>(null);
  const [allocationQuantityInputs, setAllocationQuantityInputs] = useState<Record<string, string>>({});
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [draggingDepartmentId, setDraggingDepartmentId] = useState('');
  const [draggingRouteStepId, setDraggingRouteStepId] = useState('');
  const { data: departmentsData } = useDepartments('ACTIVE');
  const assemblyDepartment = useMemo(
    () => resolveAssemblyDepartment(departmentsData?.items || []),
    [departmentsData?.items]
  );
  const departments = useMemo(
    () => (departmentsData?.items || []).filter((department) =>
      department.id !== assemblyDepartment?.id && isProductionExecutionDepartment(department)
    ),
    [departmentsData?.items, assemblyDepartment?.id]
  );

  const [stockShortages, setStockShortages] = useState<Array<{ materialName?: string; materialCode?: string; required: number; available: number; shortage: number; uom?: string }>>([]);
  const [stockCheckStatus, setStockCheckStatus] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [stockRequirements, setStockRequirements] = useState<ProductionInventoryAvailabilityLine[]>([]);
  const [stockCheckError, setStockCheckError] = useState('');

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === form.productId),
    [products, form.productId]
  );
  const selectedProductIsVariant = Boolean(
    selectedProduct?.isVariant || selectedProduct?.parentOptionId || selectedProduct?.parentProductId
    || selectedProduct?.metadata?.isVariant || selectedProduct?.metadata?.parentProductId
  );
  const selectedProductParentId = selectedProduct?.parentProductId || selectedProduct?.parentOptionId
    || (typeof selectedProduct?.metadata?.parentProductId === 'string' ? selectedProduct.metadata.parentProductId : undefined);
  const productionProductId = selectedProductIsVariant
    ? selectedProductParentId || form.productId
    : form.productId;
  const productionProductVariantId = selectedProductIsVariant && selectedProduct && !selectedProduct.id.includes('__var__')
    ? selectedProduct.id
    : undefined;

  // Production Route State matching ProductCreationWorkspace (Image #3)
  // All system BOMs for the dropdown selector
  const allSystemBoms = useBomVersions({ limit: 200 });
  const productBomsQuery = useBomVersions(
    { productId: productionProductId || undefined, productVariantId: productionProductVariantId },
    { enabled: Boolean(productionProductId) }
  );

  // Approved Product Routes for selected product (or all routes if no product chosen yet)
  const { data: routesData, isLoading: isLoadingRoutes } = useProductRoutes(productionProductId || undefined);
  const routes = useMemo(
    () => (routesData?.items || []).filter((route) => route.status === 'APPROVED' || route.status === 'ACTIVE'),
    [routesData?.items]
  );

  const routeBomVersionId = selectedBomVersionIds.length > 1
    ? ''
    : selectedBomVersionIds[0] || selectedBomVersionId || form.bomVersionId;
  const matchingGraphRoutes = useMemo(() => {
    if (!productionProductId || !routeBomVersionId || selectedBomVersionIds.length > 1) return [];
    return routes.filter((route) => {
      const graphRoute = route as unknown as RouteWithOptionalProduct;
      return Boolean(graphRoute.graphReviewedAt)
        && graphRoute.productId === productionProductId
        && graphRoute.bomVersionId === routeBomVersionId;
    });
  }, [routes, productionProductId, routeBomVersionId, selectedBomVersionIds.length]);
  const selectedGraphRoute = useMemo(
    () => matchingGraphRoutes.find((route) => route.id === selectedRouteId),
    [matchingGraphRoutes, selectedRouteId]
  );

  const planQuantity = Math.max(1, Number(form.quantity) || 1);
  const prevPlanQuantityRef = useRef<number>(planQuantity);
  const routeOutputItemId = productionProductId || '';
  const routeOutputUomId = selectedProduct?.uomId || uoms[0]?.id || '';

  const uomForLine = useCallback((line: ProductBomLine) => {
    const match = uoms.find((uom) => uom.id === line.uomId);
    return match?.symbol || match?.name || '';
  }, [uoms]);

  const getScheduleTotalBomQty = useCallback((line: ProductBomLine, currentPlanQty: number = planQuantity) => {
    const lineQty = Number(line.quantity) || 0;
    const isFixed = line.quantityMode === 'FIXED';
    const mult = isFixed ? 1 : Math.max(1, currentPlanQty);
    return Number((lineQty * mult).toFixed(6));
  }, [planQuantity]);

  const createRouteDraft = useCallback((route: RouteWithOptionalProduct, currentPlanQty: number = planQuantity): EditableRouteDraft => {
    const steps = (route.steps || []).map((step) => ({
      ...step,
      id: step.id,
      branchKey: step.branchKey || 'Branch 1',
      stepOrder: Number(step.stepOrder || 1),
      stepName: step.stepName || step.department?.name || 'Production step',
      departmentId: step.departmentId || step.department?.id || '',
      // Older routes may not have step outputs. Inherit the finished product
      // output used by route setup so the schedule editor starts with valid,
      // visible values that can be reviewed or changed before saving.
      outputItemType: step.outputItemId && step.outputUomId ? step.outputItemType || 'PRODUCT' : 'PRODUCT',
      outputItemId: step.outputItemId && step.outputUomId ? step.outputItemId : routeOutputItemId,
      outputUomId: step.outputItemId && step.outputUomId ? step.outputUomId : routeOutputUomId,
      outputQuantityPerUnit: step.outputItemId && step.outputUomId ? Number(step.outputQuantityPerUnit ?? 1) : 1,
      nextDepartmentId: step.nextDepartmentId || null,
    }));
    return {
      sourceRouteId: route.id || '',
      steps,
      allocations: (route.materialAllocations || []).map((allocation) => {
        const line = bomLines.find((l) => l.bomLineId === allocation.bomLineId);
        const isFixed = line?.quantityMode === 'FIXED';
        const mult = isFixed ? 1 : Math.max(1, currentPlanQty);
        return {
          bomLineId: allocation.bomLineId,
          stepKey: steps.find((step) => step.id === allocation.routeStepId)?.id || null,
          quantity: Number((Number(allocation.quantity || 0) * mult).toFixed(6)),
        };
      }),
      assemblyDepartmentId: route.assemblyDepartmentId || (selectedGraphRoute as any)?.assemblyDepartmentId || assemblyDepartment?.id || '',
      changed: false,
    };
  }, [assemblyDepartment?.id, bomLines, planQuantity, routeOutputItemId, routeOutputUomId, selectedGraphRoute]);

  useEffect(() => {
    if (!selectedGraphRoute || routeDraft?.sourceRouteId === selectedGraphRoute.id) return;
    setRouteDraft(createRouteDraft(selectedGraphRoute as unknown as RouteWithOptionalProduct, planQuantity));
  // Route data is the source only until the user edits the local schedule copy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGraphRoute?.id, selectedGraphRoute?.steps, selectedGraphRoute?.materialAllocations, createRouteDraft, planQuantity, routeDraft?.sourceRouteId]);

  // Keep route allotments proportional to Target Planned Quantity
  useEffect(() => {
    const prevQty = prevPlanQuantityRef.current;
    if (prevQty === planQuantity) return;
    prevPlanQuantityRef.current = planQuantity;

    if (!routeDraft) return;

    if (!routeDraft.changed && selectedGraphRoute) {
      setRouteDraft(createRouteDraft(selectedGraphRoute as unknown as RouteWithOptionalProduct, planQuantity));
      setAllocationQuantityInputs({});
      return;
    }

    const ratio = planQuantity / (prevQty || 1);
    setRouteDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        allocations: current.allocations.map((alloc) => {
          const line = bomLines.find((l) => l.bomLineId === alloc.bomLineId);
          if (line?.quantityMode === 'FIXED') return alloc;
          return {
            ...alloc,
            quantity: Number((alloc.quantity * ratio).toFixed(6)),
          };
        }),
      };
    });
    setAllocationQuantityInputs({});
  }, [planQuantity, routeDraft, selectedGraphRoute, bomLines, createRouteDraft]);



  const allAvailableBoms = useMemo(() => {
    const direct = productBomsQuery.data?.items || [];
    const system = allSystemBoms.data?.items || [];
    const map = new Map<string, typeof system[0]>();
    for (const b of [...direct, ...system]) {
      if (!map.has(b.id)) map.set(b.id, b);
    }
    return Array.from(map.values());
  }, [productBomsQuery.data?.items, allSystemBoms.data?.items]);

  const bomOptions: BomSelectorOption[] = useMemo(() => {
    return allAvailableBoms.map((bom) => {
      const matObj = ('material' in bom && bom.material && typeof bom.material === 'object')
        ? (bom as unknown as BomVersionOptionalMaterial).material
        : undefined;
      const resolvedName = bom.product?.name || matObj?.name || bom.product?.sku || matObj?.code || 'BOM';
      return {
        id: bom.id,
        name: `${bom.bomNumber || `BOM v${bom.version}`} — ${resolvedName}`,
        code: `v${bom.version}`,
        productName: bom.product?.name || matObj?.name,
        productSku: bom.product?.sku || matObj?.code,
      };
    });
  }, [allAvailableBoms]);

  const routeOptions = useMemo(() => {
    return matchingGraphRoutes.map((route) => ({
      id: route.id,
      name: `${route.code} — ${route.name}`,
      code: route.code,
      stepCount: route.steps?.length || 0,
    }));
  }, [matchingGraphRoutes]);

  // Combined materials and products for line items selection
  const bomItems = useMemo(() => {
    const filteredMaterials = rawMaterials.filter((m) => {
      const name = (m.name || '').trim();
      const code = (m.code || '').trim();
      if (/^(sun|mon|tue|wed|thu|fri|sat)\s+/i.test(name) || /gmt\+\d+/i.test(name)) return false;
      if (/^sufiyan\s+mirza$/i.test(name) || /^sufiyan-mirza$/i.test(code)) return false;
      if (/^total\s+no\.\s+of\s+bundles/i.test(name) || /^return\s+material\s+handover/i.test(name)) return false;
      return true;
    });

    const materialItems: CatalogItemWithHierarchy[] = filteredMaterials.map((item) => {
      const typedItem = item as unknown as CatalogItemWithHierarchy;
      const parentId = typedItem.parentMaterialId || typedItem.materialId || typedItem.specs?.parentMaterialId || undefined;
      const isVar = Boolean(typedItem.isVariant || typedItem.specs?.isVariant || parentId);
      return {
        ...typedItem,
        name: typedItem.name || 'Unnamed Material',
        isVariant: isVar,
        parentMaterialId: parentId,
        parentOptionId: parentId || undefined,
      };
    });
    const productItems: CatalogItemWithHierarchy[] = (products || []).map((item) => {
      const typedItem = item as unknown as CatalogItemWithHierarchy;
      const parentId = typedItem.parentProductId || typedItem.productId || typedItem.metadata?.parentProductId || undefined;
      const isVar = Boolean(typedItem.isVariant || typedItem.metadata?.isVariant || parentId);
      return {
        ...typedItem,
        name: typedItem.name || 'Unnamed Product',
        isVariant: isVar,
        parentProductId: parentId,
        parentOptionId: parentId || undefined,
      };
    });
    const byId = new Map<string, CatalogItemWithHierarchy>([...materialItems, ...productItems].map((item) => [item.id, item]));
    const childrenByParent = new Map<string, CatalogItemWithHierarchy[]>();
    const rootItems = Array.from(byId.values()).filter((item) => !item.parentOptionId || !byId.has(item.parentOptionId));
    for (const item of byId.values()) {
      if (!item.parentOptionId || !byId.has(item.parentOptionId)) continue;
      const children = childrenByParent.get(item.parentOptionId) || [];
      children.push(item);
      childrenByParent.set(item.parentOptionId, children);
    }
    const ordered: CatalogItemWithHierarchy[] = [];
    for (const item of rootItems) {
      ordered.push(item);
      const children = childrenByParent.get(item.id) || [];
      ordered.push(...children.map((child) => ({
        ...child,
        isVariant: true,
        parentOptionId: item.id,
        parentItemName: (item.name || child.parentItemName || child.parentProductName || child.parentMaterialName) || undefined,
        parentCode: item.code || child.parentCode,
        parentSku: item.sku || child.parentSku,
        category: child.category || item.category,
      })));
    }
    return ordered;
  }, [rawMaterials, products]);

  const routeOutputOptions = useMemo(() => bomItems.map((item) => {
    const uom = uoms.find((candidate) => candidate.id === item.uomId);
    const itemType: 'PRODUCT' | 'MATERIAL' = products.some((product) => product.id === item.id || product.id === item.parentProductId || product.id === item.parentOptionId)
      || Boolean(item.parentProductId || item.productId)
      ? 'PRODUCT'
      : 'MATERIAL';
    return {
      id: item.id,
      name: `${item.name}${uom ? ` (${uom.symbol || uom.name})` : ''}`,
      code: item.code || item.sku,
      sku: item.sku,
      isVariant: item.isVariant,
      parentOptionId: item.parentOptionId,
      parentItemName: item.parentItemName,
      itemType,
    };
  }), [bomItems, products, uoms]);

  const routeUomOptions = useMemo(() => uoms.map((uom) => ({
    id: uom.id,
    name: `${uom.name}${uom.symbol ? ` (${uom.symbol})` : ''}`,
    code: uom.symbol || undefined,
  })), [uoms]);

  const areBomLinesComplete = bomLines.length > 0 && bomLines.every((line) =>
    Boolean(line.materialId && line.uomId && Number(line.quantity) > 0)
  );

  // Check the recipe currently shown in the form against live inventory. This
  // intentionally uses the edited BOM lines, rather than resolving an unrelated
  // approved BOM for the selected finished good.
  useEffect(() => {
    let isCurrent = true;
    const clearCheck = (status: 'idle' | 'error', message = '') => {
      setStockRequirements([]);
      setStockShortages([]);
      setStockCheckError(message);
      setStockCheckStatus(status);
    };

    if (!form.productId || Number(form.quantity) <= 0 || bomLines.length === 0) {
      clearCheck('idle');
      return () => { isCurrent = false; };
    }
    if (!areBomLinesComplete) {
      clearCheck('error', 'Complete every BOM item, quantity, and unit before checking stock.');
      return () => { isCurrent = false; };
    }
    if (!selectedProduct?.uomId) {
      clearCheck('error', 'The selected product has no unit of measure, so material quantities cannot be calculated.');
      return () => { isCurrent = false; };
    }

    let lines: Array<{
      itemType: 'MATERIAL' | 'PRODUCT';
      itemId: string;
      parentItemId?: string;
      uomId: string;
      quantity: number;
      quantityMode: 'FIXED' | 'SCALED';
      roundingRule: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
      roundingPrecision?: number | null;
    }>;
    try {
      lines = bomLines.map((line) => {
        const selectedItem = bomItems.find((item) => item.id === line.materialId);
        const parentItemId = selectedItem?.parentMaterialId || selectedItem?.parentProductId || selectedItem?.parentOptionId;
        const variantId = selectedVariantIdFromNote(line.note);
        const variantLabel = selectedVariantLabelFromNote(line.note);
        const selectedItemIsVariant = Boolean(selectedItem?.isVariant || parentItemId);
        const inventoryVariantId = variantId || (selectedItemIsVariant && UUID_PATTERN.test(line.materialId) ? line.materialId : undefined);
        const isVariant = Boolean(variantId || variantLabel || selectedItemIsVariant);
        const itemIsProduct = Boolean(
          products.some((product) => product.id === line.materialId) ||
          selectedItem?.parentProductId ||
          (selectedItem && 'sku' in selectedItem && !selectedItem.parentMaterialId)
        );
        const itemType = itemIsProduct ? 'PRODUCT' : 'MATERIAL';
        const itemId = inventoryVariantId || line.materialId;
        const inventoryParentId = inventoryVariantId
          ? parentItemId || line.materialId
          : isVariant
            ? parentItemId
            : undefined;

        if (!selectedItem && !variantId) {
          throw new Error(`The BOM item “${line.materialName || line.materialId}” is no longer in the item catalog.`);
        }
        if (isVariant && !inventoryVariantId) {
          throw new Error(`The selected variant “${selectedItem?.name || line.materialName || 'item'}” has no saved inventory item ID, so its stock cannot be verified.`);
        }
        if (!UUID_PATTERN.test(itemId) || (inventoryParentId && !UUID_PATTERN.test(inventoryParentId))) {
          throw new Error(`The BOM item “${line.materialName || line.materialId}” is not linked to a valid inventory record.`);
        }

        return {
          itemType,
          itemId,
          parentItemId: inventoryParentId,
          uomId: line.uomId,
          quantity: Number(line.quantity),
          quantityMode: line.quantityMode || 'SCALED',
          roundingRule: line.roundingRule || 'NONE',
          roundingPrecision: line.roundingPrecision ?? null,
        };
      });
    } catch (error) {
      clearCheck('error', error instanceof Error ? error.message : 'A BOM item could not be linked to inventory.');
      return () => { isCurrent = false; };
    }

    setStockRequirements([]);
    setStockShortages([]);
    setStockCheckError('');
    setStockCheckStatus('checking');
    const timer = window.setTimeout(() => {
      productionApi.checkAvailability({
        scheduleDate: form.scheduleDate,
        productId: productionProductId,
        quantityUomId: selectedProduct.uomId,
        quantity: Number(form.quantity),
        lines,
      })
        .then((result) => {
          if (!isCurrent) return;
          setStockRequirements(result.requirements || []);
          setStockShortages((result.requirements || []).filter((line) => line.shortageQuantity > 0.000001).map((line) => ({
            materialName: line.itemName,
            materialCode: line.itemCode || '',
            required: line.requiredQuantity,
            available: line.availableQuantity,
            shortage: line.shortageQuantity,
            uom: line.uomSymbol,
          })));
          setStockCheckError('');
          setStockCheckStatus('ready');
        })
        .catch((error: unknown) => {
          if (!isCurrent) return;
          setStockRequirements([]);
          setStockShortages([]);
          setStockCheckError(friendlyErrorMessage(error) || 'Inventory availability could not be verified.');
          setStockCheckStatus('error');
        });
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [form.productId, form.quantity, form.scheduleDate, bomLines, areBomLinesComplete, bomItems, products, selectedProduct, productionProductId]);

  // Load existing plan data if editId or cloneFrom query param is provided
  useEffect(() => {
    const targetPlanId = editId || cloneId;
    if (!targetPlanId || isLoadingProducts || isLoadingMaterials || isLoadingUoms) return;
    if (loadedPlanIdRef.current === targetPlanId) return;
    // Keep the request one-shot even when React re-runs this effect in
    // Strict Mode or when catalog data changes after it has loaded.
    loadedPlanIdRef.current = targetPlanId;

    fetchApi<ProductionPlan>(`/production/plans/${targetPlanId}`)
      .then(async (plan) => {
        if (!plan) return;
        setExistingPlanNumber(plan.planNumber || '');
        setIsDraftEdit(plan.status === 'DRAFT');
        setForm((prev) => ({
          ...prev,
          scheduleDate: plan.scheduleDate ? String(plan.scheduleDate).slice(0, 10) : prev.scheduleDate,
          productId: plan.productId || prev.productId,
          bomVersionId: plan.bomVersionId || prev.bomVersionId,
          routeId: plan.routeId || prev.routeId,
          quantity: Number(plan.quantity) || prev.quantity,
          scheduleType: plan.scheduleType || prev.scheduleType,
          priority: plan.priority !== undefined ? Number(plan.priority) : prev.priority,
        }));

        // Load BOM lines if bomVersionId exists
        if (plan.bomVersionId) {
          try {
            const detail = await bomApi.getVersion(plan.bomVersionId);
            const rawLines = (detail.lines || []) as unknown as RawBomLinePayload[];
            if (rawLines.length > 0) {
              const loadedLines: ProductBomLine[] = rawLines.map((line, idx) => {
                const matId = resolveBomComponentId(line, bomItems);
                const foundMat = bomItems.find((m) => m.id === matId);
                const resolvedUomId = line.uomId || line.uom?.id || foundMat?.uomId || uoms[0]?.id || '';
                const rawQty = line.quantity !== undefined && line.quantity !== null ? Number(line.quantity) : 1;
                const matUnitCost = foundMat ? getMaterialCost(foundMat) : 0;
                const lineCostVal = Math.round(matUnitCost * rawQty * 100) / 100;
                return {
                  id: `line-plan-${Date.now()}-${idx}`,
                  bomLineId: line.id,
                  materialId: matId,
                  materialName: foundMat?.name || line.material?.name || line.componentProduct?.name || '',
                  materialCode: foundMat?.code || foundMat?.sku || line.material?.code || line.componentProduct?.sku || '',
                  quantity: isNaN(rawQty) ? '1' : String(rawQty),
                  uomId: resolvedUomId,
                  quantityMode: line.quantityMode || 'SCALED',
                  roundingRule: line.roundingRule || 'NONE',
                  roundingPrecision: line.roundingPrecision ?? null,
                  unitCost: matUnitCost > 0 ? String(matUnitCost) : '',
                  lineCost: lineCostVal > 0 ? String(lineCostVal) : '',
                  note: line.note || '',
                  sourceBomVersionId: plan.bomVersionId,
                };
              });
              setBomLines(loadedLines);
              setSelectedBomVersionId(plan.bomVersionId);
              setSelectedBomVersionIds([plan.bomVersionId]);
              setAppendedBomNames([`${detail.bomNumber} (v${detail.version})`]);
            }
          } catch {
            // Ignore error if bom detail cannot be loaded
          }
        }

        // Load Route steps if routeId exists
        if (plan.routeId) {
          setSelectedRouteId(plan.routeId);
        }

      })
      .catch((error: unknown) => {
        loadedPlanIdRef.current = '';
        showToast({
          kind: 'error',
          title: 'Unable to load production schedule',
          message: friendlyErrorMessage(error),
        });
      });
  }, [editId, cloneId, isLoadingProducts, isLoadingMaterials, isLoadingUoms, bomItems, uoms]);

  // Auto-feed the default BOM when the product changes (guarded to run once per product).
  useEffect(() => {
    if (!form.productId) {
      setAutoFedProductId('');
      return;
    }
    // Edit and clone flows restore the source plan's BOM and route directly.
    // Auto-feeding here can overwrite those values and emits misleading notices.
    if (isEditMode || cloneId) return;
    if (autoFedProductId === form.productId) return;

    let fed = false;

    // 1. Auto-feed product's primary approved BOM if bomLines is empty
    if (bomLines.length === 0 && allAvailableBoms.length > 0) {
      const modelPrefix = (selectedProduct?.sku || selectedProduct?.name || '').match(/CS\d+/i)?.[0];

      const matchedBom =
        (productionProductVariantId
          ? allAvailableBoms.find((b) => b.productId === productionProductId && b.productVariantId === productionProductVariantId && b.status === 'APPROVED')
          : undefined) ||
        allAvailableBoms.find((b) => b.productId === productionProductId && !b.productVariantId && b.status === 'APPROVED') ||
        allAvailableBoms.find((b) => b.productId === productionProductId && !b.productVariantId) ||
        allAvailableBoms.find((b) => b.productId === productionProductId && b.status === 'APPROVED') ||
        allAvailableBoms.find((b) => b.productId === productionProductId) ||
        (modelPrefix
          ? allAvailableBoms.find(
              (b) =>
                b.status === 'APPROVED' &&
                (b.bomNumber?.toUpperCase().includes(modelPrefix.toUpperCase()) ||
                 b.product?.name?.toUpperCase().includes(modelPrefix.toUpperCase()) ||
                 b.product?.sku?.toUpperCase().includes(modelPrefix.toUpperCase()))
            )
          : undefined) ||
        allAvailableBoms.find(
          (b) =>
            b.status === 'APPROVED' &&
            (b.product?.sku === selectedProduct?.sku ||
             b.product?.name === selectedProduct?.name ||
             b.material?.code === selectedProduct?.sku ||
             b.material?.name === selectedProduct?.name)
        );

      if (matchedBom) {
        handleAutoFeedBom(matchedBom.id);
        fed = true;
      }
    }

    if (fed || allAvailableBoms.length > 0) {
      setAutoFedProductId(form.productId);
    }
  }, [form.productId, productionProductId, productionProductVariantId, allAvailableBoms, selectedProduct, bomLines.length, autoFedProductId, isEditMode, cloneId]);

  // A production schedule must use the reviewed route graph bound to this
  // product and exact BOM. Never fall back to a similarly named/legacy route.
  useEffect(() => {
    if (!productionProductId || !routeBomVersionId || isEditMode || cloneId) return;
    const routeKey = `${productionProductId}:${routeBomVersionId}`;
    const currentRoute = routes.find((route) => route.id === selectedRouteId) as unknown as RouteWithOptionalProduct | undefined;
    if (selectedBomVersionIds.length <= 1 && currentRoute?.graphReviewedAt && currentRoute.productId === productionProductId && currentRoute.bomVersionId === routeBomVersionId) return;
    if (selectedRouteId) {
      setSelectedRouteId('');
      setRouteDraft(null);
      setForm((prev) => ({ ...prev, routeId: '' }));
    }
    if (autoFedRouteKeyRef.current === routeKey) return;
    const matchingRoute = matchingGraphRoutes[0];
    if (matchingRoute) {
      handleAutoFeedRoute(matchingRoute.id);
      autoFedRouteKeyRef.current = routeKey;
    }
  }, [productionProductId, routeBomVersionId, isEditMode, cloneId, routes, selectedRouteId, matchingGraphRoutes, selectedBomVersionIds.length]);

  const handleChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Auto-feed / clone from existing BOM(s) with multi-select and append capability
  const handleAutoFeedBom = async (versionId: string) => {
    if (!versionId) return;
    setIsAutoFeedingBom(true);
    try {
      const detail = await bomApi.getVersion(versionId);
      const rawLines = (detail.lines || []) as unknown as RawBomLinePayload[];
      if (rawLines.length === 0) {
        showToast({
          kind: 'error',
          title: 'Empty BOM Version',
          message: `BOM "${detail.bomNumber}" does not contain any material formulation lines.`,
        });
        return;
      }

      const allMaterials = bomItems;
      const allProducts = products;
      const modelPrefix = (detail.bomNumber || '').match(/CS\d+/i)?.[0] || '';

      const normalize = (str: string) =>
        (str || '')
          .toLowerCase()
          .replace(/[–—]/g, '-')
          .replace(/×/g, 'x')
          .replace(/[*]/g, 'x')
          .replace(/["”]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      const newLines: ProductBomLine[] = rawLines
        .slice()
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .map((line, idx) => {
          let matId = resolveBomComponentId(line, allMaterials);
          let matName = line.material?.name || line.componentProduct?.name || line.material?.code || line.componentProduct?.sku || '';
          let matCode = line.material?.code || line.componentProduct?.sku || '';
          const lineNote = (line.note || '').trim();

          // 1. If matId is empty, match with known materials/products from line.note
          if (!matId && lineNote) {
            const noteParts = lineNote.split(' — ');
            const fullTitle = (noteParts[0] || '').trim();
            const shortTitle = fullTitle.split(/[–—]/)[0].trim();
            const candidates = [fullTitle, shortTitle].filter(Boolean);

            let matchedMat: CatalogItemWithHierarchy | undefined = undefined;
            let matchedProd: (typeof allProducts)[number] | undefined = undefined;

            for (const cand of candidates) {
              const nCand = normalize(cand);

              // 1a. Exact match
              matchedMat = allMaterials.find((m) => {
                const nm = normalize(m.name || '');
                const nc = normalize(m.code || '');
                return nm === nCand || nc === nCand;
              });
              if (matchedMat) break;

              matchedProd = allProducts.find((p) => {
                const np = normalize(p.name || '');
                const ns = normalize(p.sku || '');
                return np === nCand || ns === nCand;
              });
              if (matchedProd) break;

              // 1b. Model prefix match (e.g. CS8 - 827mm Pipe)
              if (modelPrefix) {
                const withPrefix = normalize(`${modelPrefix} - ${cand}`);
                matchedMat = allMaterials.find((m) => {
                  const nm = normalize(m.name || '');
                  const nc = normalize(m.code || '');
                  return nm === withPrefix || nc === withPrefix || nm.startsWith(withPrefix);
                });
                if (matchedMat) break;

                matchedProd = allProducts.find((p) => {
                  const np = normalize(p.name || '');
                  const ns = normalize(p.sku || '');
                  return np === withPrefix || ns === withPrefix || np.startsWith(withPrefix);
                });
                if (matchedProd) break;
              }

              // 1c. Slash alternatives (e.g. "Side Cap / Bottom Cap")
              if (cand.includes('/')) {
                const alts = cand.split('/').map((s: string) => s.trim());
                for (const alt of alts) {
                  const nAlt = normalize(alt);
                  matchedMat = allMaterials.find((m) => normalize(m.name || '') === nAlt || normalize(m.code || '') === nAlt);
                  if (!matchedMat && modelPrefix) {
                    const withPref = normalize(`${modelPrefix} - ${alt}`);
                    matchedMat = allMaterials.find((m) => normalize(m.name || '') === withPref || normalize(m.code || '') === withPref);
                  }
                  if (matchedMat) break;

                  matchedProd = allProducts.find((p) => normalize(p.name || '') === nAlt || normalize(p.sku || '') === nAlt);
                  if (!matchedProd && modelPrefix) {
                    const withPref = normalize(`${modelPrefix} - ${alt}`);
                    matchedProd = allProducts.find((p) => normalize(p.name || '') === withPref || normalize(p.sku || '') === withPref);
                  }
                  if (matchedProd) break;
                }
                if (matchedMat || matchedProd) break;
              }
            }

            // 1d. Substring inclusion match (if >= 4 chars)
            if (!matchedMat && !matchedProd) {
              const nFull = normalize(fullTitle);
              matchedMat = allMaterials.find((m) => {
                const nm = normalize(m.name || '');
                const nc = normalize(m.code || '');
                return (nm.length >= 4 && (nFull.includes(nm) || nm.includes(nFull))) ||
                  (nc.length >= 4 && (nFull.includes(nc) || nc.includes(nFull)));
              });
            }

            // 1e. Token overlap scoring with model bonus
            if (!matchedMat && !matchedProd) {
              const nFull = normalize(fullTitle);
              const tokens = nFull.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !['with', 'without', 'and', 'or', 'various'].includes(t));
              let bestMat: CatalogItemWithHierarchy | undefined = undefined;
              let maxScore = 0;
              for (const m of allMaterials) {
                const mNorm = normalize((m.name || '') + ' ' + (m.code || ''));
                let score = 0;
                if (modelPrefix && mNorm.includes(modelPrefix.toLowerCase())) score += 4;
                for (const token of tokens) {
                  if (mNorm.includes(token)) score += 3;
                }
                if (score > maxScore && score >= 4) {
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

          // 2. If matId is still empty but we have a note/label, use note as the material label and fallback to first material or custom
          if (!matId && lineNote) {
            matName = lineNote.split(/[—–]/)[0].trim();
            const fallbackItem = allMaterials[0];
            matId = fallbackItem?.id || `custom-${Date.now()}-${idx}`;
            matCode = fallbackItem?.code || 'CUSTOM';
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

          const foundItem = allMaterials.find((m) => m.id === matId);
          const resolvedUomId = line.uomId || line.uom?.id || foundItem?.uomId || uoms[0]?.id || '';
          const rawQty = line.quantity !== undefined && line.quantity !== null ? Number(line.quantity) : 1;
          const matUnitCost = foundItem ? getMaterialCost(foundItem) : 0;
          const lineCostVal = Math.round(matUnitCost * rawQty * 100) / 100;

          return {
            id: `line-autofed-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            bomLineId: line.id,
            materialId: matId,
            materialName: matName || foundItem?.name || 'Item',
            materialCode: matCode || foundItem?.code || '',
            quantity: isNaN(rawQty) ? '1' : String(rawQty),
            uomId: resolvedUomId,
            quantityMode: line.quantityMode || 'SCALED',
            roundingRule: line.roundingRule || 'NONE',
            roundingPrecision: line.roundingPrecision ?? null,
            unitCost: matUnitCost > 0 ? String(matUnitCost) : '',
            lineCost: lineCostVal > 0 ? String(lineCostVal) : '',
            note: line.note || '',
            sourceBomVersionId: versionId,
          };
        });
      setBomLines((current) => [...current, ...newLines]);
      setSelectedBomVersionId(versionId);
      setForm((prev) => ({ ...prev, bomVersionId: versionId }));
      setSelectedBomVersionIds((prev) => [...new Set([...prev, versionId])]);
      setAppendedBomNames((prev) => [...new Set([...prev, `${detail.bomNumber} (v${detail.version})`])]);
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        title: 'Failed to Auto-Feed BOM',
        message: err instanceof Error ? err.message : 'Could not load BOM version details.',
      });
    } finally {
      setIsAutoFeedingBom(false);
    }
  };

  const handleToggleBomVersion = async (versionId: string) => {
    if (selectedBomVersionIds.includes(versionId)) {
      const remainingVersionIds = selectedBomVersionIds.filter((id) => id !== versionId);
      setSelectedBomVersionIds(remainingVersionIds);
      setBomLines((prev) => prev.filter((line) => line.sourceBomVersionId !== versionId));
      const bomObj = bomOptions.find((b) => b.id === versionId);
      if (bomObj) {
        setAppendedBomNames((prev) => prev.filter((name) => !name.startsWith(bomObj.name.split(' — ')[0])));
      }
      if (selectedBomVersionId === versionId) setSelectedBomVersionId(remainingVersionIds[0] || '');
      if (form.bomVersionId === versionId) setForm((prev) => ({ ...prev, bomVersionId: remainingVersionIds[0] || '' }));
    } else {
      await handleAutoFeedBom(versionId);
    }
  };

  const handleClearBomSelection = () => {
    setBomLines((prev) => prev.filter((line) => !line.sourceBomVersionId));
    setSelectedBomVersionIds([]);
    setAppendedBomNames([]);
    setSelectedBomVersionId('');
    setForm((prev) => ({ ...prev, bomVersionId: '' }));
  };

  const moveBomLine = (from: number, to: number) => {
    setBomLines((current) => {
      if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Route Helpers
  const handleAutoFeedRoute = (routeId: string) => {
    if (!routeId) return;
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    const graphRoute = route as unknown as RouteWithOptionalProduct;
    if (!graphRoute.graphReviewedAt || !graphRoute.bomVersionId || !(route.steps || []).length) {
      showToast({
        kind: 'error',
        title: 'Route is not ready for scheduling',
        message: 'Select a reviewed production route with departments, sub-departments, and BOM allotments.',
      });
      return;
    }
    setSelectedRouteId(routeId);
    setRouteDraft(createRouteDraft(graphRoute, planQuantity));
    setAllocationQuantityInputs({});
    setForm((prev) => ({ ...prev, routeId }));
  };

  const addDepartmentToRoute = (departmentId: string, underBranch?: string, afterStepId?: string) => {
    const department = departments.find((item) => item.id === departmentId);
    if (!department || !routeDraft) return;
    setRouteDraft((current) => {
      if (!current) return current;
      let branchKey = underBranch || `Branch ${current.steps.length + 1}`;
      if (!underBranch) {
        const usedBranches = new Set(current.steps.map((step) => step.branchKey));
        let index = 1;
        while (usedBranches.has(`Branch ${index}`)) index += 1;
        branchKey = `Branch ${index}`;
      }
      const branchSteps = current.steps.filter((step) => step.branchKey === branchKey)
        .sort((a, b) => a.stepOrder - b.stepOrder);
      const insertAt = afterStepId ? branchSteps.findIndex((step) => step.id === afterStepId) + 1 : branchSteps.length;
      const template = (afterStepId ? branchSteps.find((step) => step.id === afterStepId) : branchSteps.at(-1)) || current.steps[0];
      const id = `schedule-step-${crypto.randomUUID()}`;
      const newStep: EditableRouteStep = {
        id,
        branchKey,
        stepOrder: branchSteps.length + 1,
        parentStepId: insertAt > 0 ? branchSteps[insertAt - 1]?.id || null : null,
        stepName: department.name,
        departmentId: department.id,
        department: { id: department.id, name: department.name, code: department.code },
        standardDurationMinutes: null,
        isQcRequired: false,
        workCenterId: null,
        outputItemType: template?.outputItemId && template?.outputUomId ? template.outputItemType || 'PRODUCT' : 'PRODUCT',
        outputItemId: template?.outputItemId && template?.outputUomId ? template.outputItemId : routeOutputItemId,
        outputUomId: template?.outputItemId && template?.outputUomId ? template.outputUomId : routeOutputUomId,
        outputQuantityPerUnit: template?.outputItemId && template?.outputUomId ? Number(template.outputQuantityPerUnit ?? 1) : 1,
      };
      branchSteps.splice(Math.max(0, insertAt), 0, newStep);
      const normalized = branchSteps.map((step, index) => ({ ...step, stepOrder: index + 1, parentStepId: index === 0 ? null : branchSteps[index - 1].id }));
      return { ...current, steps: current.steps.filter((step) => step.branchKey !== branchKey).concat(normalized), changed: true };
    });
  };

  const reorderRouteStep = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setRouteDraft((current) => {
      if (!current) return current;
      const source = current.steps.find((step) => step.id === sourceId);
      const target = current.steps.find((step) => step.id === targetId);
      if (!source || !target || source.branchKey !== target.branchKey) return current;
      const branchSteps = current.steps.filter((step) => step.branchKey === source.branchKey).sort((a, b) => a.stepOrder - b.stepOrder);
      const from = branchSteps.findIndex((step) => step.id === sourceId);
      const to = branchSteps.findIndex((step) => step.id === targetId);
      const [moved] = branchSteps.splice(from, 1);
      branchSteps.splice(to, 0, moved);
      const normalized = branchSteps.map((step, index) => ({
        ...step,
        stepOrder: index + 1,
        parentStepId: index === 0 ? null : branchSteps[index - 1].id,
      }));
      const nextSteps = current.steps.filter((step) => step.branchKey !== source.branchKey).concat(normalized);
      return { ...current, steps: nextSteps, changed: true };
    });
  };

  const removeRouteStep = (stepId: string) => {
    setRouteDraft((current) => {
      if (!current) return current;
      const target = current.steps.find((step) => step.id === stepId);
      if (!target) return current;
      const remaining = current.steps.filter((step) => step.id !== stepId);
      const branchSteps = remaining.filter((step) => step.branchKey === target.branchKey).sort((a, b) => a.stepOrder - b.stepOrder);
      const normalized = branchSteps.map((step, index) => ({ ...step, stepOrder: index + 1, parentStepId: index === 0 ? null : branchSteps[index - 1].id }));
      const steps = remaining.filter((step) => step.branchKey !== target.branchKey).concat(normalized);
      return {
        ...current,
        steps,
        allocations: current.allocations.filter((allocation) => allocation.stepKey !== stepId),
        changed: true,
      };
    });
  };

  const setRouteAllocation = (bomLineId: string, stepKey: string | null, quantity: number) => {
    setRouteDraft((current) => {
      if (!current) return current;
      const line = bomLines.find((item) => item.bomLineId === bomLineId);
      if (!line) return current;
      const totalScheduleQty = getScheduleTotalBomQty(line);
      const assignedElsewhere = current.allocations
        .filter((allocation) => allocation.bomLineId === bomLineId && allocation.stepKey !== null && allocation.stepKey !== stepKey)
        .reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
      const boundedQuantity = Math.min(Math.max(0, quantity), Math.max(0, totalScheduleQty - assignedElsewhere));
      const allocations = current.allocations.filter((allocation) => !(allocation.bomLineId === bomLineId && allocation.stepKey === stepKey));
      allocations.push({ bomLineId, stepKey, quantity: Number(boundedQuantity.toFixed(6)) });
      return { ...current, allocations, changed: true };
    });
  };

  const routeAllocationInputKey = (bomLineId: string, stepKey: string) => `${bomLineId}:${stepKey}`;
  const availableRouteQuantity = (bomLineId: string, stepKey: string) => {
    const line = bomLines.find((item) => item.bomLineId === bomLineId);
    if (!line) return 0;
    const totalScheduleQty = getScheduleTotalBomQty(line);
    const assignedElsewhere = (routeDraft?.allocations || [])
      .filter((allocation) => allocation.bomLineId === bomLineId && allocation.stepKey !== null && allocation.stepKey !== stepKey)
      .reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
    return Math.max(0, Number((totalScheduleQty - assignedElsewhere).toFixed(6)));
  };

  const addRouteMaterialToStep = (stepKey: string, bomLineId: string) => {
    const available = availableRouteQuantity(bomLineId, stepKey);
    if (available <= 0.000001) return;
    setRouteAllocation(bomLineId, stepKey, available);
    setAllocationQuantityInputs((current) => ({ ...current, [routeAllocationInputKey(bomLineId, stepKey)]: String(available) }));
  };

  const removeRouteMaterialFromStep = (stepKey: string, bomLineId: string) => {
    setRouteDraft((current) => current ? {
      ...current,
      changed: true,
      allocations: current.allocations.filter((allocation) => !(allocation.bomLineId === bomLineId && allocation.stepKey === stepKey)),
    } : current);
    setAllocationQuantityInputs((current) => {
      const next = { ...current };
      delete next[routeAllocationInputKey(bomLineId, stepKey)];
      return next;
    });
  };

  const changeRouteMaterialQuantity = (stepKey: string, bomLineId: string, rawValue: string) => {
    const key = routeAllocationInputKey(bomLineId, stepKey);
    const parsed = rawValue === '' ? 0 : Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    const bounded = Math.min(Math.max(0, parsed), availableRouteQuantity(bomLineId, stepKey));
    setAllocationQuantityInputs((current) => ({ ...current, [key]: rawValue === '' ? '' : String(bounded) }));
    setRouteAllocation(bomLineId, stepKey, bounded);
  };

  // Persist BOM
  const persistInventoryBom = async (productId: string, lines: ProductBomLine[], customBomName?: string, productVariantId?: string): Promise<string> => {
    const bomDraftLines = lines
      .filter((line) => line.materialId && line.uomId && Number(line.quantity) > 0)
      .map((line, index) => {
        const selectedItem = bomItems.find((item) => item.id === line.materialId);
        const isProduct = Boolean(selectedItem && 'sku' in selectedItem && !selectedItem.parentMaterialId);
        const selectedParentId = selectedItem?.parentProductId || selectedItem?.parentMaterialId || selectedItem?.parentOptionId;
        const selectedItemIsVariant = Boolean(selectedParentId || selectedItem?.isVariant);
        const isVariant = Boolean(selectedItemIsVariant || selectedVariantLabelFromNote(line.note));
        const savedVariantId = selectedVariantIdFromNote(line.note) || (selectedItemIsVariant && UUID_PATTERN.test(line.materialId) ? line.materialId : undefined);
        const variantLabel = selectedVariantLabelFromNote(line.note) || (selectedItemIsVariant ? selectedItem?.name : undefined);
        const bomItemId = isVariant && selectedParentId ? selectedParentId : line.materialId;
        const cleanNote = stripSelectedVariantNote(line.note);
        const persistedNote = isVariant
          ? `Selected variant: ${variantLabel || selectedItem?.name || 'Selected variant'}${savedVariantId ? ` (${savedVariantId})` : ''}`
          : '';
        return {
          lineType: 'COMPONENT' as const,
          materialId: isProduct ? undefined : bomItemId,
          componentProductId: isProduct ? bomItemId : undefined,
          uomId: line.uomId,
          quantityMode: line.quantityMode || 'SCALED',
          quantity: Number(line.quantity),
          roundingRule: line.roundingRule || 'NONE',
          roundingPrecision: line.roundingPrecision ?? null,
          sequence: index + 1,
          note: [cleanNote, persistedNote].filter(Boolean).join(' · ').slice(0, 500) || undefined,
        };
      });
    if (!bomDraftLines.length) {
      throw new Error('Please configure at least one valid material line with quantity and unit of measure.');
    }

    // Merge duplicate material/product lines to prevent duplicate key errors in BOM engine
    const mergedMap = new Map<string, (typeof bomDraftLines)[0]>();
    for (const l of bomDraftLines) {
      const variant = selectedVariantLabelFromNote(l.note) || '';
      const key = `${l.materialId ? `mat:${l.materialId}` : `prod:${l.componentProductId}`}::${variant.toLocaleLowerCase()}`;
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity = Number((existing.quantity + l.quantity).toFixed(6));
      } else {
        mergedMap.set(key, { ...l });
      }
    }
    const finalLines = Array.from(mergedMap.values()).map((line, index) => ({
      ...line,
      sequence: index + 1,
    }));

    const bomVersion = await bomApi.createDraft({
      productId,
      productVariantId,
      bomNumber: customBomName?.trim() || undefined,
      note: 'Auto-created from Production Schedule',
      lines: finalLines,
    });
    await bomApi.validate(bomVersion.id);
    await bomApi.approve(bomVersion.id);
    return bomVersion.id;
  };

  // Save & Add Another BOM
  const handleSaveAndAddAnotherBom = async () => {
    const validLines = bomLines.filter((l) => l.materialId && l.uomId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      showToast({
        kind: 'error',
        title: 'BOM Lines Required',
        message: 'Please add at least one valid item line with quantity and UOM before saving this BOM.',
      });
      return;
    }

    if (!form.productId) {
      showToast({
        kind: 'error',
        title: 'Product Required',
        message: 'Please select a target product before saving a BOM recipe.',
      });
      return;
    }

    try {
      const safeName = bomName.trim() || `BOM #${savedBoms.length + 1}`;
      const savedVersionId = await persistInventoryBom(productionProductId, validLines, safeName, productionProductVariantId);
      setSelectedBomVersionId(savedVersionId);
      setForm((prev) => ({ ...prev, bomVersionId: savedVersionId }));

      setSavedBoms((prev) => [
        ...prev,
        {
          id: savedVersionId,
          name: safeName,
          lines: [...validLines],
        },
      ]);

      showToast({
        kind: 'success',
        title: 'BOM Formulation Saved',
        message: `BOM "${safeName}" saved (${validLines.length} items). You can now configure another BOM.`,
      });

      setBomName('');
      setBomLines([]);
      setAppendedBomNames([]);
      setSelectedBomVersionIds([]);
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        title: 'Failed to Save BOM',
        message: err instanceof Error ? err.message : 'Could not save BOM version.',
      });
    }
  };

  const handleEditSavedBom = (savedId: string) => {
    const saved = savedBoms.find((b) => b.id === savedId);
    if (!saved) return;
    setEditingSavedBomId(saved.id);
    setBomName(saved.name);
    setBomLines([...saved.lines]);
    setSelectedBomVersionId(saved.id);
  };

  const handleCancelEditSavedBom = () => {
    setEditingSavedBomId(null);
    setBomName('');
    setBomLines([]);
  };

  const handleRemoveSavedBom = (savedId: string) => {
    setSavedBoms((prev) => prev.filter((b) => b.id !== savedId));
    if (editingSavedBomId === savedId) {
      handleCancelEditSavedBom();
    }
  };

  const bomTotalMaterialCost = useMemo(() => {
    return bomLines.reduce((acc, line) => {
      const qty = parseFloat(String(line.quantity)) || 0;
      const rate = parseFloat(String(line.unitCost)) || (getMaterialCost(bomItems.find((m) => m.id === line.materialId)) || 0);
      return acc + (qty * rate);
    }, 0);
  }, [bomLines, bomItems]);

  const handleSubmit = async (saveAsDraft = false) => {
    // Mutation pending only becomes true after the request starts. Lock at the
    // handler boundary so users cannot queue a second submit while route/BOM
    // persistence and validation requests are still running.
    if (submitInProgressRef.current) return;
    if (!saveAsDraft && (stockCheckStatus !== 'ready' || stockRequirements.length === 0)) {
      showToast({ kind: 'error', title: 'Inventory Check Required', message: stockCheckError || 'Complete the BOM and wait for its inventory check before creating the schedule.' });
      return;
    }
    if (!saveAsDraft && stockShortages.length > 0) {
      showToast({ kind: 'error', title: 'Insufficient Inventory', message: 'Increase available stock or reduce the BOM quantity before creating the production schedule.' });
      return;
    }
    if (!form.productId) {
      showToast({ kind: 'error', title: 'Product Required', message: 'Please select a catalog product.' });
      return;
    }
    const validLines = bomLines.filter((l) => l.materialId && l.uomId && Number(l.quantity) > 0);
    if (validLines.length === 0 || validLines.length !== bomLines.length) {
      showToast({
        kind: 'error',
        title: 'BOM Formula Required',
        message: 'Complete every BOM item line with a valid item, quantity, and unit of measure.',
      });
      return;
    }
    if (Number(form.quantity) <= 0) {
      setQuantityError(true);
      targetQuantityInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetQuantityInputRef.current?.focus({ preventScroll: true });
      showToast({ kind: 'error', title: 'Invalid Quantity', message: 'Target production quantity must be greater than 0.' });
      return;
    }

    submitInProgressRef.current = true;
    setSubmitAction(saveAsDraft ? 'draft' : 'schedule');
    try {
      // 1. Resolve BOM version
      let effectiveBomVersionId = selectedBomVersionId || form.bomVersionId;
      const boundBom = allAvailableBoms.find((b) => b.id === effectiveBomVersionId);
      const isForeignBom = Boolean(boundBom && (
        boundBom.productId !== productionProductId ||
        (boundBom.productVariantId || undefined) !== productionProductVariantId
      ));
      const isMultiBom = selectedBomVersionIds.length > 1;
      const recipeDoesNotMatchSelectedBom = validLines.some((line) => line.sourceBomVersionId !== effectiveBomVersionId);

      // If no version bound yet, or foreign BOM (belongs to another product/template), or multi-BOM, or custom lines/name:
      if (!effectiveBomVersionId || isForeignBom || isMultiBom || recipeDoesNotMatchSelectedBom || bomName.trim()) {
        try {
          effectiveBomVersionId = await persistInventoryBom(
            productionProductId,
            validLines,
            bomName.trim() || (isForeignBom && boundBom?.bomNumber ? `${selectedProduct?.sku || selectedProduct?.parentSku || 'PROD'}-${boundBom.bomNumber}` : `${selectedProduct?.sku || selectedProduct?.parentSku || 'PROD'}-SCH-${Date.now().toString(36).slice(-4).toUpperCase()}`),
            productionProductVariantId
          );
        } catch (persistErr) {
          // If direct persist fails and a valid approved template BOM is available, let backend fallback resolve it
          if (!effectiveBomVersionId) throw persistErr;
        }
      }

      // 2. Resolve Route
      let effectiveRouteId = selectedRouteId || undefined;
      const boundRoute = routes.find((route) => route.id === effectiveRouteId) as unknown as RouteWithOptionalProduct | undefined;
      if (!saveAsDraft && !boundRoute) {
        throw new Error('No reviewed production route is available for this product and BOM. Create and review a route before scheduling production.');
      }
      const selectedAssemblyDepartmentId = routeDraft?.assemblyDepartmentId || boundRoute?.assemblyDepartmentId || assemblyDepartment?.id || '';
      if (!selectedAssemblyDepartmentId) throw new Error('Choose an active Assembly department in a route step’s Next department field before scheduling production.');
      if (boundRoute && (!boundRoute.graphReviewedAt || boundRoute.productId !== productionProductId || boundRoute.bomVersionId !== effectiveBomVersionId)) {
        throw new Error('The selected production route does not match this product and BOM. Select the reviewed route created for this BOM.');
      }
      if (!saveAsDraft && isEditMode && isDraftEdit && !boundRoute) {
        throw new Error('Select a reviewed production route before submitting this draft.');
      }

      let routeGraphAllocations: Array<{ bomLineId: string; stepKey: string | null; quantity: number }> = [];
      if (routeDraft?.changed) {
        if (!boundRoute || !routeDraft.steps.length || !selectedAssemblyDepartmentId) {
          throw new Error('The edited route needs at least one department step and an Assembly destination selected in Next department.');
        }
        if (routeDraft.steps.some((step) => !step.departmentId)) throw new Error('Choose a department for every route step.');
        if (routeDraft.steps.some((step) => !step.stepName.trim())) throw new Error('Enter an operation name for every route step.');
        if (routeDraft.steps.some((step) => !step.outputItemId || !step.outputUomId || !Number.isFinite(Number(step.outputQuantityPerUnit)) || Number(step.outputQuantityPerUnit) <= 0)) {
          throw new Error('A route step is missing a valid output item, unit, or quantity. Select a product with a unit of measure, then retry.');
        }
        // Validate that no line exceeds total schedule quantity
        const unbalancedLine = validLines.find((line) => {
          if (!line.bomLineId) return true;
          const totalScheduleQty = getScheduleTotalBomQty(line);
          const assigned = routeDraft.allocations
            .filter((allocation) => allocation.bomLineId === line.bomLineId && allocation.stepKey !== null)
            .reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
          return assigned - totalScheduleQty > 0.000001;
        });
        if (unbalancedLine) {
          const totalScheduleQty = getScheduleTotalBomQty(unbalancedLine);
          throw new Error(`The department allotment for ${unbalancedLine.materialName || 'a BOM item'} cannot exceed ${totalScheduleQty.toLocaleString()} ${uoms.find((uom) => uom.id === unbalancedLine.uomId)?.symbol || ''} for this schedule (${Number(unbalancedLine.quantity)}/unit).`);
        }

        // Normalize allocations back to per-unit recipe for the backend route graph validation
        const normalizedAllocations: Array<{ bomLineId: string; stepKey: string | null; quantity: number }> = [];
        validLines.forEach((line) => {
          const isFixed = line.quantityMode === 'FIXED';
          const mult = isFixed ? 1 : planQuantity;
          const lineAllocations = routeDraft.allocations.filter(
            (allocation) => allocation.bomLineId === line.bomLineId && allocation.stepKey !== null && Number(allocation.quantity) > 0.000001
          );

          let assignedPerUnit = 0;
          lineAllocations.forEach((alloc) => {
            const qtyPerUnit = Number((Number(alloc.quantity) / mult).toFixed(6));
            assignedPerUnit += qtyPerUnit;
            normalizedAllocations.push({
              bomLineId: alloc.bomLineId,
              stepKey: alloc.stepKey,
              quantity: qtyPerUnit,
            });
          });

          const remainderPerUnit = Number((Number(line.quantity) - assignedPerUnit).toFixed(6));
          if (remainderPerUnit > 0.000001) {
            normalizedAllocations.push({
              bomLineId: line.bomLineId!,
              stepKey: null,
              quantity: remainderPerUnit,
            });
          }
        });

        routeGraphAllocations = normalizedAllocations;

        const startingBranches = new Set(routeDraft.steps.filter((step) => !step.parentStepId).map((step) => step.id));
        const missingStartingAllocation = [...startingBranches].some(
          (stepId) => !routeGraphAllocations.some((allocation) => allocation.stepKey === stepId && allocation.quantity > 0)
        );
        if (missingStartingAllocation) throw new Error('Assign at least one BOM material to the first step of every route branch.');

        const source = boundRoute as RouteWithOptionalProduct & { code?: string; name?: string };
        const cloneCode = `${String(source.code || 'ROUTE').slice(0, 35)}-SCH-${Date.now().toString(36).slice(-7).toUpperCase()}`.slice(0, 50);
        const routeBranches = new Map<string, EditableRouteStep[]>();
        routeDraft.steps.forEach((step) => routeBranches.set(step.branchKey, [...(routeBranches.get(step.branchKey) || []), step]));
        const orderedRouteBranches = Array.from(routeBranches.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
        const defaultNextDepartmentByStep = new Map<string, string>();
        orderedRouteBranches.forEach(([, branchSteps], branchIndex) => {
          const orderedBranchSteps = [...branchSteps].sort((a, b) => a.stepOrder - b.stepOrder);
          orderedBranchSteps.forEach((step, stepIndex) => {
            const nextStep = orderedBranchSteps[stepIndex + 1] || orderedRouteBranches[branchIndex + 1]?.[1].slice().sort((a, b) => a.stepOrder - b.stepOrder)[0];
            defaultNextDepartmentByStep.set(step.id, nextStep?.departmentId || selectedAssemblyDepartmentId);
          });
        });
        const savedRoute = await fetchApi<{ id: string }>('/routing/graphs', {
          method: 'POST',
          body: JSON.stringify({
            code: cloneCode,
            name: `${String(source.name || 'Production route').slice(0, 125)} (Schedule copy)`,
            productId: productionProductId,
            bomVersionId: effectiveBomVersionId,
            assemblyDepartmentId: selectedAssemblyDepartmentId,
            effectiveFrom: form.scheduleDate,
            steps: routeDraft.steps.map((step) => ({
              key: step.id,
              branchKey: step.branchKey,
              stepOrder: step.stepOrder,
              parentKey: step.parentStepId || null,
              stepName: step.stepName,
              departmentId: step.departmentId,
              nextDepartmentId: step.nextDepartmentId || defaultNextDepartmentByStep.get(step.id) || selectedAssemblyDepartmentId,
              workCenterId: step.workCenterId || null,
              standardDurationMinutes: step.standardDurationMinutes == null ? null : Number(step.standardDurationMinutes),
              isQcRequired: Boolean(step.isQcRequired),
              outputItemType: step.outputItemType,
              outputItemId: step.outputItemId,
              outputUomId: step.outputUomId,
              outputQuantityPerUnit: Number(step.outputQuantityPerUnit),
            })),
            allocations: routeGraphAllocations,
          }),
        });
        if (!savedRoute?.id) throw new Error('The edited production route could not be saved.');
        effectiveRouteId = savedRoute.id;
      }

      let savedPlan: ProductionPlan | null = null;

      if (isEditMode) {
        savedPlan = await updateMutation.mutateAsync({
          id: editId,
          scheduleDate: form.scheduleDate,
          productId: productionProductId,
          productVariantId: productionProductVariantId,
          quantityUomId: selectedProduct?.uomId,
          bomVersionId: effectiveBomVersionId,
          sourceReferenceType: 'MANUAL_SCHEDULE',
          sourceReferenceId: form.batchReference || undefined,
          routeId: effectiveRouteId || undefined,
          quantity: Number(form.quantity),
          scheduleType: form.scheduleType,
          priority: Number(form.priority),
          submitDraft: isDraftEdit && !saveAsDraft,
        });
      } else {
        savedPlan = await createMutation.mutateAsync({
          scheduleDate: form.scheduleDate,
          productId: productionProductId,
          productVariantId: productionProductVariantId,
          quantityUomId: selectedProduct?.uomId,
          bomVersionId: effectiveBomVersionId,
          sourceReferenceType: 'MANUAL_SCHEDULE',
          sourceReferenceId: form.batchReference || undefined,
          routeId: effectiveRouteId || undefined,
          quantity: Number(form.quantity),
          scheduleType: form.scheduleType,
          priority: Number(form.priority),
          saveAsDraft,
        });
      }

      if (savedPlan?.id) {
        router.push(`/production/planning/${savedPlan.id}`);
      } else {
        router.push('/production');
      }
    } catch (err) {
      showToast({
        kind: 'error',
        title: isEditMode ? 'Update Failed' : 'Scheduling Failed',
        message: friendlyErrorMessage(err),
      });
    } finally {
      submitInProgressRef.current = false;
      setSubmitAction(null);
    }
  };

  const isSaving = submitAction !== null || createMutation.isPending || updateMutation.isPending;

  return (
    <div className="w-full overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-muted/20">
      <div className="mx-auto w-full max-w-[1680px] space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/production" className="hover:text-primary transition-colors">
            Production & Floor Ops
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/production" className="hover:text-primary transition-colors">
            Production Overview
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-foreground">New Production Schedule</span>
        </nav>

        {/* Return to Product Draft Banner */}
        <ReturnToProductDraftBanner currentFlowName="Production Schedule" />

        {/* Page Header */}
        <PageHeader
          title={isEditMode ? `Edit Production Schedule (${existingPlanNumber || 'Draft'})` : "Create Production Schedule"}
          description={isEditMode 
            ? `Update parameters for ${existingPlanNumber || 'schedule'} to resolve material shortages or adjust batch requirements.`
            : undefined}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/production')}
                className="h-9 rounded-lg text-xs font-semibold"
                icon={ArrowLeft}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setForm({
                    scheduleDate: new Date().toISOString().slice(0, 10),
                    productId: products[0]?.id || '',
                    bomVersionId: '',
                    routeId: '',
                    scheduleType: 'DAY',
                    quantity: 0,
                    priority: 0,
                    batchReference: `BATCH-${new Date().getFullYear()}-${new Date().getMonth() + 1}`,
                  });
                  setQuantityError(false);
                  setBomLines([]);
                  setSelectedBomVersionIds([]);
                  setSelectedBomVersionId('');
                  setSelectedRouteId('');
                }}
                className="h-9 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground"
                icon={RotateCcw}
              >
                Reset
              </Button>
            </div>
          }
        />

        {/* Form Grid */}
        <form onSubmit={(event) => { event.preventDefault(); void handleSubmit(false); }} className="w-full space-y-6">
          {/* SECTION 01: SCHEDULE IDENTITY & PRODUCT */}
          <div className="bg-card rounded-xl border border-border shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-border/70 flex items-center gap-3 bg-card">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-none ring-2 ring-primary/20">
                01
              </div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">
                Schedule Identity & Target Product
              </h2>
            </div>

            <div className="p-6 space-y-5">
              {/* Product Selection & Target Quantity Side-by-Side */}
              <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-foreground/85 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Target Finished Good / Product
                  </label>
                  <SearchableSelector
                    value={form.productId}
                    onChange={(value) => {
                      handleChange('productId', value);
                      handleChange('bomVersionId', '');
                      handleChange('routeId', '');
                      setBomLines([]);
                      setSelectedBomVersionIds([]);
                      setSelectedBomVersionId('');
                      setSelectedRouteId('');
                      setAutoFedProductId('');
                    }}
                    options={products}
                    isLoading={isLoadingProducts}
                    placeholder="Search finished product by SKU or name..."
                  />
                </div>

                <div>
                  <label htmlFor="target-planned-quantity" className="flex items-center gap-1 text-xs font-semibold text-foreground/85 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Target Planned Quantity
                    <span className="text-destructive" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <input
                      ref={targetQuantityInputRef}
                      id="target-planned-quantity"
                      type="number"
                      required
                      min="1"
                      value={form.quantity}
                      aria-invalid={quantityError}
                      aria-describedby={quantityError ? 'target-quantity-error' : undefined}
                      onChange={(e) => {
                        handleChange('quantity', e.target.value);
                        if (Number(e.target.value) > 0) setQuantityError(false);
                      }}
                      onBlur={(e) => {
                        const quantity = Number.parseInt(e.currentTarget.value, 10);
                        handleChange('quantity', Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
                      }}
                      className={`w-full h-9 px-3 pr-12 rounded-lg border bg-background text-xs font-bold text-foreground focus:outline-none focus:ring-2 transition-all ${quantityError ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : 'border-input focus:border-primary focus:ring-primary/20'}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">
                      {selectedProduct?.uom?.symbol || 'PCS'}
                    </span>
                  </div>
                  {quantityError && (
                    <p id="target-quantity-error" className="mt-1 text-xs font-medium text-destructive" role="alert">
                      Enter a target quantity greater than 0.
                    </p>
                  )}
                </div>
              </div>

              {/* Live inventory check for the exact BOM shown below */}
              {form.productId && (
                <div className="mt-3 space-y-3">
                  {stockCheckStatus === 'checking' ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>Checking the current BOM quantities against available inventory...</span>
                    </div>
                  ) : stockCheckStatus === 'ready' && stockRequirements.length > 0 ? (
                    <div className={`overflow-hidden rounded-xl border ${stockShortages.length ? 'border-destructive/40 bg-destructive/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
                      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${stockShortages.length ? 'border-destructive/20' : 'border-emerald-500/20'}`}>
                        <div className={`flex items-center gap-2 text-xs font-bold ${stockShortages.length ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {stockShortages.length ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                          <span>{stockShortages.length ? `Insufficient stock for ${stockShortages.length} BOM item${stockShortages.length === 1 ? '' : 's'}` : 'All BOM requirements are available'}</span>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inventory check · {stockRequirements.length} items</span>
                      </div>
                      <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(120px,1fr))] gap-3 bg-background/70 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                        <span>BOM item</span><span>Required</span><span>Available</span><span>Check</span>
                      </div>
                      <div className="divide-y divide-border/70">
                        {stockRequirements.map((line) => (
                          <div key={`${line.itemType}:${line.itemId}:${line.uomId}`} className="grid grid-cols-2 gap-x-4 gap-y-2 bg-background/50 px-4 py-3 text-xs md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(120px,1fr))] md:items-center">
                            <div className="col-span-2 min-w-0 md:col-span-1">
                              <div className="truncate font-semibold text-foreground" title={line.itemName}>{line.itemName}</div>
                              {line.itemCode && <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{line.itemCode}</div>}
                            </div>
                            <div>
                              <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground md:hidden">Required</span>
                              <span className="font-mono font-bold text-foreground">{line.requiredQuantity.toLocaleString()} {line.uomSymbol}</span>
                            </div>
                            <div>
                              <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground md:hidden">Available</span>
                              <span className={`font-mono font-bold ${line.shortageQuantity > 0.000001 ? 'text-destructive' : 'text-foreground'}`}>{line.availableQuantity.toLocaleString()} {line.uomSymbol}</span>
                            </div>
                            <div className="flex items-center">
                              {line.shortageQuantity > 0.000001 ? (
                                <span className="rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive">Short {line.shortageQuantity.toLocaleString()} {line.uomSymbol}</span>
                              ) : (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Sufficient</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : stockCheckStatus === 'error' ? (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{stockCheckError || 'Inventory availability could not be verified. The schedule remains blocked until the BOM and stock check are valid.'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{bomLines.length ? 'Complete all BOM lines to check material availability.' : 'Load or add a BOM to check material availability before creating the schedule.'}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="h-px bg-border/60" />

              {/* Date, Shift Type & Batch Reference */}
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-foreground/85 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Planned Production Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.scheduleDate}
                    onChange={(e) => handleChange('scheduleDate', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-foreground/85 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    Shift & Operational Type
                  </label>
                  <select
                    required
                    value={form.scheduleType}
                    onChange={(e) => handleChange('scheduleType', e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {SCHEDULE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                    Batch Tracking Reference Code
                  </label>
                  <input
                    type="text"
                    value={form.batchReference}
                    onChange={(e) => handleChange('batchReference', e.target.value)}
                    placeholder="e.g. BATCH-2026-09A"
                    className="w-full h-9 px-3 font-mono text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECTION 02: BILL OF MATERIALS (BOM FORMULATION RECIPE) — Exact Image #1
             ========================================================================= */}
          <div className="bg-card rounded-xl border border-border shadow-none overflow-hidden">
            {/* Section Header */}
            <div className="px-6 py-4 border-b border-border/70 flex items-center justify-between gap-3 bg-card">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-none ring-2 ring-primary/20">
                  02
                </div>
                <h2 className="text-sm font-bold text-foreground tracking-tight">
                  Bill of Materials (BOM Formulation Recipe)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsBomCollapsed((prev) => !prev)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <span>{isBomCollapsed ? 'Expand' : 'Collapse'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isBomCollapsed ? '-rotate-90' : ''}`} />
              </button>
            </div>

            <div className={isBomCollapsed ? 'hidden' : 'p-6 space-y-4'}>
              {/* Saved BOMs Chip List */}
              {savedBoms.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20">
                  <span className="text-xs font-bold text-foreground mr-1">Saved BOM Recipes:</span>
                  {savedBoms.map((b) => {
                    const isEditingThis = editingSavedBomId === b.id;
                    return (
                      <div
                        key={b.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isEditingThis
                            ? 'bg-primary text-white ring-2 ring-primary/40 shadow-none'
                            : 'bg-card border border-border text-foreground hover:border-primary/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleEditSavedBom(b.id)}
                          className="font-medium hover:underline cursor-pointer"
                        >
                          {b.name} ({b.lines.length} items)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSavedBom(b.id)}
                          className="ml-1 text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Remove this BOM from saved list"
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
                      className="text-xs text-primary hover:underline font-semibold ml-2 cursor-pointer flex items-center gap-1"
                    >
                      + Switch to New Blank BOM
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      Will be created with schedule
                    </span>
                  )}
                </div>
              )}

              {/* BOM Toolbar Matching Image #1 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    Recipe Lines: <strong className="font-mono text-primary text-sm">{bomLines.length} Items</strong>
                  </span>
                  {editingSavedBomId && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                      Editing Saved BOM
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* BOM Name input */}
                  <div className="w-48 sm:w-60">
                    <input
                      type="text"
                      value={bomName}
                      onChange={(e) => setBomName(e.target.value)}
                      placeholder="BOM Name (Auto-generated if empty)"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-none"
                    />
                  </div>

                  {/* Multi-BOM Selector Dropdown */}
                  <div className="min-w-[240px] sm:min-w-[280px]">
                    <MultiBomSelector
                      selectedIds={selectedBomVersionIds}
                      onToggle={handleToggleBomVersion}
                      onClear={handleClearBomSelection}
                      options={bomOptions}
                      isLoading={allSystemBoms.isLoading || productBomsQuery.isLoading || isAutoFeedingBom}
                      disabled={isAutoFeedingBom}
                      placeholder="Auto-feed from BOM..."
                      size="sm"
                    />
                  </div>

                  {/* Save & Add Another BOM Button */}
                  <button
                    type="button"
                    onClick={handleSaveAndAddAnotherBom}
                    disabled={bomLines.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <BookmarkPlus className="w-4 h-4 text-primary" /> Save & Add Another BOM
                  </button>

                  {/* Add Item Line Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setBomLines((current) => [
                        ...current,
                        {
                          id: `bom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                          materialId: '',
                          materialName: '',
                          materialCode: '',
                          quantity: '1',
                          uomId: '',
                          note: '',
                        },
                      ]);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer shadow-none"
                  >
                    <Plus className="w-4 h-4" /> Add Item Line
                  </button>
                </div>
              </div>

              {/* Appended BOM Tags */}
              {appendedBomNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                  <span className="text-[11px] font-semibold text-muted-foreground">Appended BOMs:</span>
                  {appendedBomNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-mono text-[11px] font-bold">
                      {name}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAppendedBomNames([])}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1 cursor-pointer"
                  >
                    Clear Tags
                  </button>
                </div>
              )}

              {/* BOM Table Matching Image #1 */}
              <div className="overflow-x-auto rounded-xl border border-border shadow-none">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-muted/40 font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3.5 w-16 text-center">#</th>
                      <th className="px-4 py-3.5 min-w-[240px]">ITEM / COMPONENT</th>
                      <th className="px-3 py-3.5 w-36 min-w-[130px] text-right">
                        <span>REQUIRED QTY</span>
                        {planQuantity > 1 && (
                          <span className="block text-[10px] font-normal normal-case text-primary font-mono">
                            Per Unit (Total: ×{planQuantity})
                          </span>
                        )}
                      </th>
                      <th className="px-3 py-3.5 w-36 min-w-[140px]">UNIT OF MEASURE</th>
                      <th className="px-3 py-3.5 w-32 min-w-[120px] text-right">AVG RATE (₹)</th>
                      <th className="px-4 py-3.5 min-w-[180px]">ENGINEERING NOTES</th>
                      <th className="px-3 py-3.5 w-14 text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-card">
                    {bomLines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground font-medium">
                          <div className="space-y-2.5">
                            <p className="text-sm">No BOM items added yet.</p>
                            <button
                              type="button"
                              onClick={() => {
                                const defaultMat = bomItems[0];
                                const unitRate = defaultMat ? getMaterialCost(defaultMat) : 0;
                                setBomLines([
                                  {
                                    id: `bom-${Date.now()}`,
                                    materialId: defaultMat?.id || '',
                                    materialName: defaultMat?.name || '',
                                    materialCode: defaultMat?.code || '',
                                    quantity: '1',
                                    uomId: defaultMat?.uomId || uoms[0]?.id || '',
                                    unitCost: unitRate > 0 ? String(unitRate) : '',
                                    lineCost: unitRate > 0 ? String(unitRate) : '',
                                    note: '',
                                  },
                                ]);
                              }}
                              className="h-9 px-4 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer shadow-none"
                            >
                              <Plus className="w-4 h-4" /> Add First Line
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      bomLines.map((line, index) => {
                        const selectedMat = bomItems.find((m) => m.id === line.materialId);
                        const typedMat = selectedMat as unknown as CatalogItemWithHierarchy | undefined;
                        const matUom = selectedMat?.uomId
                          ? uoms.find((u) => u.id === selectedMat.uomId)
                          : typedMat?.uom;
                        const targetDimension = matUom?.dimension;

                        const compatibleUoms = targetDimension
                          ? uoms.filter((u) => u.dimension === targetDimension)
                          : [];
                        const otherUoms = targetDimension
                          ? uoms.filter((u) => u.dimension !== targetDimension)
                          : uoms;

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
                            className={`transition-colors ${
                              isDragging
                                ? 'opacity-40 bg-primary/10 shadow-none scale-[1.008] z-20 relative ring-2 ring-primary/40 rounded-xl'
                                : 'hover:bg-muted/40'
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
                                className="inline-flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary active:scale-95 transition-all py-1.5 px-2 rounded-lg hover:bg-primary/10 active:bg-primary/20 select-none"
                                title="Click and drag to reorder line"
                              >
                                <GripVertical className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="font-bold font-mono text-xs text-muted-foreground">
                                  {index + 1}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">
                              <SearchableSelector
                                value={line.materialId}
                                onChange={(value) => {
                                  const material = bomItems.find((item) => item.id === value);
                                  const autoUnitCost = getMaterialCost(material);
                                  const currentQty = parseFloat(String(line.quantity)) || 1;
                                  const calcLineTotal = Math.round(autoUnitCost * currentQty * 100) / 100;

                                  setBomLines((current) =>
                                    current.map((row) =>
                                      row.id === line.id
                                        ? {
                                            ...row,
                                            materialId: value,
                                            sourceBomVersionId: undefined,
                                            materialName: material?.name,
                                            materialCode: material?.code || material?.sku,
                                            uomId: material?.uomId || material?.uom?.id || row.uomId,
                                            unitCost: autoUnitCost > 0 ? String(autoUnitCost) : row.unitCost || '',
                                            lineCost: calcLineTotal > 0 ? String(calcLineTotal) : '',
                                          }
                                        : row
                                    )
                                  );
                                }}
                                options={bomItems}
                                placeholder="Search raw material or component..."
                              />
                            </td>

                            <td className="px-3 py-3 align-top">
                              <div className="flex flex-col items-end">
                                <input
                                  type="number"
                                  min="0.0001"
                                  step="any"
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const newQty = e.target.value;
                                    setBomLines((current) =>
                                      current.map((row) =>
                                        row.id === line.id ? { ...row, quantity: newQty, sourceBomVersionId: undefined } : row
                                      )
                                    );
                                  }}
                                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-bold text-right font-mono text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                                {planQuantity > 1 && (
                                  <span className="mt-1 text-[11px] font-mono font-semibold text-primary/90 text-right">
                                    Total: {getScheduleTotalBomQty(line).toLocaleString(undefined, { maximumFractionDigits: 4 })} {uomForLine(line)}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-3 py-3 align-top">
                              <select
                                value={line.uomId}
                                onChange={(e) => {
                                  const newUom = e.target.value;
                                  setBomLines((current) =>
                                    current.map((row) => (row.id === line.id ? { ...row, uomId: newUom, sourceBomVersionId: undefined } : row))
                                  );
                                }}
                                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-primary truncate"
                              >
                                <option value="">Select UOM</option>
                                {compatibleUoms.length > 0 && (
                                  <optgroup label={`Compatible (${targetDimension})`}>
                                    {compatibleUoms.map((uom) => (
                                      <option key={uom.id} value={uom.id}>
                                        {uom.name} ({uom.code})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {otherUoms.length > 0 && (
                                  <optgroup label={compatibleUoms.length > 0 ? 'Other Dimensions' : 'All Units'}>
                                    {otherUoms.map((uom) => (
                                      <option key={uom.id} value={uom.id}>
                                        {uom.name} ({uom.code})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </td>

                            <td className="px-3 py-3 align-top">
                              <div className="relative">
                                <span className="absolute left-2.5 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder={avgRate > 0 ? avgRate.toFixed(2) : '0.00'}
                                  value={line.unitCost !== undefined ? line.unitCost : (avgRate > 0 ? String(avgRate) : '')}
                                  onChange={(e) => {
                                    const newRate = e.target.value;
                                    setBomLines((current) =>
                                      current.map((row) =>
                                        row.id === line.id ? { ...row, unitCost: newRate } : row
                                      )
                                    );
                                  }}
                                  className="h-10 w-full pl-6 pr-2 rounded-xl border border-input bg-background text-xs font-bold text-right font-mono text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top">
                              <input
                                value={line.note}
                                onChange={(e) =>
                                  setBomLines((current) =>
                                    current.map((row) => (row.id === line.id ? { ...row, note: e.target.value, sourceBomVersionId: undefined } : row))
                                  )
                                }
                                placeholder="Cutting length, color code, tolerance..."
                                className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                              />
                            </td>

                            <td className="px-3 py-3 text-center align-top">
                              <button
                                type="button"
                                onClick={() => setBomLines((current) => current.filter((row) => row.id !== line.id).map((row) => ({ ...row, sourceBomVersionId: undefined })))}
                                aria-label="Remove BOM line"
                                className="h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors cursor-pointer mx-auto"
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

              {/* Total Material Cost Summary Bar */}
              {bomLines.length > 0 && (
                <div className="p-4 rounded-xl border border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-6 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Total Line Items</span>
                      <span className="font-bold text-sm text-foreground font-mono">{bomLines.length} Items</span>
                    </div>
                    <div className="h-8 w-px bg-border/60 hidden sm:block" />
                    <div>
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Total Estimated Material Cost</span>
                      <span className="font-bold text-sm text-primary font-mono">
                        ₹{bomTotalMaterialCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Buttons Matching Image #1 */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBomLines((current) => [
                        ...current,
                        {
                          id: `bom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                          materialId: '',
                          materialName: '',
                          materialCode: '',
                          quantity: '1',
                          uomId: '',
                          note: '',
                        },
                      ]);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer shadow-none"
                  >
                    <Plus className="w-4 h-4" /> Add Item Line
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndAddAnotherBom}
                    disabled={bomLines.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <BookmarkPlus className="w-4 h-4 text-primary" /> Save & Add Another BOM
                  </button>
                </div>

                <Link
                  href={productionProductId ? `/production/bom/new?productId=${productionProductId}` : '/production/bom/new'}
                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  Open Advanced Multi-Level BOM Studio <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECTION 03: PRODUCTION ROUTE & OPERATIONS WORKFLOW — Exact Image #3
             ========================================================================= */}
          <div className="bg-card rounded-xl border border-border shadow-none overflow-hidden">
            {/* Route is selected from the reviewed route graph tied to this BOM. */}
            <div className="px-6 py-4 border-b border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-white font-mono text-xs font-black shadow-none ring-2 ring-primary/20">
                  03
                </div>
                <h2 className="text-sm font-bold text-foreground tracking-tight">
                  Production Route & Operations Workflow
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="min-w-[260px]">
                  <SearchableSelector
                    value={selectedRouteId}
                    onChange={(value) => {
                      if (value) handleAutoFeedRoute(value);
                      else {
                        setSelectedRouteId('');
                        setRouteDraft(null);
                        setForm((prev) => ({ ...prev, routeId: '' }));
                      }
                    }}
                    options={routeOptions}
                    isLoading={isLoadingRoutes}
                    disabled={!routeBomVersionId || selectedBomVersionIds.length > 1}
                    placeholder={selectedBomVersionIds.length > 1 ? 'Use one BOM to choose a route' : routeBomVersionId ? 'Select reviewed route...' : 'Select a BOM first...'}
                    size="sm"
                    renderOption={(option) => (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-foreground">{option.name}</span>
                        {option.stepCount !== undefined && (
                          <span className="text-[10px] text-muted-foreground">{option.stepCount} department steps</span>
                        )}
                      </div>
                    )}
                  />
                </div>
                <Link
                  href={productionProductId ? `/inventory/routing/new?productId=${productionProductId}${routeBomVersionId ? `&bomVersionId=${routeBomVersionId}` : ''}` : '/inventory/routing/new'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Create route
                </Link>
              </div>
            </div>

            <div className="p-6">
              {!routeBomVersionId ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Choose a BOM to load routes that use its exact material recipe.</p>
              ) : selectedBomVersionIds.length > 1 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">A reviewed route is tied to one BOM version. Select one BOM version to use its department flow and allotments.</p>
              ) : !selectedGraphRoute ? (
                <div className="rounded-lg border border-dashed border-border px-6 py-9 text-center">
                  <GitBranch className="mx-auto mb-2 h-5 w-5 text-primary" />
                  <p className="text-sm font-semibold text-foreground">No reviewed route is linked to this product and BOM.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Create and review a production route for this BOM, then it will appear here.</p>
                </div>
              ) : (() => {
                const graph = selectedGraphRoute as unknown as RouteWithOptionalProduct;
                const graphSteps = (routeDraft?.sourceRouteId === selectedGraphRoute.id ? routeDraft.steps : createRouteDraft(graph).steps).slice().sort((a, b) =>
                  String(a.branchKey || '').localeCompare(String(b.branchKey || ''), undefined, { numeric: true })
                  || Number(a.stepOrder || 0) - Number(b.stepOrder || 0)
                );
                const branches = new Map<string, EditableRouteStep[]>();
                graphSteps.forEach((step) => {
                  const key = step.branchKey || 'main';
                  branches.set(key, [...(branches.get(key) || []), step]);
                });
                const orderedBranches = Array.from(branches.entries());
                const allocations = routeDraft?.sourceRouteId === selectedGraphRoute.id ? routeDraft.allocations : createRouteDraft(graph, planQuantity).allocations;
                const amount = Math.max(0, Number(form.quantity) || 0);
                const addAtBranchEnd = (departmentId: string, branchKey: string) => addDepartmentToRoute(departmentId, branchKey);

                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Schedule route copy · {selectedGraphRoute.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Changes are saved on this schedule as a separate route. Original: {selectedGraphRoute.code}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {routeDraft?.changed && (
                          <button
                            type="button"
                            onClick={() => {
                              setRouteDraft(createRouteDraft(graph, planQuantity));
                              setAllocationQuantityInputs({});
                            }}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Reset edits
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">Allotment preview for <span className="font-semibold text-foreground">{amount.toLocaleString()} {selectedProduct?.uom?.symbol || 'units'}</span></p>
                      </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="space-y-4">
                        {orderedBranches.map(([branchKey, steps], branchIndex) => (
                          <section key={branchKey} className="rounded-lg border border-border p-3">
                            <div className="mb-3 flex items-center justify-between">
                              <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground"><GitBranch className="h-4 w-4 text-primary" />{branchKey}</h3>
                              <span className="text-[11px] text-muted-foreground">Drag a catalog department below to append a dependent step</span>
                            </div>
                            <div className="space-y-2">
                              {steps.map((step, stepIndex) => (
                                (() => {
                                  const followingStep = steps[stepIndex + 1] || orderedBranches[branchIndex + 1]?.[1][0];
                                  const routeAssemblyId = routeDraft?.assemblyDepartmentId || graph.assemblyDepartmentId || assemblyDepartment?.id || '';
                                  const targetAssemblyDept = (departmentsData?.items || []).find((d) => d.id === routeAssemblyId);
                                  const routeAssemblyName = targetAssemblyDept?.name || assemblyDepartment?.name || graph.assemblyDepartment?.name || 'Assembly Department';
                                  const routeAssemblyCode = targetAssemblyDept?.code || assemblyDepartment?.code || graph.assemblyDepartment?.code || 'ASSEMBLY';
                                  const nextDepartmentId = followingStep?.departmentId || routeAssemblyId;
                                  const routeDepartmentIds = new Set(routeDraft?.steps.map((candidate) => candidate.departmentId) || []);
                                  const nextDepartmentOptions = (departmentsData?.items || [])
                                    .filter((department) => routeDepartmentIds.has(department.id) || department.id === routeAssemblyId || department.id === step.nextDepartmentId)
                                    .map((department) => ({
                                    id: department.id,
                                    name: department.id === routeAssemblyId ? `${department.name} (Assembly)` : department.name,
                                    code: department.code,
                                  }));
                                  if (routeAssemblyId && !nextDepartmentOptions.some((option) => option.id === routeAssemblyId)) {
                                    nextDepartmentOptions.push({ id: routeAssemblyId, name: `${routeAssemblyName} (Assembly)`, code: routeAssemblyCode });
                                  }
                                  return (
                                <article
                                  key={step.id}
                                  draggable
                                  onDragStart={() => setDraggingRouteStepId(step.id)}
                                  onDragEnd={() => setDraggingRouteStepId('')}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => { event.preventDefault(); if (draggingDepartmentId) addDepartmentToRoute(draggingDepartmentId, branchKey, step.id); else if (draggingRouteStepId) reorderRouteStep(draggingRouteStepId, step.id); setDraggingDepartmentId(''); setDraggingRouteStepId(''); }}
                                  className={`rounded-md border border-border bg-background p-3 ${step.parentStepId ? 'ml-5 border-l-2 border-l-primary/40' : ''} ${draggingRouteStepId === step.id ? 'opacity-50' : ''}`}
                                >
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2"><GripHorizontal className="h-4 w-4 cursor-grab text-muted-foreground" /><span className="font-mono text-[11px] text-muted-foreground">{branchKey}.{step.stepOrder}</span><span className="text-[11px] text-muted-foreground">{step.parentStepId ? 'Sub-department' : 'Department'}</span></div>
                                    <button type="button" onClick={() => removeRouteStep(step.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Remove department step"><XCircle className="h-4 w-4" /></button>
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_auto] md:items-end">
                                    <label className="block text-[11px] font-medium text-muted-foreground">Department
                                      <select value={step.departmentId} onChange={(event) => {
                                        const department = departments.find((item) => item.id === event.target.value);
                                        setRouteDraft((current) => current ? { ...current, changed: true, steps: current.steps.map((item) => item.id === step.id ? { ...item, departmentId: event.target.value, workCenterId: null, department: department ? { id: department.id, name: department.name, code: department.code } : null } : item) } : current);
                                      }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground">
                                        <option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name} ({department.code})</option>)}
                                      </select>
                                    </label>
                                    <label className="block text-[11px] font-medium text-muted-foreground">Operation name
                                      <input value={step.stepName} onChange={(event) => setRouteDraft((current) => current ? { ...current, changed: true, steps: current.steps.map((item) => item.id === step.id ? { ...item, stepName: event.target.value } : item) } : current)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground" />
                                    </label>
                                    <label className="block text-[11px] font-medium text-muted-foreground">Duration (min)
                                      <input type="number" min="0" value={step.standardDurationMinutes ?? ''} onChange={(event) => setRouteDraft((current) => current ? { ...current, changed: true, steps: current.steps.map((item) => item.id === step.id ? { ...item, standardDurationMinutes: event.target.value === '' ? null : Number(event.target.value) } : item) } : current)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground" />
                                    </label>
                                    <label className="flex h-9 items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={Boolean(step.isQcRequired)} onChange={(event) => setRouteDraft((current) => current ? { ...current, changed: true, steps: current.steps.map((item) => item.id === step.id ? { ...item, isQcRequired: event.target.checked } : item) } : current)} /> QC gate</label>
                                  </div>
                                  {(() => {
                                    const stepAllocations = allocations.filter((allocation) => allocation.stepKey === step.id && allocation.quantity >= 0);
                                    const availableOptions = bomLines.filter((line) => line.bomLineId).map((line, index) => {
                                      const available = availableRouteQuantity(line.bomLineId!, step.id);
                                      const totalQty = getScheduleTotalBomQty(line);
                                      return {
                                        id: line.bomLineId!,
                                        name: `#${index + 1} · ${line.materialName || line.materialCode} (${available.toLocaleString(undefined, { maximumFractionDigits: 4 })} of ${totalQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${uomForLine(line)} remaining)`,
                                        code: available > 0.000001 ? `${available.toLocaleString(undefined, { maximumFractionDigits: 4 })} of ${totalQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${uomForLine(line)} remaining` : 'Fully allocated',
                                        disabled: available <= 0.000001,
                                      };
                                    });
                                    return (
                                      <div className="mt-3 space-y-2.5 border-t border-border/60 bg-muted/10 p-3">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                          <div className="flex items-center gap-2"><PackageCheck className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-bold text-foreground">Allocated BOM Materials</span><span className="rounded-full border border-border/50 bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{stepAllocations.length}</span></div>
                                          <div className="w-full sm:w-64"><SearchableSelector size="sm" placeholder={availableOptions.every((option) => option.disabled) ? 'No additional BOM quantity available here' : '+ Allot Item from BOM...'} options={availableOptions} value="" onChange={(bomLineId) => addRouteMaterialToStep(step.id, bomLineId)} disabled={!bomLines.length || availableOptions.length === 0} className="w-full text-xs font-normal" /></div>
                                        </div>
                                        {stepAllocations.length === 0 ? (
                                          <p className="py-1 text-[11px] italic text-muted-foreground">No additional materials allocated to this stage. Unallotted quantities pass to final assembly.</p>
                                        ) : (
                                          <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
                                            <table className="w-full border-collapse text-left text-xs">
                                              <thead><tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground"><th className="px-3 py-1.5">BOM Material</th><th className="w-32 px-3 py-1.5">BOM Total</th><th className="w-48 px-3 py-1.5">Allotted Qty</th><th className="w-10 px-2 py-1.5 text-center">Action</th></tr></thead>
                                              <tbody className="divide-y divide-border/40">
                                                {stepAllocations.map((allocation) => {
                                                  const line = bomLines.find((item) => item.bomLineId === allocation.bomLineId);
                                                  if (!line) return null;
                                                  const totalScheduleQty = getScheduleTotalBomQty(line);
                                                  const inputKey = routeAllocationInputKey(allocation.bomLineId, step.id);
                                                  const whole = ['pcs', 'pc', 'units', 'nos', 'pieces'].includes(uomForLine(line).toLowerCase());
                                                  const maxAvailable = availableRouteQuantity(allocation.bomLineId, step.id);
                                                  return (
                                                    <tr key={allocation.bomLineId} className="hover:bg-muted/10">
                                                      <td className="px-3 py-2 font-medium text-foreground">
                                                        <div>{line.materialName || line.materialCode}</div>
                                                        {line.materialCode && line.materialName && (
                                                          <div className="text-[10px] text-muted-foreground font-mono">{line.materialCode}</div>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-2 font-mono text-muted-foreground">
                                                        <span className="font-semibold text-foreground">
                                                          {totalScheduleQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} {uomForLine(line)}
                                                        </span>
                                                        {planQuantity > 1 && (
                                                          <span className="block text-[10px] text-muted-foreground font-normal">
                                                            ({Number(line.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })} {uomForLine(line)}/unit × {planQuantity})
                                                          </span>
                                                        )}
                                                      </td>
                                                      <td className="px-3 py-2">
                                                        <div className="flex items-center gap-1.5">
                                                          <input
                                                            type="number"
                                                            step={whole ? '1' : 'any'}
                                                            min="0"
                                                            max={maxAvailable}
                                                            value={allocationQuantityInputs[inputKey] ?? (allocation.quantity || '')}
                                                            onChange={(event) => changeRouteMaterialQuantity(step.id, allocation.bomLineId, event.target.value)}
                                                            onBlur={() => setAllocationQuantityInputs((current) => { const next = { ...current }; delete next[inputKey]; return next; })}
                                                            className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs font-semibold text-foreground transition-colors focus:border-primary focus:outline-none"
                                                          />
                                                          <span className="text-[11px] font-medium text-muted-foreground">{uomForLine(line)}</span>
                                                        </div>
                                                      </td>
                                                      <td className="px-2 py-2 text-center">
                                                        <button
                                                          type="button"
                                                          onClick={() => removeRouteMaterialFromStep(step.id, allocation.bomLineId)}
                                                          title="Remove allotment"
                                                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
                                                        >
                                                          <X className="h-3.5 w-3.5" />
                                                        </button>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <div className="mt-3 border-t border-border/60 bg-muted/10 p-3">
                                    <p className="mb-2 text-xs font-bold text-foreground">Department Output &amp; Next Destination</p>
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                      <label className="block text-[11px] font-medium text-muted-foreground sm:col-span-2">Output item
                                        <SearchableSelector
                                          size="sm"
                                          placeholder="Search output item..."
                                          options={routeOutputOptions}
                                          value={step.outputItemId}
                                          onChange={(value) => {
                                            const selected = routeOutputOptions.find((option) => option.id === value);
                                            setRouteDraft((current) => current ? {
                                              ...current,
                                              changed: true,
                                              steps: current.steps.map((item) => item.id === step.id
                                                ? { ...item, outputItemId: value, outputItemType: selected?.itemType || 'PRODUCT' }
                                                : item),
                                            } : current);
                                          }}
                                          className="mt-1 w-full text-xs font-normal"
                                        />
                                      </label>
                                      <label className="block text-[11px] font-medium text-muted-foreground">Qty / unit
                                        <input type="number" min="0.000001" step="any" value={step.outputQuantityPerUnit} onChange={(event) => setRouteDraft((current) => current ? {
                                          ...current,
                                          changed: true,
                                          steps: current.steps.map((item) => item.id === step.id ? { ...item, outputQuantityPerUnit: Number(event.target.value) } : item),
                                        } : current)} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground" />
                                      </label>
                                      <label className="block text-[11px] font-medium text-muted-foreground">Output UOM
                                        <SearchableSelector
                                          size="sm"
                                          placeholder="Select UOM..."
                                          options={routeUomOptions}
                                          value={step.outputUomId}
                                          onChange={(value) => setRouteDraft((current) => current ? {
                                            ...current,
                                            changed: true,
                                            steps: current.steps.map((item) => item.id === step.id ? { ...item, outputUomId: value } : item),
                                          } : current)}
                                          className="mt-1 w-full text-xs font-normal"
                                        />
                                      </label>
                                      <label className="block text-[11px] font-medium text-muted-foreground sm:col-span-2 xl:col-span-2">Next department
                                        <SearchableSelector
                                          size="sm"
                                          placeholder="Next department"
                                          options={nextDepartmentOptions}
                                          value={step.nextDepartmentId || nextDepartmentId}
                                          onChange={(value) => {
                                            const selected = nextDepartmentOptions.find((option) => option.id === value);
                                            const isAssembly = value === routeAssemblyId || /assembly/i.test(`${selected?.name || ''} ${selected?.code || ''}`);
                                            setRouteDraft((current) => current ? {
                                              ...current,
                                              changed: true,
                                              assemblyDepartmentId: isAssembly ? value : current.assemblyDepartmentId,
                                              steps: current.steps.map((item) => item.id === step.id ? { ...item, nextDepartmentId: value } : item),
                                            } : current);
                                          }}
                                          className="mt-1 w-full text-xs font-normal"
                                        />
                                        <span className="mt-1 block text-[10px] font-normal text-muted-foreground">The selected department receives this stage’s completed output.</span>
                                      </label>
                                    </div>
                                  </div>
                                </article>
                                  );
                                })()
                              ))}
                              <div
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => { event.preventDefault(); if (draggingDepartmentId) addAtBranchEnd(draggingDepartmentId, branchKey); setDraggingDepartmentId(''); }}
                                className="flex min-h-10 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
                              >Drop a department to add a sub-department after {steps.at(-1)?.stepName || 'this branch'}</div>
                            </div>
                          </section>
                        ))}
                        <div
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => { event.preventDefault(); if (draggingDepartmentId) addDepartmentToRoute(draggingDepartmentId); setDraggingDepartmentId(''); }}
                          className="flex min-h-12 items-center justify-center rounded-md border border-dashed border-primary/40 bg-primary/[0.02] text-xs text-muted-foreground"
                        >Drop a department here to start a new route branch</div>
                      </div>

                      <aside className="rounded-lg border border-border">
                        <div className="border-b border-border p-3"><p className="text-xs font-semibold text-foreground">Department catalog</p><input value={departmentSearch} onChange={(event) => setDepartmentSearch(event.target.value)} placeholder="Search departments" className="mt-2 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" /></div>
                        <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
                          {departments.filter((department) => `${department.name} ${department.code}`.toLowerCase().includes(departmentSearch.toLowerCase())).map((department) => (
                            <div key={department.id} draggable onDragStart={() => setDraggingDepartmentId(department.id)} onDragEnd={() => setDraggingDepartmentId('')} className="flex cursor-grab items-center justify-between gap-2 p-3 hover:bg-muted/40">
                              <div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{department.name}</p><p className="truncate text-[10px] text-muted-foreground">{department.code}</p></div>
                              <button type="button" onClick={() => addDepartmentToRoute(department.id)} className="shrink-0 text-xs font-semibold text-primary hover:underline">Add branch</button>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <div>
                        {(() => {
                          const targetDept = (departmentsData?.items || []).find((department) => department.id === (routeDraft?.assemblyDepartmentId || graph.assemblyDepartmentId || assemblyDepartment?.id));
                          return (
                            <>
                              <p className="text-xs font-semibold text-foreground">Assembly destination · {targetDept?.name || assemblyDepartment?.name || graph.assemblyDepartment?.name || 'Select Assembly in a Next department field'}</p>
                              {(targetDept?.code || assemblyDepartment?.code || graph.assemblyDepartment?.code) && <p className="mt-0.5 text-[10px] text-muted-foreground">{targetDept?.code || assemblyDepartment?.code || graph.assemblyDepartment?.code}</p>}
                            </>
                          );
                        })()}
                        <p className="mt-1 text-[11px] text-muted-foreground">Stages routed to Assembly deliver their completed output there.</p>
                      </div>
                      <span className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">Assigned automatically</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bottom Submit Action */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {(!isEditMode || isDraftEdit) && (
              <Button
                type="button"
                size="sm"
                disabled={isSaving || !form.productId || !areBomLinesComplete || Number(form.quantity) <= 0}
                loading={submitAction === 'draft'}
                onClick={() => void handleSubmit(true)}
                className="h-9 rounded-lg border border-border bg-background text-xs font-semibold text-foreground shadow-none hover:bg-muted"
                icon={Save}
              >
                {submitAction === 'draft' ? 'Saving draft…' : 'Save Draft'}
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || stockCheckStatus !== 'ready' || stockRequirements.length === 0 || stockShortages.length > 0 || !areBomLinesComplete || !form.productId}
              loading={isSaving}
              aria-busy={isSaving}
              className="h-9 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-none"
              icon={Save}
            >
              {submitAction === 'schedule'
                ? isEditMode
                  ? 'Saving changes…'
                  : 'Creating schedule…'
                : isSaving
                ? isEditMode
                  ? 'Saving changes…'
                  : 'Creating schedule…'
                : isEditMode
                ? isDraftEdit ? 'Submit Schedule' : 'Update Schedule'
                : 'Create Production Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
