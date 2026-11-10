"use client";

import React from 'react';
import {
  Boxes,
  BadgeDollarSign,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { DetailedProduct, ProductWarehouseStock } from '../types';
import { formatINR, formatQty } from '../utils';

interface ProductStockTelemetryProps {
  product: DetailedProduct;
  stocks: ProductWarehouseStock[];
}

export function ProductStockTelemetry({ product, stocks }: ProductStockTelemetryProps) {
  const initialQty = Number(product.metadata?.initialQuantity ?? 0);
  const totalOnHand = stocks.reduce((acc, s) => acc + s.onHand, 0) || (stocks.length === 0 ? initialQty : 0);
  const totalReserved = stocks.reduce((acc, s) => acc + s.reserved, 0);
  const totalAvailable = Math.max(0, totalOnHand - totalReserved);
  const isRawMaterial = /raw\s*materials?/i.test(product.category?.name || '')
    || String(product.metadata?.materialType || '').toUpperCase() === 'RAW_MATERIAL';
  const mrp = product.metadata?.mrp != null ? Number(product.metadata.mrp) : (isRawMaterial && product.metadata?.costPrice != null ? Number(product.metadata.costPrice) : null);
  const sellingPrice = product.metadata?.sellingPrice != null ? Number(product.metadata.sellingPrice) : null;
  const costPrice = product.metadata?.costPrice != null ? Number(product.metadata.costPrice) : null;
  const displayedPrice = isRawMaterial ? costPrice ?? mrp : sellingPrice;
  const marginPct = sellingPrice != null && sellingPrice > 0 && costPrice != null ? Math.round(((sellingPrice - costPrice) / sellingPrice) * 100) : null;

  const reorderPoint = product.metadata?.reorderPoint != null ? Number(product.metadata.reorderPoint) : null;
  const isLowStock = reorderPoint != null && totalAvailable < reorderPoint;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
      {/* Metric 1: Available Stock */}
      <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Available to Sell
          </span>
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Boxes className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl sm:text-3xl font-black text-foreground">
              {formatQty(totalAvailable, '')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {product.uom?.symbol || 'pcs'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-1.5 font-medium">
            <span>On-Hand: {totalOnHand}</span>
            <span className="text-amber-600 dark:text-amber-400">Allocated: {totalReserved}</span>
          </div>
        </div>
      </div>

      {/* Metric 2: Commercial Price & Margins */}
      <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {isRawMaterial ? 'Cost Price' : 'Assumed Selling Price (B2C/Net)'}
          </span>
          <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
            <BadgeDollarSign className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl sm:text-3xl font-black text-foreground">
              {formatINR(displayedPrice)}
            </span>
            {!isRawMaterial && mrp != null && sellingPrice != null && mrp > sellingPrice && (
              <span className="font-mono text-xs line-through text-muted-foreground">
                {formatINR(mrp)}
              </span>
            )}
          </div>
          {!isRawMaterial && <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-1.5 font-medium">
            <span>Metadata cost: {formatINR(costPrice)}</span>
            {marginPct != null && <span className="font-bold text-muted-foreground">~{marginPct}% indicative margin</span>}
          </div>}
        </div>
      </div>

      {/* Metric 3: Stock Status & Run Rate */}
      <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Inventory Health
          </span>
          <div
            className={`rounded-md p-1.5 ${
              isLowStock
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {isLowStock ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isLowStock ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <span className="text-lg font-bold text-foreground">
              {isLowStock ? 'Reorder Needed' : 'Healthy Buffer'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-1.5 font-medium">
            <span>Reorder At: {reorderPoint ?? '—'}</span>
            <span className="font-mono font-bold text-foreground">Days cover: —</span>
          </div>
        </div>
      </div>
    </div>
  );
}
