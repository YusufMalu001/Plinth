"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  FileSpreadsheet,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { useStockLedger } from '../../inventory/hooks';
import type { ProductMovementRow } from '../types';

interface ProductMovementsTabProps {
  productId: string;
}

export function ProductMovementsTab({ productId }: ProductMovementsTabProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useStockLedger({ productId, limit: 200 });

  const movementTypeMap: Record<string, ProductMovementRow['movementType']> = {
    GRN_RECEIPT: 'GRN_RECEIPT',
    RECEIPT: 'GRN_RECEIPT',
    TRANSFER_OUT: 'TRANSFER_OUT',
    TRANSFER_IN: 'TRANSFER_IN',
    ISSUE: 'PRODUCTION_ISSUE',
    PRODUCTION_ISSUE: 'PRODUCTION_ISSUE',
    ADJUSTMENT: 'ADJUSTMENT',
    DISPATCH: 'DISPATCH',
    OPENING_BALANCE: 'OPENING_BALANCE',
  };

  const rawMovements: ProductMovementRow[] = (data?.items ?? []).map((m: any) => {
    const isOut = m.direction === 'OUT' || Number(m.quantityDelta ?? 0) < 0;
    let movType: ProductMovementRow['movementType'] = 'ADJUSTMENT';
    if (m.sourceType?.includes('OPENING_BALANCE')) {
      movType = 'OPENING_BALANCE';
    } else if (
      m.sourceType === 'SALES_SHIPMENT' ||
      m.sourceType === 'SALES_ORDER' ||
      m.sourceType === 'SALES_PACKAGE' ||
      m.movementType === 'DISPATCH'
    ) {
      movType = 'DISPATCH';
    } else if (
      m.sourceType?.startsWith('PRODUCTION') ||
      m.movementType === 'ISSUE' ||
      m.entryType === 'ISSUE'
    ) {
      movType = 'PRODUCTION_ISSUE';
    } else if (
      m.movementType === 'RECEIPT' ||
      m.movementType === 'GRN_RECEIPT' ||
      m.entryType === 'GRN_RECEIPT' ||
      m.sourceType === 'GOODS_RECEIPT'
    ) {
      movType = 'GRN_RECEIPT';
    } else if (m.movementType === 'TRANSFER' || m.entryType?.startsWith('TRANSFER')) {
      movType = isOut ? 'TRANSFER_OUT' : 'TRANSFER_IN';
    } else {
      movType = movementTypeMap[m.movementType || m.entryType || ''] || 'ADJUSTMENT';
    }

    const grnId = (m.sourceType === 'GOODS_RECEIPT' || m.sourceType === 'GRN')
      ? (m.sourceId || m.grnId || null)
      : (m.grnId || null);
    const grnNumber = m.goodsReceipt?.grnNumber || (grnId ? `GRN #${String(grnId).slice(0, 8)}` : null);

    let referenceHref: string | null = null;
    let referenceLabel = m.entryNumber || m.sourceId || m.id;

    if (grnId) {
      referenceHref = `/receiving/goods-receipts/${grnId}`;
      referenceLabel = grnNumber || `GRN #${String(grnId).slice(0, 8)}`;
    } else if (m.productionPlan?.id || m.sourceType === 'PRODUCTION_PLAN') {
      const planId = m.productionPlan?.id || m.sourceId;
      referenceHref = `/production/plans/${planId}`;
      referenceLabel = m.productionPlan?.planNumber || `Plan #${String(planId).slice(0, 8)}`;
    } else if (m.assemblyBatch?.id || m.sourceType === 'ASSEMBLY_BATCH') {
      referenceHref = `/assembly`;
      referenceLabel = m.assemblyBatch?.batchNumber || 'Assembly Batch';
    } else if (m.sourceType === 'STOCK_ADJUSTMENT' || m.adjustmentId) {
      referenceHref = `/stock/adjustments/${m.adjustmentId || m.sourceId}`;
      referenceLabel = 'Stock Adjustment';
    } else if (m.sourceType?.includes('OPENING_BALANCE')) {
      referenceHref = null;
      referenceLabel = 'Opening Stock Balance';
    }

    return {
      id: m.id,
      timestamp: new Date(m.postedAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      movementType: movType,
      referenceId: m.entryNumber || m.sourceId || m.id,
      referenceLabel,
      referenceHref,
      direction: isOut ? 'OUT' : 'IN',
      quantity: Math.abs(Number(m.quantityDelta ?? m.quantity ?? 0)),
      uom: m.uom?.symbol || m.uom?.name || m.uomId || 'pcs',
      balanceAfter: Number(m.quantityAfter ?? 0),
      locationName: m.location?.name || m.location?.code,
      actorName: m.postedByActor?.name || m.postedBy || m.postedByActorId || 'System',
      notes: m.note || (m.sourceType ? `Source: ${m.sourceType.replace('_', ' ')}` : undefined),
      grnNumber: grnNumber || undefined,
      grnId: grnId || undefined,
    };
  });

  const filteredMovements = rawMovements.filter((m) => {
    if (filterType === 'IN' && m.direction !== 'IN') return false;
    if (filterType === 'OUT' && m.direction !== 'OUT') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.referenceId.toLowerCase().includes(q) ||
        m.actorName.toLowerCase().includes(q) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    }
    return true;
  });

  function exportMovementsCSV() {
    const headers = ['Timestamp', 'Type', 'Reference', 'Direction', 'Quantity', 'Balance After', 'Actor', 'Notes'];
    const rows = filteredMovements.map((m) => [
      m.timestamp,
      m.movementType,
      m.referenceId,
      m.direction,
      m.quantity,
      m.balanceAfter,
      `"${m.actorName}"`,
      `"${m.notes || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Movements_${productId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-4">
      {/* Movements Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search reference, actor, note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterType === 'ALL' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType('IN')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterType === 'IN' ? 'bg-background text-tone-green-text shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Inward (+)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('OUT')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterType === 'OUT' ? 'bg-background text-tone-amber-text shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Outward (-)
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={exportMovementsCSV}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-tone-green-text" />
          <span>Export Movement Log</span>
        </button>
      </div>

      {/* Movement Ledger Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                <th className="px-5 py-3">Date & Timestamp</th>
                <th className="px-4 py-3">Movement Type</th>
                <th className="px-4 py-3">Reference / Doc</th>
                <th className="px-4 py-3 text-right">Quantity Delta</th>
                <th className="px-4 py-3 text-right">Balance After</th>
                <th className="px-5 py-3">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Loading movement history…</td></tr>
              ) : filteredMovements.length > 0 ? (
                filteredMovements.map((mov) => (
                  <tr key={mov.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {mov.timestamp}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold ${
                          mov.direction === 'IN'
                            ? 'bg-tone-green-bg text-tone-green-text border border-tone-green-solid'
                            : 'bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid'
                        }`}
                      >
                        {mov.direction === 'IN' ? (
                          <ArrowDownLeft className="h-3 w-3 text-tone-green-text" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3 text-tone-amber-text" />
                        )}
                        {mov.movementType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {mov.referenceHref ? (
                        <Link
                          href={mov.referenceHref}
                          className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-primary hover:text-primary/80 hover:underline group"
                        >
                          <FileText className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary shrink-0" />
                          <span>{mov.referenceLabel || mov.referenceId}</span>
                          <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 shrink-0" />
                        </Link>
                      ) : (
                        <span className="font-mono text-xs font-medium text-foreground">
                          {mov.referenceLabel || mov.referenceId}
                        </span>
                      )}
                      {mov.notes && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{mov.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-sm">
                      <span className={mov.direction === 'IN' ? 'text-tone-green-text' : 'text-tone-amber-text'}>
                        {mov.direction === 'IN' ? '+' : '-'}
                        {mov.quantity} {mov.uom}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-foreground">
                      {mov.balanceAfter} {mov.uom}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {mov.actorName}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No matching stock movements found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
