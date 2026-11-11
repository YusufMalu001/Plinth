'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Layers,
  Plus,
  Trash2,
  Save,
  Pencil,
  Calendar,
  Coins,
  ChevronRight,
  AlertTriangle,
  X,
  Loader2,
  FileText,
  Package,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@plinth/ui';
import {
  useBomVersion,
  useBomNameConflict,
  useUpdateBomDraft,
  useDeleteBomDraft,
} from '../../../../../features/bom/hooks';
import {
  useMaterials,
  useProducts,
  useUoms,
} from '../../../../../hooks/useMasterData';
import { getVariantLabel } from '../../../../../features/products/variant-names';
import { getBomLineItemDisplay, getItemAllowedUomIds, convertItemQuantityBetweenUoms } from '../../../../../features/bom/utils';
import { getMaterialCost } from '@/features/products/components/ProductCreationWorkspace';
import { SearchableSelector } from '../../../../../components/ui/SearchableSelector';
import { ConfirmDeleteDialog } from '../../../../../components/ConfirmDeleteDialog';
import { showToast } from '../../../../../components/toast-store';

interface EditableDraftLine {
  id: string;
  materialId: string;
  componentProductId: string;
  variantId?: string;
  quantity: number | string;
  uomId: string;
  unitCost: string;
  lineCost: string;
  note: string;
}

const resolveItemCost = (mat: any, prod: any): number => {
  if (mat) return getMaterialCost(mat);
  if (prod) {
    const raw = prod.costPrice ?? prod.unitCost ?? (prod as any).basePrice ?? (prod as any).sellingPrice ?? 0;
    return Number(raw) || 0;
  }
  return 0;
};

function cleanQuantityString(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  let s = String(val).trim().replace(/,/g, '.');
  if (s.startsWith('.')) s = '0' + s;
  return s;
}

function mergeDuplicateDraftLines(lines: EditableDraftLine[]): EditableDraftLine[] {
  const merged: EditableDraftLine[] = [];
  const indexByKey = new Map<string, number>();
  let hasDuplicates = false;

  for (const line of lines) {
    const key = line.materialId
      ? `mat:${line.materialId}`
      : (line.componentProductId ? `prod:${line.componentProductId}:${line.variantId || getVariantIdFromNote(line.note) || getVariantLabelFromNote(line.note)}` : '');
    if (!key) {
      merged.push(line);
      continue;
    }
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...line });
      continue;
    }

    hasDuplicates = true;
    const existing = merged[existingIndex];
    const existingQty = parseFloat(cleanQuantityString(existing.quantity)) || 0;
    const dupQty = parseFloat(cleanQuantityString(line.quantity)) || 0;
    const combinedQty = Math.round((existingQty + dupQty) * 1000000) / 1000000;

    const existingRate = parseFloat(existing.unitCost) || 0;
    const dupRate = parseFloat(line.unitCost) || 0;
    const existingCost = parseFloat(existing.lineCost) || (existingQty * existingRate);
    const dupCost = parseFloat(line.lineCost) || (dupQty * dupRate);
    const totalCost = existingCost + dupCost;
    const combinedRate = combinedQty > 0 && totalCost > 0 ? (Math.round((totalCost / combinedQty) * 100) / 100) : (existingRate > 0 ? existingRate : dupRate);
    const combinedLineCost = Math.round(totalCost * 100) / 100;
    const notes = Array.from(new Set([existing.note?.trim(), line.note?.trim()].filter(Boolean))).join(' · ');

    merged[existingIndex] = {
      ...existing,
      quantity: String(combinedQty),
      unitCost: combinedRate > 0 ? String(combinedRate) : existing.unitCost || line.unitCost || '',
      lineCost: combinedLineCost > 0 ? String(combinedLineCost) : '',
      note: notes,
    };
  }

  return hasDuplicates ? merged : lines;
}

const getUserSpecificationNote = (note?: string | null) => {
  const value = note?.trim() || '';
  return /^Created from (?:finished good|raw material) creation$/i.test(value) ? '' : value;
};

const getUserEngineeringNote = (note?: string | null) =>
  String(note || '')
    .split(/\s*·\s*/)
    .filter((part) => !/^Selected variant:/i.test(part.trim()))
    .join(' · ')
    .trim();

const getVariantIdFromNote = (note?: string | null) =>
  String(note || '').match(/Selected variant:.*?\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i)?.[1];

const getVariantLabelFromNote = (note?: string | null) =>
  String(note || '').match(/Selected variant:\s*(.*?)(?:\s*\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\))?(?:\s*·|$)/i)?.[1]?.trim() || '';

const getProductVariantId = (note: string | null | undefined, parentProductId: string, products: any[]) => {
  const explicitId = getVariantIdFromNote(note);
  if (explicitId && products.some((item) => item.id === explicitId)) return explicitId;
  const label = getVariantLabelFromNote(note).toLowerCase();
  if (!label) return undefined;
  return products.find((item) => {
    const parentId = item.parentProductId || item.metadata?.parentProductId || item.parentOptionId;
    const itemLabel = getVariantLabel(item.parentProductName || item.parentItemName || '', item.name, item.measurementValue || item.metadata?.measurementValue);
    return parentId === parentProductId && itemLabel.trim().toLowerCase() === label;
  })?.id;
};

export default function BomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const lastLoadedVersionId = useRef<string | null>(null);
  const hasConsumedEditParam = useRef(false);

  const { data: version, isLoading, error, refetch } = useBomVersion(id);
  const updateMutation = useUpdateBomDraft();
  const deleteMutation = useDeleteBomDraft();

  // Master data for item lookup & editing
  const { data: materialsData } = useMaterials(undefined, 1, 500, { expandVariants: true });
  const { data: productsData } = useProducts(undefined, 1, 500, { expandVariants: true });
  const { data: uomsData } = useUoms();

  const rawMaterials = useMemo(
    () => (materialsData?.items || []).filter((item) => item.status !== 'INACTIVE' && item.status !== 'SUPERSEDED'),
    [materialsData?.items]
  );
  const materials = useMemo(() => {
    return rawMaterials.filter((m) => {
      const name = (m.name || '').trim();
      const code = (m.code || '').trim();
      if (/^(sun|mon|tue|wed|thu|fri|sat)\s+/i.test(name) || /gmt\+\d+/i.test(name)) return false;
      if (/^sufiyan\s+mirza$/i.test(name) || /^sufiyan-mirza$/i.test(code)) return false;
      if (/^total\s+no\.\s+of\s+bundles/i.test(name) || /^return\s+material\s+handover/i.test(name)) return false;
      return true;
    });
  }, [rawMaterials]);

  const products = useMemo(
    () => (productsData?.items || []).filter((item) => item.status !== 'INACTIVE' && item.status !== 'SUPERSEDED'),
    [productsData?.items]
  );
  const uoms = useMemo(() => uomsData?.items || [], [uomsData?.items]);

  // Combined master catalog for line editing
  const bomItemCatalog = useMemo(() => {
    const materialItems = (materials || []).map((item) => {
      const parentId = item.parentMaterialId || (item as any).materialId || String((item as any).specs?.parentMaterialId || '') || undefined;
      const isVar = Boolean(item.isVariant || (item as any).specs?.isVariant || parentId);
      return {
        ...item,
        isVariant: isVar,
        parentMaterialId: parentId,
        parentOptionId: parentId,
      };
    });
    const productItems = (products || []).map((item) => {
      const parentId = (item as any).parentProductId || (item as any).productId || ((item as any).metadata as any)?.parentProductId;
      const isVar = Boolean(item.isVariant || ((item as any).metadata as any)?.isVariant || parentId);
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
  }, [materials, products]);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [draftLines, setDraftLines] = useState<EditableDraftLine[]>([]);
  const [draftBomName, setDraftBomName] = useState('');
  const nameConflict = useBomNameConflict(isEditing ? draftBomName : '', id);
  const [draftNote, setDraftNote] = useState('');
  const [draftEffectiveDate, setDraftEffectiveDate] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Initialize draft when version loads or changes (never clobber when user is editing)
  useEffect(() => {
    if (!version) return;
    if (lastLoadedVersionId.current === version.id && isEditing) return;

    lastLoadedVersionId.current = version.id;
    setDraftBomName(version.bomNumber || '');
    setDraftNote(getUserSpecificationNote(version.note));
    setDraftEffectiveDate(version.effectiveDate ? new Date(version.effectiveDate).toISOString().slice(0, 10) : '');
    const initialLines: EditableDraftLine[] = (version.lines || []).map((line, idx) => {
      const legacyVariantId = getVariantIdFromNote(line.note);
      const isProductVariant = Boolean(legacyVariantId && products.some((item) => item.id === legacyVariantId));
      const isMaterialVariant = Boolean(legacyVariantId && !isProductVariant && materials.some((item) => item.id === legacyVariantId));
      const matId = isMaterialVariant
        ? legacyVariantId
        : line.materialId || line.material?.id || '';
      const prodId = line.componentProductId || line.componentProduct?.id || '';
      const variantId = isProductVariant ? legacyVariantId : (isMaterialVariant ? legacyVariantId : getProductVariantId(line.note, prodId, products));
      const foundMat = line.material || materials.find((m) => m.id === matId);
      const foundProd = line.componentProduct || products.find((p) => p.id === prodId);
      const resolvedUomId = line.uomId || line.uom?.id || (foundMat as any)?.uomId || uoms[0]?.id || '';
      const rawQty = line.quantity !== undefined && line.quantity !== null ? cleanQuantityString(line.quantity) : '1';
      const numQty = Number(rawQty) || 1;
      const lineSavedRate = (line as any).unitCost != null && !isNaN(Number((line as any).unitCost)) ? Number((line as any).unitCost) : null;
      const matUnitCost = lineSavedRate !== null ? lineSavedRate : resolveItemCost(foundMat, foundProd);
      const lineCostVal = Math.round(matUnitCost * numQty * 100) / 100;

      return {
        id: line.id || `line-${idx}`,
        materialId: isMaterialVariant ? ((foundMat as any)?.parentMaterialId || (foundMat as any)?.parentOptionId || line.materialId || matId) : matId,
        componentProductId: prodId,
        variantId,
        quantity: rawQty,
        uomId: resolvedUomId,
        unitCost: matUnitCost > 0 ? String(matUnitCost) : (lineSavedRate !== null ? String(lineSavedRate) : ''),
        lineCost: lineCostVal > 0 ? String(lineCostVal) : '',
        note: getUserEngineeringNote(line.note),
      };
    });
    setDraftLines(initialLines);
    if (!hasConsumedEditParam.current && searchParams?.get('edit') === 'true') {
      hasConsumedEditParam.current = true;
      setIsEditing(true);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/production/bom/${version.id}`);
      }
    }
  }, [version, materials, products, uoms, isEditing, searchParams]);

  // Calculated totals for view mode
  const viewModeMetrics = useMemo(() => {
    if (!version || !version.lines) return { totalItems: 0, totalQty: 0, totalCost: 0 };
    let cost = 0;
    let qty = 0;
    for (const line of version.lines) {
      const q = Number(line.quantity) || 0;
      qty += q;
      const foundMat = line.material || materials.find((m) => m.id === (line.materialId || line.material?.id));
      const foundProd = line.componentProduct || products.find((p) => p.id === (line.componentProductId || line.componentProduct?.id));
      const lineSavedRate = (line as any).unitCost != null && !isNaN(Number((line as any).unitCost)) ? Number((line as any).unitCost) : null;
      const uCost = lineSavedRate !== null ? lineSavedRate : resolveItemCost(foundMat, foundProd);
      cost += Math.round(uCost * q * 100) / 100;
    }
    return {
      totalItems: version.lines.length,
      totalQty: Math.round(qty * 100) / 100,
      totalCost: Math.round(cost * 100) / 100,
    };
  }, [version, materials, products]);

  // Calculated totals for edit mode
  const editModeMetrics = useMemo(() => {
    let cost = 0;
    let qty = 0;
    for (const line of draftLines) {
      const q = parseFloat(cleanQuantityString(line.quantity)) || 0;
      const c = parseFloat(String(line.unitCost)) || 0;
      qty += q;
      cost += Math.round(q * c * 100) / 100;
    }
    return {
      totalItems: draftLines.length,
      totalQty: Math.round(qty * 10000) / 10000,
      totalCost: Math.round(cost * 100) / 100,
    };
  }, [draftLines]);

  const attachedProduct = version?.product;

  // Add line in edit mode
  const handleAddLine = () => {
    const newLine: EditableDraftLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      materialId: '',
      componentProductId: '',
      quantity: '1',
      uomId: uoms[0]?.id || '',
      unitCost: '',
      lineCost: '',
      note: '',
    };
    setDraftLines((prev) => [...prev, newLine]);
  };

  // Remove line in edit mode
  const handleRemoveLine = (lineId: string) => {
    setDraftLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  // Save changes
  const handleSaveFormula = async () => {
    if (!version) return;
    if (!draftBomName.trim()) {
      showToast({ kind: 'error', title: 'BOM name required', message: 'Enter a name for this BOM before saving.' });
      return;
    }
    if (nameConflict.isConflict) {
      showToast({ kind: 'error', title: 'BOM name already exists', message: 'Choose a different BOM name.' });
      return;
    }
    const linesToProcess = mergeDuplicateDraftLines(draftLines);
    if (linesToProcess.length !== draftLines.length) {
      setDraftLines(linesToProcess);
    }

    if (linesToProcess.length === 0) {
      showToast({
        kind: 'error',
        title: 'Validation Error',
        message: 'The Bill of Materials must contain at least one formulation line.',
      });
      return;
    }

    for (let i = 0; i < linesToProcess.length; i++) {
      const line = linesToProcess[i];
      if (!line.materialId && !line.componentProductId) {
        showToast({
          kind: 'error',
          title: 'Validation Error',
          message: `Line #${i + 1} has no item selected. Please choose a raw material or component.`,
        });
        return;
      }
      const q = parseFloat(cleanQuantityString(line.quantity));
      if (isNaN(q) || q <= 0) {
        showToast({
          kind: 'error',
          title: 'Validation Error',
          message: `Line #${i + 1} quantity must be greater than 0.`,
        });
        return;
      }
    }

    const payload = linesToProcess.map((line, idx) => {
      const parsedRate = line.unitCost !== undefined && line.unitCost !== '' && !isNaN(Number(line.unitCost)) ? parseFloat(line.unitCost) : null;
      const selectedVariant = line.variantId ? products.find((item) => item.id === line.variantId) : undefined;
      const selectedMaterialVariant = line.variantId ? materials.find((item) => item.id === line.variantId) : undefined;
      const variantLabel = selectedVariant
        ? getVariantLabel(selectedVariant.parentProductName || selectedVariant.parentItemName || '', selectedVariant.name, String(selectedVariant.measurementValue || selectedVariant.metadata?.measurementValue || ''))
        : selectedMaterialVariant
          ? getVariantLabel(selectedMaterialVariant.parentMaterialName || '', selectedMaterialVariant.name, String(selectedMaterialVariant.measurementValue || (selectedMaterialVariant as any).specs?.measurementValue || ''))
          : getVariantLabelFromNote(line.note);
      const variantNote = line.variantId || variantLabel
        ? `Selected variant: ${variantLabel || selectedVariant?.name || selectedMaterialVariant?.name || 'Variant'}${line.variantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(line.variantId) ? ` (${line.variantId})` : ''}`
        : '';
      const cleanQty = Math.round((parseFloat(cleanQuantityString(line.quantity)) || 1) * 1000000) / 1000000;
      return {
        lineType: 'COMPONENT' as const,
        materialId: line.materialId || null,
        componentProductId: line.componentProductId || null,
        uomId: line.uomId || uoms[0]?.id || '',
        quantityMode: 'SCALED' as const,
        quantity: cleanQty,
        unitCost: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null,
        roundingRule: 'NONE' as const,
        sequence: idx + 1,
        note: [getUserEngineeringNote(line.note), variantNote].filter(Boolean).join(' · ') || null,
      };
    });

    try {
      await updateMutation.mutateAsync({
        id: version.id,
        data: {
          bomNumber: draftBomName.trim(),
          lines: payload,
          note: draftNote.trim() || null,
          effectiveDate: draftEffectiveDate ? new Date(draftEffectiveDate).toISOString() : (version.effectiveDate || undefined),
        },
      });
      lastLoadedVersionId.current = null;
      setIsEditing(false);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/production/bom/${version.id}`);
      }
      refetch();
      showToast({
        kind: 'success',
        title: 'Formula Updated',
        message: `BOM specification "${draftBomName.trim()}" saved successfully.`,
      });
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Save Failed',
        message: err?.message || 'Could not save BOM formulation.',
      });
    }
  };

  // Delete BOM
  const handleDeleteBom = async () => {
    if (!version) return;
    try {
      await deleteMutation.mutateAsync(version.id);
      setIsDeleteDialogOpen(false);
      router.push('/production/bom');
    } catch {
      // Handled by deleteMutation onError toast
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    if (!version) return;
    setDraftBomName(version.bomNumber || '');
    setDraftNote(getUserSpecificationNote(version.note));
    setDraftEffectiveDate(version.effectiveDate ? new Date(version.effectiveDate).toISOString().slice(0, 10) : '');
    const initialLines: EditableDraftLine[] = (version.lines || []).map((line, idx) => {
      const legacyVariantId = getVariantIdFromNote(line.note);
      const isProductVariant = Boolean(legacyVariantId && products.some((item) => item.id === legacyVariantId));
      const isMaterialVariant = Boolean(legacyVariantId && !isProductVariant && materials.some((item) => item.id === legacyVariantId));
      const matId = isMaterialVariant
        ? legacyVariantId
        : line.materialId || line.material?.id || '';
      const prodId = line.componentProductId || line.componentProduct?.id || '';
      const variantId = isProductVariant ? legacyVariantId : (isMaterialVariant ? legacyVariantId : getProductVariantId(line.note, prodId, products));
      const foundMat = line.material || materials.find((m) => m.id === matId);
      const foundProd = line.componentProduct || products.find((p) => p.id === prodId);
      const resolvedUomId = line.uomId || line.uom?.id || (foundMat as any)?.uomId || uoms[0]?.id || '';
      const rawQty = line.quantity !== undefined && line.quantity !== null ? cleanQuantityString(line.quantity) : '1';
      const numQty = Number(rawQty) || 1;
      const lineSavedRate = (line as any).unitCost != null && !isNaN(Number((line as any).unitCost)) ? Number((line as any).unitCost) : null;
      const matUnitCost = lineSavedRate !== null ? lineSavedRate : resolveItemCost(foundMat, foundProd);
      const lineCostVal = Math.round(matUnitCost * numQty * 100) / 100;

      return {
        id: line.id || `line-${idx}`,
        materialId: isMaterialVariant ? ((foundMat as any)?.parentMaterialId || (foundMat as any)?.parentOptionId || line.materialId || matId) : matId,
        componentProductId: prodId,
        variantId,
        quantity: rawQty,
        uomId: resolvedUomId,
        unitCost: matUnitCost > 0 ? String(matUnitCost) : (lineSavedRate !== null ? String(lineSavedRate) : ''),
        lineCost: lineCostVal > 0 ? String(lineCostVal) : '',
        note: getUserEngineeringNote(line.note),
      };
    });
    setDraftLines(initialLines);
    setIsEditing(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/production/bom/${version.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 w-full p-8 text-center text-xs text-muted-foreground animate-pulse min-h-[400px] flex items-center justify-center">
        <div className="space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          <p className="font-semibold text-foreground">Loading Bill of Materials details…</p>
        </div>
      </div>
    );
  }

  if (error || !version) {
    return (
      <div className="flex-1 w-full p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-semibold space-y-2">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
          <p>Bill of Materials record not found or could not be loaded.</p>
          <p className="text-xs text-muted-foreground font-normal">
            {error instanceof Error ? error.message : 'Please check your connection and try again.'}
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
            Retry
          </Button>
          <Link href="/production/bom">
            <Button size="sm" className="text-xs bg-primary text-white">
              Back
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const activeMetrics = isEditing ? editModeMetrics : viewModeMetrics;
  const targetItem = version?.product || version?.material;
  const targetType = version?.product ? 'Product' : version?.material ? 'Material' : null;
  const targetCode = version?.product?.sku || version?.material?.code;
  const targetHref = version?.product ? `/products/${version.product.id}` : version?.material ? `/inventory/materials/${version.material.id}` : null;


  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-5 min-h-screen">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/inventory" className="hover:text-primary transition-colors">
          Inventory
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/production/bom" className="hover:text-primary transition-colors">
          Bill of Materials
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-semibold text-foreground font-mono">{version.bomNumber}</span>
      </nav>

      {/* Header Banner */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <Link
            href="/production/bom"
            className="mb-0.5 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            {isEditing ? (
              <div className="w-full max-w-xl">
              <input
                aria-label="BOM name"
                value={draftBomName}
                onChange={(event) => setDraftBomName(event.target.value)}
                maxLength={100}
                aria-invalid={nameConflict.isConflict}
                aria-describedby={nameConflict.isConflict ? 'bom-name-error' : undefined}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground focus:outline-none focus:ring-2 ${nameConflict.isConflict ? 'border-destructive focus:ring-destructive/30' : 'border-input focus:ring-primary/30'}`}
              />
              {nameConflict.isConflict && <p id="bom-name-error" role="alert" className="mt-1 text-xs font-medium text-destructive">This BOM name already exists. Choose a different name.</p>}
              </div>
            ) : (
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                  {version.bomNumber}
                </h1>
                {targetItem && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Target Item:</span>
                    {targetHref ? (
                      <Link
                        href={targetHref}
                        className="font-medium text-primary hover:underline inline-flex items-center gap-1.5"
                      >
                        <span>{targetItem.name}</span>
                        {targetCode && <span className="font-mono text-muted-foreground">({targetCode})</span>}
                      </Link>
                    ) : (
                      <span>{targetItem.name} {targetCode && `(${targetCode})`}</span>
                    )}
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase border border-border/60">
                      {targetType}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          {!isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(true)}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 border-destructive/20"
                icon={Trash2}
              >
                Delete BOM
              </Button>
              <Button
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-none"
                icon={Pencil}
              >
                Edit Formula
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                className="h-8 px-3 rounded-lg text-xs font-semibold"
                icon={X}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveFormula}
                disabled={updateMutation.isPending || draftLines.length === 0}
                className="h-8 px-4 rounded-lg text-xs font-bold bg-primary hover:bg-primary/90 text-white shadow-none"
                icon={updateMutation.isPending ? Loader2 : Save}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </header>

      {/* 4-Card KPI Metric Grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full">
        {/* Card 1: Total Formulation Items */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-primary/40 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Component Lines
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {activeMetrics.totalItems}
                </span>
                <span className="text-xs font-medium text-muted-foreground">items</span>
              </div>
            </div>
            <span className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
              <Layers className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        {/* Card 2: Total Cost Basis */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-emerald-500/40 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Est. Formulation Cost
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight font-mono">
                  ₹{activeMetrics.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <span className="rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 p-2 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Coins className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        {/* Card 3: Effective Date */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-amber-500/40 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Effective Timeline
              </p>
              <div className="flex items-baseline gap-1.5">
                {isEditing ? (
                  <input
                    type="date"
                    aria-label="Effective Date"
                    value={draftEffectiveDate}
                    onChange={(e) => setDraftEffectiveDate(e.target.value)}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : (
                  <span className="text-base sm:text-lg font-bold text-foreground">
                    {version.effectiveDate
                      ? new Date(version.effectiveDate).toLocaleDateString()
                      : 'Immediate'}
                  </span>
                )}
              </div>
            </div>
            <span className="rounded-lg bg-amber-500/10 dark:bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400 shrink-0">
              <Calendar className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        {/* Card 4: The product directly owned by this BOM */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-blue-500/40 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="min-w-0 space-y-1 pr-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Attached Product
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {attachedProduct ? 1 : 0}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {attachedProduct ? 'product' : 'products'}
                </span>
              </div>
              <p
                className="text-[10px] text-muted-foreground truncate max-w-[180px] sm:max-w-[220px]"
                title={attachedProduct?.name || ''}
              >
                {attachedProduct?.name || 'No product attached'}
              </p>
            </div>
            <span className="rounded-lg bg-blue-500/10 dark:bg-blue-500/20 p-2 text-blue-600 dark:text-blue-400 shrink-0">
              <Package className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Main Formulation Recipe Table Card */}
      <Card className="rounded-xl border border-border overflow-hidden shadow-none w-full bg-card">
        {/* Table Header Bar */}
        <div className="p-3 sm:p-4 border-b border-border bg-card flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold text-foreground">
              Formulation Recipe & Components
            </span>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
              {activeMetrics.totalItems} Items
            </span>
          </div>

          {isEditing && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLine}
                className="h-8 px-3 rounded-lg border-border text-xs font-bold"
                icon={Plus}
              >
                Add Item Line
              </Button>
              {draftLines.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraftLines([])}
                  className="h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                  icon={Trash2}
                >
                  Clear All
                </Button>
              )}
            </div>
          )}
        </div>

        {/* VIEW MODE TABLE */}
        {!isEditing ? (
          <div className="w-full overflow-x-auto">
            {version.lines.length === 0 ? (
              <div className="py-12 text-center space-y-2.5">
                <Layers className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <h3 className="text-sm font-semibold text-foreground">No Formulation Lines Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  This BOM specification does not contain any raw materials or component lines yet.
                </p>
                <Button
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="mt-1 bg-primary text-primary-foreground font-semibold h-8 text-xs"
                  icon={Pencil}
                >
                  Add Components Now
                </Button>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground w-12 text-center">
                      #
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground min-w-[220px]">
                      Item
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground">
                      Type
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground text-right">
                      Required Qty
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground text-center">
                      Unit of Measure
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground text-right">
                      Avg Rate (₹)
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground text-right">
                      Line Cost (₹)
                    </TableHead>
                    <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground min-w-[180px]">
                      Engineering Notes
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {version.lines.map((line, idx) => {
                    const variantIdFromNote = getVariantIdFromNote(line.note);
                    const variantFromNote = variantIdFromNote
                      ? materials.find((item) => item.id === variantIdFromNote) || products.find((item) => item.id === variantIdFromNote)
                      : undefined;
                    const display = getBomLineItemDisplay(line, materials, products);
                    const itemName = display.name === 'Component' ? line.material?.name || line.componentProduct?.name || 'Raw Material Item' : display.name;
                    const variantLabel = display.variant || (variantFromNote ? getVariantLabel(itemName, variantFromNote.name, (variantFromNote as any).measurementValue) : undefined);
                    const isSubAssembly = Boolean(line.componentProductId);
                    const foundMat = line.material || materials.find((m) => m.id === (line.materialId || line.material?.id));
                    const foundProd = line.componentProduct || products.find((p) => p.id === (line.componentProductId || line.componentProduct?.id));
                    const lineSavedRate = (line as any).unitCost != null && !isNaN(Number((line as any).unitCost)) ? Number((line as any).unitCost) : null;
                    const avgRate = lineSavedRate !== null ? lineSavedRate : resolveItemCost(foundMat, foundProd);
                    const lineCost = Math.round(avgRate * Number(line.quantity) * 100) / 100;
                    const engineeringNote = getUserEngineeringNote(line.note);
                    const uomSymbol = line.uom?.symbol || line.uom?.code || 'PCS';

                    const targetId = variantIdFromNote || (isSubAssembly ? (line.componentProductId || line.componentProduct?.id) : (line.materialId || line.material?.id));
                    const itemHref = targetId
                      ? isSubAssembly
                        ? `/products/${targetId}`
                        : `/inventory/materials/${targetId}`
                      : null;

                    return (
                      <TableRow
                        key={line.id || idx}
                        className="hover:bg-muted/40 transition-colors border-b border-border/60"
                      >
                        {/* Sequence */}
                        <TableCell className="py-2.5 px-3.5 text-center text-xs font-mono font-semibold text-muted-foreground">
                          {idx + 1}
                        </TableCell>

                        {/* Item name and variant */}
                        <TableCell className="py-2.5 px-3.5">
                          {itemHref ? (
                            <Link
                              href={itemHref}
                              className="group/item block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
                            >
                              <div className="font-semibold text-foreground text-xs group-hover/item:text-primary group-hover/item:underline transition-colors">
                                {itemName}
                              </div>
                              {variantLabel && (
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span className="text-[11px] font-normal text-muted-foreground">{variantLabel}</span>
                                  <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                                    Variant
                                  </span>
                                </div>
                              )}
                            </Link>
                          ) : (
                            <div>
                              <div className="font-semibold text-foreground text-xs">
                                {itemName}
                              </div>
                              {variantLabel && (
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span className="text-[11px] font-normal text-muted-foreground">{variantLabel}</span>
                                  <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                                    Variant
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        {/* Type */}
                        <TableCell className="py-2.5 px-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${isSubAssembly
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              }`}
                          >
                            {isSubAssembly ? 'Sub-Assembly' : 'Raw Material'}
                          </span>
                        </TableCell>

                        {/* Quantity */}
                        <TableCell className="py-2.5 px-3.5 text-right font-mono font-bold text-xs text-foreground">
                          {Number(line.quantity)}
                        </TableCell>

                        {/* UOM */}
                        <TableCell className="py-2.5 px-3.5 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-foreground border border-border text-[11px] font-mono">
                            {uomSymbol}
                          </span>
                        </TableCell>

                        {/* Avg Rate */}
                        <TableCell className="py-2.5 px-3.5 text-right font-mono text-xs font-semibold text-foreground">
                          ₹{avgRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>

                        {/* Line Cost */}
                        <TableCell className="py-2.5 px-3.5 text-right font-mono font-bold text-xs text-foreground">
                          ₹{lineCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>

                        {/* Notes */}
                        <TableCell className="py-2.5 px-3.5 text-xs text-muted-foreground">
                          {engineeringNote ? (
                            <span>{engineeringNote}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Table Summary Footer */}
            {version.lines.length > 0 && (
              <div className="p-4 bg-muted/30 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground font-semibold">Total Components:</span>
                    <strong className="text-foreground font-bold">{viewModeMetrics.totalItems} lines</strong>
                  </div>
                  <span className="text-muted-foreground/30 hidden sm:inline">•</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground font-semibold">Cumulative Quantity:</span>
                    <strong className="text-foreground font-bold font-mono">{viewModeMetrics.totalQty}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-card px-3.5 py-1.5 rounded-lg border border-border shadow-none self-start sm:self-auto">
                  <span className="text-xs font-bold text-muted-foreground">Total Formulation Cost Basis:</span>
                  <strong className="font-mono font-black text-primary text-sm">
                    ₹{viewModeMetrics.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* EDIT MODE TABLE */
          <div className="w-full overflow-x-auto">
            {draftLines.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No lines in formulation. Click &quot;Add Item Line&quot; to begin.</p>
                <Button size="sm" onClick={handleAddLine} className="text-xs" icon={Plus}>
                  Add Item Line
                </Button>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3 min-w-[260px]">Item</th>
                    <th className="py-2.5 px-3 w-28 text-right">Required Qty</th>
                    <th className="py-2.5 px-3 w-28 text-center">Unit of Measure</th>
                    <th className="py-2.5 px-3 w-32 text-right">Avg Rate (₹)</th>
                    <th className="py-2.5 px-3 w-32 text-right">Line Cost (₹)</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Engineering Notes</th>
                    <th className="py-2.5 px-3 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {draftLines.map((line, idx) => {
                    const selectedItemId = line.variantId || line.materialId || line.componentProductId;
                    const selectedBomItem = bomItemCatalog.find((item) => item.id === selectedItemId);
                    const allowedUomIds = getItemAllowedUomIds(selectedBomItem, bomItemCatalog);
                    const allowedUoms = uoms.filter((uom) => allowedUomIds.includes(uom.id));
                    const effectiveUoms = allowedUoms.length > 0 ? allowedUoms : uoms;

                    return (
                      <tr key={line.id} className="hover:bg-muted/20">
                        {/* Sequence */}
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-muted-foreground">
                          {idx + 1}
                        </td>

                        {/* Searchable Item Selector */}
                        <td className="py-2.5 px-3">
                          <SearchableSelector
                            value={selectedItemId}
                            onChange={(val) => {
                              const selectedMat = bomItemCatalog.find((m) => m.id === val);
                              const isSubAssy = products.some((p) => p.id === val);
                              const isMaterialVariant = !isSubAssy && Boolean(selectedMat?.parentMaterialId || selectedMat?.parentOptionId);
                              const parentMaterialId = selectedMat?.parentMaterialId || selectedMat?.parentOptionId;
                              const resolvedUomId = getItemAllowedUomIds(selectedMat, bomItemCatalog)[0] || uoms[0]?.id || '';
                              const avgRate = isSubAssy
                                ? resolveItemCost(null, selectedMat)
                                : resolveItemCost(selectedMat, null);
                              const currentQty = parseFloat(cleanQuantityString(line.quantity)) || 1;
                              const calculatedCost = Math.round(avgRate * currentQty * 100) / 100;

                              setDraftLines((current) =>
                                current.map((row) =>
                                  row.id === line.id
                                    ? {
                                      ...row,
                                      materialId: isSubAssy ? '' : (parentMaterialId || val),
                                      componentProductId: isSubAssy ? selectedMat?.parentProductId || val : '',
                                      variantId: isSubAssy && selectedMat?.isVariant ? val : (isMaterialVariant ? val : undefined),
                                      uomId: resolvedUomId,
                                      unitCost: avgRate > 0 ? String(avgRate) : '',
                                      lineCost: calculatedCost > 0 ? String(calculatedCost) : '',
                                    }
                                    : row
                                )
                              );
                            }}
                            options={bomItemCatalog.map((item) => ({
                              id: item.id,
                              name: item.name || 'Unnamed Material',
                              code: item.code || item.sku,
                              sku: item.sku || item.code,
                              category: item.category,
                              isVariant: item.isVariant,
                              parentItemName: item.parentItemName,
                            }))}
                            showOptionCode={false}
                            placeholder="Select raw material or component..."
                            size="sm"
                          />
                        </td>

                        {/* Quantity */}
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              const parsedQty = parseFloat(val) || 0;
                              const rate = parseFloat(line.unitCost) || 0;
                              const calculatedLineCost = Math.round(parsedQty * rate * 100) / 100;
                              setDraftLines((current) =>
                                current.map((row) =>
                                  row.id === line.id
                                    ? {
                                      ...row,
                                      quantity: val,
                                      lineCost: calculatedLineCost > 0 ? String(calculatedLineCost) : '',
                                    }
                                    : row
                                )
                              );
                            }}
                            onBlur={() => {
                              const cleaned = cleanQuantityString(line.quantity);
                              if (cleaned !== line.quantity) {
                                setDraftLines((current) =>
                                  current.map((row) =>
                                    row.id === line.id ? { ...row, quantity: cleaned } : row
                                  )
                                );
                              }
                            }}
                            placeholder="1"
                            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-bold text-right font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </td>

                        {/* UOM */}
                        <td className="py-2.5 px-3">
                          <select
                            value={line.uomId}
                            onChange={(e) => {
                              const newUom = e.target.value;
                              if (newUom === line.uomId) return;
                              const selectedMat = bomItemCatalog.find((m) => m.id === line.materialId);
                              let nextQty = line.quantity;
                              if (selectedMat && line.uomId && newUom && line.quantity) {
                                const converted = convertItemQuantityBetweenUoms(
                                  selectedMat,
                                  line.quantity,
                                  line.uomId,
                                  newUom,
                                  bomItemCatalog
                                );
                                if (converted !== null) {
                                  nextQty = String(converted);
                                }
                              }

                              setDraftLines((current) =>
                                current.map((row) => {
                                  if (row.id !== line.id) return row;
                                  const currentRate = parseFloat(String(row.unitCost || '')) || 0;
                                  const numQty = parseFloat(String(nextQty || '')) || 0;
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
                            }}
                            aria-label="Unit of measure"
                            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            {effectiveUoms.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.code} ({u.symbol || u.name})
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Avg Rate */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.unitCost}
                            onChange={(e) => {
                              const val = e.target.value.replace(',', '.');
                              if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
                              const parsedRate = parseFloat(val) || 0;
                              const q = parseFloat(cleanQuantityString(line.quantity)) || 0;
                              const calculatedLineCost = Math.round(q * parsedRate * 100) / 100;
                              setDraftLines((current) =>
                                current.map((row) =>
                                  row.id === line.id
                                    ? {
                                      ...row,
                                      unitCost: val,
                                      lineCost: calculatedLineCost > 0 ? String(calculatedLineCost) : '',
                                    }
                                    : row
                                )
                              );
                            }}
                            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs font-mono text-right text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="0.00"
                          />
                        </td>

                        {/* Line Cost (computed) */}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-xs text-foreground">
                          ₹{(parseFloat(line.lineCost) || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>

                        {/* Notes */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={line.note}
                            onChange={(e) =>
                              setDraftLines((current) =>
                                current.map((row) =>
                                  row.id === line.id ? { ...row, note: e.target.value } : row
                                )
                              )
                            }
                            placeholder="Instructions, length, grade..."
                            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </td>

                        {/* Remove */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            aria-label="Remove item line"
                            className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Live Total Cost Bar in Edit Mode */}
            {draftLines.length > 0 && (
              <div className="p-4 bg-muted/30 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground font-semibold">Total Components:</span>
                    <strong className="text-foreground font-bold">{editModeMetrics.totalItems} lines</strong>
                  </div>
                  <span className="text-muted-foreground/30 hidden sm:inline">•</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground font-semibold">Cumulative Quantity:</span>
                    <strong className="text-foreground font-bold font-mono">{editModeMetrics.totalQty}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-card px-3.5 py-1.5 rounded-lg border border-border shadow-none self-start sm:self-auto">
                  <span className="text-xs font-bold text-muted-foreground">Total Formulation Cost Basis:</span>
                  <strong className="font-mono font-black text-primary text-sm">
                    ₹{editModeMetrics.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Specification Overview & Notes follows the recipe so UOM and component details come first. */}
      <Card className="rounded-xl border border-border bg-card shadow-none p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Specification Overview & Notes</h2>
        </div>

        {!isEditing ? (
          <div className="space-y-3">
            {getUserSpecificationNote(version.note) && (
              <p className="text-xs text-foreground leading-relaxed bg-muted/30 p-3.5 rounded-xl border border-border/60">
                {getUserSpecificationNote(version.note)}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-[11px]">
              <div>
                <span className="text-muted-foreground block">BOM Identifier:</span>
                <strong className="font-mono text-foreground font-bold">{version.bomNumber}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Last Updated:</span>
                <span className="text-foreground">
                  {version.updatedAt ? new Date(version.updatedAt).toLocaleDateString() : '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Effective Date:</span>
                <span className="text-foreground">
                  {version.effectiveDate ? new Date(version.effectiveDate).toLocaleDateString() : 'Immediate'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Total Quantity Sum:</span>
                <strong className="font-mono text-foreground">{viewModeMetrics.totalQty} units</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground block">
              Engineering Notes / Formula Instructions
            </label>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              rows={3}
              className="w-full text-xs rounded-xl border border-input bg-background p-3 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-medium text-foreground"
            />
          </div>
        )}
      </Card>

      {/* Delete BOM Modal Confirmation */}
      <ConfirmDeleteDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        title="Delete Bill of Materials Specification"
        message={`Are you sure you want to delete "${version.bomNumber}"? This will permanently remove this formula specification.`}
        onConfirm={handleDeleteBom}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
