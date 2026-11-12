'use client';

import React, { useState, useMemo } from 'react';
import type { POLine } from '@/features/purchases/api';
import { Search, Layers, Calendar, AlertCircle } from 'lucide-react';
interface PoLinesTableProps {
  lines: POLine[];
  currency?: string;
}

export function PoLinesTable({ lines, currency = 'INR' }: PoLinesTableProps) {
  const [filterQuery, setFilterQuery] = useState('');

  // Consolidate identical items so duplicate lines (e.g. 2 lines of 100 pcs) merge into 1 line (200 pcs)
  const consolidatedLines = useMemo(() => {
    const map = new Map<string, POLine>();
    for (const line of lines) {
      const itemKey = `${line.materialId || ''}:${line.productId || ''}:${line.uomId || ''}:${line.unitPrice}`;
      const existing = map.get(itemKey);
      if (existing) {
        existing.quantity = Number(existing.quantity || 0) + Number(line.quantity || 0);
        existing.lineTotal = Number(existing.lineTotal || 0) + Number(line.lineTotal || 0);
      } else {
        map.set(itemKey, { ...line, quantity: Number(line.quantity || 0), lineTotal: Number(line.lineTotal || 0) });
      }
    }
    return Array.from(map.values());
  }, [lines]);

  const filteredLines = useMemo(() => {
    if (!filterQuery.trim()) return consolidatedLines;
    const q = filterQuery.toLowerCase().trim();
    return consolidatedLines.filter((line, index) => {
      const name = line.product?.name || line.material?.name || `Line ${index + 1}`;
      const code = line.product?.sku || line.material?.code || '';
      return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
    });
  }, [consolidatedLines, filterQuery]);
  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-border/80 bg-muted/20 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
        </div>
        <h4 className="mt-3 text-sm font-bold text-foreground">No PO lines found</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          This purchase order does not contain any active line items to receive.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
      {/* Header & Filter Bar */}
      <div className="flex flex-col gap-3 border-border-strong border-border/70 bg-muted/20 px-4 sm:px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Contractual PO Lines
              </h4>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                {lines.length}
              </span>
            </div>
          </div>
        </div>

        {lines.length > 3 && (
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter order items…"
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 sm:w-48 shadow-2xs"
            />
          </div>
        )}
      </div>


      {/* Desktop Table View */}
      <div className="hidden max-h-72 overflow-y-auto md:block">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-border-strong border-border/70 bg-card/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3">#</th>
              <th className="px-5 py-3">Item / Description</th>
              <th className="px-5 py-3 text-right">Ordered Qty</th>
              <th className="px-5 py-3 text-right">Unit Price</th>
              <th className="px-5 py-3 text-right">Need Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredLines.map((line, index) => {
              const itemName = line.product?.name || line.material?.name || `Line ${index + 1}`;
              const itemCode = line.product?.sku || line.material?.code || '—';
              const uomSymbol = line.uom?.symbol || line.uom?.code || 'unit';

              return (
                <tr key={line.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  <td className="max-w-[260px] px-5 py-3">
                    <p className="truncate font-semibold text-foreground" title={itemName}>
                      {itemName}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {itemCode}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    <span className="font-bold text-foreground">{line.quantity}</span>{' '}
                    <span className="text-[11px] text-muted-foreground uppercase">{uomSymbol}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-foreground font-semibold">
                    {line.unitPrice !== undefined && line.unitPrice !== null
                      ? `${currency} ${Number(line.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[11px] text-muted-foreground">
                    {line.needDate ? new Date(line.needDate).toLocaleDateString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className="divide-y divide-border/60 md:hidden">
        {filteredLines.map((line, index) => {
          const itemName = line.product?.name || line.material?.name || `Line ${index + 1}`;
          const itemCode = line.product?.sku || line.material?.code || '—';
          const uomSymbol = line.uom?.symbol || line.uom?.code || 'unit';

          return (
            <div key={line.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-muted-foreground">
                      #{index + 1}
                    </span>
                    <p className="truncate text-xs font-bold text-foreground">{itemName}</p>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{itemCode}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-foreground">
                    {line.quantity} <span className="font-normal text-muted-foreground uppercase">{uomSymbol}</span>
                  </p>
                  {line.unitPrice !== undefined && (
                    <p className="font-mono text-[10px] font-semibold text-muted-foreground">
                      {currency} {Number(line.unitPrice).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              {line.needDate && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Need Date: {new Date(line.needDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
