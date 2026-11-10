"use client";

import React from 'react';
import { X, Printer, ShieldCheck } from 'lucide-react';
import { Button } from '@synergy/ui';
import type { DetailedProduct } from '../types';
import { useBomVersion, useBomVersions } from '../../bom/hooks';
import { useReactToPrint } from 'react-to-print';
import { getVariantLabel } from '../variant-names';

interface ProductSpecSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: DetailedProduct;
}

export function ProductSpecSheetModal({ isOpen, onClose, product }: ProductSpecSheetModalProps) {
  const printRef = React.useRef<HTMLDivElement>(null);
  const { data: bomData } = useBomVersions(
    { productId: product.id, status: 'APPROVED', limit: 10 },
    { enabled: isOpen },
  );
  const approvedBomSummary = bomData?.items?.find((item) => item.status === 'APPROVED');
  const { data: approvedBomDetail } = useBomVersion(approvedBomSummary?.id || '');
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${product.sku}-spec-sheet`,
  });

  if (!isOpen) return null;

  const specs = product.metadata?.specifications || {};
  const measurementVariants = (
    Array.isArray(product.metadata?.measurementVariants)
      ? product.metadata.measurementVariants
      : Array.isArray(product.metadata?.variants)
      ? product.metadata.variants
      : []
  ) as Array<{
    name?: string;
    sku?: string;
    measurementValue?: string;
    openingStock?: number | string;
    standardPrice?: number | string;
  }>;
  const approvedBom = (approvedBomDetail || approvedBomSummary) as NonNullable<typeof bomData>['items'][number] & { lines?: Array<{ material?: { name?: string; code?: string } | null; componentProduct?: { name?: string; sku?: string } | null; materialId?: string | null; componentProductId?: string | null; quantity?: number; uom?: { symbol?: string; name?: string } | null; uomId?: string | null; note?: string | null }> } | undefined;
  const fallbackBomLines = Array.isArray(product.metadata?.bomLines) ? (product.metadata.bomLines as any[]) : [];
  const bomLines = (approvedBom?.lines && approvedBom.lines.length > 0) ? approvedBom.lines : fallbackBomLines;
  const bom = bomLines.map((line: any) => ({
    component: line.material?.name || line.materialName || line.componentProduct?.name || 'Unresolved component',
    code: line.material?.code || line.materialCode || line.componentProduct?.sku || line.materialId || line.componentProductId || '—',
    quantity: line.quantity !== undefined && line.quantity !== null ? line.quantity : 0,
    uom: line.uom?.symbol || line.uom?.name || line.uomId || '—',
    note: line.note || undefined,
  }));

  return (
    <div className="spec-sheet-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div ref={printRef} className="spec-sheet-document flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Modal Controls Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary">TECH-DOC-2026 // SYNERGY ERP</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={Printer} onClick={() => handlePrint()}>
              Print / Download PDF
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
                    Synergy International
                  </h1>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase print:text-slate-500">
                    Industrial Manufacturing & Precision Engineering Standards
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-2xl font-black text-foreground print:text-slate-900">{product.name}</h2>
                <p className="font-mono text-sm text-primary font-bold mt-0.5 print:text-[#004a80]">
                  SKU: {product.sku} · REV v{product.version ?? 1} · {product.status}
                </p>
              </div>
            </div>

            {(product.metadata?.barcode || product.metadata?.asin) && (
              <div className="text-right flex flex-col items-end space-y-1">
                {product.metadata?.barcode && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Barcode: {String(product.metadata.barcode)}
                  </span>
                )}
                {product.metadata?.asin && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    ASIN: {String(product.metadata.asin)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Core Technical Specifications Grid */}
          {Object.keys(specs).length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3">
              1. Engineering & Structural Specifications
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border border-border rounded-xl p-4 bg-muted/10 text-xs print:border-slate-300 print:bg-slate-50/70">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Material Alloy</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.materialGrade || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Main Frame</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.frameSpecs || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Hanging Rods</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.rodSpecs || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Surface Finish</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.surfaceFinish || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Linear Drying Space</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.hangingSpace || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Rated Load Capacity</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.loadCapacity || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Folded Flat Dimensions</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.foldedDimensions || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Extended Working Dimensions</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.extendedDimensions || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Net Weight / Gross</p>
                <p className="font-semibold text-foreground mt-0.5">{specs.netWeight || '—'} / {specs.grossWeight || '—'}</p>
              </div>
            </div>
          </div>
          )}
          {/* Configured Product Variants & Specifications */}
          {measurementVariants.length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3">
              Configured Product Variants &amp; Specifications
            </h3>
            <table className="w-full text-left text-xs border border-border rounded-xl overflow-hidden print:border-slate-300">
              <thead className="bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground print:bg-slate-100 print:text-slate-600">
                <tr className="border-b border-border print:border-slate-300">
                  <th className="p-2.5">Variant Name</th>
                  <th className="p-2.5">SKU Code</th>
                  <th className="p-2.5">Specification / Type</th>
                  <th className="p-2.5 text-right">Opening Stock</th>
                  <th className="p-2.5 text-right">Standard Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 print:divide-slate-200">
                {measurementVariants.map((v, i) => (
                  <tr key={i}>
                    <td className="p-2.5 font-medium print:text-slate-900">{getVariantLabel(product.name, v.name, v.measurementValue)}</td>
                    <td className="p-2.5 font-mono text-muted-foreground print:text-slate-600">{v.sku || '—'}</td>
                    <td className="p-2.5 print:text-slate-900">{v.measurementValue || '—'}</td>
                    <td className="p-2.5 text-right font-mono font-bold print:text-slate-900">{v.openingStock ?? 0} {product.uom?.symbol || 'units'}</td>
                    <td className="p-2.5 text-right font-mono font-bold print:text-slate-900">{Number(v.standardPrice) > 0 ? `₹${Number(v.standardPrice).toLocaleString('en-IN')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Bill of Materials Summary */}
          {bom.length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3">
              2. Standard Production Formula & Components (BOM)
            </h3>
            <table className="w-full text-left text-xs border border-border rounded-xl overflow-hidden print:border-slate-300">
              <thead className="bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground print:bg-slate-100 print:text-slate-600">
                <tr className="border-b border-border print:border-slate-300">
                  <th className="p-2.5">Component</th>
                  <th className="p-2.5">Code</th>
                  <th className="p-2.5 text-right">Quantity</th>
                  <th className="p-2.5">UOM</th>
                  <th className="p-2.5">Process Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 print:divide-slate-200">
                {bom.slice(0, 10).map((item, i) => (
                  <tr key={i}>
                    <td className="p-2.5 font-medium print:text-slate-900">{item.component}</td>
                    <td className="p-2.5 font-mono text-muted-foreground print:text-slate-600">{item.code}</td>
                    <td className="p-2.5 text-right font-mono font-bold print:text-slate-900">{item.quantity}</td>
                    <td className="p-2.5 text-muted-foreground print:text-slate-600">{item.uom}</td>
                    <td className="p-2.5 text-muted-foreground text-[11px] print:text-slate-600">{item.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Quality Assurance & Compliance */}
          <div className="border-t border-border pt-4 flex items-center justify-between text-xs text-muted-foreground print:border-slate-300 print:text-slate-600 print-avoid-break">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 font-semibold text-foreground print:text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Product master data
              </span>
              <span>HSN Code: {String(product.metadata?.hsnCode || product.metadata?.hsn || '—')}</span>
              <span>GST: {product.metadata?.gstRate != null ? `${String(product.metadata.gstRate)}%` : '—'}</span>
            </div>
            <p className="font-mono text-[10px]">
              Document Generated: {new Date().toLocaleDateString()} · Synergy ERP
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
