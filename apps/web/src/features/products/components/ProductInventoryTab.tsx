"use client";

import React from 'react';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import type { DetailedProduct, ProductWarehouseStock } from '../types';
import { formatINR } from '../utils';

interface ProductInventoryTabProps {
  product: DetailedProduct;
  stocks: ProductWarehouseStock[];
}

export function ProductInventoryTab({ product, stocks }: ProductInventoryTabProps) {
  const initialQty = Number(product.metadata?.initialQuantity ?? 0);
  const totalOnHand = stocks.reduce((acc, s) => acc + s.onHand, 0) || (stocks.length === 0 ? initialQty : 0);
  const totalReserved = stocks.reduce((acc, s) => acc + s.reserved, 0);
  const totalAvailable = Math.max(0, totalOnHand - totalReserved);
  const totalInTransit = stocks.reduce((acc, s) => acc + s.inTransit, 0);
  const totalValuation = stocks.reduce((acc, s) => acc + s.onHand * s.unitCost, 0) || (stocks.length === 0 ? initialQty * Number(product.metadata?.costPrice || 0) : 0);
  const safetyStock = product.metadata?.safetyStock != null ? Number(product.metadata.safetyStock) : null;
  const reorderPoint = product.metadata?.reorderPoint != null ? Number(product.metadata.reorderPoint) : null;
  const maxCapacity = product.metadata?.maxCapacity != null ? Number(product.metadata.maxCapacity) : null;

  const gaugePercentage = maxCapacity && maxCapacity > 0 ? Math.min(100, Math.round((totalAvailable / maxCapacity) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Visual Stock Level & Safety Threshold Gauge Card */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Inventory Buffer & Reorder Point Dynamics
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live enterprise stock allocation against active sales commitments and safety buffers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary border border-primary/20">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Real-Time Balance
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {/* Visual Progress Bar Gauge */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-muted-foreground">
                Current Available:{' '}
                <strong className="text-foreground font-mono font-bold">
                  {totalAvailable} {product.uom?.symbol || 'pcs'}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Target Capacity: <strong className="text-foreground font-mono">{maxCapacity ?? 'Not configured'}</strong>
              </span>
            </div>
            <div className="relative h-4 w-full rounded-full bg-muted overflow-hidden border border-border">
              {/* Safety Stock Marker (0 to safety) */}
              <div
                className="absolute top-0 bottom-0 bg-red-500/20 border-r-2 border-red-500 z-10"
                style={{ width: `${maxCapacity && safetyStock != null ? (safetyStock / maxCapacity) * 100 : 0}%` }}
                title={safetyStock == null ? 'Safety stock not configured' : `Safety Stock: ${safetyStock}`}
              />
              {/* Reorder Point Marker */}
              <div
                className="absolute top-0 bottom-0 bg-amber-500/10 border-r-2 border-amber-500 z-10"
                style={{ width: `${maxCapacity && reorderPoint != null ? (reorderPoint / maxCapacity) * 100 : 0}%` }}
                title={reorderPoint == null ? 'Reorder point not configured' : `Reorder Point: ${reorderPoint}`}
              />
              {/* Filled Current Level */}
              <div
                className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${gaugePercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1">
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span>Critical (&lt; {safetyStock ?? '—'})</span>
              </div>
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Reorder Point ({reorderPoint ?? '—'})</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Optimal Capacity ({maxCapacity ?? '—'})</span>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Physical On-Hand</p>
              <p className="font-mono text-xl font-bold text-foreground mt-0.5">{totalOnHand} pcs</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Sales Allocated / Reserved</p>
              <p className="font-mono text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {totalReserved} pcs
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">In-Transit / Assembly WIP</p>
              <p className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                {totalInTransit} pcs
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Estimated Inventory Value</p>
              <p className="font-mono text-xl font-bold text-foreground mt-0.5">{formatINR(totalValuation)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/stock/adjustments">
          <button type="button" className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span>Adjust Stock</span>
          </button>
        </Link>
      </div>
    </div>
  );
}
