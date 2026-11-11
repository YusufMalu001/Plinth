'use client';

import React, { useState } from 'react';
import { Card, PageHeader, Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '@plinth/ui';
import { StatusBadge } from '../../../../components/StatusBadge';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { EmptyState } from '../../../../components/EmptyState';
import { useVendorHistory, useApprovedVendors } from '../../../../features/purchases/hooks';
import { BarChart3, Package, ChevronDown, UserSquare2 } from 'lucide-react';
import Link from 'next/link';

export default function VendorHistoryPage() {
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const { data: vendors, isLoading: loadingVendors } = useApprovedVendors();
  const { data: history, isLoading: loadingHistory, error } = useVendorHistory(selectedVendorId);

  const vendorList = vendors?.items ?? [];

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <PageHeader 
          title="Vendor Performance"
          description="Evaluate delivery reliability, quality, spend, and order history."
        />

        {/* Vendor picker */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between mb-2">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Vendor profile</p><p className="mt-1 text-sm text-muted-foreground">Select a vendor to inspect performance and history.</p></div>
          <div className="relative w-full sm:w-96">
            <UserSquare2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              id="vendor-picker"
              value={selectedVendorId ?? ''}
              onChange={e => setSelectedVendorId(e.target.value || null)}
              className="h-11 w-full appearance-none rounded-xl border border-border/80 bg-background pl-10 pr-10 text-sm font-medium shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              disabled={loadingVendors}
            >
              <option value="">— Select a vendor —</option>
              {vendorList.map(v => (
                <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          {loadingVendors && <span className="text-xs font-medium text-muted-foreground flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Loading vendors...</span>}
        </div>

        {/* History */}
        {!selectedVendorId ? (
          <EmptyState
            title="Select a Vendor"
            description="Choose an approved vendor above to view their procurement history."
          />
        ) : loadingHistory ? (
          <LoadingState message="Loading vendor history..." />
        ) : error ? (
          <ErrorState error={error as Error} />
        ) : !history ? (
          <EmptyState title="No History" description="This vendor has no purchase order history." />
        ) : (
          <div className="space-y-6">
            {/* Summary cards (Compact Data Style) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <Card className="p-5 flex flex-col justify-center border-l-4 border-l-primary/60 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Package className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Total Orders</span>
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground">{history.totalOrders}</p>
              </Card>
              <Card className="p-5 flex flex-col justify-center shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider">Total Value</span>
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground">
                  {history.totalValue?.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) ?? '—'}
                </p>
              </Card>
              <Card className="p-5 flex flex-col justify-center shadow-sm bg-primary/5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Vendor Profile</span>
                </div>
                <p className="text-xl font-bold tracking-tight text-foreground line-clamp-1" title={history.vendorName}>{history.vendorName}</p>
              </Card>
              <Card className="p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vendor Score</p>
                <p className="mt-1 text-3xl font-bold text-primary">
                  {history.score !== null && history.score !== undefined ? (
                    <>
                      {history.score}
                      <span className="text-base text-muted-foreground">/100</span>
                    </>
                  ) : (
                    'N.A'
                  )}
                </p>
              </Card>
              <Card className="p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delivery / Quality</p>
                <p className="mt-1 text-lg font-bold">
                  {history.performance.onTimeRate !== null && history.performance.qualityRate !== null ? (
                    `${history.performance.onTimeRate}% / ${history.performance.qualityRate}%`
                  ) : (
                    'N.A'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">On time · accepted</p>
              </Card>
            </div>

            {/* Order list Table */}
            <Card className="shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/10">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Purchase Orders</h2>
              </div>
              {!history.orders || history.orders.length === 0 ? (
                <EmptyState title="No Orders" description="No purchase orders found for this vendor." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Value / Receipts</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.orders.map(order => (
                      <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-sm font-bold text-foreground">
                          {order.poNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-right"><p className="font-semibold">₹{order.totalAmount.toLocaleString('en-IN')}</p><p className="text-xs text-muted-foreground">{order.receiptCount} receipt{order.receiptCount === 1 ? '' : 's'}</p></TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/procurement/purchase-orders/${order.id}`}
                            className="text-xs font-semibold text-primary hover:underline hover:text-primary/80 transition-colors inline-flex items-center gap-1 bg-primary/5 px-2.5 py-1 rounded-full"
                          >
                            View Order →
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
