"use client";

import React from 'react';
import { X, Printer, ShieldCheck } from 'lucide-react';
import { Button } from '@plinth/ui';
import type { DetailedMaterial } from './MaterialDetailWorkspace';
import { extractMaterialVariants } from '../../hooks/useMasterData';
import { getVariantLabel } from '../products/variant-names';

interface MaterialSpecSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: DetailedMaterial;
}

export function MaterialSpecSheetModal({ isOpen, onClose, material }: MaterialSpecSheetModalProps) {
  if (!isOpen) return null;

  const specs = (material.specs || {}) as Record<string, unknown>;
  const techSpecs = (specs.specifications || {}) as Record<string, string | undefined>;

  const standardCost = Number(specs.standardCost ?? (material as any).standardCost ?? 0);
  const minStockLevel = Number(specs.minStockLevel ?? (material as any).minStockLevel ?? 0);
  const reorderPoint = Number(specs.reorderPoint ?? (material as any).reorderPoint ?? 0);
  const targetMaxStock = Number(specs.targetMaxStock ?? 0);
  const leadTimeDays = Number(specs.leadTimeDays ?? (material as any).leadTimeDays ?? 0);
  const hsnCode = String(specs.hsnCode ?? specs.hsn ?? (material as any).hsnCode ?? '');
  const taxRate = Number(specs.taxRate ?? specs.gstRate ?? 18);
  const barcode = String(specs.barcode || material.code.replace(/[^A-Z0-9]/g, '') || '');

  const steelGrade = techSpecs.steelGrade || (specs.steelGrade as string) || (specs.materialGrade as string) || '';
  const surfaceFinish = techSpecs.surfaceFinish || (specs.surfaceFinish as string) || '';
  const loadCapacity = techSpecs.loadCapacity || (specs.loadCapacity as string) || '';
  const dimensions = techSpecs.dimensionsUnfolded || (specs.dimensions as string) || (specs.extendedDimensions as string) || '';
  const netWeight = techSpecs.netWeight || (specs.netWeight as string) || '';
  const grossWeight = techSpecs.grossWeight || (specs.grossWeight as string) || '';

  const materialTypeLabel = {
    RAW_MATERIAL: 'Raw Material / Steel Alloy',
    HARDWARE: 'Industrial Fastener / Hardware',
    PACKAGING: 'Carton / Master Packaging',
    COMPONENT: 'Precision Sub-Assembly',
    CONSUMABLE: 'Manufacturing Consumable',
    CHEMICAL: 'Surface Coating / Chemical',
  }[material.materialType] || material.materialType;

  const variants = extractMaterialVariants(material);
  const technicalFields = (Array.isArray(specs.technicalFields) ? specs.technicalFields : []) as Array<{ name?: string; value?: string }>;
  const customFields = (Array.isArray(specs.customFields) ? specs.customFields : []) as Array<{ name?: string; value?: string }>;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-200 spec-sheet-modal-overlay">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden spec-sheet-modal-box">
        {/* Modal Controls Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary">TECH-DOC-2026 // Plinth ERP</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={Printer} onClick={handlePrint}>
              Print Spec Sheet
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Technical Spec Document Body */}
        <div className="printable-spec-sheet flex-1 overflow-y-auto p-8 space-y-6 text-foreground bg-white dark:bg-zinc-950 print:p-0 print:bg-white print:text-slate-900">
          {/* Document Header */}
          <div className="flex items-start justify-between border-b-2 border-primary pb-6 print-avoid-break">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-base">
                  S
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-foreground uppercase print:text-slate-900">
                    Plinth Master Catalog
                  </h1>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase print:text-slate-500">
                    Technical Material Specification Sheet
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-2xl font-black text-foreground print:text-slate-900">{material.name}</h2>
                <p className="font-mono text-sm text-primary font-bold mt-0.5 print:text-[#004a80]">
                  CODE: {material.code} · REV v{material.version ?? 1}.0 · {material.status}
                </p>
              </div>
            </div>

            {/* Quick Identification Stamp */}
            <div className="text-right flex flex-col items-end space-y-1">
              <div className="h-14 w-36 border border-border rounded flex items-center justify-center bg-muted/20 font-mono text-[11px] font-bold print:border-slate-300 print:bg-slate-50">
                |||| ||| ||||| |||| ||
              </div>
              <span className="font-mono text-[11px] text-muted-foreground print:text-slate-600">
                {barcode || material.code}
              </span>
              {hsnCode && (
                <span className="text-[10px] font-mono text-muted-foreground print:text-slate-500">
                  HSN: {hsnCode}
                </span>
              )}
            </div>
          </div>

          {/* Section 1: Core Parameters */}
          <div className="print-avoid-break">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 print:text-[#004a80]">
              1. General & Logistics Parameters
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-border rounded-xl p-4 bg-muted/10 text-xs print:border-slate-300 print:bg-slate-50/70">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Material Classification</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{materialTypeLabel}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Base Unit of Measure</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{material.uom?.name || 'Units'} ({material.uom?.symbol || '—'})</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Standard Valuation Rate</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{standardCost > 0 ? `₹${standardCost.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Lead Time</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{leadTimeDays > 0 ? `${leadTimeDays} Days` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Safety Buffer (Min)</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{minStockLevel > 0 ? `${minStockLevel} ${material.uom?.symbol || ''}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Reorder Point (ROP)</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{reorderPoint > 0 ? `${reorderPoint} ${material.uom?.symbol || ''}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Max Capacity</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{targetMaxStock > 0 ? `${targetMaxStock} ${material.uom?.symbol || ''}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">GST / Tax Slab</p>
                <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{taxRate != null ? `${taxRate}%` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Description if present */}
          {material.description && (
            <div className="print-avoid-break">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-2 print:text-[#004a80]">
                Scope & Description
              </h3>
              <p className="text-xs text-foreground bg-muted/10 border border-border rounded-xl p-4 leading-relaxed whitespace-pre-line print:border-slate-300">
                {material.description}
              </p>
            </div>
          )}

          {/* Section 2: Physical & Engineering Specs (Only if provided) */}
          {(steelGrade || surfaceFinish || loadCapacity || dimensions || netWeight || grossWeight) && (
            <div className="print-avoid-break">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 print:text-[#004a80]">
                2. Physical & Engineering Attributes
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border border-border rounded-xl p-4 bg-muted/10 text-xs print:border-slate-300 print:bg-slate-50/70">
                {steelGrade && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Steel / Material Grade</p>
                    <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{steelGrade}</p>
                  </div>
                )}
                {surfaceFinish && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Surface Finish</p>
                    <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{surfaceFinish}</p>
                  </div>
                )}
                {loadCapacity && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Load Capacity</p>
                    <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{loadCapacity}</p>
                  </div>
                )}
                {dimensions && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Dimensions</p>
                    <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{dimensions}</p>
                  </div>
                )}
                {netWeight && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Net Weight</p>
                    <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{netWeight}</p>
                  </div>
                )}
                {grossWeight && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500">Gross Weight</p>
                    <p className="font-semibold text-foreground mt-0.5 print:text-slate-900">{grossWeight}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Configured Variants (if any) */}
          {variants.length > 0 && (
            <div className="print-avoid-break">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 print:text-[#004a80]">
                3. Configured Material Variants ({variants.length})
              </h3>
              <table className="w-full text-left text-xs border border-border rounded-xl overflow-hidden print:border-slate-300">
                <thead className="bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground print:bg-slate-100 print:text-slate-600">
                  <tr className="border-b border-border print:border-slate-300">
                    <th className="p-2.5">Variant Name</th>
                    <th className="p-2.5">Code / SKU</th>
                    <th className="p-2.5">Specification / Type</th>
                    <th className="p-2.5 text-right">Opening Stock</th>
                    <th className="p-2.5 text-right">Standard Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 print:divide-slate-200">
                  {variants.map((v, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-bold print:text-slate-900">{getVariantLabel(material.name, v.name, v.measurementValue || (v.specs as any)?.measurementValue)}</td>
                      <td className="p-2.5 font-mono text-muted-foreground print:text-slate-600">{v.sku || v.code || '—'}</td>
                      <td className="p-2.5 text-foreground print:text-slate-700">{v.measurementValue || '—'}</td>
                      <td className="p-2.5 text-right font-mono font-bold print:text-slate-900">{v.openingStock ?? 0} {material.uom?.symbol || ''}</td>
                      <td className="p-2.5 text-right font-mono font-bold print:text-slate-900">{Number(v.standardCost) > 0 ? `₹${Number(v.standardCost).toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Technical and Custom Fields (if any) */}
          {(technicalFields.length > 0 || customFields.length > 0) && (
            <div className="print-avoid-break">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 print:text-[#004a80]">
                4. Custom Parameters & Specifications
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {technicalFields.map((f, i) => (
                  <div key={`tech-${i}`} className="p-2.5 rounded-lg border border-border bg-muted/10 print:border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground block">{f.name || 'Technical'}</span>
                    <span className="font-semibold text-foreground mt-0.5 block">{f.value || '—'}</span>
                  </div>
                ))}
                {customFields.map((f, i) => (
                  <div key={`cust-${i}`} className="p-2.5 rounded-lg border border-border bg-muted/10 print:border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground block">{f.name || 'Custom'}</span>
                    <span className="font-mono text-foreground mt-0.5 block">{f.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Footer */}
          <div className="border-t border-border pt-4 flex items-center justify-between text-xs text-muted-foreground print:border-slate-300 print:text-slate-600 print-avoid-break">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 font-semibold text-foreground print:text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Verified Master Record
              </span>
              {hsnCode && <span>HSN: {hsnCode}</span>}
              <span>Tax: {taxRate}%</span>
            </div>
            <p className="font-mono text-[10px]">
              Document Generated: {new Date().toLocaleDateString()} · Plinth Master Data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
