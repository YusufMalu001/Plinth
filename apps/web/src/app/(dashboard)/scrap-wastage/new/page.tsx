"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useReportLossEvent } from '@/features/loss-management/hooks';
import { useApprovedProducts, useApprovedMaterials, useActiveUOMs, useProcurementSelectors } from '@/features/purchases/hooks';
import { LossSourceType } from '@plinth/types';
import {
  Card,
  Button,
} from '@plinth/ui';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { EvidenceAttachmentField } from '@/features/loss-management/components/EvidenceAttachmentField';
import {
  ArrowLeft,
  Trash2,
  Package,
  Building2,
  Warehouse,
  AlertCircle,
  Link as LinkIcon,
  Info,
  Truck,
  Cog,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Plus,
} from 'lucide-react';
import { DepartmentDialog } from '@/components/DepartmentDialog';

export type LossScenarioId =
  | 'RAW_MATERIAL_QC_FAILURE'
  | 'PRODUCTION_WIP_DEFECT'
  | 'FINAL_GOODS_QC_DEFECT'
  | 'CUSTOMER_TRADER_RETURN';

interface ScenarioConfig {
  id: LossScenarioId;
  scenarioNum: string;
  title: string;
  tagline: string;
  description: string;
  badge: string;
  icon: React.ElementType;
  accentColor: string;
  defaultItemType: 'MATERIAL' | 'PRODUCT';
  defaultSourceType: LossSourceType;
  reasonPresets: string[];
}

const REGISTRATION_SCENARIOS: ScenarioConfig[] = [
  {
    id: 'RAW_MATERIAL_QC_FAILURE',
    scenarioNum: '01',
    title: 'Raw Material Arrival QC Failure',
    tagline: 'Inward dock receiving & QC rules check',
    description: 'Raw material arrives and fails incoming QC rules or is physically damaged during delivery.',
    badge: '1. Inward Raw Material QC',
    icon: Truck,
    accentColor: 'from-amber-500/10 to-amber-500/5 border-amber-300 dark:border-amber-700/60 text-amber-600 dark:text-amber-400',
    defaultItemType: 'MATERIAL',
    defaultSourceType: 'QC_REJECTION_NO_BATCH',
    reasonPresets: [
      'Raw material batch failed incoming QC chemical / physical test rules',
      'Raw material arrived physically damaged / crushed during transit',
      'Supplier delivered non-compliant material grade / dimension mismatch',
      'Moisture damage / surface oxidation discovered on unloading raw material coils',
    ],
  },
  {
    id: 'PRODUCTION_WIP_DEFECT',
    scenarioNum: '02',
    title: 'In-Process Semi-Finished Defect',
    tagline: 'WIP production run & shopfloor operations',
    description: 'During a production run while making semi-finished goods, a damaged or faulty product/part is obtained.',
    badge: '2. In-Process WIP Run',
    icon: Cog,
    accentColor: 'from-blue-500/10 to-blue-500/5 border-blue-300 dark:border-blue-700/60 text-blue-600 dark:text-blue-400',
    defaultItemType: 'PRODUCT',
    defaultSourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
    reasonPresets: [
      'Machine overheating / mechanical jamming damaged semi-finished parts in process',
      'CNC cutting / tooling breakdown produced out-of-spec dimensions',
      'Intermediate welding / bending seam crack detected during department run',
      'Shopfloor transfer drop / collision damage during intermediate handover',
    ],
  },
  {
    id: 'FINAL_GOODS_QC_DEFECT',
    scenarioNum: '03',
    title: 'Final Goods Assembly QC Defect',
    tagline: 'Post-assembly inspection & final QA check',
    description: 'When inspecting final goods, damaged or faulty product is obtained after assembly of semi-finished goods.',
    badge: '3. Final Goods Assembly QA',
    icon: ShieldAlert,
    accentColor: 'from-rose-500/10 to-rose-500/5 border-rose-300 dark:border-rose-700/60 text-rose-600 dark:text-rose-400',
    defaultItemType: 'PRODUCT',
    defaultSourceType: 'QC_REJECTION_NO_BATCH',
    reasonPresets: [
      'Final electrical / operational functional test failure post-assembly',
      'Assembled parts misalignment / fitment tolerance failure observed in QA',
      'Surface coating / paint finish blemish exceeding QA visual standards',
      'Packaging & outer enclosure distortion identified at final QA checkpoint',
    ],
  },
  {
    id: 'CUSTOMER_TRADER_RETURN',
    scenarioNum: '04',
    title: 'Customer / Trader Defective Return',
    tagline: 'RMA, field returns & dealer defect claims',
    description: 'A return received from the User/Trader/Customer that is damaged, faulty, or has any loss, error, or fault.',
    badge: '4. Customer / Trader RMA',
    icon: RotateCcw,
    accentColor: 'from-purple-500/10 to-purple-500/5 border-purple-300 dark:border-purple-700/60 text-purple-600 dark:text-purple-400',
    defaultItemType: 'PRODUCT',
    defaultSourceType: 'MANUAL_REPORT',
    reasonPresets: [
      'Customer received broken / damaged product in courier transit',
      'Trader return: defective unit returned under warranty claim',
      'Customer rejected shipment due to performance fault / functional defect',
      'Dealer return: product malfunction observed within return/warranty window',
    ],
  },
];

export default function NewLossEventPage() {
  const router = useRouter();
  const reportLossMutation = useReportLossEvent();
  const { data: products, isLoading: productsLoading } = useApprovedProducts();
  const { data: materials, isLoading: materialsLoading } = useApprovedMaterials();
  const { data: uoms } = useActiveUOMs();
  const { data: selectors } = useProcurementSelectors();

  const [selectedScenario, setSelectedScenario] = useState<LossScenarioId>('RAW_MATERIAL_QC_FAILURE');
  const [itemType, setItemType] = useState<'MATERIAL' | 'PRODUCT'>('MATERIAL');
  const [sourceType, setSourceType] = useState<LossSourceType>('QC_REJECTION_NO_BATCH');
  const [form, setForm] = useState({
    materialId: '',
    productId: '',
    uomId: '',
    locationId: '',
    departmentId: '',
    quantity: '',
    reason: REGISTRATION_SCENARIOS[0].reasonPresets[0],
    sourceExceptionRecordId: '',
    sourceDiscrepancyId: '',
    sourceInspectionResultId: '',
  });
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [createDeptOpen, setCreateDeptOpen] = useState(false);

  const activeScenarioConfig = useMemo(
    () => REGISTRATION_SCENARIOS.find((s) => s.id === selectedScenario) || REGISTRATION_SCENARIOS[0],
    [selectedScenario]
  );

  const handleSelectScenario = (scenarioId: LossScenarioId) => {
    setSelectedScenario(scenarioId);
    const config = REGISTRATION_SCENARIOS.find((s) => s.id === scenarioId);
    if (config) {
      setItemType(config.defaultItemType);
      setSourceType(config.defaultSourceType);
      setForm((prev) => ({
        ...prev,
        reason: config.reasonPresets[0] || '',
        materialId: config.defaultItemType === 'MATERIAL' ? prev.materialId : '',
        productId: config.defaultItemType === 'PRODUCT' ? prev.productId : '',
      }));
    }
  };

  const materialOptions = useMemo(
    () =>
      (materials?.items ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        status: m.status,
        uomId: m.uomId,
      })),
    [materials?.items]
  );

  const productOptions = useMemo(
    () =>
      (products?.items ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        status: p.status,
        uomId: p.uomId,
      })),
    [products?.items]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (itemType === 'MATERIAL' && !form.materialId) {
      setFormError('Please select a raw material.');
      return;
    }
    if (itemType === 'PRODUCT' && !form.productId) {
      setFormError('Please select a finished or semi-finished product.');
      return;
    }
    if (!form.uomId) {
      setFormError('Unit of Measure is required.');
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    if (!form.reason.trim() || form.reason.trim().length < 3) {
      setFormError('Reason is required (minimum 3 characters).');
      return;
    }

    // Source Reference Validation
    if (sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION' && !form.sourceExceptionRecordId.trim()) {
      setFormError('Source Exception Record UUID is required for Department Execution exceptions.');
      return;
    }
    if (sourceType === 'GRN_DISCREPANCY' && !form.sourceDiscrepancyId.trim()) {
      setFormError('Source GRN Discrepancy UUID is required for GRN discrepancy reporting.');
      return;
    }
    if (sourceType === 'QC_REJECTION_NO_BATCH' && !form.sourceInspectionResultId.trim()) {
      setFormError('Source Inspection Result UUID is required for QC rejection reports.');
      return;
    }

    try {
      const res = await reportLossMutation.mutateAsync({
        sourceType,
        materialId: itemType === 'MATERIAL' ? form.materialId : undefined,
        productId: itemType === 'PRODUCT' ? form.productId : undefined,
        uomId: form.uomId,
        locationId: form.locationId || undefined,
        departmentId: form.departmentId || undefined,
        quantity: Number(form.quantity),
        reason: form.reason.trim(),
        sourceExceptionRecordId:
          sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION'
            ? form.sourceExceptionRecordId.trim()
            : undefined,
        sourceDiscrepancyId:
          sourceType === 'GRN_DISCREPANCY'
            ? form.sourceDiscrepancyId.trim()
            : undefined,
        sourceInspectionResultId:
          sourceType === 'QC_REJECTION_NO_BATCH'
            ? form.sourceInspectionResultId.trim()
            : undefined,
      });

      if (res?.id) {
        router.push(`/scrap-wastage/${res.id}`);
      } else {
        router.push('/scrap-wastage');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to record loss event.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/scrap-wastage"
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Report Scrap, Wastage & Defect Event
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select one of the 4 operational scenarios to register raw material QC failure, WIP defects, assembly rejects, or customer returns.
            </p>
          </div>
        </div>

        {formError && (
          <div className="flex items-center gap-2.5 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* 4 REGISTRATION SCENARIOS SELECTOR */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Choose Scrap & Wastage Scenario *
            </span>
            <span className="text-[11px] font-semibold text-primary">
              Scenario {activeScenarioConfig.scenarioNum} Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {REGISTRATION_SCENARIOS.map((sc) => {
              const Icon = sc.icon;
              const isSelected = selectedScenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleSelectScenario(sc.id)}
                  className={`text-left p-4 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between ${
                    isSelected
                      ? `border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs`
                      : 'border-border bg-card hover:bg-muted/40 hover:border-border/80'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted text-muted-foreground'
                      }`}>
                        {sc.scenarioNum}
                      </div>
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <h3 className={`text-xs font-bold leading-tight ${isSelected ? 'text-foreground font-black' : 'text-foreground'}`}>
                        {sc.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {sc.tagline}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                    <span>{sc.defaultItemType === 'MATERIAL' ? 'Raw Material' : 'Product / SKU'}</span>
                    {isSelected && (
                      <span className="text-primary font-bold inline-flex items-center gap-0.5">
                        <Sparkles className="w-3 h-3" /> Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Scenario Context & Origin Linkage */}
          <Card className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  1. Scenario Context & Source Channel
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                {activeScenarioConfig.badge}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {activeScenarioConfig.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Source Channel *
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as LossSourceType)}
                  className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
                >
                  <option value="QC_REJECTION_NO_BATCH">QC Inspection Rejection (Inward / FG QA)</option>
                  <option value="DEPARTMENT_EXECUTION_EXCEPTION">Department Execution WIP Exception (Shopfloor Run)</option>
                  <option value="GRN_DISCREPANCY">Goods Receipt Discrepancy (Inward Dock)</option>
                  <option value="MANUAL_REPORT">Manual Shopfloor / Customer Return / Warehouse Report</option>
                </select>
              </div>

              {sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Source Exception Record ID (UUID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    value={form.sourceExceptionRecordId}
                    onChange={(e) => setForm({ ...form, sourceExceptionRecordId: e.target.value })}
                    className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
              )}

              {sourceType === 'GRN_DISCREPANCY' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Source GRN Discrepancy ID (UUID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    value={form.sourceDiscrepancyId}
                    onChange={(e) => setForm({ ...form, sourceDiscrepancyId: e.target.value })}
                    className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
              )}

              {sourceType === 'QC_REJECTION_NO_BATCH' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Source QC Inspection Result ID (UUID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    value={form.sourceInspectionResultId}
                    onChange={(e) => setForm({ ...form, sourceInspectionResultId: e.target.value })}
                    className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Section 2: Material / Product Details */}
          <Card className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  2. Item Selection & Physical Quantities
                </h3>
              </div>
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setItemType('MATERIAL');
                    setForm((f) => ({ ...f, productId: '', uomId: '' }));
                  }}
                  className={`px-3 py-1 rounded-md transition-all ${
                    itemType === 'MATERIAL'
                      ? 'bg-background text-foreground shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Raw Material
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemType('PRODUCT');
                    setForm((f) => ({ ...f, materialId: '', uomId: '' }));
                  }}
                  className={`px-3 py-1 rounded-md transition-all ${
                    itemType === 'PRODUCT'
                      ? 'bg-background text-foreground shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {selectedScenario === 'PRODUCTION_WIP_DEFECT' ? 'Semi-Finished / Product' : 'Finished Product'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Item Selector */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Select {itemType === 'MATERIAL' ? 'Raw Material' : (selectedScenario === 'PRODUCTION_WIP_DEFECT' ? 'Semi-Finished Product / WIP Item' : 'Finished Product')} *
                </label>
                {itemType === 'MATERIAL' ? (
                  <SearchableSelector
                    value={form.materialId}
                    onChange={(val) => {
                      const mat = materials?.items?.find((m) => m.id === val);
                      setForm((f) => ({
                        ...f,
                        materialId: val,
                        uomId: mat?.uomId || f.uomId,
                      }));
                    }}
                    options={materialOptions}
                    placeholder="Search material by name or code..."
                    isLoading={materialsLoading}
                  />
                ) : (
                  <SearchableSelector
                    value={form.productId}
                    onChange={(val) => {
                      const prod = products?.items?.find((p) => p.id === val);
                      setForm((f) => ({
                        ...f,
                        productId: val,
                        uomId: prod?.uomId || f.uomId,
                      }));
                    }}
                    options={productOptions}
                    placeholder="Search product by name or SKU..."
                    isLoading={productsLoading}
                  />
                )}
              </div>

              {/* UOM Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Unit of Measure (UOM) *
                </label>
                <select
                  value={form.uomId}
                  onChange={(e) => setForm({ ...form, uomId: e.target.value })}
                  required
                  className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select UOM...</option>
                  {(uoms?.items ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol || u.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Lost / Damaged Quantity *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  required
                  placeholder="0.000"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full h-9 px-3 text-xs font-mono font-bold bg-background border border-border rounded-lg text-foreground"
                />
              </div>

              {/* Department */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    Originating Department (Optional)
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
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground"
                >
                  <option value="">Select department...</option>
                  {(selectors?.departments.items ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse Location */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-primary" />
                  Warehouse Location (Optional)
                </label>
                <select
                  value={form.locationId}
                  onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                  className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground"
                >
                  <option value="">Select storage location...</option>
                  {(selectors?.locations.items ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* Section 3: Reason, Justification & Evidence */}
          <Card className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Info className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                3. Reason & Evidence Attachments
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Scenario {activeScenarioConfig.scenarioNum} Reason Shortcuts
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {activeScenarioConfig.reasonPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, reason: preset }))}
                      className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-[11px] text-muted-foreground hover:text-foreground border border-border transition-colors text-left"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Justification Reason & Observation Notes *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder={`Provide explicit operational context for Scenario ${activeScenarioConfig.scenarioNum}...`}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full p-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <EvidenceAttachmentField
                evidenceUrls={evidenceUrls}
                onChange={setEvidenceUrls}
              />
            </div>
          </Card>

          {/* Footer Submission Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/scrap-wastage">
              <Button type="button" variant="outline" className="h-10 px-5 text-xs">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={reportLossMutation.isPending}
              className="h-10 px-6 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              {reportLossMutation.isPending ? 'Recording Loss Event...' : `Submit Loss Report (${activeScenarioConfig.badge})`}
            </Button>
          </div>
        </form>
        <DepartmentDialog
          open={createDeptOpen}
          onClose={() => setCreateDeptOpen(false)}
          onCreated={(newDept) => setForm({ ...form, departmentId: newDept.id })}
        />
      </div>
    </div>
  );
}
