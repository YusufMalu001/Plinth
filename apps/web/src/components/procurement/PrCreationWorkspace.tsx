'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Send,
  Trash2,
  RotateCcw,
  Info,
  Layers,
} from 'lucide-react';
import {
  Button,
  PageHeader,
} from '@plinth/ui';
import {
  useGeneratePO,
  useNextPoNumber,
  useProcurementSelectors,
} from '../../features/purchases/hooks';
import { SearchableSelector } from '../ui/SearchableSelector';
import { vendorsApi, type GeminiVendorEvaluationDto } from '../../features/vendors/api';
import { VendorScorecardDialog } from '../../features/vendors/components/VendorScorecardDialog';
import { getVariantLabel } from '../../features/products/variant-names';
import { bomApi } from '../../features/bom/api';
import { showToast } from '../toast-store';
import { LoadingState } from '../LoadingState';
import {
  PURCHASE_ORDER_CREATION_DRAFT_KEY,
  PO_PAYMENT_MODES,
  encodePoPaymentTerms,
  PurchaseOrderCreationDraft,
} from '../../features/purchases/utils';
interface WorkspaceLine {
  tempId: string;
  itemSelectorKey: string;
  itemId: string;
  itemType: 'material' | 'product';
  itemName: string;
  uomId: string;
  quantity: string;
  unitPrice: string;
  needDate: string;
  preferredMake: string;
  vendorId: string;
  bomVersionId?: string;
  bomNumber?: string;
}

const getAvailableUomIds = (item: { uomId?: string; availableUomIds?: string[] }, uoms: { id: string }[]) => {
  const activeIds = new Set(uoms.map((uom) => uom.id));
  const configured = Array.isArray(item.availableUomIds) ? item.availableUomIds : [];
  return [...new Set([item.uomId, ...configured].filter((id): id is string => typeof id === 'string' && activeIds.has(id)))];
};

const getDefaultNeedDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
};

const createBlankLine = (defaultDate: string): WorkspaceLine => ({
  tempId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemSelectorKey: '',
  itemId: '',
  itemType: 'material',
  itemName: '',
  uomId: '',
  quantity: '1',
  unitPrice: '0',
  needDate: defaultDate,
  preferredMake: '',
  vendorId: '',
});

export function PrCreationWorkspace() {
  const router = useRouter();
  const selectors = useProcurementSelectors();
  const nextPo = useNextPoNumber();
  const generatePO = useGeneratePO();

  // Material Supplier scoring only — Job-Work vendors must not appear in Purchase Orders.
  const { data: scoringReport } = useQuery({
    queryKey: ['vendor-scoring', 'MATERIAL'],
    queryFn: () => vendorsApi.getScoringReport('MATERIAL'),
    staleTime: 60_000,
  });

  const vendorScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    scoringReport?.evaluations?.forEach((ev) => {
      if (typeof ev.score === 'number') {
        map.set(ev.vendorId, ev.score);
      }
    });
    return map;
  }, [scoringReport]);
  const [selectedScorecardVendorId, setSelectedScorecardVendorId] = useState<string | null>(null);
  const [selectedScorecardVendorName, setSelectedScorecardVendorName] = useState<string | null>(null);

  const [departmentId, setDepartmentId] = useState('');
  const [needDate, setNeedDate] = useState(getDefaultNeedDate());
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [vendorId, setVendorId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [poNumberEdited, setPoNumberEdited] = useState(false);
  const [paymentMode, setPaymentMode] = useState('');
  const [netTermsDays, setNetTermsDays] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [dispatchedThrough, setDispatchedThrough] = useState('');
  const [otherReferences, setOtherReferences] = useState('');
  const [termsOfDelivery, setTermsOfDelivery] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [requestedBudget, setRequestedBudget] = useState('');
  const [businessJustification, setBusinessJustification] = useState('');
  const [notes, setNotes] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [lines, setLines] = useState<WorkspaceLine[]>([]);
  const data = selectors.data;

  // Unified Item Catalog combining seeded Materials and Products
  const itemOptions = useMemo(() => {
    // The selector is the complete purchasable item catalog. Category is
    // descriptive metadata and must not hide a valid material or its variants.
    const rawMaterials = (data?.materials?.items || []).map((m: any) => {
      const parentId = m.parentMaterialId || m.materialId || String(m.specs?.parentMaterialId || '') || undefined;
      const isVar = Boolean(m.isVariant || m.specs?.isVariant || parentId);
      const parentItemName = m.parentMaterialName
        || (data?.materials?.items || []).find((candidate: any) => candidate.id === parentId)?.name;
      const displayName = isVar ? getVariantLabel(parentItemName, m.name) : m.name;
      return {
        id: `mat:${m.id}`,
        rawId: m.purchaseItemId || m.id,
        itemType: 'material' as const,
        name: displayName,
        code: m.code,
        uomId: m.uomId || m.uom?.id,
        uom: m.uom,
        availableUomIds: m.specs?.availableUomIds,
        specs: m.specs,
        status: m.status,
        isVariant: isVar,
        parentOptionId: parentId ? `mat:${parentId}` : undefined,
        parentItemName,
        category: m.category,
      };
    });

    const rawProducts = (data?.products?.items || []).map((p: any) => {
      const parentId = p.parentProductId || p.productId || (p.metadata as any)?.parentProductId;
      const isVar = Boolean(p.isVariant || (p.metadata as any)?.isVariant || parentId);
      const parentItemName = p.parentProductName
        || (data?.products?.items || []).find((candidate: any) => candidate.id === parentId)?.name;
      const displayName = isVar ? getVariantLabel(parentItemName, p.name) : p.name;
      return {
        id: `prod:${p.id}`,
        rawId: p.purchaseItemId || p.id,
        itemType: 'product' as const,
        name: displayName,
        code: p.sku,
        sku: p.sku,
        uomId: p.uomId || p.uom?.id,
        uom: p.uom,
        metadata: p.metadata,
        status: p.status,
        isVariant: isVar,
        parentOptionId: parentId ? `prod:${parentId}` : undefined,
        parentItemName,
        category: p.category,
      };
    });

    const allItems = [...rawMaterials, ...rawProducts];
    const byId = new Map(allItems.map((item) => [item.id, item]));
    const childrenByParent = new Map<string, any[]>();
    const rootItems = allItems.filter((item) => !item.parentOptionId || !byId.has(item.parentOptionId));

    for (const item of allItems) {
      if (!item.parentOptionId || !byId.has(item.parentOptionId)) continue;
      const children = childrenByParent.get(item.parentOptionId) || [];
      children.push(item);
      childrenByParent.set(item.parentOptionId, children);
    }

    const ordered: any[] = [];
    for (const item of rootItems) {
      ordered.push(item);
      const children = childrenByParent.get(item.id) || [];
      ordered.push(
        ...children.map((child) => ({
          ...child,
          isVariant: true,
          parentOptionId: item.id,
          parentItemName: item.name || child.parentItemName,
          category: child.category || item.category,
        }))
      );
    }

    return ordered;
  }, [data]);

  type CapabilityItem = NonNullable<NonNullable<typeof data>['capabilities']>['items'][number];
  type CapabilityMatch = {
    cap: CapabilityItem;
    matchType: 'item' | 'parent' | 'category';
  };

  // A vendor linked to a base item can supply its variants as well. Keep
  // category links as a fallback for older vendor records.
  const getMatchingCapabilities = (item: (typeof itemOptions)[number]): CapabilityMatch[] => {
    const parentPrefix = item.itemType === 'material' ? 'mat:' : 'prod:';
    const parentId = item.parentOptionId?.startsWith(parentPrefix)
      ? item.parentOptionId.slice(parentPrefix.length)
      : undefined;
    const categoryId = item.category?.id;
    const bestByVendor = new Map<string, { match: CapabilityMatch; rank: number }>();

    for (const cap of (data?.capabilities?.items || []) as CapabilityItem[]) {
      const capabilityItemId = item.itemType === 'material' ? cap.materialId : cap.productId;
      let matchType: CapabilityMatch['matchType'] | undefined;
      let rank = Number.POSITIVE_INFINITY;

      if (capabilityItemId === item.rawId) {
        matchType = 'item';
        rank = 0;
      } else if (parentId && capabilityItemId === parentId) {
        matchType = 'parent';
        rank = 1;
      } else if (!cap.productId && !cap.materialId && categoryId && cap.categoryId === categoryId) {
        matchType = 'category';
        rank = 2;
      }

      if (!matchType) continue;
      const match = { cap, matchType };
      const existing = bestByVendor.get(cap.vendorId);
      const currentPrice = Number(cap.unitPrice) > 0 ? Number(cap.unitPrice) : Number.POSITIVE_INFINITY;
      const existingPrice = Number(existing?.match.cap.unitPrice) > 0
        ? Number(existing?.match.cap.unitPrice)
        : Number.POSITIVE_INFINITY;
      if (!existing || rank < existing.rank || (rank === existing.rank && currentPrice < existingPrice)) {
        bestByVendor.set(cap.vendorId, { match, rank });
      }
    }

    return [...bestByVendor.values()]
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const scoreA = vendorScoreMap.get(a.match.cap.vendorId) ?? -1;
        const scoreB = vendorScoreMap.get(b.match.cap.vendorId) ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const priceA = Number(a.match.cap.unitPrice) > 0 ? Number(a.match.cap.unitPrice) : Number.POSITIVE_INFINITY;
        const priceB = Number(b.match.cap.unitPrice) > 0 ? Number(b.match.cap.unitPrice) : Number.POSITIVE_INFINITY;
        return priceA - priceB;
      })
      .map(({ match }) => match);
  };

  // Extract rate / estimated unit cost from item definition
  const getItemRate = (item: (typeof itemOptions)[number], preferredVendorId?: string): number => {
    // Check if the selected vendor has an agreed capability unitPrice for this item
    const matchingCapabilities = getMatchingCapabilities(item);
    const selectedVendorId = preferredVendorId || lines.find((line) => line.itemId === item.rawId)?.vendorId;
    const capability = (selectedVendorId
      ? matchingCapabilities.find(({ cap }) => cap.vendorId === selectedVendorId)
      : matchingCapabilities[0])?.cap;
    if (capability?.unitPrice !== undefined && capability.unitPrice !== null) {
      const p = Number(capability.unitPrice);
      if (!isNaN(p) && p > 0) return p;
    }

    if (item.itemType === 'material') {
      const specs = (item.specs || {}) as Record<string, any>;
      const val = Number(
        specs.avgRate ??
        specs.rate ??
        specs.standardCost ??
        specs.costPrice ??
        specs.unitPrice ??
        specs.standardPrice ??
        specs.sellingPrice ??
        specs.mrp ??
        0
      );
      if (!isNaN(val) && val > 0) return val;
    }
    if (item.itemType === 'product') {
      const meta = (item.metadata || {}) as Record<string, any>;
      const val = Number(
        meta.avgRate ??
        meta.costPrice ??
        meta.standardPrice ??
        meta.rate ??
        meta.sellingPrice ??
        meta.mrp ??
        0
      );
      if (!isNaN(val) && val > 0) return val;
    }
    return 0;
  };

  // Preselect default department if available
  useEffect(() => {
    if (!departmentId && data?.departments?.items && data.departments.items.length > 0) {
      setDepartmentId(data.departments.items[0].id);
    }
  }, [data, departmentId]);

  useEffect(() => {
    if (!poNumberEdited && nextPo.data?.nextNumber) setPoNumber(nextPo.data.nextNumber);
  }, [nextPo.data?.nextNumber, poNumberEdited]);

  useEffect(() => {
    if (!data || !isDraftLoaded) return;
    const byId = new Map(itemOptions.map((item) => [item.id, item]));
    setLines((current) => {
      let changed = false;
      const next = current.map((line) => {
        if (!line.itemSelectorKey) return line;
        const item = byId.get(line.itemSelectorKey);
        if (!item) {
          changed = true;
          return { ...line, itemSelectorKey: '', itemId: '', itemName: '', itemType: 'material' as const, uomId: '', unitPrice: '0' };
        }
        const allowedUoms = getAvailableUomIds(item, data.uoms.items);
        if (allowedUoms.includes(line.uomId)) return line;
        changed = true;
        return { ...line, uomId: allowedUoms[0] || '' };
      });
      return changed ? next : current;
    });
  }, [data, isDraftLoaded, itemOptions]);

  // Restore saved draft on mount
  // Restore saved draft on mount unless overrideDraft or itemId is in query params
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search);
        const shouldOverride = searchParams.get('overrideDraft') === 'true' || Boolean(searchParams.get('itemId'));

        if (shouldOverride) {
          try {
            localStorage.removeItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
          } catch {
            // ignore
          }
          setDraftSavedAt(null);
          setIsDraftLoaded(true);
          return;
        }

        const raw = localStorage.getItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PurchaseOrderCreationDraft;
          if (parsed && typeof parsed === 'object') {
            if (parsed.departmentId) setDepartmentId(parsed.departmentId);
            if (parsed.needDate) setNeedDate(parsed.needDate);
            if (parsed.priority) setPriority(parsed.priority);
            if (parsed.vendorId) setVendorId(parsed.vendorId);
            if (parsed.paymentMode) setPaymentMode(parsed.paymentMode);
            if (parsed.netTermsDays !== undefined && parsed.netTermsDays !== '') setNetTermsDays(parsed.netTermsDays);
            if (parsed.deliveryLocation && parsed.deliveryLocation !== 'Indore HQ Plant') setDeliveryLocation(parsed.deliveryLocation);
            if (parsed.dispatchedThrough) setDispatchedThrough(parsed.dispatchedThrough);
            if (parsed.otherReferences) setOtherReferences(parsed.otherReferences);
            if (parsed.termsOfDelivery) setTermsOfDelivery(parsed.termsOfDelivery);
            if (parsed.costCenter) setCostCenter(parsed.costCenter);
            if (parsed.projectCode) setProjectCode(parsed.projectCode);
            if (parsed.requestedBudget) setRequestedBudget(parsed.requestedBudget);
            if (parsed.businessJustification) setBusinessJustification(parsed.businessJustification);
            if (parsed.notes) setNotes(parsed.notes);
            if (Array.isArray(parsed.lines) && parsed.lines.length > 0) setLines(parsed.lines.map((line) => ({ ...line, vendorId: line.vendorId || parsed.vendorId || '' })));
            if (parsed.savedAt) {
              setDraftSavedAt(parsed.savedAt);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[PrCreationWorkspace] Failed to parse draft from localStorage:', err);
    } finally {
      setIsDraftLoaded(true);
    }
  }, []);

  // Auto-save draft when changes occur
  useEffect(() => {
    if (!isDraftLoaded) return;

    const hasLines = lines.some((l) => Boolean(l.itemId || (l.quantity && l.quantity !== '1') || (l.unitPrice && l.unitPrice !== '0') || l.preferredMake)) || lines.length > 1;
    const hasMeta = Boolean(vendorId || costCenter || projectCode || requestedBudget || businessJustification || notes || dispatchedThrough || otherReferences || termsOfDelivery || paymentMode || netTermsDays || deliveryLocation);
    const isDirty = hasLines || hasMeta;

    if (!isDirty) {
      try {
        localStorage.removeItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
        setDraftSavedAt(null);
      } catch {
        // ignore
      }
      return;
    }

    const timer = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const draftData: PurchaseOrderCreationDraft = {
          departmentId,
          needDate,
          priority,
          vendorId,
          paymentMode,
          netTermsDays,
          deliveryLocation,
          dispatchedThrough,
          otherReferences,
          termsOfDelivery,
          costCenter,
          projectCode,
          requestedBudget,
          businessJustification,
          notes,
          lines,
          savedAt: now,
        };
        localStorage.setItem(PURCHASE_ORDER_CREATION_DRAFT_KEY, JSON.stringify(draftData));
        setDraftSavedAt(now);
      } catch (err) {
        console.warn('[PrCreationWorkspace] Failed to auto-save draft to localStorage:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    isDraftLoaded,
    departmentId,
    needDate,
    priority,
    vendorId,
    paymentMode,
    netTermsDays,
    deliveryLocation,
    dispatchedThrough,
    otherReferences,
    termsOfDelivery,
    costCenter,
    projectCode,
    requestedBudget,
    businessJustification,
    notes,
    lines,
  ]);

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
      setDraftSavedAt(null);
      setVendorId('');
      setCostCenter('');
      setProjectCode('');
      setRequestedBudget('');
      setBusinessJustification('');
      setNotes('');
      setNeedDate(getDefaultNeedDate());
      setPriority('NORMAL');
      setPaymentMode('');
      setNetTermsDays('');
      setDeliveryLocation('');
      setDispatchedThrough('');
      setOtherReferences('');
      setTermsOfDelivery('');
      setLines([]);
      setPoNumber(nextPo.data?.nextNumber || '');
      setPoNumberEdited(false);
      showToast({ kind: 'info', title: 'Draft Discarded', message: 'Purchase order workspace has been reset.' });
    } catch {
      // ignore
    }
  };
  // Line management helpers
  const updateLine = (index: number, patch: Partial<WorkspaceLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleItemSelect = (index: number, selectorKey: string) => {
    const selected = itemOptions.find((opt) => opt.id === selectorKey);
    if (!selected) {
      updateLine(index, { itemSelectorKey: '', itemId: '', itemName: '', uomId: '', unitPrice: '0', bomVersionId: undefined, bomNumber: undefined });
      return;
    }

    // Check for approved/active BOM for this item asynchronously
    const lookupBom = async () => {
      try {
        const res = await bomApi.listVersions(
          selected.itemType === 'product'
            ? { productId: selected.rawId, status: 'APPROVED' }
            : { materialId: selected.rawId, status: 'APPROVED' }
        );
        const activeBom = res.items?.[0];
        if (activeBom) {
          updateLine(index, {
            bomVersionId: activeBom.id,
            bomNumber: activeBom.bomNumber,
          });
        }
      } catch (err) {
        console.warn('[PrCreationWorkspace] Could not fetch BOM for item:', err);
      }
    };
    void lookupBom();

    const resolvedUomId = getAvailableUomIds(selected, data?.uoms?.items || [])[0] || '';

    const matchingCapabilities = getMatchingCapabilities(selected);
    const suggestedVendorId = matchingCapabilities[0]?.cap.vendorId || '';
    const quotedRate = Number(matchingCapabilities[0]?.cap.unitPrice || 0);
    const autoRate = quotedRate > 0 ? quotedRate : getItemRate(selected, suggestedVendorId);

    updateLine(index, {
      itemSelectorKey: selectorKey,
      itemId: selected.rawId,
      itemType: selected.itemType,
      itemName: selected.name,
      vendorId: suggestedVendorId,
      uomId: resolvedUomId,
      unitPrice: autoRate > 0 ? String(autoRate) : (lines[index].unitPrice && lines[index].unitPrice !== '0' ? lines[index].unitPrice : '0'),
      needDate: needDate,
    });
  };

  const shouldFocusNewRow = useRef(false);
  const newLineFocusIndex = useRef<number | null>(null);
  const saveInProgressRef = useRef(false);

  const addLine = () => {
    shouldFocusNewRow.current = true;
    newLineFocusIndex.current = null;
    setLines((current) => [...current, createBlankLine(needDate)]);
  };

  const addLineAfter = (index: number) => {
    shouldFocusNewRow.current = true;
    newLineFocusIndex.current = index + 1;
    setLines((current) => {
      const next = [...current];
      next.splice(index + 1, 0, createBlankLine(needDate));
      return next;
    });
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (shouldFocusNewRow.current && lines.length > 0) {
      shouldFocusNewRow.current = false;
      setTimeout(() => {
        const rows = document.querySelectorAll('tbody tr[data-line-row]');
        const targetRow = rows[newLineFocusIndex.current ?? rows.length - 1];
        const firstFocusable = targetRow?.querySelector<HTMLElement>('button, input');
        newLineFocusIndex.current = null;
        firstFocusable?.focus();
      }, 50);
    }
  }, [lines.length]);

  useEffect(() => {
    if (isDraftLoaded && lines.length === 0) {
      const populateFromQueryParams = async () => {
        try {
          const searchParams = new URLSearchParams(window.location.search);
          const qItemId = searchParams.get('itemId');
          const qItemType = searchParams.get('itemType');
          const qQty = searchParams.get('quantity');
          const qItemName = searchParams.get('itemName');

          if (qItemId) {
            const selectorKey = qItemType === 'product' ? `prod:${qItemId}` : `mat:${qItemId}`;
            let found = itemOptions.find((i) => i.id === selectorKey || i.rawId === qItemId);

            if (!found && data) {
              const rawMat = (data?.materials?.items || []).find((m: unknown) => {
                if (m && typeof m === 'object' && 'id' in m) {
                  return (m as { id: string }).id === qItemId;
                }
                return false;
              }) as { id: string; name: string; code: string; uomId?: string; uom?: { id: string }; specs?: unknown; status?: string } | undefined;

              if (rawMat) {
                found = {
                  id: `mat:${rawMat.id}`,
                  rawId: rawMat.id,
                  itemType: 'material' as const,
                  name: rawMat.name,
                  code: rawMat.code,
                  uomId: rawMat.uomId || rawMat.uom?.id,
                  uom: rawMat.uom,
                  specs: rawMat.specs,
                  status: rawMat.status,
                  isVariant: false,
                };
              } else {
                const rawProd = (data?.products?.items || []).find((p: unknown) => {
                  if (p && typeof p === 'object' && 'id' in p) {
                    return (p as { id: string }).id === qItemId;
                  }
                  return false;
                }) as { id: string; name: string; sku: string; uomId?: string; uom?: { id: string }; metadata?: unknown; status?: string } | undefined;

                if (rawProd) {
                  found = {
                    id: `prod:${rawProd.id}`,
                    rawId: rawProd.id,
                    itemType: 'product' as const,
                    name: rawProd.name,
                    code: rawProd.sku,
                    sku: rawProd.sku,
                    uomId: rawProd.uomId || rawProd.uom?.id,
                    uom: rawProd.uom,
                    metadata: rawProd.metadata,
                    status: rawProd.status,
                    isVariant: false,
                  };
                }
              }
            }

            const defaultUom = found?.uomId || (found as unknown as { uom?: { id: string } })?.uom?.id || data?.uoms?.items?.[0]?.id || '';
            const qtyVal = qQty ? Number(qQty) : 1;
            const itemName = found?.name || (qItemName ? decodeURIComponent(qItemName) : 'Selected Item');
            const itemType = found?.itemType || (qItemType === 'product' ? 'product' : 'material');
            const purchasableItemId = found?.rawId || qItemId;

            // Query approved BOM for the item
            let resolvedBomId: string | undefined;
            let resolvedBomNumber: string | undefined;
            try {
              const bomRes = await bomApi.listVersions(
                itemType === 'product'
                  ? { productId: purchasableItemId, status: 'APPROVED' }
                  : { materialId: purchasableItemId, status: 'APPROVED' }
              );
              const activeBom = bomRes?.items?.[0];
              if (activeBom) {
                resolvedBomId = activeBom.id;
                resolvedBomNumber = activeBom.bomNumber;
              }
            } catch (err) {
              console.warn('[PrCreationWorkspace] Could not fetch BOM from query param item:', err);
            }

            // Resolve best vendor if available
            const matchingCaps = found ? getMatchingCapabilities(found) : [];
            const defaultVendorId = matchingCaps[0]?.cap.vendorId || '';
            const rate = found ? getItemRate(found, defaultVendorId) : 0;

            setLines([
              {
                tempId: `line-${Date.now()}`,
                itemSelectorKey: found ? found.id : selectorKey,
                itemId: purchasableItemId,
                itemType,
                itemName,
                uomId: defaultUom,
                quantity: String(isNaN(qtyVal) || qtyVal <= 0 ? 1 : qtyVal),
                unitPrice: rate > 0 ? String(rate) : '0',
                needDate,
                preferredMake: '',
                vendorId: defaultVendorId,
                bomVersionId: resolvedBomId,
                bomNumber: resolvedBomNumber,
              },
            ]);
            return;
          }
        } catch (err) {
          console.warn('[PrCreationWorkspace] Failed to pre-populate item from query params:', err);
        }
        setLines([createBlankLine(needDate)]);
      };

      void populateFromQueryParams();
    }
  }, [isDraftLoaded, lines.length, needDate, itemOptions, data]);

  useEffect(() => {
    if (isDraftLoaded && lines.length > 0) {
      if (typeof document !== 'undefined' && (document.activeElement === document.body || !document.activeElement)) {
        const firstSelector = document.querySelector('tbody tr[data-line-row] button');
        (firstSelector as HTMLElement)?.focus();
      }
    }
  }, [isDraftLoaded, lines.length]);
  const isElementVisible = (el: Element): boolean => {
    let node: Element | null = el;
    while (node) {
      if (node.hasAttribute('hidden')) return false;
      if (node.getAttribute('aria-hidden') === 'true') return false;
      if ((node as HTMLElement).inert) return false;
      const style = (node as HTMLElement).style;
      if (style) {
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
      }
      node = node.parentElement;
    }
    return true;
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.nativeEvent.isComposing) return;

    const form = e.currentTarget;

    // 1. Tab Trapping within form boundary
    if (e.key === 'Tab') {
      const focusables = Array.from(
        form.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => {
        if (el.hasAttribute('data-keyboard-skip')) return false;
        return isElementVisible(el);
      });
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    // 2. Section and row navigation via Arrow keys
    const active = document.activeElement as HTMLElement | null;
    if (!active || !form.contains(active)) return;

    const isNumberInput = active instanceof HTMLInputElement && active.type === 'number';

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Retain native spinbutton behavior on number inputs unless Alt or Ctrl is held
      if (isNumberInput && !e.altKey && !e.ctrlKey) return;

      const currentSection = active.closest<HTMLElement>('[data-section]');
      const sectionName = currentSection?.dataset.section;

      if (sectionName === 'line-items') {
        const row = active.closest<HTMLTableRowElement>('tbody tr[data-line-row]');
        if (row) {
          const allRows = Array.from(form.querySelectorAll<HTMLTableRowElement>('tbody tr[data-line-row]'));
          const rowIndex = allRows.indexOf(row);

          if (e.key === 'ArrowDown') {
            if (rowIndex < allRows.length - 1) {
              e.preventDefault();
              const nextRow = allRows[rowIndex + 1];
              const cells = Array.from(row.querySelectorAll('td'));
              const currentCell = active.closest('td');
              const cellIdx = currentCell ? cells.indexOf(currentCell) : 0;
              const nextCells = Array.from(nextRow.querySelectorAll('td'));
              const targetCell = nextCells[cellIdx] || nextRow;
              const targetFocusable = targetCell.querySelector<HTMLElement>('button, input, select') || nextRow.querySelector<HTMLElement>('button, input, select');
              targetFocusable?.focus();
            } else {
              // Last row of table: move DOWN into the next section ("Purchase Order Details")!
              e.preventDefault();
              const poDetails = form.querySelector<HTMLElement>('[data-section="po-details"]');
              const firstPoField = poDetails?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])');
              firstPoField?.focus();
            }
          } else if (e.key === 'ArrowUp') {
            if (rowIndex > 0) {
              e.preventDefault();
              const prevRow = allRows[rowIndex - 1];
              const cells = Array.from(row.querySelectorAll('td'));
              const currentCell = active.closest('td');
              const cellIdx = currentCell ? cells.indexOf(currentCell) : 0;
              const prevCells = Array.from(prevRow.querySelectorAll('td'));
              const targetCell = prevCells[cellIdx] || prevRow;
              const targetFocusable = targetCell.querySelector<HTMLElement>('button, input, select') || prevRow.querySelector<HTMLElement>('button, input, select');
              targetFocusable?.focus();
            } else {
              // First row of table: move UP to section header action ("+ Add material")!
              e.preventDefault();
              const addMatBtn = form.querySelector<HTMLElement>('[data-section="line-items"] button');
              addMatBtn?.focus();
            }
          }
        }
      } else if (sectionName === 'po-details') {
        if (e.key === 'ArrowUp') {
          const isTopField = active.id === 'purchase-order-number' || active.getAttribute('type') === 'date';
          if (isTopField || e.altKey) {
            e.preventDefault();
            // Move UP into previous section (Order Line Items - last row)
            const allRows = Array.from(form.querySelectorAll<HTMLTableRowElement>('tbody tr[data-line-row]'));
            const lastRow = allRows[allRows.length - 1];
            const targetFocusable = lastRow?.querySelector<HTMLElement>('button, input, select');
            targetFocusable?.focus();
          }
        } else if (e.key === 'ArrowDown') {
          const isBottomField = active.getAttribute('placeholder')?.includes('Delivery location') || active.getAttribute('placeholder')?.includes('Terms of Delivery');
          if (isBottomField || e.altKey) {
            e.preventDefault();
            // Move DOWN into next section (Action Dock)
            const actionDock = form.querySelector<HTMLElement>('[data-section="action-dock"]');
            const submitBtn = actionDock?.querySelector<HTMLElement>('button[type="submit"]') || actionDock?.querySelector<HTMLElement>('button');
            submitBtn?.focus();
          }
        }
      } else if (sectionName === 'action-dock') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          // Move UP into PO Details section
          const poDetails = form.querySelector<HTMLElement>('[data-section="po-details"]');
          const lastPoField = Array.from(poDetails?.querySelectorAll<HTMLElement>('input, button') || []).pop();
          lastPoField?.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const dockButtons = Array.from(form.querySelectorAll<HTMLElement>('[data-section="action-dock"] button:not([disabled])'));
          const idx = dockButtons.indexOf(active);
          if (idx !== -1) {
            const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % dockButtons.length : (idx - 1 + dockButtons.length) % dockButtons.length;
            dockButtons[nextIdx]?.focus();
          }
        }
      }
    }
  };

  // Real-time calculations
  const totals = useMemo(() => {
    let grandTotal = 0;
    let totalQty = 0;
    for (const l of lines) {
      const q = parseFloat(l.quantity) || 0;
      const r = parseFloat(l.unitPrice) || 0;
      const lineTotal = Math.round(q * r * 100) / 100;
      grandTotal += lineTotal;
      totalQty += q;
    }
    return {
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalQty,
      itemCount: lines.filter((l) => Boolean(l.itemId)).length,
    };
  }, [lines]);

  // Vendor Recommendation
  // Validation & Submission
  const validateForm = () => {
    if (lines.length === 0) {
      showToast({ kind: 'error', title: 'Add an item', message: 'Add at least one vendor-sourced item to the purchase order.' });
      return false;
    }
    if (!needDate) {
      showToast({ kind: 'error', title: 'Need date required', message: 'Please set the required-by date.' });
      return false;
    }
    const invalidLine = lines.findIndex((l) => !l.itemId || !l.uomId || parseFloat(l.quantity) <= 0);
    if (invalidLine >= 0) {
      showToast({
        kind: 'error',
        title: `Incomplete Line #${invalidLine + 1}`,
        message: 'Please select an item, UOM, and enter a valid quantity greater than 0.',
      });
      return false;
    }
    const unassignedLine = lines.findIndex((line) => !line.vendorId);
    if (unassignedLine >= 0) {
      showToast({ kind: 'error', title: `Choose a vendor for line #${unassignedLine + 1}`, message: 'Select a supplier that can provide this item.' });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (saveInProgressRef.current) return;
    if (!validateForm()) return;

    saveInProgressRef.current = true;
    setIsNavigating(true);
    try {
      const groups = new Map<string, WorkspaceLine[]>();
      lines.forEach((line) => groups.set(line.vendorId, [...(groups.get(line.vendorId) || []), line]));
      const createdOrders = [];
      for (const [selectedVendorId, vendorLines] of groups) {
        // Consolidate identical items in the same PO so multiple entries of the same material merge their quantities
        type MergedLine = {
          productId?: string;
          materialId?: string;
          uomId: string;
          quantity: number;
          unitPrice: number;
          needDate: string;
        };
        const consolidatedMap = new Map<string, MergedLine>();
        for (const l of vendorLines) {
          const itemKey = `${l.itemType}:${l.itemId}:${l.uomId}:${l.unitPrice}`;
          const existing = consolidatedMap.get(itemKey);
          const qty = parseFloat(l.quantity) || 0;
          if (existing) {
            existing.quantity += qty;
          } else {
            consolidatedMap.set(itemKey, {
              productId: l.itemType === 'product' ? l.itemId : undefined,
              materialId: l.itemType === 'material' ? l.itemId : undefined,
              uomId: l.uomId,
              quantity: qty,
              unitPrice: parseFloat(l.unitPrice) || 0,
              needDate: needDate,
            });
          }
        }
        const consolidatedLines = Array.from(consolidatedMap.values());

        const po = await generatePO.mutateAsync({
          poNumber: poNumberEdited && createdOrders.length === 0 ? poNumber.trim() : undefined,
          vendorId: selectedVendorId,
          departmentId,
          needDate,
          priority,
          costCenter: costCenter || undefined,
          projectCode: projectCode || undefined,
          requestedBudget: requestedBudget ? Number(requestedBudget) : undefined,
          notes: notes || undefined,
          businessJustification: businessJustification || undefined,
          paymentTerms: encodePoPaymentTerms(paymentMode, netTermsDays) || undefined,
          deliveryLocation: deliveryLocation || undefined,
          dispatchedThrough: dispatchedThrough || undefined,
          otherReferences: otherReferences || undefined,
          termsOfDelivery: termsOfDelivery || undefined,
          lines: consolidatedLines,
        });
        createdOrders.push(po);
      }
      const po = createdOrders[0];
      try {
        localStorage.removeItem(PURCHASE_ORDER_CREATION_DRAFT_KEY);
      } catch {
        // ignore
      }
      showToast({ kind: 'success', title: 'Purchase Order Drafts Saved', message: `${createdOrders.map((order) => order.poNumber).join(', ')} saved as separate drafts. Review and approve each vendor order individually.` });
      if (createdOrders.length > 1) router.push('/procurement/purchase-orders');
      else if (po.id) router.push(`/procurement/purchase-orders/${po.id}`);
      else throw new Error('Purchase order was created without an ID. Please refresh the purchase order register.');
    } catch (e) {
      saveInProgressRef.current = false;
      setIsNavigating(false);
      const rawMessage = e instanceof Error ? e.message : 'An error occurred';
      const message = lines.reduce((currentMessage, line) => {
        if (!line.itemId || !line.itemName || !currentMessage.includes(`[${line.itemId}]`)) return currentMessage;
        return currentMessage.replaceAll(`[${line.itemId}]`, `"${line.itemName}"`);
      }, rawMessage);
      showToast({ kind: 'error', title: 'Order Creation Failed', message });
    }
  };

  const isSaving = generatePO.isPending;
  const isSubmitting = isSaving || isNavigating;
  return (
    <div className="flex-1 w-full p-3 sm:p-4 overflow-y-auto bg-muted/20 min-h-screen">
      <form
        data-focus-boundary
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        onKeyDown={handleFormKeyDown}
        className="w-full flex flex-col space-y-4"
      >
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
          <Link href="/procurement/purchase-orders" className="hover:text-primary transition-colors">
            Purchase Orders
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
          <span className="font-bold text-foreground">
            Create Purchase Order
          </span>
        </nav>

        {/* Page Header */}
        <PageHeader
          title="Create Purchase Order"
          className="mb-0"
          actions={
            <div className="flex items-center gap-2">
              {draftSavedAt && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDiscardDraft}
                  className="h-9 px-3 rounded-lg text-xs font-semibold text-destructive bg-destructive/5 hover:bg-destructive/10 border border-destructive/20 shadow-none"
                  icon={RotateCcw}
                >
                  Discard Draft
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/procurement/purchase-orders')}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold border-border/80 bg-background hover:bg-muted shadow-none"
                icon={ArrowLeft}
              >
                Back
              </Button>
            </div>
          }
        />



        {/* 1. Order Line Items Table */}
        <div data-section="line-items" className="order-2 overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
          {/* Table Header Action Bar */}
          <div className="px-5 py-3.5 bg-muted/20 border-b border-border/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Order Line Items & Materials</h2>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine} icon={Plus} className="h-8 rounded-lg text-xs font-semibold">Add material</Button>
          </div>
          {/* Clean High-Density Line Items Table */}
          <div className="overflow-x-auto min-h-[200px]">
            <table className="w-full min-w-[900px] text-xs text-left">
              <thead className="bg-primary text-white border-b border-primary/20">
                <tr>
                  <th className="py-3 px-3 text-center text-xs font-bold uppercase tracking-wider text-white w-10">#</th>
                  <th className="py-3 px-3 text-left text-xs font-bold uppercase tracking-wider text-white min-w-[280px]">
                    Item / Material <span className="text-white/80">*</span>
                  </th>
                  <th className="py-3 px-3 text-left text-xs font-bold uppercase tracking-wider text-white min-w-[180px]">Suggested Vendor *</th>
                  <th className="py-3 px-3 text-left text-xs font-bold uppercase tracking-wider text-white w-28">
                    UOM <span className="text-white/80">*</span>
                  </th>
                  <th className="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-white w-28">
                    Qty <span className="text-white/80">*</span>
                  </th>
                  <th className="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-white w-32">
                    Est. Rate (₹)
                  </th>
                  <th className="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-white w-36">
                    Line Total (₹)
                  </th>
                  <th className="py-3 px-3 text-center text-xs font-bold uppercase tracking-wider text-white w-20">
                    Remove
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <span>No materials added yet.</span>
                        <button type="button" onClick={addLine} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
                          <Plus className="h-3.5 w-3.5" /> Add first item
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {lines.map((line, idx) => {
                  const selectedItem = itemOptions.find((item) => item.id === line.itemSelectorKey);
                  const availableUomIds = selectedItem ? getAvailableUomIds(selectedItem, data?.uoms?.items || []) : [];
                  const q = parseFloat(line.quantity) || 0;
                  const r = parseFloat(line.unitPrice) || 0;
                  const rowTotal = Math.round(q * r * 100) / 100;

                  return (
                    <React.Fragment key={line.tempId}>
                    <tr data-line-row className="hover:bg-muted/30 transition-colors">
                      {/* # Index */}
                      <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-xs font-semibold">
                        {idx + 1}
                      </td>

                      {/* Material / Product Selector */}
                      <td className="py-2.5 px-3">
                        <SearchableSelector
                          size="sm"
                          value={line.itemSelectorKey}
                          onChange={(val) => handleItemSelect(idx, val)}
                          options={itemOptions}
                          isLoading={selectors.isLoading}
                          includeDraftOptions
                          placeholder="Search material..."
                          showOptionCode={false}
                          renderOption={(item) => (
                            <div className={`flex min-w-0 items-center justify-between gap-2 py-1 ${item.parentOptionId ? 'ml-2 border-l-2 border-tone-purple-solid pl-2 ' : ''}`}>
                              <span className="flex min-w-0 items-center gap-1.5">
                                {item.parentOptionId && <span className="shrink-0 font-bold text-tone-purple-text" aria-hidden="true">↳</span>}
                                <span className="truncate text-xs font-semibold text-foreground">
                                  {item.name}
                                </span>
                                {item.isVariant && <span className="shrink-0 rounded border border-tone-purple-solid bg-tone-violet-bg px-1 py-0.5 text-[9px] font-bold uppercase text-tone-purple-text   ">Variant</span>}
                              </span>
                              <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                {item.category?.name || 'Material'}
                              </span>
                            </div>
                          )}
                          renderSelectedOption={(item) => {
                            const selectedLabel = item.isVariant && item.parentItemName
                              ? [item.parentItemName, getVariantLabel(item.parentItemName, item.name)]
                                  .filter(Boolean)
                                  .join(' · ')
                              : item.name;

                            return (
                              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                                <span className="truncate">{selectedLabel}</span>
                              </span>
                            );
                          }}
                        />
                        {line.bomNumber ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-tone-emerald-bg text-tone-green-text border border-tone-green-solid   ">
                              BOM: {line.bomNumber} (Approved)
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-3">
                        <SearchableSelector
                          size="sm"
                          value={line.vendorId}
                          disabled={!line.itemId}
                          placeholder={line.itemId ? 'Search suppliers…' : 'Select an item first'}
                          options={(() => {
                            const matchingCaps = selectedItem ? getMatchingCapabilities(selectedItem) : [];

                            // Build comparative metrics when 2+ vendors source this item
                            const isComparative = matchingCaps.length >= 2;
                            const evMap = new Map<string, GeminiVendorEvaluationDto>();
                            // Only include Material Supplier evaluations — OUTSOURCING vendors must not appear in POs.
                            scoringReport?.evaluations?.forEach((ev) => { if (ev.vendorType !== 'OUTSOURCING') evMap.set(ev.vendorId, ev); });

                            // Extract min/max values across competitors for this material
                            const validPrices = matchingCaps.map(({ cap }) => Number(cap.unitPrice)).filter((p) => p > 0);
                            const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                            const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

                            const validLeadTimes = matchingCaps.map(({ cap }) => cap.leadTimeDays).filter((lt): lt is number => typeof lt === 'number' && lt > 0);
                            const minLeadTime = validLeadTimes.length > 0 ? Math.min(...validLeadTimes) : null;
                            const maxLeadTime = validLeadTimes.length > 0 ? Math.max(...validLeadTimes) : null;

                            const validQualities = matchingCaps.map(({ cap }) => evMap.get(cap.vendorId)?.qualityScore).filter((q): q is number => typeof q === 'number');
                            const maxQuality = validQualities.length > 0 ? Math.max(...validQualities) : null;
                            const minQuality = validQualities.length > 0 ? Math.min(...validQualities) : null;

                            const validDebits = matchingCaps.map(({ cap }) => evMap.get(cap.vendorId)?.metrics.totalDebitNotesCount ?? 0);
                            const minDebits = validDebits.length > 0 ? Math.min(...validDebits) : null;
                            const maxDebits = validDebits.length > 0 ? Math.max(...validDebits) : null;

                            return matchingCaps
                              .map(({ cap, matchType }, index) => {
                                const vendor = data?.vendors?.items?.find((entry) => entry.id === cap.vendorId);
                                // Skip Job-Work vendors — they are managed in the Job-Work module, not POs.
                                const capEv = evMap.get(cap.vendorId);
                                if (capEv?.vendorType === 'OUTSOURCING') return null;
                                if (!vendor) return null;
                                const ev = evMap.get(cap.vendorId);
                                const score = vendorScoreMap.get(cap.vendorId);
                                const scoreTag = typeof score === 'number' ? `★ ${Math.round(score)}/100` : 'Score N/A';
                                const prefix = index === 0 ? 'Suggested · ' : '';
                                const priceVal = Number(cap.unitPrice);
                                const priceLabel = priceVal > 0 ? `₹${priceVal.toLocaleString('en-IN')}` : 'No saved rate';
                                const matchLabel = matchType === 'parent' ? 'Parent item' : matchType === 'category' ? 'Category' : '';
                                const subLabel = [priceLabel, scoreTag, matchLabel].filter(Boolean).join(' · ');

                                // Only show positive highlights (in green) so user clearly sees the advantages
                                type ParamBadge = { label: string };
                                const badges: ParamBadge[] = [];

                                if (isComparative) {
                                  // 1. Rate - best rate or competitive rate
                                  if (priceVal > 0 && minPrice !== null && maxPrice !== null && minPrice !== maxPrice && priceVal === minPrice) {
                                    badges.push({ label: 'Best Rate' });
                                  } else if (priceVal > 0 && minPrice !== null && maxPrice !== null && priceVal <= minPrice * 1.15) {
                                    badges.push({ label: 'Competitive Rate' });
                                  }
                                  // 2. Lead Time - least lead time or fast lead time (<=7d or <=10d)
                                  const lt = cap.leadTimeDays;
                                  if (typeof lt === 'number' && lt > 0 && minLeadTime !== null && maxLeadTime !== null && minLeadTime !== maxLeadTime && lt === minLeadTime) {
                                    badges.push({ label: 'Least Lead Time' });
                                  } else if (typeof lt === 'number' && lt > 0 && lt <= 7) {
                                    badges.push({ label: `${lt}d Fast Lead` });
                                  } else if (typeof lt === 'number' && lt > 0 && lt <= 10) {
                                    badges.push({ label: `${lt}d Lead Time` });
                                  }
                                  // 3. Quality - best quality or high quality (score >= 90 or Grade A/A+)
                                  const q = ev?.qualityScore;
                                  if (typeof q === 'number' && minQuality !== null && maxQuality !== null && minQuality !== maxQuality && q === maxQuality) {
                                    badges.push({ label: 'Best Quality' });
                                  } else if (typeof q === 'number' && q >= 90) {
                                    badges.push({ label: 'High Quality' });
                                  } else if (ev?.grade === 'A+' || ev?.grade === 'A') {
                                    badges.push({ label: `Grade ${ev.grade}` });
                                  }
                                  // 4. Debit Notes - zero debit notes or least debit notes
                                  const dn = ev?.metrics.totalDebitNotesCount ?? 0;
                                  if (minDebits !== null && maxDebits !== null && minDebits !== maxDebits && dn === minDebits) {
                                    badges.push({ label: dn === 0 ? 'Zero Debit Notes' : 'Least Debit Notes' });
                                  } else if (dn === 0) {
                                    badges.push({ label: 'Zero Debit Notes' });
                                  }
                                } else if (ev) {
                                  // Single vendor sourcing: highlight strong points
                                  if (ev.qualityScore >= 95) badges.push({ label: 'Best Quality' });
                                  else if (ev.qualityScore >= 90) badges.push({ label: 'High Quality' });
                                  else if (ev.grade === 'A+' || ev.grade === 'A') badges.push({ label: `Grade ${ev.grade}` });
                                  if ((ev.metrics.totalDebitNotesCount ?? 0) === 0) badges.push({ label: 'Zero Debit Notes' });
                                  if (typeof cap.leadTimeDays === 'number' && cap.leadTimeDays > 0 && cap.leadTimeDays <= 14) {
                                    badges.push({ label: `${cap.leadTimeDays}d Lead Time` });
                                  }
                                }
                                return {
                                  id: cap.vendorId,
                                  name: scoreTag ? `${prefix}${vendor.name} (${scoreTag})` : `${prefix}${vendor.name}`,
                                  code: subLabel,
                                  vendorName: vendor.name,
                                  prefix,
                                  scoreTag,
                                  priceLabel,
                                  leadTimeDays: cap.leadTimeDays,
                                  badges,
                                };
                              })
                              .filter((option): option is NonNullable<typeof option> => Boolean(option));
                          })()}
                          renderOption={(opt) => {
                            const option = opt as typeof opt & {
                              vendorName?: string;
                              prefix?: string;
                              scoreTag?: string;
                              priceLabel?: string;
                              badges?: Array<{ label: string }>;
                            };
                            return (
                              <div className="py-1 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-foreground truncate">
                                    {option.prefix && <span className="text-primary font-bold">{option.prefix}</span>}
                                    {option.vendorName || option.name}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                      {option.scoreTag || 'Score N/A'}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`View scorecard for ${option.vendorName || option.name}`}
                                        title="View vendor scorecard & performance audit"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectedScorecardVendorId(option.id);
                                          setSelectedScorecardVendorName(option.vendorName || option.name);
                                        }}
                                        className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                      >
                                        <Info className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-[11px] font-mono text-muted-foreground">
                                    {option.priceLabel}
                                    {typeof option.leadTimeDays === 'number' && option.leadTimeDays > 0 ? ` · ${option.leadTimeDays}d lead` : ''}
                                  </span>
                                  {option.badges && option.badges.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {option.badges.map((b, bIdx) => (
                                        <span
                                          key={bIdx}
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-tone-emerald-bg/10 text-tone-green-text  border border-tone-green-solid/30 transition-colors"
                                        >
                                          {b.label}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                          onChange={(vendorId) => {
                            const capability = selectedItem
                              ? getMatchingCapabilities(selectedItem).find(({ cap }) => cap.vendorId === vendorId)?.cap
                              : undefined;
                            updateLine(idx, { vendorId, ...(capability && Number(capability.unitPrice) > 0 ? { unitPrice: String(capability.unitPrice) } : {}) });
                          }}
                        />
                      </td>

                      {/* UOM */}
                      <td className="py-2.5 px-3">
                        <SearchableSelector
                          size="sm"
                          value={line.uomId}
                          onChange={(uomId) => updateLine(idx, { uomId })}
                          placeholder="Select UOM..."
                          disabled={!selectedItem}
                          options={(data?.uoms?.items || [])
                            .filter((uom) => availableUomIds.includes(uom.id))
                            .map((uom) => ({ ...uom, name: uom.symbol || uom.code }))}
                        />
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                          className="h-8.5 w-full rounded-lg border border-border/70 bg-background px-2.5 py-1 text-xs font-mono font-bold text-right text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (idx === lines.length - 1) {
                                addLine();
                              }
                            }
                          }}
                          className="h-8.5 w-full rounded-lg border border-border/70 bg-background px-2.5 py-1 text-xs font-mono font-bold text-right text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      </td>

                      {/* Line Total */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground text-xs">
                        ₹{rowTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Remove line */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            tabIndex={-1}
                            data-keyboard-skip
                            onClick={() => removeLine(idx)}
                            className="p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="Remove line"
                            aria-label={`Remove line ${idx + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {idx === lines.length - 1 && (
                      <tr key={`${line.tempId}-add`} className="border-b border-border/50 bg-muted/[0.12]">
                        <td colSpan={8} className="px-4 py-2 text-left">
                          <button type="button" onClick={() => addLineAfter(idx)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" title={`Add material after line ${idx + 1}`} aria-label={`Add item after line ${idx + 1}`}>
                            <Plus className="h-3.5 w-3.5" /> Add item
                          </button>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Totals */}
          <div className="p-4 bg-muted/20 border-t border-border/80 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center">
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                Press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded font-mono text-[10px] font-semibold">Tab</kbd> to jump between fields
              </span>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Lines
                </span>
                <span className="text-sm font-bold text-foreground font-mono">
                  {totals.itemCount} line{totals.itemCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Quantity
                </span>
                <span className="text-sm font-bold text-foreground font-mono">
                  {totals.totalQty.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="h-6 w-px bg-border/80" />

              <div className="text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Grand Total Value
                </span>
                <span className="text-lg font-black text-foreground font-mono">
                  ₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Clean Purchase Order Details Card */}
        <div data-section="po-details" className="order-1 space-y-4 rounded-xl border border-border/80 bg-card p-4 sm:p-5 lg:p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
            <h2 className="text-sm font-bold text-foreground">
              Purchase Order Details
            </h2>
          </div>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label htmlFor="purchase-order-number" className="block text-xs font-bold text-foreground">PO Number
              <input
                id="purchase-order-number"
                value={poNumber}
                onChange={(event) => { setPoNumber(event.target.value); setPoNumberEdited(true); }}
                placeholder={nextPo.isLoading ? 'Generating…' : 'Auto-generated'}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm font-bold text-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Purchase order number"
              />
            </label>
            {/* Required By Date */}
            <label className="block text-xs font-bold text-foreground">Required By <span className="text-destructive">*</span>
              <input
                type="date"
                value={needDate}
                onChange={(e) => {
                  setNeedDate(e.target.value);
                  setLines((curr) => curr.map((l) => ({ ...l, needDate: e.target.value })));
                }}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-2xs transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-foreground">
              <span className="block">Net Terms (Days)</span>
              <select
                value={['15', '30', '60'].includes(netTermsDays) ? netTermsDays : 'CUSTOM'}
                onChange={(e) => setNetTermsDays(e.target.value === 'CUSTOM' ? '' : e.target.value)}
                aria-label="Payment terms"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="15">Net 15 Days</option>
                <option value="30">Net 30 Days</option>
                <option value="60">Net 60 Days</option>
                <option value="CUSTOM">Custom</option>
              </select>
              {!['15', '30', '60'].includes(netTermsDays) && (
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={netTermsDays}
                  onChange={(e) => { if (/^\d*$/.test(e.target.value)) setNetTermsDays(e.target.value); }}
                  placeholder="Custom term in days"
                  aria-label="Custom payment term in days"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </label>
            <label className="space-y-1.5 text-xs font-bold text-foreground">
              <span className="block">Dispatched Through</span>
              <input value={dispatchedThrough} onChange={(e) => setDispatchedThrough(e.target.value)} placeholder="e.g. Road transport" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-foreground">Mode of Payment</span>
              <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background p-1">
                {PO_PAYMENT_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={paymentMode === mode.value}
                    onClick={() => setPaymentMode((current) => current === mode.value ? '' : mode.value)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${paymentMode === mode.value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="space-y-1.5 text-xs font-bold text-foreground">
              <span className="block">Other References</span>
              <input value={otherReferences} onChange={(e) => setOtherReferences(e.target.value)} placeholder="Optional vendor or internal reference" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-foreground">
              <span className="block">Terms of Delivery</span>
              <input value={termsOfDelivery} onChange={(e) => setTermsOfDelivery(e.target.value)} placeholder="e.g. Door delivery at plant" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-foreground">
              <span className="block">Destination</span>
              <input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Delivery location" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
          </div>
        </div>

        {/* 3. Bottom Action Dock */}
        <div data-section="action-dock" className="order-3 flex flex-col sm:flex-row items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/procurement/purchase-orders')}
            className="h-9 px-4 rounded-lg text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={isSubmitting}
            loading={isSubmitting}
            className="h-9 px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs gap-1.5 transition-all"
            icon={Send}
          >
            {isSubmitting ? (isNavigating ? 'Opening Order…' : 'Processing…') : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
      {isNavigating && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80 backdrop-blur-xs"
          role="status"
          aria-live="polite"
          aria-label={isSaving ? 'Creating purchase order' : 'Opening purchase order'}
        >
          <LoadingState message={isSaving ? 'Creating purchase order…' : 'Opening purchase order details…'} />
        </div>
      )}


      {/* Vendor Scorecard Slide-Over Board — slides in from the right so it never overlaps the dropdown */}
      <VendorScorecardDialog
        open={Boolean(selectedScorecardVendorId)}
        onClose={() => {
          setSelectedScorecardVendorId(null);
          setSelectedScorecardVendorName(null);
        }}
        variant="drawer"
        vendorId={selectedScorecardVendorId}
        vendorName={selectedScorecardVendorName}
      />
    </div>
  );
}
