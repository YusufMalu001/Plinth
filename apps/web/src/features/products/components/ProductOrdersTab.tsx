"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Truck,
  Factory,
  ExternalLink,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { useSalesOrders } from '../../sales/hooks';
import { formatINR } from '../utils';
import type { ProductLinkedOrder } from '../types';

interface ProductOrdersTabProps {
  productId?: string;
}

export function ProductOrdersTab({ productId }: ProductOrdersTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'ALL' | 'SALES' | 'WORK_ORDERS' | 'PURCHASE'>('ALL');

  const { data: salesData, isLoading: isSalesLoading } = useSalesOrders({
    productId: productId || undefined,
    limit: 100,
  });

  const liveSalesOrders: ProductLinkedOrder[] = (salesData?.items ?? []).map((so: any) => {
    const line = so.lines?.find((l: any) => l.productId === productId) || so.lines?.[0];
    const customer = so.customer?.name || so.addresses?.find((a: any) => a.kind === 'SHIPPING')?.name || 'Direct Customer';
    return {
      id: so.id,
      orderNumber: so.orderNumber,
      type: 'SALES_ORDER',
      partyName: customer,
      quantity: line ? Number(line.orderedQuantity || 0) : 0,
      allocatedQuantity: line ? Number(line.allocatedQuantity || 0) : 0,
      allocationStatus: so.allocationStatus,
      amount: line ? Number(line.lineTotal || 0) : Number(so.grandTotal || 0),
      date: new Date(so.orderedAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      status: so.status,
    };
  });

  const filtered = liveSalesOrders.filter((o) => {
    if (activeSubTab === 'SALES') return o.type === 'SALES_ORDER';
    if (activeSubTab === 'WORK_ORDERS') return o.type === 'WORK_ORDER';
    if (activeSubTab === 'PURCHASE') return o.type === 'PURCHASE_ORDER';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Orders Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubTab('ALL')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeSubTab === 'ALL' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Activity ({liveSalesOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('SALES')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeSubTab === 'SALES' ? 'bg-background text-tone-green-text shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sales Orders ({liveSalesOrders.filter(o => o.type === 'SALES_ORDER').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('WORK_ORDERS')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeSubTab === 'WORK_ORDERS' ? 'bg-background text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Work Orders (0)
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('PURCHASE')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeSubTab === 'PURCHASE' ? 'bg-background text-tone-blue-text shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Component POs (0)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/production">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
            >
              <Factory className="h-3.5 w-3.5 text-primary" />
              <span>Production Schedule</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
          </Link>
          <Link href="/sales">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-tone-green-text" />
              <span>Sales Orders</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
          </Link>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                <th className="px-5 py-3">Order Number</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-5 py-3">Party / Client / Work Center</th>
                <th className="px-4 py-3 text-right">Ordered Qty</th>
                <th className="px-4 py-3 text-right">Reserved / Allocated</th>
                <th className="px-4 py-3 text-right">Order Value</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isSalesLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Loading linked sales orders & allocations…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No active sales orders or production plans found for this product.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-primary">
                      <Link
                        href={`/sales/orders/${order.id}`}
                        className="hover:underline flex items-center gap-1"
                      >
                        {order.orderNumber}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          order.type === 'SALES_ORDER'
                            ? 'bg-tone-green-bg text-tone-green-text border border-tone-green-solid'
                            : order.type === 'WORK_ORDER'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid'
                        }`}
                      >
                        {order.type === 'SALES_ORDER' && <ShoppingBag className="h-3 w-3" />}
                        {order.type === 'WORK_ORDER' && <Factory className="h-3 w-3" />}
                        {order.type === 'PURCHASE_ORDER' && <Truck className="h-3 w-3" />}
                        {order.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-foreground">
                      {order.partyName}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-foreground">
                      {order.quantity} pcs
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-sm">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                          (order.allocatedQuantity ?? 0) >= order.quantity
                            ? 'bg-tone-green-bg text-tone-green-text font-bold'
                            : (order.allocatedQuantity ?? 0) > 0
                            ? 'bg-tone-amber-bg text-tone-amber-text font-bold'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {(order.allocatedQuantity ?? 0) >= order.quantity ? (
                          <ShieldCheck className="h-3 w-3 text-tone-green-text" />
                        ) : (
                          <Clock className="h-3 w-3 text-tone-amber-text" />
                        )}
                        {order.allocatedQuantity ?? 0} pcs
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm text-muted-foreground">
                      {order.amount ? formatINR(order.amount) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {order.date}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          order.status === 'CONFIRMED' || order.status === 'APPROVED'
                            ? 'bg-tone-green-bg text-tone-green-text border border-tone-green-solid'
                            : order.status === 'ALLOCATED' || order.status === 'PICKED' || order.status === 'PACKED'
                            ? 'bg-tone-purple-bg text-tone-purple-text border border-tone-purple-solid'
                            : order.status === 'DISPATCHED' || order.status === 'DELIVERED'
                            ? 'bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid'
                            : 'bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid'
                        }`}
                      >
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
