'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Button, PageHeader } from '@plinth/ui';
import { useProducts, useMaterials, useUoms } from '@/hooks/useMasterData';
import { useCreateBomDraft, useBomVersions, useBomNameConflict } from '@/features/bom/hooks';
import { bomApi } from '@/features/bom/api';
import { showToast } from '@/components/toast-store';
import { friendlyErrorMessage } from '@/features/auth/access-control';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { MultiBomSelector, type BomSelectorOption } from '@/components/ui/MultiBomSelector';
import { ReturnToProductDraftBanner } from '@/components/ReturnToProductDraftBanner';
import { getMaterialCost } from '@/features/products/components/ProductCreationWorkspace';
import { fetchApi } from '@/features/api/client';
import { getItemAllowedUomIds, convertItemQuantityBetweenUoms } from '@/features/bom/utils';
import { getVariantLabel } from '@/features/products/variant-names';

interface DraftLineItem {
  id: string;
  materialId: string;
  quantity: number | string;
  uomId: string;
  unitCost?: string;
  lineCost?: string;
  note: string;
  sourceBomVersionId?: string;
}

function mergeDraftLines(lines: DraftLineItem[]): DraftLineItem[] {
  const merged: DraftLineItem[] = [];
  const indexByKey = new Map<string, number>();
  let hasDuplicates = false;

  for (const line of lines) {
    if (!line.materialId) {
      merged.push(line);
      continue;
    }
    const key = line.materialId;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...line });
      continue;
    }

    hasDuplicates = true;
    const existing = merged[existingIndex];
    const existingQty = parseFloat(String(existing.quantity)) || 0;
    const dupQty = parseFloat(String(line.quantity)) || 0;
    const combinedQty = existingQty + dupQty;

    const existingRate = parseFloat(existing.unitCost || '0') || 0;
    const dupRate = parseFloat(line.unitCost || '0') || 0;
    const existingCost = parseFloat(existing.lineCost || '0') || (existingQty * existingRate);
    const dupCost = parseFloat(line.lineCost || '0') || (dupQty * dupRate);
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

const stripGeneratedVariantNotes = (note?: string | null) =>
  String(note || '').split(/\s*·\s*/).filter((part) => !/^Selected variant:/i.test(part.trim())).join(' · ').trim();

const getGeneratedVariantId = (note?: string | null) =>
  String(note || '').match(/Selected variant:.*?\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i)?.[1];

export default function NewBomFormulaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams?.get('productId') || '';

  const createBomMutation = useCreateBomDraft();

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProducts(undefined, 1, 500, { expandVariants: true });
  const products = (productsData?.items || []).filter((item) => item.status !== 'INACTIVE' && item.status !== 'SUPERSEDED');
  const productOptions = products
    .filter((item) => !item.isVariant && !(item.metadata as { isVariant?: boolean } | null)?.isVariant && !item.parentProductId)
    .map((item) => ({ id: item.id, name: item.name, code: item.sku }));

  const { data: materialsData, isLoading: isLoadingMaterials } = useMaterials(undefined, 1, 500, { expandVariants: true });
  const rawMaterials = (materialsData?.items || []).filter((item) => item.status !== 'INACTIVE' && item.status !== 'SUPERSEDED');
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

  const { data: uomsData } = useUoms();
  const uoms = uomsData?.items || [];

  const [form, setForm] = useState({
    productId: initialProductId,
    productVariantId: '',
    copyFromVersionId: '',
    bomNumber: '',
    note: '',
    batchBasisQty: 1,
    batchBasisUom: 'PCS',
  });
  const nameConflict = useBomNameConflict(form.bomNumber);

  const [lines, setLines] = useState<DraftLineItem[]>([]);
  const [selectedBomVersionIds, setSelectedBomVersionIds] = useState<string[]>([]);
  const [appendedBomNames, setAppendedBomNames] = useState<string[]>([]);
  const [isAutoFeedingBom, setIsAutoFeedingBom] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [productSelectionError, setProductSelectionError] = useState('');
  const [draggedLineIndex, setDraggedLineIndex] = useState<number | null>(null);
  const dragSourceIndexRef = React.useRef<number | null>(null);
  // Tracks bomNumbers of auto-fed source BOMs to prevent saving with the same name
  const autoFedSourceBomNumbers = React.useRef<Set<string>>(new Set());

  /** Suggest a readable name only when the user leaves the name blank. */
  const deriveSafeBomNumber = (userBomNumber: string): string | undefined => {
    const trimmed = userBomNumber.trim();
    if (trimmed) return trimmed;
    const productName = products.find((product) => product.id === form.productId)?.name || 'Item';
    const baseName = `${productName} BOM`;
    const usedNames = new Set([
      ...autoFedSourceBomNumbers.current,
      ...existingBoms.map((bom) => bom.bomNumber),
    ].map((name) => String(name || '').trim().toLowerCase()));
    if (!usedNames.has(baseName.toLowerCase())) return baseName;

    let suffix = 2;
    while (usedNames.has(`${baseName} ${suffix}`.toLowerCase())) suffix += 1;
    return `${baseName} ${suffix}`;
  };

  // Existing BOMs across entire system for cloning / auto-feed
  const { data: bomsData, isLoading: isLoadingBoms } = useBomVersions({ limit: 500 });
  const existingBoms = bomsData?.items || [];

  const bomOptions: BomSelectorOption[] = useMemo(() => {
    return existingBoms.map((b) => {
      const targetName = b.product?.name || b.material?.name || 'Formula';
      const targetSku = b.product?.sku || b.material?.code || '';
      return {
        id: b.id,
        name: `${b.bomNumber} — ${targetName}${targetSku ? ` (${targetSku})` : ''}`,
        code: `v${b.version}`,
        status: b.status,
        productName: targetName,
        productSku: targetSku,
      };
    });
  }, [existingBoms]);

  const cloneBomOptions = useMemo(() => {
    return existingBoms.map((b) => {
      const targetName = b.product?.name || b.material?.name || 'Formula';
      const targetSku = b.product?.sku || b.material?.code || '';
      return {
        id: b.id,
        name: `${b.bomNumber} (v${b.version}) — ${targetName}`,
        code: b.bomNumber,
        sku: targetSku,
        status: b.status,
      };
    });
  }, [existingBoms]);

  // Combined materials and products for recipe line item selection with variant hierarchy
  const bomItems = useMemo(() => {
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

  const handleChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddLine = () => {
    const newLine: DraftLineItem = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      materialId: '',
      quantity: 1,
      uomId: uoms[0]?.id || '',
      unitCost: '',
      lineCost: '',
      note: '',
    };
    setLines((prev) => [...prev, newLine]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const moveBomLine = (from: number, to: number) => {
    setLines((current) => {
      if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  // Auto-feed / clone from existing BOM(s) with multi-select and append capability
  const handleAutoFeedBom = async (versionId: string) => {
    if (!versionId) return;
    setIsAutoFeedingBom(true);
    try {
      const detail = await bomApi.getVersion(versionId);
      const rawLines = (detail.lines || []) as any[];
      if (rawLines.length === 0) {
        showToast({
          kind: 'error',
          title: 'Empty BOM',
          message: `BOM "${detail.bomNumber}" does not contain any material formulation lines.`,
        });
        return;
      }

      const newLines: DraftLineItem[] = rawLines.map((line, idx) => {
        const matId = getGeneratedVariantId(line.note) || line.materialId || line.componentProductId || line.material?.id || line.componentProduct?.id || '';
        const foundMat = bomItems.find((m) => m.id === matId);
        const resolvedUomId = line.uomId || line.uom?.id || foundMat?.uomId || uoms[0]?.id || '';
        const rawQty = line.quantity !== undefined && line.quantity !== null ? Number(line.quantity) : 1;
        const lineSavedCost = (line as any).unitCost != null && !isNaN(Number((line as any).unitCost))
          ? Number((line as any).unitCost)
          : ((line as any).avgRate != null && !isNaN(Number((line as any).avgRate))
            ? Number((line as any).avgRate)
            : null);
        const matUnitCost = lineSavedCost !== null && lineSavedCost > 0
          ? lineSavedCost
          : (foundMat ? getMaterialCost(foundMat) : (line.material ? getMaterialCost(line.material) : (line.componentProduct ? getMaterialCost(line.componentProduct) : 0)));
        const lineCostVal = Math.round(matUnitCost * rawQty * 100) / 100;

        return {
          id: `line-autofed-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          materialId: matId,
          quantity: isNaN(rawQty) ? '1' : String(rawQty),
          uomId: resolvedUomId,
          unitCost: matUnitCost > 0 ? String(matUnitCost) : (lineSavedCost !== null ? String(lineSavedCost) : ''),
          lineCost: lineCostVal > 0 ? String(lineCostVal) : '',
          note: stripGeneratedVariantNotes(line.note),
          sourceBomVersionId: versionId,
        };
      });

      // Appended one after the other
      setLines((current) => [...current, ...newLines]);
      setSelectedBomVersionIds((prev) => [...new Set([...prev, versionId])]);
      setAppendedBomNames((prev) => [...new Set([...prev, detail.bomNumber])]);
      autoFedSourceBomNumbers.current.add(detail.bomNumber.trim());
      showToast({
        kind: 'success',
        title: 'BOM Lines Appended',
        message: `Appended ${newLines.length} line(s) from "${detail.bomNumber}". Total items: ${lines.length + newLines.length}.`,
      });
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
      setSelectedBomVersionIds((prev) => prev.filter((id) => id !== versionId));
      setLines((prev) => prev.filter((line) => line.sourceBomVersionId !== versionId));
      const bomObj = bomOptions.find((b) => b.id === versionId);
      if (bomObj) {
        setAppendedBomNames((prev) => prev.filter((name) => !name.startsWith(bomObj.name.split(' — ')[0])));
      }
    } else {
      await handleAutoFeedBom(versionId);
    }
  };

  const handleClearBomSelection = () => {
    setLines((prev) => prev.filter((line) => !line.sourceBomVersionId));
    setSelectedBomVersionIds([]);
    setAppendedBomNames([]);
    autoFedSourceBomNumbers.current.clear();
  };

  const totalBomMaterialCost = useMemo(() => {
    return lines.reduce((acc, line) => {
      const selectedMat = bomItems.find((m) => m.id === line.materialId);
      const avgRate = selectedMat ? getMaterialCost(selectedMat) : 0;
      const rateToUse = line.unitCost !== undefined && line.unitCost !== '' ? parseFloat(line.unitCost) || 0 : avgRate;
      const qty = parseFloat(String(line.quantity)) || 0;
      return acc + (rateToUse * qty);
    }, 0);
  }, [lines, bomItems]);

  const totalCostBasis = totalBomMaterialCost;

  const validateLines = (itemsToValidate = lines) => {
    if (!form.productId || !productOptions.some((product) => product.id === form.productId)) {
      setProductSelectionError('Select the product this BOM belongs to.');
      showToast({ kind: 'error', title: 'Product Required', message: 'Select the product this BOM belongs to.' });
      return false;
    }
    if (itemsToValidate.length === 0) {
      showToast({ kind: 'error', title: 'Formula Lines Required', message: 'Add at least one raw material or component line.' });
      return false;
    }
    for (let i = 0; i < itemsToValidate.length; i++) {
      const l = itemsToValidate[i];
      if (!l.materialId) {
        showToast({ kind: 'error', title: 'Incomplete Line', message: `Row #${i + 1} must reference a valid Item/Component.` });
        return false;
      }
      if (!l.uomId) {
        showToast({ kind: 'error', title: 'UOM Required', message: `Row #${i + 1} is missing a Unit of Measure.` });
        return false;
      }
      if (!l.quantity || Number(l.quantity) <= 0) {
        showToast({ kind: 'error', title: 'Invalid Quantity', message: `Row #${i + 1} quantity must be greater than 0.` });
        return false;
      }
    }
    return true;
  };

  // Submit and create BOM
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameConflict.isConflict) {
      showToast({ kind: 'error', title: 'BOM name already exists', message: 'Choose a different BOM name.' });
      return;
    }
    const linesToProcess = mergeDraftLines(lines);
    if (linesToProcess.length !== lines.length) {
      setLines(linesToProcess);
    }
    if (!validateLines(linesToProcess)) return;

    setIsSaving(true);
    try {
      const payloadLines = linesToProcess.map((l, idx) => {
        const selectedItem = bomItems.find((item) => item.id === l.materialId);
        const isProduct = Boolean(
          products.some((p) => p.id === l.materialId) ||
          selectedItem?.parentProductId ||
          selectedItem?.sku
        );
        const parsedRate = l.unitCost !== undefined && l.unitCost !== '' ? parseFloat(l.unitCost) : (selectedItem ? getMaterialCost(selectedItem) : null);
        return {
          lineType: 'COMPONENT' as const,
          materialId: isProduct ? null : (l.materialId || null),
          componentProductId: isProduct ? (l.materialId || null) : null,
          uomId: l.uomId,
          quantityMode: 'SCALED' as const,
          quantity: Number(l.quantity),
          unitCost: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null,
          roundingRule: 'NONE' as const,
          sequence: idx + 1,
          note: l.note?.trim() || null,
        };
      });

      const created = await createBomMutation.mutateAsync({
        productId: form.productId,
        productVariantId: form.productVariantId || undefined,
        bomNumber: deriveSafeBomNumber(form.bomNumber ?? '') || undefined,
        note: form.note?.trim() || undefined,
        lines: payloadLines,
      });

      if (created?.id) {
        showToast({
          kind: 'success',
          title: 'BOM Created',
          message: `BOM "${created.bomNumber}" created with ${lines.length} component lines.`,
        });

        router.push(`/production/bom/${created.id}`);
      } else {
        router.push('/production/bom');
      }
    } catch (err) {
      showToast({
        kind: 'error',
        title: 'BOM Creation Failed',
        message: friendlyErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 w-full p-4 sm:p-6 lg:p-8 overflow-y-auto bg-muted/20 min-h-screen">
      <div className="w-full space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/products" className="hover:text-primary transition-colors">
            Inventory
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/production/bom" className="hover:text-primary transition-colors">
            Bill of Materials
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-foreground">Create BOM</span>
        </nav>

        {/* Return to Product Draft Banner */}
        <ReturnToProductDraftBanner currentFlowName="BOM Specification" />

        {/* Page Header */}
        <PageHeader
          title="Create Bill of Materials"
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/production/bom')}
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
                    productId: initialProductId,
                    productVariantId: '',
                    copyFromVersionId: '',
                    bomNumber: '',
                    note: '',
                    batchBasisQty: 1,
                    batchBasisUom: 'PCS',
                  });
                  setLines([]);
                  setAppendedBomNames([]);
                  setProductSelectionError('');
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 space-y-6">

            {/* SECTION 01: BOM DETAILS */}
            <div className="bg-card rounded-xl border border-border shadow-none overflow-hidden">
              <div className="px-6 py-4 border-border-strong border-border/70 flex flex-wrap items-center justify-between gap-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-inverse font-mono text-xs font-black shadow-none ring-2 ring-primary/20">
                    01
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground tracking-tight">
                      BOM Details
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-foreground/85 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      BOM Name
                    </label>
                    <input
                      type="text"
                      value={form.bomNumber}
                      onChange={(e) => handleChange('bomNumber', e.target.value)}
                      placeholder="Enter BOM name..."
                      maxLength={100}
                      aria-invalid={nameConflict.isConflict}
                      aria-describedby={nameConflict.isConflict ? 'new-bom-name-error' : undefined}
                      className={`w-full h-9 px-3 rounded-lg border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all font-medium ${nameConflict.isConflict ? 'border-destructive focus:ring-destructive/20' : 'border-input focus:border-primary focus:ring-primary/20'}`}
                    />
                    {nameConflict.isConflict && <p id="new-bom-name-error" role="alert" className="mt-1 text-xs font-medium text-destructive">This BOM name already exists. Choose a different name.</p>}
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-foreground/85 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      Product for this BOM
                    </label>
                    <SearchableSelector
                      value={form.productId}
                      onChange={(productId) => {
                        setForm((current) => ({ ...current, productId, productVariantId: '' }));
                        setProductSelectionError('');
                      }}
                      options={productOptions}
                      isLoading={isLoadingProducts}
                      error={productSelectionError || (productsError instanceof Error ? productsError : null)}
                      placeholder="Search product by name or SKU..."
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                      Clone Existing Recipe (Optional)
                    </label>
                    <SearchableSelector
                      value={form.copyFromVersionId}
                      onChange={(selectedId) => {
                        handleChange('copyFromVersionId', selectedId);
                        if (selectedId) {
                          handleAutoFeedBom(selectedId);
                        } else {
                          handleClearBomSelection();
                        }
                      }}
                      options={cloneBomOptions}
                      isLoading={isLoadingBoms || isAutoFeedingBom}
                      disabled={isAutoFeedingBom}
                      clearable
                      onClear={handleClearBomSelection}
                      placeholder="Search existing BOM by number, product, or SKU..."
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                      Engineering Change Order / Revision Scope
                    </label>
                    <input
                      type="text"
                      value={form.note}
                      onChange={(e) => handleChange('note', e.target.value)}
                      placeholder="Enter BOM description and specifications..."
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 02: COMPONENT MATERIALS & RATIO RECIPE */}
            <div className="bg-card rounded-xl border border-border shadow-none overflow-hidden">
              {/* Section Header */}
              <div className="px-6 py-4 border-border-strong border-border/70 flex flex-wrap items-center justify-between gap-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-inverse font-mono text-xs font-black shadow-none ring-2 ring-primary/20">
                    02
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground tracking-tight">
                      Component Materials & Ratio Recipe
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* BOM Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-3.5 rounded-xl border border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Recipe Lines: <strong className="font-mono text-primary text-sm">{lines.length} Items</strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Auto-feed selector with multi-select append support */}
                    <div className="min-w-[240px] sm:min-w-[280px]">
                      <MultiBomSelector
                        selectedIds={selectedBomVersionIds}
                        onToggle={handleToggleBomVersion}
                        onClear={handleClearBomSelection}
                        options={bomOptions}
                        isLoading={isLoadingBoms || isAutoFeedingBom}
                        disabled={isAutoFeedingBom}
                        placeholder="Auto-feed from BOM..."
                        size="sm"
                      />
                    </div>

                  </div>
                </div>

                {appendedBomNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                    <span className="text-[11px] font-semibold text-muted-foreground">Appended BOMs:</span>
                    {appendedBomNames.map((name, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary font-mono text-[11px] font-bold">
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

                {/* BOM Item Table - Exact columns matching Item Creation page */}
                <div className="overflow-x-auto rounded-xl border border-border shadow-none">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-muted/50 font-bold uppercase tracking-wider text-muted-foreground border-border-strong border-border">
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
                    <tbody className="divide-y divide-border/60 bg-card">
                      {lines.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center">
                            <div className="flex min-h-24 items-center justify-center">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleAddLine}
                                className="h-9 px-4 rounded-xl border-border bg-card hover:bg-muted text-xs font-bold text-foreground inline-flex items-center gap-1.5 shadow-none"
                                icon={Plus}
                              >
                                Add Item Line
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        lines.map((line, index) => {
                          const selectedMat = bomItems.find((m) => m.id === line.materialId);
                          const allowedUomIds = getItemAllowedUomIds(selectedMat, bomItems);
                          const allowedUoms = uoms.filter((uom) => allowedUomIds.includes(uom.id));

                          const avgRate = selectedMat ? getMaterialCost(selectedMat) : 0;

                          const isDragging = draggedLineIndex === index;

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
                                  setDraggedLineIndex(index);
                                }
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                dragSourceIndexRef.current = null;
                                setDraggedLineIndex(null);
                              }}
                              className={`transition-all duration-200 ease-out ${isDragging
                                ? 'opacity-40 bg-primary/10 shadow-none scale-[1.008] z-20 relative ring-2 ring-primary/40 rounded-xl'
                                : 'hover:bg-muted/40 transition-colors'
                                }`}
                            >
                              <td className="px-2 py-3 text-center align-top pt-3.5">
                                <div
                                  draggable
                                  onDragStart={(event) => {
                                    setDraggedLineIndex(index);
                                    event.dataTransfer.setData('bom-page-line-index', String(index));
                                    event.dataTransfer.effectAllowed = 'move';
                                    const row = event.currentTarget.closest('tr');
                                    if (row && event.dataTransfer.setDragImage) {
                                      event.dataTransfer.setDragImage(row, 20, 20);
                                    }
                                  }}
                                  onDragEnd={() => {
                                    dragSourceIndexRef.current = null;
                                    setDraggedLineIndex(null);
                                  }}
                                  className="inline-flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary active:scale-95 transition-all py-1.5 px-2 rounded-lg hover:bg-primary/10 active:bg-primary/20 select-none"
                                  title="Click and drag to move line up or down"
                                >
                                  <GripVertical className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                                  <span className="font-bold font-mono text-xs text-muted-foreground">
                                    {index + 1}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <SearchableSelector
                                  value={line.materialId}
                                  onChange={async (value) => {
                                    const material = bomItems.find((item) => item.id === value);
                                    const catalogUnitCost = getMaterialCost(material);
                                    const currentQty = parseFloat(String(line.quantity)) || 1;
                                    const catalogLineTotal = Math.round(catalogUnitCost * currentQty * 100) / 100;

                                    setLines((current) =>
                                      current.map((row) =>
                                        row.id === line.id
                                          ? {
                                            ...row,
                                            materialId: value,
                                            uomId: material?.uomId || material?.uom?.id || row.uomId,
                                            unitCost: catalogUnitCost > 0 ? String(catalogUnitCost) : '',
                                            lineCost: catalogLineTotal > 0 ? String(catalogLineTotal) : '',
                                          }
                                          : row
                                      )
                                    );

                                    if (value && materials.some((item) => item.id === value)) {
                                      try {
                                        const balanceData = await fetchApi<{
                                          items?: Array<{
                                            averageCost?: number | string;
                                            onHandQuantity?: number | string;
                                            quantity?: number | string;
                                          }>;
                                        }>(`/inventory/balances?materialId=${encodeURIComponent(value)}&limit=1000`);
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

                                        setLines((current) => current.map((row) => {
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
                                  isLoading={isLoadingMaterials || isLoadingProducts}
                                  placeholder="Search items across all categories..."
                                  renderOption={(item) => (
                                    <div className={`flex min-w-0 items-center gap-2 ${item.parentOptionId ? 'ml-3 border-l-2 border-primary/40 pl-3' : ''}`}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <span className={`truncate ${item.isVariant ? 'text-xs font-medium text-foreground/80' : 'text-xs font-bold text-foreground'}`}>
                                            {item.parentOptionId ? '↳ ' : ''}{item.isVariant ? getVariantLabel(item.parentItemName, item.name) : item.name}
                                          </span>
                                          {item.isVariant && (
                                            <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                                              Variant
                                            </span>
                                          )}
                                        </div>
                                        {item.category?.name && <span className="block truncate text-[10px] text-muted-foreground">{item.category.name}</span>}
                                      </div>
                                    </div>
                                  )}
                                />
                              </td>
                              <td className="px-3 py-3 align-top">
                                <input
                                  type="number"
                                  min="0.0001"
                                  step="any"
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const newQty = e.target.value;
                                    setLines((current) =>
                                      current.map((row) =>
                                        row.id === line.id ? { ...row, quantity: newQty } : row
                                      )
                                    );
                                  }}
                                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-bold text-right font-mono text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                              </td>
                              <td className="px-3 py-3 align-top">
                                <select
                                  value={line.uomId}
                                  onChange={(e) => {
                                    const newUom = e.target.value;
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

                                    setLines((current) =>
                                      current.map((row) => {
                                        if (row.id !== line.id) return row;
                                        const currentRate = parseFloat(String(row.unitCost)) || 0;
                                        const numQty = parseFloat(String(nextQty)) || 0;
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
                                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-primary truncate transition-all"
                                >
                                  <option value="">Select UOM</option>
                                  {allowedUoms.map((uom) => (
                                    <option key={uom.id} value={uom.id}>{uom.name} ({uom.code})</option>
                                  ))}
                                </select>
                              </td>
                              {/* Editable Average Rate */}
                              <td className="px-3 py-3 align-top">
                                <div className="relative">
                                  <span className="absolute left-2.5 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder={avgRate > 0 ? avgRate.toFixed(2) : '0.00'}
                                    value={line.unitCost !== undefined && line.unitCost !== '' ? line.unitCost : (avgRate > 0 ? String(avgRate) : '')}
                                    onChange={(e) => {
                                      const newRate = e.target.value;
                                      setLines((current) =>
                                        current.map((row) =>
                                          row.id === line.id ? { ...row, unitCost: newRate } : row
                                        )
                                      );
                                    }}
                                    className="h-10 w-full pl-6 pr-2 rounded-xl border border-input bg-background text-xs font-bold text-right font-mono text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <input
                                  value={line.note}
                                  onChange={(e) =>
                                    setLines((current) =>
                                      current.map((row) => (row.id === line.id ? { ...row, note: e.target.value } : row))
                                    )
                                  }
                                  placeholder="Cutting length, color code, tolerance..."
                                  className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                              </td>
                              <td className="px-3 py-3 text-center align-top">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(line.id)}
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

                {lines.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLine}
                      className="h-9 px-4 rounded-xl border-border bg-card hover:bg-muted text-xs font-bold text-foreground shadow-none"
                      icon={Plus}
                    >
                      Add Item Line
                    </Button>
                    <div className="flex min-w-[240px] items-center justify-between gap-6 rounded-xl border border-border bg-muted/40 px-5 py-3 shadow-none">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Total Cost</span>
                      <strong className="font-mono text-base font-black text-foreground">
                        ₹{totalCostBasis.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                )}

                {lines.length > 0 && (
                  <div className="flex justify-start pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLines([]);
                        setSelectedBomVersionIds([]);
                        setAppendedBomNames([]);
                      }}
                      className="h-9 px-3.5 rounded-xl text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                      icon={Trash2}
                    >
                      Clear All
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM ACTIONS */}
          <div className="lg:col-span-12 flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/production/bom')}
              className="h-9 px-4 rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || lines.length === 0}
              className="h-9 px-5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-inverse shadow-none"
              icon={Save}
            >
              {isSaving ? 'Creating BOM...' : 'Create BOM'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
