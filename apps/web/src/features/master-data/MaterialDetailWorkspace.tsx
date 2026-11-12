'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import {
  ArrowLeft,
  BadgeDollarSign,
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Factory,
  FileText,
  GitBranch,
  History,
  Layers,
  Package,
  Pencil,
  Printer,
  QrCode,
  Scale,
  Send,
  Wrench,
  X,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  Badge,
} from '@plinth/ui';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../auth/access-control';
import {
  useProductFamilies,
  useDepartments,
  usePricingMasters,
  usePricingMaster,
  useMaterials,
  useProducts,
  useUoms,
  extractMaterialVariants,
  extractProductVariants,
} from '../../hooks/useMasterData';
import { useStockBalances, useStockLedger } from '../inventory/hooks';
import { useReactToPrint } from 'react-to-print';
import JsBarcode from 'jsbarcode';
import { getVariantLabel } from '../products/variant-names';
import { calculateTierPrice } from '../products/utils/tierPricing';
import { getBomLineItemDisplay } from '../bom/utils';
import type { LifecycleStatus } from '@plinth/types';

export interface DetailedMaterial {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  materialType: 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT' | 'CONSUMABLE' | 'CHEMICAL' | string;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  uomId: string;
  uom?: { id: string; name: string; symbol: string } | null;
  specs?: Record<string, unknown> | null;
  status: LifecycleStatus;
  version: number;
  effectiveDate?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

interface MaterialDetailWorkspaceProps {
  id: string;
  entityType?: 'product' | 'material' | 'auto';
}

export function MaterialDetailWorkspace({ id, entityType = 'auto' }: MaterialDetailWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'manufacturing' | 'inventory' | 'pricing' | 'vendors'>('overview');
  const [selectedBomId, setSelectedBomId] = useState('');
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);

  // Active Image Index & Zoom for Media Gallery
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  const baseId = id && id.includes('__var__') ? id.split('__var__')[0] : id;

  // Product and material routes are distinct. Avoid probing the material API
  // for a known product ID, which created a misleading "Material [UUID] not
  // found" toast whenever a product detail page opened.
  const {
    data: rawMaterial,
    isLoading: loadingMaterial,
    error: materialError,
    refetch: refetchMaterial,
  } = useQuery<DetailedMaterial>({
    queryKey: ['materials', baseId],
    queryFn: () => fetchApi(`/materials/${baseId}`),
    enabled: Boolean(baseId) && entityType !== 'product',
    retry: false,
    meta: { silentError: entityType === 'auto' },
  });

  // 2. Fallback fetch Product Record if material does not exist
  const {
    data: rawProduct,
    isLoading: loadingProduct,
    error: productError,
    refetch: refetchProduct,
  } = useQuery<any>({
    queryKey: ['products', 'detail', baseId],
    queryFn: () => fetchApi(`/master-data/products/${baseId}`),
    enabled: Boolean(baseId) && (entityType === 'product' || (entityType === 'auto' && !loadingMaterial && (Boolean(materialError) || !rawMaterial))),
    retry: false,
    meta: { silentError: true },
  });

  const isLoading = entityType === 'product' ? loadingProduct : entityType === 'material' ? loadingMaterial : loadingMaterial || (Boolean(materialError) && loadingProduct);
  const activeError = rawMaterial ? null : rawProduct ? null : (productError || materialError);

  const refetch = () => {
    refetchMaterial();
    refetchProduct();
  };

  // Determine item identity & normalise
  const isMaterialEntity = Boolean(rawMaterial);
  const hasCurrentItem = Boolean(rawMaterial || rawProduct);
  const currentItem = rawMaterial || rawProduct || ({} as any);

  const familyIdFromParam =
    searchParams?.get('familyId') ||
    (rawMaterial as any)?.productFamilyId ||
    (rawMaterial?.specs as any)?.productFamilyId ||
    rawProduct?.productFamilyId ||
    (rawProduct?.productFamily as any)?.id;

  // Live Inventory Telemetry
  // For explicit entityType ('material'/'product') we can determine the item
  // type without waiting for the data fetch, preventing an initial request with
  // the wrong params (e.g. productId=<materialId>) that always returns 0.
  const isMaterialForBalance = entityType === 'material' || (entityType !== 'product' && isMaterialEntity);
  const { data: inventoryBalances, isLoading: loadingInventoryBalances } = useStockBalances({
    materialId: isMaterialForBalance ? baseId : undefined,
    productId: !isMaterialForBalance ? baseId : undefined,
    limit: 100,
  });
  const { data: bomMaterialsData } = useMaterials(undefined, 1, 1000, { expandVariants: true });
  const { data: bomProductsData } = useProducts(undefined, 1, 1000, { expandVariants: true });
  const bomMaterials = bomMaterialsData?.items || [];
  const bomProducts = bomProductsData?.items || [];

  const { data: inventoryLedger } = useStockLedger({
    materialId: isMaterialForBalance ? baseId : undefined,
    productId: !isMaterialForBalance ? baseId : undefined,
    page: 1,
    limit: 200,
  });

  const { data: materialRoutes } = useQuery<{ items: any[] }>({
    queryKey: ['product-routes', { baseId, isMaterialEntity }],
    queryFn: () =>
      fetchApi(
        isMaterialEntity
          ? `/master-data/routing/routes?materialId=${encodeURIComponent(baseId)}&limit=100`
          : `/master-data/routing/routes?productId=${encodeURIComponent(baseId)}&limit=100`
      ),
    enabled: Boolean(baseId),
    meta: { silentError: true },
  });

  const { data: materialBomVersions } = useQuery<{ items: any[] }>({
    queryKey: ['bom-versions', 'item', isMaterialEntity ? 'MATERIAL' : 'PRODUCT', baseId],
    queryFn: () =>
      fetchApi(
        isMaterialEntity
          ? `/bom-versions?materialId=${encodeURIComponent(baseId)}&take=100`
          : `/bom-versions?productId=${encodeURIComponent(baseId)}&take=100`
      ),
    enabled: Boolean(baseId && hasCurrentItem),
    meta: { silentError: true },
  });

  // Each BOM name is a logical recipe; show its latest version and fetch its
  // full detail when selected so every recipe can be inspected independently.
  const itemBoms = useMemo(() => {
    const latestByName = new Map<string, any>();
    for (const bom of materialBomVersions?.items || []) {
      const name = String(bom.bomNumber || `BOM v${bom.version || 0}`).trim();
      const key = name.toLocaleLowerCase();
      const current = latestByName.get(key);
      if (!current || Number(bom.version || 0) > Number(current.version || 0)) {
        latestByName.set(key, bom);
      }
    }
    return [...latestByName.values()].sort((a, b) => {
      const versionDifference = Number(b.version || 0) - Number(a.version || 0);
      return versionDifference || String(a.bomNumber || '').localeCompare(String(b.bomNumber || ''));
    });
  }, [materialBomVersions?.items]);
  const selectedBomSummary = itemBoms.find((bom) => bom.id === selectedBomId)
    || itemBoms.find((bom) => bom.status === 'APPROVED' || bom.status === 'ACTIVE')
    || itemBoms[0];
  useEffect(() => {
    if (selectedBomSummary?.id && selectedBomSummary.id !== selectedBomId) {
      setSelectedBomId(selectedBomSummary.id);
    }
  }, [selectedBomSummary?.id, selectedBomId]);
  const { data: selectedBomDetail } = useQuery<any>({
    queryKey: ['bom-version', selectedBomSummary?.id],
    queryFn: () => fetchApi(`/bom-versions/${selectedBomSummary?.id}`),
    enabled: Boolean(selectedBomSummary?.id),
    meta: { silentError: true },
  });

  // A vendor can be linked to the parent item or to one of its real variant
  // records. Query each persisted record so variant-specific vendor pricing is
  // visible from the parent detail page as well.
  const vendorItemRefs = useMemo(() => {
    const entity = rawMaterial || rawProduct;
    if (!entity) return [] as Array<{ id: string; name: string }>;

    const refs = [{ id: String(entity.id), name: String(entity.name || 'Item') }];
    const variants = rawMaterial
      ? extractMaterialVariants(rawMaterial as any)
      : extractProductVariants(rawProduct as any);
    for (const variant of variants as any[]) {
      const id = rawMaterial
        ? String(variant.id || '')
        : String(variant.productRecordId || variant.metadata?.productRecordId || '');
      if (!id || id.includes('__var__') || id.startsWith('temp-') || id.startsWith('var-')) continue;
      if (!refs.some((ref) => ref.id === id)) refs.push({ id, name: String(variant.name || entity.name || 'Item') });
    }
    return refs;
  }, [rawMaterial, rawProduct]);

  const { data: rawVendorPricings, isLoading: loadingVendorPricings } = useQuery<any[]>({
    queryKey: [
      'item-vendor-pricing',
      isMaterialEntity ? 'MATERIAL' : 'PRODUCT',
      currentItem?.categoryId || currentItem?.category?.id || null,
      vendorItemRefs.map((item) => item.id),
    ],
    queryFn: async () => {
      const entityPath = isMaterialEntity ? 'materials' : 'products';
      const resultSets = await Promise.allSettled(vendorItemRefs.map(async (item) => {
        const response = await fetchApi<any>(`/master-data/${entityPath}/${encodeURIComponent(item.id)}/vendor-pricing`);
        const rows = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
        return rows.map((row: any) => {
          const directlyMapped = row.productId === item.id || row.materialId === item.id;
          return {
            ...row,
            itemId: item.id,
            itemName: directlyMapped ? item.name : currentItem?.category?.name || 'Category-wide supply',
            isCategorySource: !directlyMapped,
          };
        });
      }));
      const successfulResults = resultSets.filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled');
      if (successfulResults.length === 0 && resultSets.length > 0) {
        throw (resultSets[0] as PromiseRejectedResult).reason;
      }
      const rows = successfulResults.flatMap((result) => result.value);
      rows.sort((a, b) => Number(Boolean(b.productId || b.materialId)) - Number(Boolean(a.productId || a.materialId)));
      return Array.from(new Map(rows.map((row) => [row.id, row])).values());
    },
    enabled: hasCurrentItem && vendorItemRefs.length > 0,
    meta: { silentError: true },
  });

  const vendorSources: any[] = rawVendorPricings ?? [];
  const showVendorItemColumn = vendorItemRefs.length > 1 || vendorSources.some((row) => row.isCategorySource);

  // Families lookup for category
  const categoryId = currentItem?.categoryId || currentItem?.category?.id;
  const families = useProductFamilies(categoryId || undefined);

  // Departments lookup for production routes
  const departmentsQuery = useDepartments('ACTIVE');
  const departmentMap = useMemo(() => {
    const map = new Map<string, string>();
    (departmentsQuery.data?.items ?? []).forEach((d) => map.set(d.id, d.name));
    return map;
  }, [departmentsQuery.data?.items]);

  // Submit for Validation Mutation (for Draft status)
  const submitValidationMutation = useMutation({
    mutationFn: () => {
      const entityPath = entityType === 'product' || (!rawMaterial && rawProduct) ? 'products' : 'materials';
      return fetchApi(`/${entityPath}/${baseId}/submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', baseId] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      showToast({
        kind: 'success',
        title: 'Validation Submitted',
        message: `${rawMaterial?.name || rawProduct?.name || 'Item'} is now submitted for technical review.`,
      });
      refetch();
    },
    onError: (err) => {
      showToast({
        kind: 'error',
        title: 'Submission Failed',
        message: friendlyErrorMessage(err),
      });
    },
  });

  // Keep this query above the loading/error returns so the component always
  // calls the same hooks in the same order. The inventory item can be absent
  // during the initial loading render, in which case the query stays disabled.
  const variantInventoryItems = hasCurrentItem
    ? (isMaterialEntity ? extractMaterialVariants(rawMaterial!) : extractProductVariants(rawProduct!)).map((variant: any) => ({
        inventoryId: isMaterialEntity
          ? (variant.id && !variant.id.includes('__var__') ? variant.id : undefined)
          : (variant.metadata as any)?.productRecordId,
        name: variant.name || 'Variant',
      })).filter((variant) => Boolean(variant.inventoryId))
    : [];
  const { data: variantInventoryData, isLoading: loadingVariantInventory } = useQuery<Array<{ id: string; name: string; balances: any[]; ledger: any[] }>>({
    queryKey: ['inventory', 'detail-variants', isMaterialEntity ? 'MATERIAL' : 'PRODUCT', variantInventoryItems.map((item) => item.inventoryId)],
    queryFn: async () => Promise.all(variantInventoryItems.map(async (variant) => {
      const itemId = variant.inventoryId as string;
      const itemTypeParam = isMaterialEntity ? `materialId=${encodeURIComponent(itemId)}` : `productId=${encodeURIComponent(itemId)}`;
      const [balances, ledger] = await Promise.all([
        fetchApi<{ items: any[] }>(`/inventory/balances?${itemTypeParam}&limit=200`),
        fetchApi<{ items: any[] }>(`/inventory/ledger?${itemTypeParam}&limit=200`),
      ]);
      return { id: itemId, name: variant.name, balances: balances.items || [], ledger: ledger.items || [] };
    })),
    enabled: variantInventoryItems.length > 0,
    meta: { silentError: true },
  });
  const baseUomId = currentItem.uomId || currentItem.uom?.id || '';
  const stockItemIds = Array.from(new Set([
    baseId,
    ...variantInventoryItems.map((variant) => variant.inventoryId as string),
  ].filter(Boolean)));
  const { data: familyAvailability, isLoading: loadingFamilyAvailability } = useQuery<Array<{
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    unconvertibleBalanceCount: number;
  }>>({
    queryKey: ['inventory', 'family-availability', isMaterialForBalance ? 'MATERIAL' : 'PRODUCT', stockItemIds, baseUomId],
    queryFn: async () => Promise.all(stockItemIds.map((itemId) => fetchApi<{
      onHandQuantity: number;
      reservedQuantity: number;
      availableQuantity: number;
      unconvertibleBalanceCount: number;
    }>(`/inventory/items/${isMaterialForBalance ? 'MATERIAL' : 'PRODUCT'}/${encodeURIComponent(itemId)}/availability?uomId=${encodeURIComponent(baseUomId)}`))),
    enabled: Boolean(hasCurrentItem && baseUomId && stockItemIds.length),
    meta: { silentError: true },
  });

  // Unified Normalisation
  const itemCode = (rawMaterial?.code || rawProduct?.sku || '').trim();
  const itemName = currentItem.name || 'Unnamed Item';
  const itemDescription = currentItem.description?.trim() || '';
  const itemCategoryName = currentItem.category?.name || '';
  const itemCategoryId = currentItem.categoryId || currentItem.category?.id || '';

  const matchedFamily =
    rawProduct?.productFamily ||
    families.data?.items?.find((f) => f.id === familyIdFromParam);

  const uomName = currentItem.uom?.name || '—';
  const uomSymbol = currentItem.uom?.symbol || currentItem.uom?.code || '';

  const uomsQuery = useUoms();
  const allUomMap = useMemo(
    () => new Map((uomsQuery.data?.items || []).map((u) => [u.id, u])),
    [uomsQuery.data?.items]
  );

  const specs = ((isMaterialEntity ? rawMaterial?.specs : rawProduct?.metadata) || {}) as Record<string, unknown>;
  const uomRelations = useMemo(() => {
    const rels =
      (currentItem as any)?.uomRelations ||
      (specs as any)?.uomRelations ||
      (currentItem as any)?.metadata?.uomRelations ||
      (currentItem as any)?.specs?.uomRelations ||
      [];
    return Array.isArray(rels) ? rels : [];
  }, [currentItem, specs]);
  const techSpecs = (specs.specifications || {}) as Record<string, string | undefined>;

  // Commercial Values
  const standardCost = Number(specs.standardCost ?? (currentItem as any).standardCost ?? specs.costPrice ?? 0);
  const sellingPrice = Number(specs.sellingPrice ?? specs.mrp ?? 0);
  const savedBuffer = specs.minStockLevel ?? (currentItem as any).minStockLevel ?? specs.safetyStock;
  const bufferValue = savedBuffer == null ? null : Number(savedBuffer);
  const targetMaxStock = Number(specs.targetMaxStock ?? specs.maxCapacity ?? 0);
  const leadTimeDays = Number(specs.leadTimeDays ?? (currentItem as any).leadTimeDays ?? 0);
  const hsnCode = String(specs.hsnCode ?? specs.hsn ?? (currentItem as any).hsnCode ?? '');
  const taxRate =
    specs.gstRate != null ? Number(specs.gstRate) : specs.taxRate != null ? Number(specs.taxRate) : null;

  // Physical specifications (only if provided by user)
  const steelGrade = techSpecs.steelGrade || (specs.steelGrade as string) || (specs.materialGrade as string) || '';
  const pipeDiameter = techSpecs.pipeDiameter || (specs.pipeDiameter as string) || '';
  const rodThickness = techSpecs.rodThickness || (specs.rodThickness as string) || '';
  const loadCapacity = techSpecs.loadCapacity || (specs.loadCapacity as string) || '';
  const dimensions = techSpecs.dimensionsUnfolded || (specs.dimensions as string) || (specs.extendedDimensions as string) || '';
  const surfaceFinish = techSpecs.surfaceFinish || (specs.surfaceFinish as string) || '';
  const netWeight = techSpecs.netWeight || (specs.netWeight as string) || '';
  const grossWeight = techSpecs.grossWeight || (specs.grossWeight as string) || '';
  const packagingType = techSpecs.packagingType || (specs.packagingType as string) || '';
  const unitsPerCarton = techSpecs.unitsPerCarton || (specs.unitsPerCarton as string) || '';

  const hasPhysicalAttributes = Boolean(
    steelGrade ||
    dimensions ||
    pipeDiameter ||
    rodThickness ||
    loadCapacity ||
    surfaceFinish ||
    netWeight ||
    grossWeight ||
    packagingType ||
    unitsPerCarton
  );

  // Variants extraction
  const extractedVariants = isMaterialEntity
    ? extractMaterialVariants(rawMaterial!)
    : rawProduct ? extractProductVariants(rawProduct) : [];

  const storedVariants = [
    ...(Array.isArray(specs.measurementVariants) ? specs.measurementVariants : []),
    ...(Array.isArray(specs.variants) ? specs.variants : []),
  ];

  const variantsList = (
    extractedVariants.length > 0
      ? extractedVariants.map((v: any, idx: number) => ({
          id: v.id,
          productRecordId: v.metadata?.productRecordId || v.specs?.productRecordId,
          sequence: idx + 1,
          name: getVariantLabel(itemName, v.name, v.measurementValue || v.specs?.measurementValue || v.metadata?.measurementValue),
          sku: v.code || v.sku || '',
          measurementValue:
            v.measurementValue ||
            v.specs?.measurementValue ||
            v.metadata?.measurementValue ||
            (storedVariants[idx] as any)?.measurementValue ||
            '',
          openingStock: v.openingStock,
          minStockLevel: v.minStockLevel,
          reorderPoint: v.reorderPoint,
          standardPrice: v.standardCost || v.standardPrice,
        }))
      : Array.isArray(specs.measurementVariants)
      ? specs.measurementVariants.map((variant: any, idx: number) => ({
          ...variant,
          name: getVariantLabel(itemName, variant.name, variant.measurementValue || `Variant ${idx + 1}`),
        }))
      : Array.isArray(specs.variants)
      ? specs.variants.map((variant: any, idx: number) => ({
          ...variant,
          name: getVariantLabel(itemName, variant.name, variant.measurementValue || `Variant ${idx + 1}`),
        }))
      : []
  ) as Array<{
    id?: string;
    productRecordId?: string;
    sequence?: number;
    name?: string;
    sku?: string;
    measurementValue?: string;
    openingStock?: number | string;
    minStockLevel?: number | string;
    reorderPoint?: number | string;
    standardPrice?: number | string;
  }>;

  // Custom and Technical fields
  const technicalFields = (
    Array.isArray(specs.technicalFields) ? specs.technicalFields : []
  ) as Array<{ name?: string; value?: string }>;

  const customFields = (
    Array.isArray(specs.customFields) ? specs.customFields : []
  ) as Array<{ name?: string; value?: string }>;

  // Pricing Master & Customer Tiers Lookup
  const pricingMasterId = String(
    specs.pricingMasterId ||
    (rawProduct as any)?.metadata?.pricingMasterId ||
    (rawProduct as any)?.pricingMasterId ||
    (rawMaterial as any)?.specs?.pricingMasterId ||
    ''
  );
  const pricingMastersQuery = usePricingMasters();
  const pricingMasterQuery = usePricingMaster(pricingMasterId);

  const matchedPricingMaster =
    pricingMasterQuery.data ||
    (Array.isArray(pricingMastersQuery.data)
      ? pricingMastersQuery.data
      : (pricingMastersQuery.data as any)?.items || []
    ).find((pm: any) => pm.id === pricingMasterId);

  const pricingMasterName =
    matchedPricingMaster?.name ||
    (specs.pricingMasterName as string) ||
    ((rawProduct as any)?.metadata?.pricingMasterName as string) ||
    '';

  const storedTierPricing = (
    Array.isArray(specs.tierPricing)
      ? specs.tierPricing
      : Array.isArray((rawProduct as any)?.metadata?.tierPricing)
      ? (rawProduct as any)?.metadata?.tierPricing
      : Array.isArray((rawMaterial as any)?.specs?.tierPricing)
      ? (rawMaterial as any)?.specs?.tierPricing
      : []
  ) as any[];

  const storedPricingFields = (
    Array.isArray(specs.pricingFields)
      ? specs.pricingFields
      : Array.isArray((rawProduct as any)?.metadata?.pricingFields)
      ? (rawProduct as any)?.metadata?.pricingFields
      : []
  ) as any[];

  const effectivePricingFields = storedPricingFields.length > 0
    ? storedPricingFields
    : (matchedPricingMaster?.fields || []).map((f: any) => ({
        name: f.name,
        value: f.defaultValue || '—',
      }));

  interface EffectiveTierItem {
    id: string;
    tierName: string;
    tierCode: string;
    masterPrice: number;
    discountPercentage: number;
    appliedPrice: number;
    isCustomPrice: boolean;
    enabled: boolean;
  }

  const effectiveTiers = useMemo<EffectiveTierItem[]>(() => {
    if (storedTierPricing.length > 0) {
      return storedTierPricing.map((t, idx) => {
        const discount = Number(t.discountPercentage ?? t.defaultDiscountPercentage ?? 0);
        const basePrice = Number(t.masterPrice ?? sellingPrice ?? 0);
        const calcPrice = t.isCustomPrice && t.customPrice
          ? Number(t.customPrice)
          : calculateTierPrice(basePrice, discount);

        return {
          id: String(t.tierId || t.id || `tier-${idx}`),
          tierName: String(t.tierName || t.name || `Tier ${idx + 1}`),
          tierCode: String(t.tierCode || t.code || ''),
          masterPrice: basePrice,
          discountPercentage: discount,
          appliedPrice: calcPrice,
          isCustomPrice: Boolean(t.isCustomPrice),
          enabled: t.enabled !== false,
        };
      });
    }

    if (matchedPricingMaster?.tiers && Array.isArray(matchedPricingMaster.tiers)) {
      return matchedPricingMaster.tiers.map((t: any, idx: number) => {
        const discount = Number(t.discountPercentage ?? 0);
        const basePrice = Number(t.price ?? sellingPrice ?? 0);
        const calcPrice = calculateTierPrice(basePrice, discount);

        return {
          id: String(t.id || `tier-${idx}`),
          tierName: String(t.name || `Tier ${idx + 1}`),
          tierCode: String(t.code || (t.name ? t.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_') : '')),
          masterPrice: basePrice,
          discountPercentage: discount,
          appliedPrice: calcPrice,
          isCustomPrice: false,
          enabled: t.isActive !== false,
        };
      });
    }

    return [];
  }, [storedTierPricing, matchedPricingMaster, sellingPrice]);

  // All hooks must run before either loading or error paths return.
  if (isLoading) return <LoadingState message="Loading item specification details..." />;
  if (activeError || !hasCurrentItem) {
    const friendlyItemError = new Error('This item could not be loaded. Please check that the item is available and try again.');
    return <ErrorState error={friendlyItemError} retry={refetch} />;
  }

  // Media Images
  const rawImages = Array.isArray(specs.images) ? (specs.images as any[]) : [];
  const galleryImages: string[] = rawImages
    .map((img) => (typeof img === 'string' ? img : img?.url || img?.secure_url))
    .filter(Boolean);

  // Stock calculations
  const stockByItem = new Map<string, {
    itemId: string;
    itemName: string;
    onHand: number;
    reserved: number;
    available: number;
    value: number;
    hasValue: boolean;
    uom: string;
    uomId: string;
  }>();
  const stockItemSources = [
    { id: baseId, name: itemName, balances: inventoryBalances?.items ?? [] },
    ...(variantInventoryData ?? []).map((variant) => ({ id: variant.id, name: variant.name, balances: variant.balances })),
  ];
  stockItemSources.forEach((source) => {
    source.balances.forEach((balance: any) => {
      if (balance.condition !== 'AVAILABLE' || balance.ownership !== 'OWNED') return;
      const uomId = balance.uomId || balance.uom?.id || baseUomId;
      const key = `${source.id}:${uomId}`;
      const summary = stockByItem.get(key) ?? {
        itemId: source.id,
        itemName: source.name,
        onHand: 0,
        reserved: 0,
        available: 0,
        value: 0,
        hasValue: false,
        uom: balance.uom?.symbol || uomSymbol,
        uomId,
      };
      const onHand = Number(balance.onHandQuantity ?? 0);
      const reserved = Number(balance.reservedQuantity ?? 0);
      summary.onHand += onHand;
      summary.reserved += reserved;
      summary.available += Number(balance.availableQuantity ?? Math.max(0, onHand - reserved));
      const value = balance.value != null
        ? Number(balance.value)
        : balance.averageCost != null
        ? onHand * Number(balance.averageCost)
        : null;
      if (value != null && Number.isFinite(value)) {
        summary.value += value;
        summary.hasValue = true;
      }
      stockByItem.set(key, summary);
    });
  });
  const consolidatedStockBalances = Array.from(stockByItem.values());
  const baseUomRows = consolidatedStockBalances.filter((item) => item.uomId === baseUomId);
  const liveOnHand = familyAvailability?.reduce((sum, item) => sum + Number(item.onHandQuantity || 0), 0)
    ?? baseUomRows.reduce((sum, item) => sum + item.onHand, 0);
  const liveReserved = familyAvailability?.reduce((sum, item) => sum + Number(item.reservedQuantity || 0), 0)
    ?? baseUomRows.reduce((sum, item) => sum + item.reserved, 0);
  const liveAvailable = familyAvailability?.reduce((sum, item) => sum + Number(item.availableQuantity || 0), 0)
    ?? baseUomRows.reduce((sum, item) => sum + item.available, 0);
  const unconvertibleBalanceCount = familyAvailability?.reduce((sum, item) => sum + Number(item.unconvertibleBalanceCount || 0), 0) ?? 0;
  const allStockBalances = [
    ...(inventoryBalances?.items ?? []),
    ...(variantInventoryData ?? []).flatMap((variant) => variant.balances),
  ];
  const liveStockValue = allStockBalances.reduce((sum, balance: any) => sum + Number(balance.value ?? 0), 0);
  const hasLiveStockValue = allStockBalances.some((balance: any) => balance.value != null && Number.isFinite(Number(balance.value)));
  const combinedLedgerRows = [
    ...(inventoryLedger?.items ?? []).map((entry) => ({ ...entry, itemName, itemId: baseId })),
    ...(variantInventoryData ?? []).flatMap((variant) =>
      variant.ledger.map((entry) => ({ ...entry, itemName: variant.name, itemId: variant.id }))
    ),
  ].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  // Cross-location running total: accumulate deltas oldest → newest so the
  // "Total Balance" column reflects the real aggregate on-hand across ALL
  // warehouse locations, not just the per-location bucket shown in Balance After.
  const crossLocationRunningTotal = (() => {
    const totals = new Map<string, number>();
    let running = 0;
    const ascending = [...combinedLedgerRows].sort(
      (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
    );
    for (const row of ascending) {
      running += Number(row.quantityDelta ?? 0);
      totals.set(row.id, running);
    }
    return totals;
  })();

  // Classification Label
  const materialType = rawMaterial?.materialType || (specs.materialType as string) || (isMaterialEntity ? 'RAW_MATERIAL' : 'PRODUCT');
  const typeLabelMap: Record<string, string> = {
    RAW_MATERIAL: 'Raw Material',
    HARDWARE: 'Fastener & Hardware',
    PACKAGING: 'Packaging Material',
    COMPONENT: 'Component & Sub-Assembly',
    CONSUMABLE: 'Consumable Supply',
    CHEMICAL: 'Coating & Chemical',
    PRODUCT: 'Finished Product',
  };
  // Category is the persisted catalog classification. MaterialType describes
  // procurement/handling and must not override the category users edited.
  const categoryBadgeLabel = currentItem.category?.name || typeLabelMap[materialType] || materialType.replace(/_/g, ' ');

  // Tabs definition
  const tabs = [
    {
      id: 'overview' as const,
      label: 'Overview & Specifications',
      icon: FileText,
    },
    {
      id: 'manufacturing' as const,
      label: 'Manufacturing & BOM',
      icon: Factory,
    },
    {
      id: 'inventory' as const,
      label: 'Inventory & Ledger',
      icon: Package,
    },
    {
      id: 'pricing' as const,
      label: 'Pricing Master',
      icon: BadgePercent,
    },
    {
      id: 'vendors' as const,
      label: 'Sourcing & Vendors',
      icon: Scale,
    },
  ];

  return (
    <div className="flex-1 bg-page min-h-screen">
      {/* Full-width container covering entire screen without squished max-w */}
      <div className={`w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${isBarcodeOpen ? 'print:hidden' : ''}`}>

        {/* -------------------------------------------------------------------------
            1. REFINED ACTION & BREADCRUMB BAR (PROPERLY SIZED BUTTONS)
           ------------------------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-xs text-ink-muted">
            <Link
              href={isMaterialEntity ? "/products?type=MATERIAL" : "/products"}
              className="hover:text-primary transition-colors font-medium"
            >
              Inventory
            </Link>
            {itemCategoryName && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-ink-placeholder shrink-0" />
                <Link
                  href={`/products?categoryId=${encodeURIComponent(itemCategoryId)}`}
                  className="hover:text-primary transition-colors font-medium"
                >
                  {itemCategoryName}
                </Link>
              </>
            )}
            {matchedFamily?.name && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-ink-placeholder shrink-0" />
                <Link
                  href={`/products?familyId=${encodeURIComponent(matchedFamily.id)}`}
                  className="hover:text-primary transition-colors font-medium"
                >
                  {matchedFamily.name}
                </Link>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-ink-placeholder shrink-0" />
            <span className="text-ink font-bold truncate max-w-[320px]">
              {itemName}
            </span>
          </nav>

          {/* Clean Action Toolbar (Properly sized buttons, Spec sheet removed) */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              icon={ArrowLeft}
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else if (familyIdFromParam) {
                  router.push(`/products?familyId=${familyIdFromParam}`);
                } else {
                  router.push(isMaterialEntity ? '/products?type=MATERIAL' : '/products');
                }
              }}
              className="h-10 px-4 rounded-xl border-border-strong font-bold text-xs hover:bg-muted transition cursor-pointer"
            >
              Back
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={QrCode}
              onClick={() => setIsBarcodeOpen(true)}
              className="h-10 px-4 rounded-xl border-border-strong font-bold text-xs hover:bg-muted transition cursor-pointer"
            >
              Barcode
            </Button>

            {currentItem.status === 'DRAFT' && isMaterialEntity && (
              <Button
                size="sm"
                variant="outline"
                icon={Send}
                onClick={() => submitValidationMutation.mutate()}
                loading={submitValidationMutation.isPending}
                className="h-10 px-4 rounded-xl border-primary/40 text-primary hover:bg-primary/5 font-bold text-xs cursor-pointer"
              >
                Submit for Review
              </Button>
            )}

            <Button
              size="sm"
              icon={Pencil}
              onClick={() => {
                if (isMaterialEntity) {
                  router.push(`/products/new?editId=${currentItem.id}&mode=edit&type=MATERIAL`);
                } else {
                  router.push(`/products/new?editId=${currentItem.id}&mode=edit`);
                }
              }}
              className="h-10 px-5 rounded-xl bg-primary hover:bg-[color:var(--action-primary-bg-hover)] text-inverse font-bold text-xs shadow-sm transition cursor-pointer"
            >
              Edit Item
            </Button>
          </div>
        </div>

        {/* -------------------------------------------------------------------------
            2. UNIFIED PRODUCT PRESENTATION STAGE (HERO CARD - CAPSULES REMOVED)
           ------------------------------------------------------------------------- */}
        <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">

          {/* Top Identity & Title Area (Clean typography, NO SKU capsule, NO ACTIVE capsule, NO SKU CODE) */}
          <div className="p-5 sm:p-6 border-b border-border">
            <div className="space-y-1.5">
              {/* Meta details line (SKU code removed as requested) */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted">
                <span className="font-bold text-primary">
                  {categoryBadgeLabel}
                </span>
                <span>•</span>
                <span>Category: {itemCategoryName || 'General Catalog'}</span>
                {matchedFamily?.name && (
                  <>
                    <span>•</span>
                    <span>Sub-Family: {matchedFamily.name}</span>
                  </>
                )}
                <span>•</span>
                <span>Base UOM: {uomName} ({uomSymbol})</span>
                {uomRelations.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-bold text-primary">
                      <Scale className="w-3.5 h-3.5" />
                      Multi-UOM ({uomRelations.length} {uomRelations.length === 1 ? 'relation' : 'relations'})
                    </span>
                  </>
                )}
                {hsnCode && (
                  <>
                    <span>•</span>
                    <span className="font-mono font-bold text-ink-secondary">HSN: {hsnCode}</span>
                  </>
                )}
              </div>

              {/* Primary Heading */}
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">
                {itemName}
              </h1>
            </div>
          </div>

          {/* Main Visual & Key Metrics Grid (Compact Height) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Visual Media Showcase (Properly styled without grey background, full visibility) */}
            <div className="lg:col-span-4 p-5 sm:p-6 flex flex-col justify-center space-y-3">
              <div
                className="relative h-64 sm:h-72 w-full rounded-2xl bg-surface border border-border flex items-center justify-center p-3 overflow-hidden group select-none cursor-pointer shadow-2xs"
                onClick={() => galleryImages.length > 0 && setIsImageZoomed(!isImageZoomed)}
              >
                {galleryImages.length > 0 ? (
                  <>
                    <img
                      src={galleryImages[activeImageIndex]}
                      alt={itemName}
                      className={clsx(
                        'h-full w-full object-contain transition-transform duration-300',
                        isImageZoomed ? 'scale-125' : 'scale-100'
                      )}
                    />

                    {/* Navigation buttons */}
                    {galleryImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : galleryImages.length - 1));
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-surface shadow-none border border-border flex items-center justify-center text-ink-secondary hover:scale-105 transition cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex((prev) => (prev < galleryImages.length - 1 ? prev + 1 : 0));
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-surface shadow-none border border-border flex items-center justify-center text-ink-secondary hover:scale-105 transition cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {/* Image indicator */}
                    <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-inverse backdrop-blur-xs text-[10px] font-mono font-bold text-inverse shadow-sm">
                      {activeImageIndex + 1} / {galleryImages.length}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-4 space-y-2">
                    <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-ink-placeholder">
                      <Package className="h-6 w-6 stroke-[1.5]" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-ink-secondary">
                        No product image uploaded
                      </p>
                      <p className="text-[11px] text-ink-placeholder">
                        Technical diagram or media photo has not been added
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Thumbnails strip */}
              {galleryImages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                  {galleryImages.map((imgUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={clsx(
                        'relative h-12 w-12 shrink-0 rounded-xl border overflow-hidden p-1 bg-surface transition cursor-pointer',
                        idx === activeImageIndex
                          ? 'border-primary ring-2 ring-primary/20 shadow-xs'
                          : 'border-border hover:border-border-strong'
                      )}
                    >
                      <img src={imgUrl} alt="" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Core Metrics & Key Specification Attributes (8 Columns) */}
            <div className="lg:col-span-8 p-5 sm:p-6 space-y-4">

              {/* Clean Metric Ribbon (High-contrast numbers, dedicated HSN code field) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 py-3 border-b border-border">

                {/* 1. Rate */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {standardCost > 0 ? 'Valuation Rate' : sellingPrice > 0 ? 'Selling Rate' : 'Standard Rate'}
                  </p>
                  <p className="text-2xl font-black font-mono text-primary mt-1">
                    {standardCost > 0
                      ? `₹${standardCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : sellingPrice > 0
                      ? `₹${sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                  <p className="text-xs font-medium text-ink-muted mt-0.5">
                    Per {uomSymbol || 'unit'}
                  </p>
                </div>

                {/* 2. Available Stock */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Available Stock
                  </p>
                  <p className="text-2xl font-black font-mono text-tone-green-text mt-1">
                    {liveAvailable.toLocaleString()} <span className="text-xs font-semibold text-ink-muted">{uomSymbol}</span>
                  </p>
                  <p className="text-xs font-medium text-ink-muted mt-0.5">
                    {liveOnHand.toLocaleString()} on-hand {liveReserved > 0 ? `(${liveReserved} reserved)` : ''}
                  </p>
                  {unconvertibleBalanceCount > 0 && (
                    <p className="text-xs font-medium text-tone-amber-text mt-1">
                      Stock in other units is listed separately until a conversion is approved.
                    </p>
                  )}
                </div>

                {/* 3. Safety buffer */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Buffer
                  </p>
                  <p className="text-2xl font-black font-mono text-ink mt-1">
                    {bufferValue != null && Number.isFinite(bufferValue)
                      ? `${bufferValue.toLocaleString('en-IN')}${uomSymbol ? ` ${uomSymbol}` : ''}`
                      : '—'}
                  </p>
                  {targetMaxStock > 0 && <p className="text-xs font-medium text-ink-muted mt-0.5">Max: {targetMaxStock} {uomSymbol}</p>}
                </div>

                {/* 4. HSN Code */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    HSN / SAC Code
                  </p>
                  <p className="text-2xl font-black font-mono text-ink mt-1">
                    {hsnCode || '—'}
                  </p>
                  <p className="text-xs font-medium text-ink-muted mt-0.5">
                    Tariff Classification
                  </p>
                </div>

                {/* 5. GST / Tax Slab */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    GST / Tax Slab
                  </p>
                  <p className="text-2xl font-black font-mono text-ink mt-1">
                    {taxRate != null ? `${taxRate}%` : '—'}
                  </p>
                  <p className="text-xs font-medium text-ink-muted mt-0.5">
                    Standard Slab Rate
                  </p>
                </div>
              </div>

              {/* Description (Clean prose) */}
              {itemDescription && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                    Description & Scope
                  </h3>
                  <p className="text-sm font-medium text-ink leading-relaxed whitespace-pre-line">
                    {itemDescription}
                  </p>
                </div>
              )}

              {/* Essential Physical & Technical Attributes - Only displayed if fields exist */}
              {hasPhysicalAttributes && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                    Physical & Engineering Attributes
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3.5 text-xs">
                    {steelGrade && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Material Grade</span>
                        <span className="font-bold text-ink mt-0.5">{steelGrade}</span>
                      </div>
                    )}

                    {dimensions && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Dimensions</span>
                        <span className="font-mono font-bold text-ink mt-0.5">{dimensions}</span>
                      </div>
                    )}

                    {pipeDiameter && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Pipe Diameter</span>
                        <span className="font-bold text-ink mt-0.5">{pipeDiameter}</span>
                      </div>
                    )}

                    {rodThickness && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Thickness</span>
                        <span className="font-bold text-ink mt-0.5">{rodThickness}</span>
                      </div>
                    )}

                    {loadCapacity && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Load Capacity</span>
                        <span className="font-bold text-tone-green-text mt-0.5">{loadCapacity}</span>
                      </div>
                    )}

                    {surfaceFinish && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Surface Finish</span>
                        <span className="font-bold text-ink mt-0.5">{surfaceFinish}</span>
                      </div>
                    )}

                    {netWeight && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Net Weight</span>
                        <span className="font-bold text-ink mt-0.5">{netWeight}</span>
                      </div>
                    )}

                    {grossWeight && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Gross Weight</span>
                        <span className="font-bold text-ink mt-0.5">{grossWeight}</span>
                      </div>
                    )}

                    {packagingType && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Packaging Type</span>
                        <span className="font-bold text-ink mt-0.5">{packagingType}</span>
                      </div>
                    )}

                    {unitsPerCarton && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Units Per Carton</span>
                        <span className="font-bold font-mono text-ink mt-0.5">{unitsPerCarton}</span>
                      </div>
                    )}

                    {leadTimeDays > 0 && (
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-muted">Procurement Lead Time</span>
                        <span className="font-bold text-ink mt-0.5">
                          {leadTimeDays} Days
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </Card>

        {/* -------------------------------------------------------------------------
            3. WORKSPACE TABBED SECTIONS (DISTINCT STYLING, PUNCHY LAYOUTS)
           ------------------------------------------------------------------------- */}
        <div className="space-y-4">

          {/* Distinct Tab Navigation Header (Clean pill navigation, no dull gray washout) */}
          <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto scrollbar-none">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={clsx(
                    'flex items-center gap-2.5 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer',
                    isActive
                      ? 'bg-primary text-inverse shadow-sm ring-1 ring-primary/20'
                      : 'text-ink-secondary bg-surface hover:text-primary hover:bg-muted border border-border'
                  )}
                >
                  <Icon className={clsx('h-4 w-4 shrink-0', isActive ? 'text-inverse' : 'text-primary')} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW & SPECIFICATIONS */}
          {activeTab === 'overview' && (
            <div className="space-y-6 pt-2">

              {/* Variants Matrix Table Card (Flat Inventory List Style) */}
              <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
                <CardHeader className="bg-surface border-b border-border p-5 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-sm font-bold text-ink">
                      Configured Variants Matrix
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="rounded-none border-0 shadow-none">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-bold text-xs">Variant Name</TableHead>
                          <TableHead className="font-bold text-xs">Measurement / Spec</TableHead>
                          <TableHead className="font-bold text-xs text-right">Opening Stock</TableHead>
                          <TableHead className="font-bold text-xs text-right">Safety Buffer</TableHead>
                          <TableHead className="font-bold text-xs text-right">Standard Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantsList.length > 0 ? (
                          variantsList.map((v, idx) => (
                            <TableRow key={v.id || idx} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="font-bold text-ink text-xs">
                                {v.name || `Variant ${idx + 1}`}
                              </TableCell>
                              <TableCell className="font-medium text-ink-secondary text-xs">
                                {v.measurementValue || '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-tone-green-text text-xs">
                                {v.openingStock ?? 0} {uomSymbol}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-ink-secondary text-xs">
                                {v.minStockLevel ?? 0} {uomSymbol}
                              </TableCell>
                              <TableCell className="text-right font-mono font-extrabold text-ink text-xs">
                                {Number(v.standardPrice) > 0 ? `₹${Number(v.standardPrice).toLocaleString('en-IN')}` : '—'}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="h-28 text-center text-ink-placeholder font-medium">
                              No discrete variants configured. This item exists as a single standard catalog item.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Units of Measure & Conversion Relations Card */}
              {uomRelations.length > 0 && (
                <Card className="rounded-2xl border border-border bg-surface shadow-sm p-6 space-y-4">
                  <div className="border-b border-border pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Scale className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-bold text-ink">
                        Units of Measure &amp; Conversion Relations
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold text-primary border-primary/20 bg-primary/5">
                      {uomRelations.length} {uomRelations.length === 1 ? 'relation' : 'relations'} configured
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {/* Primary Base UOM Card */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
                        Primary Base UOM
                      </span>
                      <p className="text-base font-black text-ink">
                        {uomName} {uomSymbol ? `(${uomSymbol})` : ''}
                      </p>
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-primary text-inverse shadow-2xs">
                        Base Anchor
                      </span>
                    </div>

                    {/* Each established relation */}
                    {uomRelations.map((rel: any, idx: number) => {
                      const fromUom = allUomMap.get(rel.fromUomId);
                      const toUom = allUomMap.get(rel.toUomId);
                      const fromLabel = fromUom?.symbol || fromUom?.name || 'Unit';
                      const toLabel = toUom?.symbol || toUom?.name || 'Unit';
                      const factorNum = Number(rel.factor);
                      const inverseNum = factorNum > 0 ? Number((1 / factorNum).toFixed(4)) : null;

                      return (
                        <div
                          key={rel.id || idx}
                          className="rounded-xl border border-border bg-surface p-4 space-y-1.5 shadow-2xs hover:border-primary/40 transition-colors"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block">
                            Conversion #{idx + 1}
                          </span>
                          <p className="font-mono font-bold text-sm text-primary">
                            {rel.fromQuantity ?? 1} {fromLabel} = {rel.toQuantity ?? rel.factor} {toLabel}
                          </p>
                          {inverseNum !== null && (
                            <p className="text-[11px] font-mono text-ink-muted">
                              ⇄ 1 {toLabel} = {inverseNum} {fromLabel}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Technical Specifications (Custom Attributes) */}
              {technicalFields.length > 0 && (
                <Card className="rounded-2xl border border-border bg-surface shadow-sm p-6 space-y-4">
                  <div className="border-b border-border pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Wrench className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-bold text-ink">
                        Technical Parameters & Metallurgy
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold">
                      {technicalFields.length} attributes
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {technicalFields.map((field, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 shadow-2xs"
                      >
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                          {field.name || 'Specification'}
                        </span>
                        <span className="text-sm font-extrabold text-ink mt-1 block break-words">
                          {field.value || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Custom Business Identifiers */}
              {customFields.length > 0 && (
                <Card className="rounded-2xl border border-border bg-surface shadow-sm p-6 space-y-4">
                  <div className="border-b border-border pb-3 flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-ink">
                      Commercial & Custom Business Identifiers
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-xs font-bold">
                      {customFields.length} identifiers
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {customFields.map((field, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 shadow-2xs"
                      >
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                          {field.name || 'Identifier'}
                        </span>
                        <span className="text-sm font-mono font-bold text-ink mt-1 block break-words">
                          {field.value || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

            </div>
          )}

          {/* TAB 2: MANUFACTURING & BOM */}
          {activeTab === 'manufacturing' && (() => {
            const attachedRoutes = (materialRoutes?.items || []).filter(
              (route) =>
                (isMaterialEntity ? route.materialId === currentItem.id : route.productId === currentItem.id) &&
                route.status !== 'SUPERSEDED'
            ).sort((a, b) => {
              const versionDifference = Number(b.version || 0) - Number(a.version || 0);
              if (versionDifference !== 0) return versionDifference;

              const dateOf = (route: any) => new Date(route.effectiveFrom || route.updatedAt || route.createdAt || 0).getTime();
              return dateOf(b) - dateOf(a);
            });
            const latestRoute = attachedRoutes[0];
            const routes = latestRoute ? [latestRoute] : [];
            const bomVersions = itemBoms;
            const activeBom = selectedBomDetail || selectedBomSummary;
            const specsRouteSteps = Array.isArray(specs.productionRouteSteps) ? specs.productionRouteSteps : [];
            const displayRoutes =
              routes.length > 0
                ? routes
                : specsRouteSteps.length > 0
                ? [
                    {
                      id: (specs.productionRouteId as string) || 'spec-route',
                      name: (specs.productionRouteName as string) || `${itemName} Production Route`,
                      steps: specsRouteSteps,
                    },
                  ]
                : [];

            return (
              <div className="space-y-6 pt-2">

                {/* 1. BOM (Appears First) */}
                <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
                  <CardHeader className="bg-surface border-b border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Layers className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-sm font-bold text-ink">
                        BOM
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeBom?.id && <Link href={`/production/bom/${activeBom.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 px-4 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <span>View BOM details</span>
                          <ExternalLink className="h-3 w-3 opacity-80" />
                        </Button>
                      </Link>}
                    </div>
                  </CardHeader>

                  <CardContent className="p-6">
                    {bomVersions.length === 0 ? (
                      <div className="text-center py-10 text-xs text-ink-placeholder space-y-3 font-medium">
                        <Layers className="h-8 w-8 mx-auto text-ink-placeholder" />
                        <p>No Bill of Materials recipe configured for this item.</p>
                      </div>
                    ) : (() => {
                      const lines = activeBom?.lines || [];
                      const totalBomCost = lines.reduce((sum: number, line: any) => {
                        const qty = Number(line.quantity) || 0;
                        const rate = Number(line.unitCost ?? line.material?.averageCost ?? line.material?.costPrice ?? 0);
                        return sum + qty * rate;
                      }, 0);

                      return (
                        <div className="space-y-4">
                          {bomVersions.length > 1 && (
                            <div className="flex flex-wrap gap-2 border-b border-border pb-4" role="tablist" aria-label="Bill of materials">
                              {bomVersions.map((bom: any) => {
                                const isSelected = bom.id === activeBom?.id;
                                return (
                                  <button
                                    key={bom.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isSelected}
                                    onClick={() => setSelectedBomId(bom.id)}
                                    className={clsx(
                                      'rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                                      isSelected
                                        ? 'border-primary bg-primary text-inverse shadow-sm'
                                        : 'border-border bg-background text-foreground hover:bg-muted'
                                    )}
                                  >
                                    {bom.bomNumber || `BOM v${bom.version}`}
                                    <span className={clsx('ml-2 text-[10px]', isSelected ? 'text-inverse' : 'text-muted-foreground')}>
                                      {(bom.lines || []).length} items
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {/* BOM Lines Table */}
                          <div className="overflow-x-auto rounded-xl border border-border shadow-xs">
                            <Table className="rounded-none border-0 shadow-none">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="font-bold text-xs">Item Name</TableHead>
                                  <TableHead className="text-right font-bold text-xs">Required Qty</TableHead>
                                  <TableHead className="font-bold text-xs">UOM</TableHead>
                                  <TableHead className="text-right font-bold text-xs">Unit Rate (₹)</TableHead>
                                  <TableHead className="text-right font-bold text-xs">Line Total (₹)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lines.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-ink-placeholder font-medium">
                                      No component parts listed in this formulation version.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  lines.map((line: any, idx: number) => {
                                    const display = getBomLineItemDisplay(line, bomMaterials, bomProducts);
                                    const partTitle = display.name;
                                    const variantLabel = display.variant;
                                    const qty = Number(line.quantity) || 0;
                                    const rate = Number(line.unitCost ?? line.material?.averageCost ?? line.material?.costPrice ?? 0);
                                    const lineCost = qty * rate;
                                    const uomText = line.uom?.symbol || line.uom?.code || line.uom?.name || '—';

                                    return (
                                      <TableRow key={line.id || idx} className="hover:bg-muted/40 transition-colors">
                                        <TableCell>
                                          <div className="font-bold text-ink text-xs">
                                            {partTitle}
                                          </div>
                                          {variantLabel && <div className="mt-0.5 flex items-center gap-2"><span className="text-[11px] font-normal text-muted-foreground">{variantLabel}</span><span className="shrink-0 rounded-md border border-tone-purple-solid/25 bg-tone-purple-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-tone-purple-text">Variant</span></div>}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-ink text-xs">
                                          {qty.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                                        </TableCell>
                                        <TableCell className="font-mono font-semibold text-ink-secondary text-xs">
                                          {uomText}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-semibold text-ink-secondary text-xs">
                                          ₹{rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-extrabold text-ink text-xs">
                                          ₹{lineCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })
                                )}
                              </TableBody>
                              {lines.length > 0 && (
                                <TableFooter className="bg-muted border-t-2 border-border">
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-right font-extrabold text-xs uppercase tracking-wider text-ink-secondary py-3">
                                      Total BOM Cost:
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-black text-sm text-primary py-3">
                                      ₹{totalBomCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                  </TableRow>
                                </TableFooter>
                              )}
                            </Table>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* 2. Production Route Operations (Appears Below BOM) */}
                <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted border-b border-border p-5 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <GitBranch className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-sm font-bold text-ink">
                        Production Route Operations
                      </CardTitle>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6">
                    {displayRoutes.length === 0 ? (
                      <div className="text-center py-8 text-xs text-ink-placeholder font-medium">
                        No active production route assigned to this item.
                      </div>
                    ) : (
                      displayRoutes.map((route) => {
                        const routeTitle = route.name || (specs.productionRouteName as string) || route.code || 'Production Route';
                        const routeSteps = route.steps || [];

                        return (
                          <div key={route.id} className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-ink text-base">
                                {routeTitle}
                              </span>
                              {route.id !== 'spec-route' && <Link href={`/inventory/routing/${route.id}`}>
                                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold inline-flex items-center gap-2">
                                  View route details
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </Link>}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                              {routeSteps.map((step: any, sIdx: number) => {
                                const stepTitle = step.stepName || step.name || 'Operation';
                                const deptName =
                                  step.department?.name ||
                                  step.departmentName ||
                                  (step.departmentId ? departmentMap.get(step.departmentId) : '') ||
                                  'Production';
                                const duration = step.standardDurationMinutes ?? step.durationMinutes ?? 0;

                                return (
                                  <div
                                    key={step.id || sIdx}
                                    className="p-4 rounded-xl border border-border bg-surface flex items-start gap-3 transition-all hover:border-primary/40 shadow-2xs"
                                  >
                                    <span className="h-7 w-7 rounded-lg bg-primary text-inverse font-mono text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                                      {step.sequenceNumber || sIdx + 1}
                                    </span>
                                    <div className="space-y-1 min-w-0">
                                      <p className="text-xs font-extrabold text-ink truncate">
                                        {stepTitle}
                                      </p>
                                      <p className="text-[11px] font-semibold text-ink-muted">
                                        {deptName}
                                      </p>
                                      <p className="font-mono text-[11px] font-bold text-primary">
                                        {duration} mins
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

              </div>
            );
          })()}

          {/* TAB 3: WAREHOUSE INVENTORY */}
          {activeTab === 'inventory' && (
            <div className="space-y-6 pt-2">

              {/* Warehouse Inventory Metric Summary Cards */}
              <div className={clsx('grid grid-cols-1 gap-4', hasLiveStockValue ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
                <Card className="p-5 border border-border bg-surface shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Total On-Hand</span>
                  <p className="text-2xl font-black font-mono text-ink mt-1">
                    {liveOnHand.toLocaleString()} <span className="text-xs font-semibold text-ink-muted">{uomSymbol}</span>
                  </p>
                  <p className="text-xs text-ink-placeholder mt-0.5">From posted stock balances</p>
                </Card>

                <Card className="p-5 border border-border bg-surface shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Allocated / Reserved</span>
                  <p className="text-2xl font-black font-mono text-tone-amber-text mt-1">
                    {liveReserved.toLocaleString()} <span className="text-xs font-semibold text-ink-muted">{uomSymbol}</span>
                  </p>
                  <p className="text-xs text-ink-placeholder mt-0.5">From active reservations</p>
                </Card>

                <Card className="p-5 border border-border bg-surface shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Available to Pick</span>
                  <p className="text-2xl font-black font-mono text-tone-green-text mt-1">
                    {liveAvailable.toLocaleString()} <span className="text-xs font-semibold text-ink-muted">{uomSymbol}</span>
                  </p>
                  <p className="text-xs text-ink-placeholder mt-0.5">On-hand less reserved</p>
                </Card>

                {hasLiveStockValue && (
                <Card className="p-5 border border-border bg-surface shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Total Stock Valuation</span>
                  <p className="text-2xl font-black font-mono text-ink mt-1">
                    ₹{liveStockValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-ink-placeholder mt-0.5">From inventory balance cost</p>
                </Card>
                )}
              </div>

              {/* Stock Balances Table Card (Flat Inventory List Style) */}
              <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
                <CardHeader className="bg-surface border-b border-border p-5 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-ink">
                        Stock Balances
                      </CardTitle>
                      <CardDescription className="text-xs text-ink-muted mt-0.5">
                        Consolidated stock for this item and its variants
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="rounded-none border-0 shadow-none">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-bold text-xs">Item</TableHead>
                          <TableHead className="text-right font-bold text-xs">Available</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingInventoryBalances || loadingVariantInventory || loadingFamilyAvailability ? (
                          <TableRow>
                            <TableCell colSpan={2} className="h-28 text-center text-ink-placeholder font-medium">
                              Loading stock balances...
                            </TableCell>
                          </TableRow>
                        ) : consolidatedStockBalances.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="h-28 text-center text-ink-placeholder font-medium">
                              No posted stock balances for this item or its variants.
                            </TableCell>
                          </TableRow>
                        ) : (
                          consolidatedStockBalances.map((balance) => (
                            <TableRow key={`${balance.itemId}:${balance.uomId}`} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="font-semibold text-ink-secondary text-xs">{balance.itemName} <span className="font-normal text-ink-muted">({balance.uom})</span></TableCell>
                              <TableCell className="text-right font-mono font-black text-tone-green-text text-xs">
                                {balance.available.toLocaleString()} {balance.uom}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

          {/* Inventory balances and the immutable movement ledger share one tab. */}
          {activeTab === 'inventory' && (
            <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden pt-1">
              <CardHeader className="bg-surface border-b border-border p-5 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-ink">
                      Stock Movement Audit Trail
                    </CardTitle>
                    <CardDescription className="text-xs text-ink-muted mt-0.5">
                      Immutable transaction log of receipts, production issues, transfers, and inventory adjustments
                    </CardDescription>
                  </div>
                </div>
                <Link
                  href={`/stock/ledger?${isMaterialEntity ? 'materialId' : 'productId'}=${currentItem.id}`}
                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                >
                  Parent Ledger <ExternalLink className="h-3 w-3" />
                </Link>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="rounded-none border-0 shadow-none">
                    <TableHeader>
                      <TableRow>
                      <TableHead className="font-bold text-xs">Timestamp</TableHead>
                        <TableHead className="font-bold text-xs">Item</TableHead>
                        <TableHead className="font-bold text-xs">Movement Type</TableHead>
                        <TableHead className="font-bold text-xs">Location</TableHead>
                        <TableHead className="font-bold text-xs">Reference Document</TableHead>
                        <TableHead className="text-right font-bold text-xs">Quantity Delta</TableHead>
                        <TableHead className="text-right font-bold text-xs">Total Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {combinedLedgerRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="px-6 py-10 text-center text-ink-placeholder font-medium">
                          No stock movements have been recorded for this item yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      combinedLedgerRows.map((mov) => {
                        const isOut = mov.direction === 'OUT' || Number(mov.quantityDelta ?? 0) < 0;
                        const isOpening = mov.sourceType?.includes('OPENING_BALANCE');
                        const isReceipt = mov.movementType === 'RECEIPT' || mov.entryType === 'GRN_RECEIPT' || mov.sourceType === 'GOODS_RECEIPT';
                        const isIssue = mov.movementType === 'ISSUE' || mov.entryType === 'ISSUE' || mov.sourceType?.startsWith('PRODUCTION');

                        const grnId = (mov.sourceType === 'GOODS_RECEIPT' || mov.sourceType === 'GRN')
                          ? (mov.sourceId || mov.grnId || null)
                          : (mov.grnId || null);
                        const grnNumber = mov.goodsReceipt?.grnNumber || (grnId ? `GRN #${String(grnId).slice(0, 8)}` : null);
                        const planId = mov.productionPlan?.id || (mov.sourceType === 'PRODUCTION_PLAN' ? mov.sourceId : null);

                        return (
                          <TableRow key={mov.id} className="hover:bg-muted transition-colors">
                            <TableCell className="px-6 py-4 font-mono font-semibold text-ink-secondary text-xs whitespace-nowrap">
                              {new Date(mov.postedAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </TableCell>

                            <TableCell className="px-6 py-4 font-semibold text-ink-secondary text-xs">
                              {mov.itemName}
                            </TableCell>

                            <TableCell className="px-6 py-4">
                              <span
                                className={clsx(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold',
                                  isReceipt
                                    ? 'bg-tone-green-bg text-tone-green-text'
                                    : isIssue
                                    ? 'bg-tone-amber-bg text-tone-amber-text'
                                    : 'bg-muted text-ink-secondary'
                                )}
                              >
                                {isReceipt ? <ArrowDownLeft className="w-3.5 h-3.5 text-tone-green-text" /> : isIssue ? <ArrowUpRight className="w-3.5 h-3.5 text-tone-amber-text" /> : null}
                                <span>{isReceipt ? 'Receipt (GRN)' : isIssue ? 'Production Issue' : isOpening ? 'Opening Stock' : (mov.movementType || 'Movement')}</span>
                              </span>
                            </TableCell>

                            <TableCell className="px-6 py-4">
                              {mov.location ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-secondary">
                                  <span className="font-mono font-bold text-primary">{mov.location.code}</span>
                                  <span className="text-ink-placeholder">·</span>
                                  <span>{mov.location.name}</span>
                                </span>
                              ) : (
                                <span className="text-ink-placeholder text-xs">—</span>
                              )}
                            </TableCell>


                            <TableCell className="px-6 py-4">
                              {grnId ? (
                                <Link
                                  href={`/receiving/goods-receipts/${grnId}`}
                                  className="font-mono text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <span>{grnNumber}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : planId ? (
                                <Link
                                  href={`/production/plans/${planId}`}
                                  className="font-mono text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <span>{mov.productionPlan?.planNumber || `Plan #${String(planId).slice(0, 8)}`}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="text-ink-placeholder text-xs">—</span>
                              )}
                            </TableCell>

                            <TableCell className="px-6 py-4 text-right font-mono font-extrabold text-xs">
                              <span className={isOut ? 'text-tone-red-text' : 'text-tone-green-text'}>
                                {isOut ? '−' : '+'}
                                {Math.abs(Number(mov.quantityDelta ?? mov.quantity ?? 0))} {uomSymbol}
                              </span>
                            </TableCell>

                            <TableCell className="px-6 py-4 text-right font-mono font-black text-ink text-xs">
                              {mov.totalBalanceAfter != null
                                ? `${Number(mov.totalBalanceAfter).toLocaleString('en-IN')} ${uomSymbol}`
                                : crossLocationRunningTotal.has(mov.id)
                                ? `${crossLocationRunningTotal.get(mov.id)!.toLocaleString('en-IN')} ${uomSymbol}`
                                : mov.quantityAfter != null
                                ? `${Number(mov.quantityAfter).toLocaleString('en-IN')} ${uomSymbol}`
                                : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

            </CardContent>
          </Card>
        )}

        {/* TAB 5: PRICING MASTER & COMMERCIAL TIERS */}
        {activeTab === 'pricing' && (
          <div className="space-y-6 pt-2">

            {/* Commercial Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                  Benchmark Selling Rate
                </span>
                <p className="text-2xl font-black font-mono text-primary mt-1">
                  {sellingPrice > 0
                    ? `₹${sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
                <p className="text-xs text-ink-placeholder mt-0.5">Base catalog rate per {uomSymbol || 'unit'}</p>
              </Card>

              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                  Assigned Pricing Master
                </span>
                <p className="text-lg font-black text-ink mt-1 truncate" title={pricingMasterName || 'Standard Catalog Pricing'}>
                  {pricingMasterName || (pricingMasterId ? 'Custom Pricing Master' : 'Standard Catalog')}
                </p>
                <p className="text-xs font-mono font-semibold text-ink-placeholder mt-0.5">
                  {matchedPricingMaster?.code ? `Code: ${matchedPricingMaster.code}` : (pricingMasterId ? 'Master Active' : 'No master linked')}
                </p>
              </Card>

              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                  Customer Tiers Matrix
                </span>
                <p className="text-2xl font-black font-mono text-tone-green-text mt-1">
                  {effectiveTiers.length} {effectiveTiers.length === 1 ? 'Tier' : 'Tiers'}
                </p>
                <p className="text-xs text-ink-placeholder mt-0.5">Configured channel discounts</p>
              </Card>

              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                  GST & Tariff Slab
                </span>
                <p className="text-2xl font-black font-mono text-ink mt-1">
                  {taxRate != null ? `${taxRate}%` : '—'}
                </p>
                <p className="text-xs font-mono font-semibold text-ink-muted mt-0.5">HSN: {hsnCode || '—'}</p>
              </Card>
            </div>

            {/* Customer Pricing Tiers Matrix Table Card */}
            <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
              <CardHeader className="bg-surface border-b border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BadgePercent className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold text-ink">
                        Customer Pricing Tiers Matrix
                      </CardTitle>
                      {pricingMasterName && (
                        <Badge variant="outline" className="font-semibold text-[11px] text-primary border-primary/30">
                          {pricingMasterName}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs text-ink-muted mt-0.5">
                      Wholesale, e-commerce, dealer, and distribution tier discount rules and net applied prices
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pricingMasterId && (
                    <Link
                      href={`/products/pricing-masters/${pricingMasterId}`}
                      className="h-9 px-3.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-ink-secondary inline-flex items-center gap-1.5 transition"
                    >
                      <span>View Master</span>
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </Link>
                  )}
                  <Link
                    href={isMaterialEntity ? `/products/new?editId=${currentItem.id}&mode=edit&type=MATERIAL` : `/products/new?editId=${currentItem.id}&mode=edit`}
                    className="h-9 px-3.5 rounded-xl bg-primary hover:bg-[color:var(--action-primary-bg-hover)] text-inverse text-xs font-bold inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Edit Tiers</span>
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="rounded-none border-0 shadow-none">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold text-xs">Customer Tier</TableHead>
                        <TableHead className="text-right font-bold text-xs">Tier Benchmark Price (₹)</TableHead>
                        <TableHead className="text-right font-bold text-xs">Tier Discount (%)</TableHead>
                        <TableHead className="text-right font-bold text-xs">Applied Price (₹)</TableHead>
                        <TableHead className="text-right font-bold text-xs">Benchmark Realization</TableHead>
                        <TableHead className="text-center font-bold text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {effectiveTiers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-28 text-center text-ink-placeholder font-medium">
                            No customer pricing tiers configured for this item. Standard catalog rate applies.
                          </TableCell>
                        </TableRow>
                      ) : (
                        effectiveTiers.map((tier) => {
                          const realization = sellingPrice > 0 ? (tier.appliedPrice / sellingPrice) * 100 : null;

                          return (
                            <TableRow key={tier.id} className="hover:bg-muted/40 transition-colors">
                              <TableCell>
                                <div className="font-bold text-ink text-xs">
                                  {tier.tierName}
                                </div>
                                {tier.tierCode && (
                                  <span className="font-mono text-[10px] font-semibold text-ink-placeholder block mt-0.5">
                                    {tier.tierCode}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-ink-secondary text-xs">
                                ₹{tier.masterPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-tone-amber-text text-xs">
                                {tier.discountPercentage}%
                              </TableCell>
                              <TableCell className="text-right font-mono font-black text-primary text-sm">
                                ₹{tier.appliedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-xs">
                                {realization != null ? (
                                  <span className={realization >= 80 ? 'text-tone-green-text font-bold' : 'text-ink-secondary'}>
                                    {realization.toFixed(1)}% of MRP
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={tier.enabled ? 'success' : 'secondary'} className="text-[10px] font-bold">
                                  {tier.enabled ? 'ACTIVE' : 'INACTIVE'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Custom Pricing Master Fields / Rules */}
            {effectivePricingFields.length > 0 && (
              <Card className="rounded-2xl border border-border bg-surface shadow-sm p-6 space-y-4">
                <div className="border-b border-border pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <BadgeDollarSign className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-bold text-ink">
                      Commercial Pricing Master Rules & Attributes
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs font-bold">
                    {effectivePricingFields.length} rules
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {effectivePricingFields.map((field: any, index: number) => (
                    <div
                      key={index}
                      className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 shadow-2xs"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                        {field.name || 'Rule'}
                      </span>
                      <span className="text-sm font-extrabold text-ink mt-1 block break-words">
                        {field.value || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

          </div>
        )}

        {/* TAB 6: SOURCING & VENDORS */}
        {activeTab === 'vendors' && (
          <div className="space-y-6 pt-2">

            {/* Vendor Sourcing Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Valuation Rate</span>
                <p className="text-2xl font-black font-mono text-ink mt-1">
                  {standardCost > 0
                    ? `₹${standardCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
                <p className="text-xs text-ink-placeholder mt-0.5">Per {uomSymbol || 'unit'}</p>
              </Card>

              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Approved Vendors</span>
                <p className="text-2xl font-black font-mono text-ink mt-1">
                  {vendorSources.length} Sources
                </p>
                <p className="text-xs text-ink-placeholder mt-0.5">Contracted suppliers</p>
              </Card>

              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Best Procurement Rate</span>
                <p className="text-2xl font-black font-mono text-tone-green-text mt-1">
                  {vendorSources.length > 0
                    ? `₹${Math.min(...vendorSources.map((r) => Number(r.unitPrice || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
                <p className="text-xs text-ink-placeholder mt-0.5">Lowest active quote</p>
              </Card>

              <Card className="p-5 border border-border bg-surface shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">Procurement Lead Time</span>
                <p className="text-2xl font-black font-mono text-ink mt-1">
                  {leadTimeDays > 0 ? `${leadTimeDays}d` : '7d'}
                </p>
                <p className="text-xs text-ink-placeholder mt-0.5">Contract turnaround</p>
              </Card>
            </div>

            {/* Vendors List Table Card */}
            <Card className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
              <CardHeader className="bg-surface border-b border-border p-5 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-ink">
                      Approved Sourcing Vendors
                    </CardTitle>
                    <CardDescription className="text-xs text-ink-muted mt-0.5">
                      Suppliers contracted for this item with lead times, minimum order quantities, and agreed prices
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-xs font-bold">
                  {vendorSources.length} {vendorSources.length === 1 ? 'vendor' : 'vendors'}
                </Badge>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="rounded-none border-0 shadow-none">
                    <TableHeader>
                      <TableRow>
                        {showVendorItemColumn && <TableHead className="font-bold text-xs">Item / Category</TableHead>}
                        <TableHead className="font-bold text-xs">Vendor Code</TableHead>
                        <TableHead className="font-bold text-xs">Vendor Name</TableHead>
                        <TableHead className="text-right font-bold text-xs">Supply Rate (₹)</TableHead>
                        <TableHead className="text-right font-bold text-xs">Lead Time</TableHead>
                        <TableHead className="font-bold text-xs">Payment Terms</TableHead>
                        <TableHead className="text-right font-bold text-xs">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingVendorPricings ? (
                        <TableRow>
                          <TableCell colSpan={showVendorItemColumn ? 7 : 6} className="h-28 text-center text-ink-placeholder font-medium">
                            Loading vendor pricing data...
                          </TableCell>
                        </TableRow>
                      ) : vendorSources.length > 0 ? (
                        vendorSources.map((row) => {
                          const v = row.vendor;
                          const price = Number(row.unitPrice || 0);
                          const leadTime = row.leadTimeDays ?? v?.leadTimeDays ?? 7;

                          return (
                            <TableRow key={row.id} className="hover:bg-muted/40 transition-colors">
                              {showVendorItemColumn && (
                                <TableCell className="font-medium text-ink-secondary text-xs">
                                  {row.itemName || currentItem?.name || 'Item'}
                                </TableCell>
                              )}
                              <TableCell className="font-mono font-bold text-primary text-xs">
                                {v?.code || '—'}
                              </TableCell>
                              <TableCell className="font-bold text-ink text-xs">
                                {v?.name || 'Supplier'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-black text-ink text-sm">
                                ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-ink-secondary text-xs">
                                {leadTime}d
                              </TableCell>
                              <TableCell className="text-ink-secondary font-medium text-xs">
                                {v?.paymentTerms || 'Net 30'}
                              </TableCell>
                              <TableCell className="text-right">
                                {v?.id && (
                                  <Link
                                    href={`/vendors/${v.id}`}
                                    className="font-bold text-xs text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    Profile <ExternalLink className="w-3 h-3" />
                                  </Link>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={showVendorItemColumn ? 7 : 6} className="h-28 text-center text-ink-placeholder font-medium">
                            No approved vendor pricing records mapped for this item.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

          </div>
        )}

        </div>
      </div>

      {/* Barcode & Bin Label Modal */}
      <ItemBarcodeModal
        isOpen={isBarcodeOpen}
        onClose={() => setIsBarcodeOpen(false)}
        code={itemCode || itemName}
        name={itemName}
        uom={uomSymbol}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// CLEAN BARCODE & BIN TAG MODAL
// ----------------------------------------------------------------------------
function ItemBarcodeModal({
  isOpen,
  onClose,
  code,
  name,
  uom,
}: {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  name: string;
  uom: string;
}) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const safeCode = code.replace(/[^\x20-\x7E]/g, '').trim() || 'ITEM';

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (barcodeRef.current && safeCode) {
        try {
          JsBarcode(barcodeRef.current, safeCode, {
            format: 'CODE128',
            displayValue: true,
            fontSize: 14,
            height: 64,
            margin: 8,
            lineColor: '#171717',
            background: '#FFFFFF',
          });
        } catch {
          // ignore fallback
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, safeCode]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${code}-barcode-label`,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-none overflow-hidden p-6 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-border">
          <div>
            <h3 className="text-sm font-bold text-ink">
              Inventory Bin Label
            </h3>
            <p className="text-[11px] text-ink-muted">Standard Code-128 Warehouse Barcode</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-placeholder hover:text-ink-secondary cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={printRef}
          className="border border-border rounded-xl p-5 bg-surface text-ink flex flex-col items-center justify-center space-y-2"
        >
          <svg ref={barcodeRef} className="max-w-full" />
          <div className="text-center pt-1">
            <p className="text-xs font-bold text-ink">{name}</p>
            <p className="text-[10px] text-ink-muted font-mono mt-0.5">
              Code: {code} • UOM: {uom || 'units'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-xl h-10 px-4 text-xs font-bold"
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => handlePrint()}
            className="rounded-xl h-10 px-4 bg-primary hover:bg-[color:var(--action-primary-bg-hover)] text-inverse text-xs font-bold shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print Bin Tag
          </Button>
        </div>
      </div>
    </div>
  );
}
