'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  Button,
  Input,
} from '@plinth/ui';
import {
  Trash2,
  Truck,
  Cog,
  ShieldAlert,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useReportLossEvent } from '@/features/loss-management/hooks';
import { EvidenceAttachmentField } from '@/features/loss-management/components/EvidenceAttachmentField';
import { showToast } from '@/components/toast-store';
import type { LossSourceType } from '@plinth/types';

export type LossScenarioId =
  | 'RAW_MATERIAL_QC_FAILURE'
  | 'PRODUCTION_WIP_DEFECT'
  | 'FINAL_GOODS_QC_DEFECT'
  | 'CUSTOMER_TRADER_RETURN';

interface ScenarioOption {
  id: LossScenarioId;
  scenarioNum: string;
  title: string;
  tagline: string;
  badge: string;
  icon: React.ElementType;
  accentColor: string;
  borderActive: string;
  bgLight: string;
  sourceType: LossSourceType;
  defaultItemType: 'MATERIAL' | 'PRODUCT';
  reasonPresets: string[];
}

const SCENARIOS: ScenarioOption[] = [
  {
    id: 'RAW_MATERIAL_QC_FAILURE',
    scenarioNum: '01',
    title: 'Raw Material Arrival QC Failure',
    tagline: 'Inward dock receiving & raw material inspection',
    badge: '1. Inward Raw Material QC',
    icon: Truck,
    accentColor: 'text-primary',
    borderActive: 'border-primary ring-2 ring-primary/20 bg-primary/5',
    bgLight: 'bg-primary/10 text-primary',
    sourceType: 'QC_REJECTION_NO_BATCH',
    defaultItemType: 'MATERIAL',
    reasonPresets: [
      'Raw material batch failed incoming QC chemical / physical test rules',
      'Raw material arrived physically damaged / crushed during transit',
      'Supplier delivered non-compliant material grade / dimension mismatch',
      'Moisture damage / surface oxidation discovered on unloading coils',
    ],
  },
  {
    id: 'PRODUCTION_WIP_DEFECT',
    scenarioNum: '02',
    title: 'In-Process Semi-Finished Defect',
    tagline: 'WIP production floor & stage manufacturing run',
    badge: '2. In-Process WIP Run',
    icon: Cog,
    accentColor: 'text-link ',
    borderActive: 'border-tone-blue-solid ring-2 ring-accent-brand/20 bg-tone-blue-bg/5',
    bgLight: 'bg-tone-blue-bg/10 text-link ',
    sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
    defaultItemType: 'PRODUCT',
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
    tagline: 'Post-assembly inspection & final QA checkpoint',
    badge: '3. Final Goods Assembly QA',
    icon: ShieldAlert,
    accentColor: 'text-tone-red-text ',
    borderActive: 'border-tone-red-solid ring-2 ring-tone-red-solid/20 bg-tone-rose-bg/5',
    bgLight: 'bg-tone-rose-bg/10 text-tone-red-text ',
    sourceType: 'QC_REJECTION_NO_BATCH',
    defaultItemType: 'PRODUCT',
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
    tagline: 'RMA, field warranty claims & return defectives',
    badge: '4. Customer / Trader RMA',
    icon: RotateCcw,
    accentColor: 'text-tone-purple-text ',
    borderActive: 'border-tone-purple-solid ring-2 ring-tone-purple-solid/20 bg-tone-purple-bg/5',
    bgLight: 'bg-tone-purple-bg/10 text-tone-purple-text ',
    sourceType: 'MANUAL_REPORT',
    defaultItemType: 'PRODUCT',
    reasonPresets: [
      'Customer received broken / damaged product in courier transit',
      'Trader return: defective unit returned under warranty claim',
      'Customer rejected shipment due to performance fault / functional defect',
      'Dealer return: product malfunction observed within warranty window',
    ],
  },
];

export interface ReportLossModalProps {
  open: boolean;
  onClose: () => void;
  // Context defaults passed from Production Schedule or Assembly Batch
  defaultScenario?: LossScenarioId;
  contextType: 'PRODUCTION_SCHEDULE' | 'ASSEMBLY_BATCH';
  batchId?: string;
  batchNumber?: string;
  departmentId?: string;
  departmentName?: string;
  productId?: string | null;
  productName?: string | null;
  productSku?: string | null;
  materialId?: string | null;
  materialName?: string | null;
  uomId?: string | null;
  uomSymbol?: string | null;
  components?: Array<{
    id: string;
    materialId?: string | null;
    productId?: string | null;
    materialName?: string | null;
    productName?: string | null;
    itemCode?: string | null;
    uomId?: string | null;
    uomCode?: string | null;
  }>;
  initialQuantity?: number | string;
  initialReason?: string;
  onSuccess?: () => void;
}

export function ReportLossModal({
  open,
  onClose,
  defaultScenario = 'PRODUCTION_WIP_DEFECT',
  contextType,
  batchId,
  batchNumber,
  departmentId,
  departmentName,
  productId,
  productName,
  productSku,
  materialId,
  materialName,
  uomId,
  uomSymbol = 'units',
  components,
  initialQuantity,
  initialReason,
  onSuccess,
}: ReportLossModalProps) {
  const reportLossMutation = useReportLossEvent();

  const [selectedScenario, setSelectedScenario] = useState<LossScenarioId>(defaultScenario);
  const [selectedComponentId, setSelectedComponentId] = useState<string>('');
  const [quantity, setQuantity] = useState(initialQuantity ? String(initialQuantity) : '');
  const [reason, setReason] = useState(initialReason || '');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync default scenario when opening modal
  React.useEffect(() => {
    if (open) {
      setSelectedScenario(defaultScenario);
      setSelectedComponentId('');
      setQuantity(initialQuantity ? String(initialQuantity) : '');
      setReason(initialReason || '');
      setEvidenceUrls([]);
      setErrorMsg(null);
    }
  }, [open, defaultScenario, initialQuantity, initialReason]);

  const currentScenario = useMemo(
    () => SCENARIOS.find((s) => s.id === selectedScenario) || SCENARIOS[1],
    [selectedScenario]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setErrorMsg('Please specify a valid quantity greater than 0.');
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('Please provide a root cause or defect reason.');
      return;
    }

    try {
      // If a specific component was chosen in Assembly Batch, prioritize it
      const chosenComp = components?.find((c) => c.id === selectedComponentId);
      const isMaterial = chosenComp
        ? Boolean(chosenComp.materialId)
        : currentScenario.defaultItemType === 'MATERIAL' && Boolean(materialId);

      const targetMaterialId = chosenComp
        ? chosenComp.materialId || null
        : isMaterial
        ? materialId
        : null;

      const targetProductId = chosenComp
        ? chosenComp.productId || null
        : !isMaterial && productId
        ? productId
        : null;

      const targetUomId = chosenComp?.uomId || uomId;

      if (!targetMaterialId && !targetProductId) {
        setErrorMsg('Item reference (Product or Material ID) is required to register a scrap proposal.');
        return;
      }

      if (!targetUomId) {
        setErrorMsg('A unit of measure is missing for the selected item. Check the item or component UOM setup and try again.');
        return;
      }

      const compTag = chosenComp
        ? ` [Component: ${chosenComp.materialName || chosenComp.productName || chosenComp.itemCode || 'Kit Part'}]`
        : '';

      await reportLossMutation.mutateAsync({
        sourceType: 'MANUAL_REPORT',
        sourceExceptionRecordId: null,
        materialId: targetMaterialId,
        productId: targetProductId,
        uomId: targetUomId,
        departmentId: departmentId || null,
        quantity: parsedQty,
        reason: `[${currentScenario.badge}] [${contextType === 'ASSEMBLY_BATCH' ? `Assembly Batch: ${batchNumber || batchId}` : `Stage Batch: ${batchNumber || batchId}`}]${compTag} ${reason.trim()}`,
      });

      showToast({
        kind: 'success',
        title: 'Loss Event Registered',
        message: `${parsedQty} ${uomSymbol} logged into Scrap & Wastage register.`,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit loss report.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report Loss, Scrap & Wastage"
      description=""
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1 text-xs max-h-[80vh] overflow-y-auto pr-1">
        {errorMsg && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current Batch Context Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">
              {contextType === 'ASSEMBLY_BATCH' ? 'Assembly Batch:' : 'Stage Batch:'}
            </span>
            <span className="font-mono font-bold text-primary">{batchNumber || batchId || 'N/A'}</span>
            {departmentName && (
              <span className="text-[11px] text-muted-foreground">({departmentName})</span>
            )}
          </div>
          <div className="text-right">
            <span className="font-bold text-foreground">{productName || materialName || 'Item'}</span>
            {productSku && (
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {productSku}
              </span>
            )}
          </div>
        </div>

        {/* Assembly Component Selector (When context is ASSEMBLY_BATCH and components exist) */}
        {components && components.length > 0 && (
          <div className="p-3 bg-muted/20 border border-border/80 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground block">
                Assembly Component Line (Optional — select if a specific kit component was scrapped)
              </label>
              <span className="text-[10px] text-primary font-semibold">Store Manager Replenishment Link</span>
            </div>
            <select
              value={selectedComponentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Full Finished Assembly — {productName || 'FG'}</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.materialName || c.productName || c.itemCode || 'Component'} ({c.uomCode || 'units'})
                </option>
              ))}
            </select>

          </div>
        )}
        {/* 4 Loss Scenarios Grid */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
            Select Applicable Loss Scenario <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              const isSelected = selectedScenario === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => {
                    setSelectedScenario(scenario.id);
                    if (scenario.reasonPresets.length > 0 && !reason) {
                      setReason(scenario.reasonPresets[0]);
                    }
                  }}
                  className={`text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    isSelected
                      ? scenario.borderActive
                      : 'border-border bg-card hover:bg-muted/30 hover:border-border/80'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${scenario.bgLight} shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground truncate">
                      {scenario.title}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground ml-2 shrink-0">
                      #{scenario.scenarioNum}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quantity & Reason Form */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Quantity Scrapped / Lost <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                type="number"
                min="0.001"
                step="any"
                placeholder="e.g. 5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="text-xs font-mono pr-12 rounded-xl"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground font-semibold">
                {uomSymbol}
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-foreground">
                Root Cause / Justification <span className="text-destructive">*</span>
              </label>
              <span className="text-[10px] text-muted-foreground">Quick Presets below</span>
            </div>
            <Input
              type="text"
              placeholder="e.g. Mechanical tool collision caused fracture on mandrel seam"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs rounded-xl"
              required
            />
          </div>
        </div>



        {/* Evidence Photo / Document Upload */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-bold text-foreground block">
            Attach Defect / Scrap Evidence Photos (Optional)
          </label>
          <EvidenceAttachmentField
            evidenceUrls={evidenceUrls}
            onChange={(urls) => setEvidenceUrls(urls)}
          />
        </div>

        {/* Footer Actions */}
      <div className="flex items-center justify-end pt-3 border-t border-border gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={reportLossMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={reportLossMutation.isPending || !quantity || !reason.trim()}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold gap-1.5 shadow-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {reportLossMutation.isPending ? 'Reporting...' : 'Submit Loss Report'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
