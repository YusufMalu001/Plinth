"use client";

import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Cpu,
  Plus,
  ExternalLink,
} from 'lucide-react';
import type { DetailedProduct, ProductBomComponent } from '../types';
import { getResolvedSpecifications, formatINR } from '../utils';
import { useBomVersion, useBomVersions } from '../../bom/hooks';
import { getBomLineItemDisplay } from '../../bom/utils';
import { useMaterials, useProducts, useUoms } from '../../../hooks/useMasterData';

interface ProductBomTabProps {
  product: DetailedProduct;
  onOpenEdit?: () => void;
}

interface BomLineItem {
  quantity?: number;
  note?: string | null;
  material?: { name?: string; code?: string } | null;
  componentProduct?: { name?: string; sku?: string } | null;
  materialId?: string | null;
  componentProductId?: string | null;
  uomId?: string;
  uomCode?: string | null;
  uom?: { id?: string; code?: string; symbol?: string; name?: string } | null;
}

interface BomVersionItem {
  id?: string;
  bomNumber?: string;
  version?: number;
  status?: string;
  lines?: BomLineItem[];
}

export function ProductBomTab({ product, onOpenEdit }: ProductBomTabProps) {
  const { data: bomData, isLoading: isBomListLoading } = useBomVersions({ productId: product.id, limit: 100 });
  const { data: uomsData } = useUoms();
  const { data: materialsData } = useMaterials(undefined, 1, 1000, { expandVariants: true });
  const { data: productsData } = useProducts(undefined, 1, 1000, { expandVariants: true });
  const uoms = uomsData?.items || [];
  const materials = materialsData?.items || [];
  const products = productsData?.items || [];
  const allBoms = ((bomData?.items as unknown as BomVersionItem[] | undefined) || []);
  const [selectedBomId, setSelectedBomId] = React.useState<string>('');

  // Deduplicate logical BOMs by bomNumber / name, keeping latest version
  const uniqueBoms = React.useMemo(() => {
    const byName = new Map<string, BomVersionItem>();
    for (const b of allBoms) {
      const key = (b.bomNumber || `v${b.version || 0}`).trim().toLowerCase();
      const current = byName.get(key);
      if (!current || (b.version ?? 0) > (current.version ?? 0)) {
        byName.set(key, b);
      }
    }
    return [...byName.values()];
  }, [allBoms]);

  const activeBomSummary = uniqueBoms.find((b) => b.id === selectedBomId)
    || uniqueBoms.find((item) => item.status === 'APPROVED')
    || uniqueBoms[0];
  const { data: bomDetail, isLoading: isBomDetailLoading } = useBomVersion(activeBomSummary?.id || '');
  const liveBom = (bomDetail || activeBomSummary) as BomVersionItem | undefined;
  const isBomLoading = isBomListLoading || isBomDetailLoading;
  const fallbackLines = Array.isArray(product.metadata?.bomLines) ? (product.metadata.bomLines as any[]) : [];
  // Once a persisted BOM is found, its detail is authoritative even when it
  // has zero lines. Falling back to old metadata here can show stale recipe
  // rows and make it look as though the BOM fetch returned the wrong version.
  const linesSource = liveBom
    ? (Array.isArray(liveBom.lines) ? liveBom.lines : [])
    : fallbackLines;
  const bomComponents: ProductBomComponent[] = linesSource.map((line: any) => {
    const display = getBomLineItemDisplay(line, materials, products);
    const component = display.name === 'Component' ? line.materialName || 'Unresolved component' : display.name;
    return {
    component,
    variant: display.variant,
    code: line.material?.code || line.materialCode || line.componentProduct?.sku,
    category: line.material || line.materialId ? 'RAW_MATERIAL' : 'SUB_ASSEMBLY',
    quantity: line.quantity !== undefined && line.quantity !== null ? line.quantity : 0,
    uom: line.uom?.symbol || line.uom?.code || line.uom?.name || line.uomCode || uoms.find((uom) => uom.id === (line.uomId || line.uom?.id))?.symbol || uoms.find((uom) => uom.id === (line.uomId || line.uom?.id))?.code || uoms.find((uom) => uom.id === (line.uomId || line.uom?.id))?.name || '',
    unitCost: Number(line.unitCost ?? line.material?.averageCost ?? line.material?.costPrice ?? 0),
    note: line.note || undefined,
  };
  });
  const specs = getResolvedSpecifications(product);

  const totalDirectCost = bomComponents.reduce(
    (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* BOM Header Card with Summary Metrics */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                BOM
              </h3>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary border border-primary/20">
                {liveBom ? (liveBom.bomNumber || 'Active BOM') : 'No BOM configured'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/production/bom">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
              >
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span>BOM Engine</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </button>
            </Link>
            {onOpenEdit && (
              <button
                type="button"
                onClick={onOpenEdit}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Edit Formula Lines</span>
              </button>
            )}
          </div>
        </div>

        {uniqueBoms.length > 1 && (
          <div className="pt-3 border-b border-border/60 pb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground mr-1">
              Select Recipe ({uniqueBoms.length}):
            </span>
            {uniqueBoms.map((b) => {
              const isSelected = (liveBom?.id || activeBomSummary?.id) === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBomId(b.id || '')}
                  className={clsx(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
                    isSelected
                      ? 'bg-primary text-white border-primary shadow-2xs ring-2 ring-primary/20'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  )}
                >
                  <span className="font-bold">{b.bomNumber || `v${b.version}`}</span>
                  <span className={clsx('text-[10px]', isSelected ? 'text-white/80' : 'text-muted-foreground')}>
                    ({(b.lines || []).length} parts)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Cost & Rollup KPI Blocks */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Components</p>
            <p className="font-mono text-xl font-black text-foreground mt-0.5">{bomComponents.length} Parts</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Direct Material Cost</p>
            <p className="font-mono text-xl font-black text-primary mt-0.5">{formatINR(totalDirectCost)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Finished Product Net Weight</p>
            <p className="font-mono text-xl font-black text-foreground mt-0.5">{specs.netWeight || '—'}</p>
          </div>
        </div>
      </div>

      {/* BOM Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                <th className="px-5 py-3 w-12 text-center">#</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Qty / Unit</th>
                <th className="px-4 py-3 text-right">UOM</th>
                <th className="px-4 py-3 text-right">Avg Rate (₹)</th>
                <th className="px-5 py-3 text-right font-bold text-foreground">Total Cost (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isBomLoading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading approved BOM...</td></tr> : bomComponents.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No approved BOM is configured for this product.</td></tr> : bomComponents.map((item, idx) => {
                const extended = (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);
                return (
                  <tr key={`${item.component}-${idx}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 text-center font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm">{item.component}</p>
                        {item.variant && <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">Variant</span>}
                      </div>
                      {item.variant && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{item.variant}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                        {item.category || 'RAW MATERIAL'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-foreground">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground">
                      {item.uom}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground">
                      {formatINR(item.unitCost)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-sm text-foreground">
                      {formatINR(extended)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-bold text-sm">
                <td colSpan={3} className="px-5 py-3.5 text-foreground">
                  Total Direct BOM Material Cost Contribution
                </td>
                <td colSpan={3} className="text-right text-xs text-muted-foreground">
                  Sum of Extended Material Costs
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-primary text-base font-black">
                  {formatINR(totalDirectCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
