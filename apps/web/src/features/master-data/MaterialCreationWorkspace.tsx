'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Button, PageHeader } from '@plinth/ui';
import {
  useCategories,
  useCreateMaterial,
  useUoms,
  useWarehouseLocations,
} from '../../hooks/useMasterData';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../../features/auth/access-control';
import { InlineMasterDataDialog } from '../../components/InlineMasterDataDialog';
import { handleNumberInputWheel, handleNumberInputKeyDown } from '../products/utils/tierPricing';

interface MaterialCustomField {
  name: string;
  value: string;
}

interface MaterialFormState {
  code: string;
  name: string;
  materialType: 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT';
  categoryId: string;
  description: string;
  // Procurement & Inventory
  uomId: string;
  standardCost: string;
  minStockLevel: string;
  reorderPoint: string;
  moq: string;
  leadTimeDays: string;
  warehouseLocationId: string;
}

const INITIAL_FORM: MaterialFormState = {
  code: '',
  name: '',
  materialType: 'RAW_MATERIAL',
  categoryId: '',
  description: '',
  uomId: '',
  standardCost: '',
  minStockLevel: '',
  reorderPoint: '',
  moq: '',
  leadTimeDays: '',
  warehouseLocationId: '',
};

export function MaterialCreationWorkspace() {
  const router = useRouter();
  const [form, setForm] = useState<MaterialFormState>(INITIAL_FORM);
  const [customFields, setCustomFields] = useState<MaterialCustomField[]>([{ name: '', value: '' }]);
  const [inlineMasterData, setInlineMasterData] = useState<'category' | 'uom' | null>(null);

  const categories = useCategories();
  const uoms = useUoms();
  const locations = useWarehouseLocations();
  const createMaterial = useCreateMaterial();

  const handleChange = (field: keyof MaterialFormState, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.code.trim()) {
      showToast({ kind: 'error', title: 'Material Code Required', message: 'Specify a unique material SKU code.' });
      return;
    }
    if (!form.name.trim()) {
      showToast({ kind: 'error', title: 'Material Name Required', message: 'Specify an authoritative material name.' });
      return;
    }
    if (!form.uomId) {
      showToast({ kind: 'error', title: 'UOM Required', message: 'Select base unit of measure (e.g. MTR, KGS, PCS).' });
      return;
    }

    try {
      const specs = {
        customFields: customFields.filter((field) => field.name.trim() || field.value.trim()),
        moq: parseFloat(form.moq) || 0,
        warehouseLocationId: form.warehouseLocationId || undefined,
      };

      const payload = {
        code: form.code.trim().toUpperCase() || undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        materialType: form.materialType,
        uomId: form.uomId,
        categoryId: form.categoryId || null,
        specs,
        minStockLevel: parseFloat(form.minStockLevel) || 0,
        reorderPoint: parseFloat(form.reorderPoint) || 0,
        leadTimeDays: parseFloat(form.leadTimeDays) || 0,
        standardCost: parseFloat(form.standardCost) || 0,
      };

      const result = await createMaterial.mutateAsync(payload);
      showToast({
        kind: 'success',
        title: 'Material created successfully',
        message: `“${payload.name}” was added to the catalog${payload.code?.trim() ? ` with code ${payload.code.trim()}` : ''}.`,
      });
      router.push(`/inventory/materials/${result.id}`);
    } catch (err) {
      showToast({
        kind: 'error',
        title: 'Material Registration Failed',
        message: friendlyErrorMessage(err),
      });
    }
  };

  const isSaving = createMaterial.isPending;

  const updateCustomField = (index: number, key: keyof MaterialCustomField, value: string) => {
    setCustomFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, [key]: value } : field));
  };

  return (
    <>
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-muted/20 min-h-screen">
        <div className="max-w-[1550px] mx-auto space-y-6">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Link href="/products" className="hover:text-primary transition-colors">
              Products Catalog
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
            <Link href="/inventory/materials" className="hover:text-primary transition-colors">
              Materials
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
            <span className="font-bold text-foreground">Create Material</span>
          </nav>

          {/* Page Header */}
          <PageHeader
            title="Create Raw Material & Component"
            actions={
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/inventory/materials')}
                  className="h-10 px-4 rounded-xl text-sm font-bold"
                  icon={ArrowLeft}
                >
                  Back to materials
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => { setForm(INITIAL_FORM); setCustomFields([{ name: '', value: '' }]); }}
                  className="h-10 px-4 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground"
                  icon={RotateCcw}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="h-10 px-5 rounded-xl text-sm font-bold bg-primary hover:bg-[#003c68] text-white shadow-sm"
                  icon={Save}
                >
                  {isSaving ? 'Registering Material...' : 'Create Material'}
                </Button>
              </div>
            }
          />

          {/* Main Form Grid */}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT 8 COLUMNS: FORM CARDS */}
            <div className="lg:col-span-12 flex flex-col space-y-6">

              {/* SECTION 01: MATERIAL IDENTITY */}
              <div className="order-1 bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
                <div className="px-6 py-4.5 border-b border-border/70 flex items-center justify-between gap-3 bg-card">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-sm font-black shadow-xs ring-2 ring-primary/20">
                      01
                    </div>
                    <h2 className="text-base font-bold text-foreground tracking-tight">
                      Material Identity & Classification
                    </h2>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* 1.1 Name & Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-1.5 text-sm font-bold text-foreground mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        Material Name & Specification
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-bold text-foreground mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        Part Code / Material SKU
                      </label>
                      <input
                        type="text"
                        required
                        value={form.code}
                        onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                        className="w-full h-10 px-3.5 font-mono font-bold uppercase rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* 1.2 Type & Category */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-bold text-foreground mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        Material Type Classification
                      </label>
                      <select
                        required
                        value={form.materialType}
                        onChange={(e) => handleChange('materialType', e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      >
                        <option value="RAW_MATERIAL">RAW_MATERIAL (SS Pipes, Rods, Coils)</option>
                        <option value="HARDWARE">HARDWARE (Fasteners, Rivets, Screws)</option>
                        <option value="COMPONENT">COMPONENT (Moulded PP Knuckles, Wheels)</option>
                        <option value="PACKAGING">PACKAGING (Corrugated Cartons, Wrap)</option>
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-sm font-bold text-foreground mb-1.5">
                        <span>Item Category</span>
                        <button type="button" onClick={() => setInlineMasterData('category')} className="text-xs font-bold text-primary hover:underline">+ Create</button>
                      </label>
                      <select
                        value={form.categoryId}
                        onChange={(e) => handleChange('categoryId', e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      >
                        <option value="">Select Category (Optional)...</option>
                        {categories.data?.items.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.code} — {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Lifecycle State
                      </label>
                      <div className="h-10 px-3.5 rounded-xl border border-input bg-muted/30 flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Standard Inventory</span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-black bg-primary/10 text-primary border border-primary/20">
                          ACTIVE
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 1.3 Description */}
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-1.5">
                      Technical Material Description
                    </label>
                    <textarea
                      rows={2}
                      value={form.description}
                      onChange={(e) => handleChange('description', e.target.value)}
                      className="w-full p-3.5 rounded-xl border border-input bg-background text-sm font-medium text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 03: METALLURGICAL SPECS */}
              <div className="order-3 bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
                <div className="px-6 py-4.5 border-b border-border/70 flex items-center justify-between gap-3 bg-card">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-sm font-black shadow-xs ring-2 ring-primary/20">
                      03
                    </div>
                    <h2 className="text-base font-bold text-foreground tracking-tight">
                      Metallurgical & Physical Specifications
                    </h2>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">Custom material specifications</p>
                      <p className="mt-1 text-xs text-muted-foreground">Add only the metallurgical or physical attributes relevant to this material.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setCustomFields((current) => [...current, { name: '', value: '' }])} icon={Plus}>Add custom field</Button>
                  </div>
                  <div className="space-y-3">
                    {customFields.map((field, index) => (
                      <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_40px] items-center gap-3">
                        <input type="text" value={field.name} onChange={(event) => updateCustomField(index, 'name', event.target.value)} placeholder="Field name (e.g. Alloy Grade)" className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
                        <input type="text" value={field.value} onChange={(event) => updateCustomField(index, 'value', event.target.value)} placeholder="Value (e.g. SS 304)" className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
                        <button type="button" onClick={() => setCustomFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))} aria-label="Remove custom field" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 02: PROCUREMENT & INVENTORY */}
              <div className="order-2 bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
                <div className="px-6 py-4.5 border-b border-border/70 flex items-center justify-between gap-3 bg-card">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white font-mono text-sm font-black shadow-xs ring-2 ring-primary/20">
                      02
                    </div>
                    <h2 className="text-base font-bold text-foreground tracking-tight">
                      Procurement Cost & Warehouse Inventory Thresholds
                    </h2>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* 2.1 Costing & MOQ */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="flex items-center justify-between text-sm font-bold text-foreground mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Base UOM
                        </span>
                        <button type="button" onClick={() => setInlineMasterData('uom')} className="text-xs font-bold text-primary hover:underline">+ Create</button>
                      </label>
                      <select
                        required
                        value={form.uomId}
                        onChange={(event) => handleChange('uomId', event.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      >
                        <option value="" disabled>
                          {uoms.isLoading ? 'Loading UOMs...' : 'Select UOM'}
                          {uoms.isLoading ? 'Loading UOMs...' : 'Select UOM'}
                        </option>
                        {(uoms.data?.items || []).map((uom) => (
                          <option key={uom.id} value={uom.id}>
                            {uom.code} — {uom.name} ({uom.symbol || 'u'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Standard Cost (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-sm font-bold text-primary">₹</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0.00"
                          value={!form.standardCost || form.standardCost === '0' ? '' : form.standardCost}
                          onChange={(e) => handleChange('standardCost', e.target.value)}
                          onWheel={(e) => handleNumberInputWheel(e, form.standardCost, (val) => handleChange('standardCost', val))}
                          onKeyDown={(e) => handleNumberInputKeyDown(e, form.standardCost, (val) => handleChange('standardCost', val))}
                          className="w-full h-10 pl-8 pr-3.5 rounded-xl border border-input bg-background text-sm font-bold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Minimum Order (MOQ)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={!form.moq || form.moq === '0' ? '' : form.moq}
                        onChange={(e) => handleChange('moq', e.target.value)}
                        onWheel={(e) => handleNumberInputWheel(e, form.moq, (val) => handleChange('moq', val))}
                        onKeyDown={(e) => handleNumberInputKeyDown(e, form.moq, (val) => handleChange('moq', val))}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Lead Time (Days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={!form.leadTimeDays || form.leadTimeDays === '0' ? '' : form.leadTimeDays}
                        onChange={(e) => handleChange('leadTimeDays', e.target.value)}
                        onWheel={(e) => handleNumberInputWheel(e, form.leadTimeDays, (val) => handleChange('leadTimeDays', val))}
                        onKeyDown={(e) => handleNumberInputKeyDown(e, form.leadTimeDays, (val) => handleChange('leadTimeDays', val))}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* 2.2 Safety Buffers & Storage Yard */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Minimum Safety Stock
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={!form.minStockLevel || form.minStockLevel === '0' ? '' : form.minStockLevel}
                        onChange={(e) => handleChange('minStockLevel', e.target.value)}
                        onWheel={(e) => handleNumberInputWheel(e, form.minStockLevel, (val) => handleChange('minStockLevel', val))}
                        onKeyDown={(e) => handleNumberInputKeyDown(e, form.minStockLevel, (val) => handleChange('minStockLevel', val))}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Reorder Threshold
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={!form.reorderPoint || form.reorderPoint === '0' ? '' : form.reorderPoint}
                        onChange={(e) => handleChange('reorderPoint', e.target.value)}
                        onWheel={(e) => handleNumberInputWheel(e, form.reorderPoint, (val) => handleChange('reorderPoint', val))}
                        onKeyDown={(e) => handleNumberInputKeyDown(e, form.reorderPoint, (val) => handleChange('reorderPoint', val))}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-foreground mb-1.5">
                        Default Storage Location
                      </label>
                      <select
                        value={form.warehouseLocationId}
                        onChange={(e) => handleChange('warehouseLocationId', e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      >
                        <option value="">Select Storage Location...</option>
                        {locations.data?.items.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} — {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM ACTION BUTTONS */}
            <div className="lg:col-span-12 flex items-center justify-end gap-3 pt-4 pb-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/inventory/materials')}
                className="h-10 px-5 rounded-xl text-sm font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="h-10 px-6 rounded-xl text-sm font-bold bg-primary hover:bg-[#003c68] text-white shadow-sm"
                icon={Save}
              >
                {isSaving ? 'Registering Material...' : 'Create Material'}
              </Button>
            </div>
          </form>
        </div>
      </div>
      <InlineMasterDataDialog
        kind={inlineMasterData || 'category'}
        open={inlineMasterData !== null}
        onClose={() => setInlineMasterData(null)}
        onCreated={(createdId) => {
          if (inlineMasterData === 'category') setForm((current) => ({ ...current, categoryId: createdId }));
          if (inlineMasterData === 'uom') setForm((current) => ({ ...current, uomId: createdId }));
        }}
      />
    </>
  );
}
