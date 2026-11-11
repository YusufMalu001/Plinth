"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { generateUUID } from '@/lib/uuid';
import { useCreateStockIssue, useInventoryItemAvailability } from '../../../../../features/inventory/hooks';
import { useApprovedMaterials, useActiveUOMs } from '../../../../../features/purchases/hooks';
import { useDepartments } from '@/hooks/useMasterData';
import { extractErrorMessage } from '../../../../../features/inventory/errors';
import {
  PageHeader,
  Card,
  Button,
} from '@plinth/ui';
import { SearchableSelector } from '../../../../../components/ui/SearchableSelector';
import {
  ArrowLeft,
  XCircle,
  Layers,
  Building2,
  Plus,
} from 'lucide-react';
import { DepartmentDialog } from '@/components/DepartmentDialog';
import { formatVariantName } from '@/features/products/variant-names';
import { StockMovementSummary } from '../../../../../features/inventory/components/StockMovementSummary';

const ISSUE_PURPOSE_PRESETS = [
  'Production Batch Consumption',
  'Shop Floor Job Order Issue',
  'Sample / Testing Extraction',
  'Maintenance & Operational Repair',
  'Assembly Line Staging Issue',
];

const formatQuantity = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(value || 0);

export default function NewStockIssuePage() {
  const router = useRouter();
  const createIssue = useCreateStockIssue();
  const { data: materials, isLoading: materialsLoading, error: materialsError } = useApprovedMaterials();
  const { data: uoms } = useActiveUOMs();
  const { data: deptData, isLoading: departmentsLoading } = useDepartments('ACTIVE');
  const departments = deptData?.items || [];
  const [createDeptOpen, setCreateDeptOpen] = useState(false);
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
          uomId: (material as { uomId?: string }).uomId,
          availableUomIds: Array.isArray(material.specs?.availableUomIds) ? material.specs.availableUomIds : [],
          isVariant: isVar,
          parentOptionId: parentId,
          parentItemName: material.parentMaterialName,
          category: material.category,
        };
      }),
    [materials?.items]
  );

  const departmentOptions = useMemo(
    () =>
      (departments ?? []).map((dept: any) => ({
        id: dept.id,
        name: dept.name,
        code: dept.code,
        status: dept.status,
      })),
    [departments]
  );

  const [form, setForm] = useState({
    materialId: '',
    departmentId: '',
    uomId: '',
    quantity: '',
    reason: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const selectedMaterial = useMemo(
    () => (materials?.items ?? []).find((m: any) => m.id === form.materialId) as any,
    [materials?.items, form.materialId]
  );

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
    () => (uoms?.items ?? []).find((u: any) => u.id === form.uomId),
    [uoms?.items, form.uomId]
  );
  const selectedUomLabel = selectedUom?.symbol || selectedUom?.code || '';
  const isSelectedVariant = Boolean(selectedMaterial?.isVariant || selectedMaterial?.specs?.isVariant);
  const selectedMaterialDisplayName = selectedMaterial
    ? isSelectedVariant
      ? formatVariantName(selectedMaterial.parentMaterialName, selectedMaterial.name)
      : selectedMaterial.name
    : '';
  const {
    data: stockAvailability,
    isLoading: stockAvailabilityLoading,
    isError: stockAvailabilityError,
  } = useInventoryItemAvailability('MATERIAL', form.materialId, form.uomId);
  const requestedQuantity = Number(form.quantity);
  const hasRequestedQuantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0;
  const stockShortage = Boolean(
    stockAvailability && hasRequestedQuantity && requestedQuantity > stockAvailability.availableQuantity + 0.00005
  );
  const noAvailableStock = Boolean(
    stockAvailability && stockAvailability.availableQuantity <= 0 && !stockAvailabilityLoading
  );
  const shortageQuantity = stockAvailability && hasRequestedQuantity
    ? Math.max(0, requestedQuantity - stockAvailability.availableQuantity)
    : 0;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.materialId) {
      setFormError('Please select an item.');
      return;
    }
    if (!form.uomId || !form.quantity || !form.reason) {
      setFormError('UOM, quantity, and purpose/reason are required.');
      return;
    }
    if (Number(form.quantity) <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }

    try {
      const selectedDept = departmentOptions.find((d) => d.id === form.departmentId);
      const variantContext = isSelectedVariant && selectedMaterialDisplayName
        ? `[Variant: ${selectedMaterialDisplayName}] `
        : '';
      const compositeReason = selectedDept
        ? `[Dept: ${selectedDept.name}] ${variantContext}${form.reason}`
        : `${variantContext}${form.reason}`;

      await createIssue.mutateAsync({
        data: {
          materialId: form.materialId,
          uomId: form.uomId,
          quantity: Number(form.quantity),
          reason: compositeReason,
        },
        idempotencyKey: generateUUID(),
        toastContext: {
          itemName: selectedMaterialDisplayName || 'Selected item',
          quantity: Number(form.quantity),
          uomLabel: selectedUomLabel || 'units',
          departmentName: selectedDept?.name,
        },
      });
      router.push('/stock/issues');
    } catch (err) {
      setFormError(extractErrorMessage(err).message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full min-h-[calc(100vh-64px)]">
      <div className="w-full space-y-6">
        
        {/* Page Header */}
        <PageHeader
          title="Direct Stock Issue & Consumption"
          description={undefined}
          actions={
            <Link href="/stock/issues">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full shadow-xs font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Issues</span>
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

        {/* Clean Form Layout */}
        <Card className="p-6 md:p-8 shadow-xs border border-border/80 rounded-2xl bg-card">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Top Row: Target Department & Select Item side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 1. Target Department */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    <span>1. Target Department</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateDeptOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    title="Add new department"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add new</span>
                  </button>
                </div>
                <SearchableSelector
                  value={form.departmentId}
                  onChange={(value) => setForm((f) => ({ ...f, departmentId: value }))}
                  onAddNew={() => setCreateDeptOpen(true)}
                  addNewText="department"
                  options={departmentOptions}
                  isLoading={departmentsLoading}
                  placeholder="Select target department..."
                />
              </div>

              {/* 2. Select Item */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span>2. Select Item *</span>
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
            </div>
            {/* Quantity and UOM Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  3. Issue Quantity *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  placeholder="e.g. 15"
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
                  movementQuantity={hasRequestedQuantity ? -requestedQuantity : 0}
                  uomLabel={selectedUomLabel}
                  isLoading={stockAvailabilityLoading}
                  isError={stockAvailabilityError}
                />
                {stockAvailability?.unconvertibleBalanceCount ? (
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    Some stock uses a different unit and has no approved conversion, so it is excluded from the available total.
                  </p>
                ) : null}
                {noAvailableStock && !stockAvailability?.unconvertibleBalanceCount && (
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    No unreserved company stock is available in this unit.
                  </p>
                )}
                {stockShortage && (
                  <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    Short by {formatQuantity(shortageQuantity)} {selectedUomLabel} for this issue.
                  </p>
                )}
              </div>
            )}
            {/* Purpose & Reason */}
            <div className="pt-2 border-t border-border/40">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                5. Issue Purpose & Job Reference *
              </label>
              <p className="text-[11px] text-muted-foreground mb-2.5">
                Select a purpose preset or provide production job reference details.
              </p>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {ISSUE_PURPOSE_PRESETS.map((preset) => (
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
                placeholder="Provide job reference (e.g. Batch #B-402 cloth dryer assembly run)..."
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary shadow-2xs"
              />
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
              <Link href="/stock/issues">
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
                disabled={createIssue.isPending || stockShortage}
                size="sm"
                className="rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-bold text-xs px-6 h-9"
              >
                {createIssue.isPending ? 'Issuing...' : 'Issue Stock'}
              </Button>
            </div>

          </form>
        </Card>

      <DepartmentDialog
        open={createDeptOpen}
        onClose={() => setCreateDeptOpen(false)}
        onCreated={(newDept) => setForm((f) => ({ ...f, departmentId: newDept.id }))}
      />
      </div>
    </div>
  );
}
