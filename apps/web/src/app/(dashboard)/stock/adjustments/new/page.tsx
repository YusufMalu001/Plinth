"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProposeStockAdjustment, useInventoryItemAvailability } from '../../../../../features/inventory/hooks';
import { useApprovedMaterials, useActiveUOMs } from '../../../../../features/purchases/hooks';
import { extractErrorMessage } from '../../../../../features/inventory/errors';
import {
  PageHeader,
  Card,
  Button,
} from '@plinth/ui';
import { SearchableSelector } from '../../../../../components/ui/SearchableSelector';
import { formatVariantName } from '@/features/products/variant-names';
import { StockMovementSummary } from '../../../../../features/inventory/components/StockMovementSummary';
import {
  ArrowLeft,
  XCircle,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';

const REASON_PRESETS = [
  'Physical cycle count discrepancy',
  'Damaged during handling',
  'Physical surplus count on audit',
  'Quality inspection write-off / scrap',
  'Expired shelf life reconciliation',
  'Initial physical stock intake',
];

export default function NewStockAdjustmentPage() {
  const router = useRouter();
  const proposeAdjustment = useProposeStockAdjustment();
  const { data: materials, isLoading: materialsLoading, error: materialsError } = useApprovedMaterials();
  const { data: uoms } = useActiveUOMs();

  const [form, setForm] = useState({
    materialId: '',
    uomId: '',
    direction: 'DECREASE' as 'INCREASE' | 'DECREASE',
    quantity: '',
    reason: '',
  });

  const materialOptions = useMemo(
    () =>
      (materials?.items ?? []).map((material: any) => {
        const parentId = material.parentMaterialId || material.materialId || String(material.specs?.parentMaterialId || '') || undefined;
        const isVar = Boolean(material.isVariant || material.specs?.isVariant || parentId);
        return {
          id: material.id,
          name: material.name,
          code: material.code,
          status: material.status,
          uomId: material.uomId,
          availableUomIds: Array.isArray(material.specs?.availableUomIds) ? material.specs.availableUomIds : [],
          isVariant: isVar,
          parentOptionId: parentId,
          parentItemName: material.parentMaterialName,
          category: material.category,
        };
      }),
    [materials?.items]
  );
  const [formError, setFormError] = useState<string | null>(null);

  const selectedMaterial = useMemo(
    () => (materials?.items ?? []).find((m: any) => m.id === form.materialId) as any,
    [materials?.items, form.materialId]
  );

  const {
    data: stockAvailability,
    isLoading: stockAvailabilityLoading,
    isError: stockAvailabilityError,
  } = useInventoryItemAvailability('MATERIAL', form.materialId, form.uomId);

  const allowedUoms = useMemo(() => {
    if (!selectedMaterial) return [];
    const baseUomId = selectedMaterial.uomId;
    const configuredIds = Array.isArray(selectedMaterial.specs?.availableUomIds)
      ? selectedMaterial.specs.availableUomIds
      : Array.isArray(selectedMaterial.availableUomIds)
      ? selectedMaterial.availableUomIds
      : [];
    const allAllowedIds = new Set([baseUomId, ...configuredIds].filter(Boolean));
    const list = (uoms?.items ?? []).filter((u) => allAllowedIds.has(u.id));
    return list.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.symbol || u.code,
    }));
  }, [selectedMaterial, uoms?.items]);

  const selectedUom = useMemo(
    () => (uoms?.items ?? []).find((u) => u.id === form.uomId),
    [uoms?.items, form.uomId]
  );
  const selectedUomLabel = selectedUom?.symbol || selectedUom?.code || '';
  const isSelectedVariant = Boolean(selectedMaterial?.isVariant || selectedMaterial?.specs?.isVariant);
  const selectedMaterialDisplayName = selectedMaterial
    ? isSelectedVariant
      ? formatVariantName(selectedMaterial.parentMaterialName, selectedMaterial.name)
      : selectedMaterial.name
    : '';
  const adjustmentQuantity = Number(form.quantity);
  const hasAdjustmentQuantity = Number.isFinite(adjustmentQuantity) && adjustmentQuantity > 0;
  const movementQuantity = hasAdjustmentQuantity
    ? (form.direction === 'INCREASE' ? adjustmentQuantity : -adjustmentQuantity)
    : 0;
  const adjustmentShortage = Boolean(
    form.direction === 'DECREASE' &&
    stockAvailability &&
    hasAdjustmentQuantity &&
    adjustmentQuantity > stockAvailability.availableQuantity + 0.00005
  );
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.materialId) {
      setFormError('Please select an item to adjust.');
      return;
    }
    if (!form.uomId || !form.quantity || form.reason.length < 3) {
      setFormError('UOM, quantity, and a justification reason (min 3 characters) are required.');
      return;
    }
    if (Number(form.quantity) <= 0) {
      setFormError('Adjustment quantity must be greater than zero.');
      return;
    }

    try {
      const variantContext = isSelectedVariant
        ? `[Variant: ${selectedMaterialDisplayName}] `
        : '';
      const adjustment = await proposeAdjustment.mutateAsync({
        data: {
          materialId: form.materialId,
          uomId: form.uomId,
          direction: form.direction,
          quantity: Number(form.quantity),
          reason: `${variantContext}${form.reason}`,
        },
        toastContext: {
          itemName: selectedMaterialDisplayName || 'Selected item',
          quantity: Number(form.quantity),
          uomLabel: selectedUomLabel || 'units',
          direction: form.direction,
        },
      });
      router.push(`/stock/adjustments/${adjustment.id}`);
    } catch (err) {
      setFormError(extractErrorMessage(err).message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full min-h-[calc(100vh-64px)]">
      <div className="w-full space-y-6">

        {/* Page Header */}
        <PageHeader
          title="Propose Stock Adjustment"
          description={undefined}
          actions={
            <Link href="/stock/adjustments">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full shadow-xs font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Adjustments</span>
              </Button>
            </Link>
          }
        />

        {formError && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 shadow-sm animate-in fade-in-0 duration-200">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider">Validation Error</h4>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">{formError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Input Form */}
        <Card className="p-6 md:p-8 shadow-xs border border-border/80 rounded-2xl bg-card">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Top Row: Select Item & Adjustment Direction side-by-side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {/* 1. Select Item */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span>1. Select Item *</span>
                  </label>
                </div>
                <SearchableSelector
                  value={form.materialId}
                  onChange={(value) => {
                    const mat = (materials?.items ?? []).find((m: any) => m.id === value) as any;
                    const available = Array.isArray(mat?.specs?.availableUomIds) && mat.specs.availableUomIds.length > 0
                      ? mat.specs.availableUomIds
                      : [mat?.uomId].filter(Boolean);
                    setForm((f) => ({
                      ...f,
                      materialId: value,
                      uomId: mat?.uomId || available[0] || '',
                    }));
                  }}
                  options={materialOptions}
                  isLoading={materialsLoading}
                  error={materialsError}
                  placeholder="Search item by name or code..."
                />
              </div>

              {/* 2. Adjustment Direction */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  2. Adjustment Direction *
                </label>
                <div className="grid grid-cols-2 gap-2 h-11 items-center">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, direction: 'DECREASE' }))}
                    className={`h-full rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      form.direction === 'DECREASE'
                        ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-2 ring-rose-500/20 shadow-xs'
                        : 'border-border/80 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    <span>Write-off (–)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, direction: 'INCREASE' }))}
                    className={`h-full rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      form.direction === 'INCREASE'
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-border/80 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    <span>Surplus (+)</span>
                  </button>
                </div>
              </div>
            </div>
            {/* Quantity & Unit of Measure Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-border/40">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  3. Adjustment Quantity *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  placeholder="e.g. 25"
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-xs font-semibold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  4. Unit of Measure (UOM) *
                </label>
                <SearchableSelector
                  value={form.uomId}
                  onChange={(val) => setForm((f) => ({ ...f, uomId: val }))}
                  disabled={!form.materialId}
                  options={allowedUoms}
                  placeholder={form.materialId ? 'Search and select UOM...' : 'Select an item first'}
                  renderOption={(u) => (
                    <span className="font-medium text-foreground">
                      {u.name} {u.code ? `(${u.code})` : ''}
                    </span>
                  )}
                />
              </div>
            </div>

            {form.materialId && (
              <div className="space-y-2" aria-live="polite">
                <StockMovementSummary
                  availableQuantity={stockAvailability?.availableQuantity}
                  movementQuantity={movementQuantity}
                  uomLabel={selectedUomLabel}
                  isLoading={stockAvailabilityLoading}
                  isError={stockAvailabilityError}
                />
                {stockAvailability?.unconvertibleBalanceCount ? (
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    Some stock is recorded in other units without an approved conversion, so it is shown separately and excluded from this {selectedUomLabel} balance.
                  </p>
                ) : null}
                {adjustmentShortage && (
                  <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    This write-off exceeds the selected item’s available stock by {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(adjustmentQuantity - (stockAvailability?.availableQuantity ?? 0))} {selectedUomLabel}.
                  </p>
                )}
                {stockAvailabilityError && (
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    Current stock could not be loaded. The server will verify availability before posting.
                  </p>
                )}
              </div>
            )}

            {/* Justification / Discrepancy Reason */}
            <div className="pt-2 border-t border-border/40">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                5. Discrepancy Justification &amp; Audit Note *
              </label>
              <p className="text-[11px] text-muted-foreground mb-2.5">
                Select a standardized reason preset below or enter specific cycle count details.
              </p>

              {/* Preset Tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, reason: preset }))}
                    className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                      form.reason === preset
                        ? 'bg-primary text-primary-foreground border-primary font-bold shadow-2xs'
                        : 'bg-muted/40 text-muted-foreground border-border/70 hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                required
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Provide explicit operational context (e.g. Physical cycle count discrepancy found on Rack D4 during weekly audit)..."
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-2xs"
              />
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
              <Link href="/stock/adjustments">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full shadow-xs px-5 font-semibold text-xs h-9"
                >
                  Cancel
                </Button>
              </Link>

              <Button
                type="submit"
                disabled={proposeAdjustment.isPending || adjustmentShortage}
                size="sm"
                className="rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-bold text-xs px-6 h-9"
              >
                {proposeAdjustment.isPending ? 'Adjusting Stock...' : 'Adjust Stock'}
              </Button>
            </div>

          </form>
        </Card>
      </div>
    </div>
  );
}
