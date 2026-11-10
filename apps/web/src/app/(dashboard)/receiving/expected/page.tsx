'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  EmptyState,
} from '@synergy/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { ForbiddenState } from '@/components/ForbiddenState';
import { useGrnCapabilities, useGrnExpectedQueue } from '@/features/goods-receipt/hooks';
import type { ExpectedReceipt } from '@/features/purchases/api';
import { ExpectedReceiptStatus } from '@synergy/types';
import {
  Filter,
  Clock,
  Search,
  ChevronDown,
  Calendar,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Plus,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
  Truck,
  PackageCheck,
} from 'lucide-react';

const RECEIPT_STATUSES: { label: string; value: ExpectedReceiptStatus | '' }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending Intake', value: 'PENDING' },
  { label: 'Partially Received', value: 'PARTIALLY_RECEIVED' },
  { label: 'Fully Received', value: 'FULLY_RECEIVED' },
];

export default function GrnExpectedReceiptsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpectedReceiptStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const { data, isLoading, error, refetch, isRefetching } = useGrnExpectedQueue({
    status: statusFilter || undefined,
  });
  const { data: capabilities } = useGrnCapabilities();

  const items: ExpectedReceipt[] = useMemo(() => {
    return Array.isArray(data) ? data : ((data as unknown as { items?: ExpectedReceipt[] })?.items ?? []);
  }, [data]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isOverdue =
        item.status !== 'FULLY_RECEIVED' &&
        Boolean(item.expectedDate && item.expectedDate.split('T')[0] < todayStr);

      if (overdueOnly && !isOverdue) return false;

      if (!search.trim()) return true;

      const q = search.toLowerCase().trim();
      const poNum = (item.po?.poNumber || item.poLine?.purchaseOrder?.poNumber || item.poId || '').toLowerCase();
      const prodName = (item.poLine?.product?.name || item.poLine?.material?.name || '').toLowerCase();
      const sku = (item.poLine?.product?.sku || item.poLine?.material?.code || '').toLowerCase();
      const vendor = (item.poLine?.purchaseOrder?.vendor?.name || '').toLowerCase();

      return poNum.includes(q) || prodName.includes(q) || sku.includes(q) || vendor.includes(q);
    });
  }, [items, search, overdueOnly, todayStr]);

  // Metrics
  const totalCount = items.length;
  const overdueCount = useMemo(() => {
    return items.filter(
      (item) =>
        item.status !== 'FULLY_RECEIVED' &&
        Boolean(item.expectedDate && item.expectedDate.split('T')[0] < todayStr)
    ).length;
  }, [items, todayStr]);

  const pendingCount = items.filter((i) => i.status === 'PENDING').length;
  const partialCount = items.filter((i) => i.status === 'PARTIALLY_RECEIVED').length;
  const completedCount = items.filter((i) => i.status === 'FULLY_RECEIVED').length;

  // Grouped for Card/Timeline View
  const groupedDates = useMemo(() => {
    const grouped: Record<string, typeof filteredItems> = {};
    for (const item of filteredItems) {
      const date = item.expectedDate ? item.expectedDate.split('T')[0] : 'Unscheduled';
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(item);
    }
    return Object.keys(grouped)
      .sort()
      .map((date) => ({ date, items: grouped[date] }));
  }, [filteredItems]);

  if (isLoading) return <LoadingState message="Loading expected receipts queue…" />;
  if (error) {
    const apiError = error as { status?: number };
    if (apiError.status === 401) {
      return <ForbiddenState message="You must be logged in to view expected receipts." />;
    }
    if (apiError.status === 403) {
      return <ForbiddenState message="You do not have permission to view expected receipts." />;
    }
    return <ErrorState error={error as Error} retry={refetch} />;
  }

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        {/* Page Header matching Procurement */}
        <PageHeader
          title="Expected Receipts Queue"
          description="Inbound deliveries and contractual purchase order lines awaiting warehouse gate intake."
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="rounded-full shadow-xs text-xs font-semibold h-9"
              >
                <RefreshCw size={13} className={`mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>

              {capabilities?.receive && (
                <Link href="/receiving/goods-receipts/new">
                  <Button
                    variant="default"
                    size="sm"
                    className="rounded-full shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-9 text-xs"
                  >
                    <Plus size={14} className="mr-1.5" />
                    <span>New Goods Receipt</span>
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        {/* Executive Metrics Ribbon */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Inbound Lines
              </p>
              <div className="rounded-lg bg-muted p-1.5 text-muted-foreground">
                <Truck size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{totalCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Open purchase deliveries</p>
          </div>

          <div
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={`rounded-xl border p-4 shadow-xs cursor-pointer transition-all ${
              overdueOnly
                ? 'border-red-400 bg-red-50 dark:bg-red-950/20 ring-2 ring-red-400/20'
                : 'border-border/70 bg-card hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                Overdue Inbound
              </p>
              <div className="rounded-lg bg-red-500/10 p-1.5 text-red-600">
                <AlertTriangle size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-red-600">{overdueCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Past expected delivery date</p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Pending Intake
              </p>
              <div className="rounded-lg bg-muted p-1.5 text-muted-foreground">
                <Clock size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{pendingCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Awaiting delivery and physical verification</p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Completed
              </p>
              <div className="rounded-lg bg-muted p-1.5 text-muted-foreground">
                <CheckCircle2 size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{completedCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {partialCount} partially received
            </p>
          </div>
        </div>

        {/* Filter & View Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
            {/* Search input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                id="receipt-search"
                type="text"
                placeholder="Search PO #, item description, or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-muted/40 border border-border/50 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground transition-all hover:bg-muted/60 placeholder:text-muted-foreground/70"
              />
            </div>

            {/* Status select */}
            <div className="relative w-full sm:w-56">
              <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                id="receipt-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ExpectedReceiptStatus | '')}
                className="w-full pl-10 pr-10 py-2 text-sm bg-muted/40 border border-border/50 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none text-foreground font-medium cursor-pointer transition-all hover:bg-muted/60"
              >
                {RECEIPT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Overdue toggle chip */}
            <button
              type="button"
              onClick={() => setOverdueOnly(!overdueOnly)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
                overdueOnly
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <AlertTriangle size={13} />
              <span>Overdue Only ({overdueCount})</span>
            </button>
          </div>

          {/* View mode switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-xs self-end md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TableIcon size={14} />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'cards'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid size={14} />
              <span>Schedule</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {filteredItems.length === 0 ? (
          <EmptyState
            title="No Expected Receipts Matching Filters"
            description={
              search || statusFilter || overdueOnly
                ? 'Try adjusting your search criteria or resetting filters to see all incoming deliveries.'
                : 'Expected receipts appear here once purchase orders are sent to vendors.'
            }
          />
        ) : viewMode === 'table' ? (
          /* PLATFORM TABLE VIEW (Exact Procurement styling) */
          <Card className="shadow-sm overflow-hidden border border-border/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Item & Material Details</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((receipt) => {
                  const isOverdue =
                    receipt.status !== 'FULLY_RECEIVED' &&
                    Boolean(receipt.expectedDate && receipt.expectedDate.split('T')[0] < todayStr);

                  const itemName = receipt.poLine
                    ? receipt.poLine.product?.name ?? receipt.poLine.material?.name ?? receipt.poLineId
                    : receipt.poLineId;

                  const itemCode = receipt.poLine?.product?.sku || receipt.poLine?.material?.code;
                  const targetPoId = receipt.poId || (receipt.poLine && typeof receipt.poLine === 'object' && 'poId' in receipt.poLine && typeof receipt.poLine.poId === 'string' ? receipt.poLine.poId : undefined) || receipt.po?.id;
                  const poNum = receipt.po?.poNumber ?? receipt.poLine?.purchaseOrder?.poNumber ?? targetPoId ?? '—';
                  const vendorName = receipt.poLine?.purchaseOrder?.vendor?.name;

                  return (
                    <TableRow
                      key={receipt.id}
                      className={`hover:bg-muted/30 transition-colors group ${
                        isOverdue ? 'bg-red-50/20 dark:bg-red-950/10' : ''
                      }`}
                    >
                      {/* PO Reference */}
                      <TableCell>
                        <div className="flex flex-col">
                          {targetPoId ? (
                            <Link
                              href={`/procurement/purchase-orders/${targetPoId}`}
                              className="font-mono text-sm font-bold text-primary hover:underline"
                            >
                              {poNum}
                            </Link>
                          ) : (
                            <span className="font-mono text-sm font-bold text-foreground">{poNum}</span>
                          )}
                          {vendorName && (
                            <span className="text-[11px] text-muted-foreground truncate max-w-[180px] mt-0.5">
                              {vendorName}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Item Details */}
                      <TableCell>
                        <div className="flex flex-col max-w-sm">
                          <span className="font-semibold text-foreground text-xs leading-snug">
                            {itemName}
                          </span>
                          {itemCode && (
                            <span className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              SKU: {itemCode}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Expected Date with relative indicator */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="text-xs">
                            <span className="font-medium text-foreground block">
                              {new Date(receipt.expectedDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            {isOverdue ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-red-600 mt-0.5">
                                <Clock size={11} />
                                Overdue delivery
                              </span>
                            ) : receipt.expectedDate.split('T')[0] === todayStr ? (
                              <span className="font-semibold text-[10px] text-amber-600 mt-0.5">
                                Due today
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                Scheduled
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Quantity */}
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {receipt.poLine?.quantity ?? '—'}{' '}
                          <span className="text-muted-foreground font-normal">
                            {receipt.poLine?.uom?.symbol || ''}
                          </span>
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={receipt.status} />
                      </TableCell>

                      {/* Action Button */}
                      <TableCell className="text-right">
                        {receipt.status !== 'FULLY_RECEIVED' ? (
                          <Link
                            href={`/receiving/goods-receipts/new?poId=${receipt.poId}&poLineId=${receipt.poLineId}`}
                          >
                            <Button
                              variant="default"
                              size="sm"
                              className="rounded-xl shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-8 px-3 text-xs"
                            >
                              <PackageCheck size={13} className="mr-1" />
                              <span>Receive</span>
                              <ArrowRight size={12} className="ml-1" />
                            </Button>
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={13} />
                            <span>Received</span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        ) : (
          /* SCHEDULE / CHRONOLOGICAL VIEW */
          <div className="space-y-6">
            {groupedDates.map(({ date, items: dateItems }) => {
              const isOverdue = date !== 'Unscheduled' && date < todayStr;
              const isToday = date === todayStr;

              return (
                <div key={date} className="space-y-3">
                  {/* Date Group Heading */}
                  <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                    <Calendar
                      size={16}
                      className={isOverdue ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-primary'}
                    />
                    <h3
                      className={`text-sm font-bold tracking-tight ${
                        isOverdue ? 'text-red-600' : isToday ? 'text-amber-600' : 'text-foreground'
                      }`}
                    >
                      {date === 'Unscheduled'
                        ? 'Unscheduled Deliveries'
                        : new Date(date).toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                    </h3>

                    {isOverdue && (
                      <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-red-200">
                        Overdue ({dateItems.length})
                      </span>
                    )}
                    {isToday && (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                        Due Today ({dateItems.length})
                      </span>
                    )}
                  </div>

                  {/* Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {dateItems.map((receipt) => {
                      const itemName = receipt.poLine
                        ? receipt.poLine.product?.name ?? receipt.poLine.material?.name ?? receipt.poLineId
                        : receipt.poLineId;

                      const itemCode = receipt.poLine?.product?.sku || receipt.poLine?.material?.code;
                      const targetPoId = receipt.poId || (receipt.poLine && typeof receipt.poLine === 'object' && 'poId' in receipt.poLine && typeof receipt.poLine.poId === 'string' ? receipt.poLine.poId : undefined) || receipt.po?.id;
                      const poNum =
                        receipt.po?.poNumber ?? receipt.poLine?.purchaseOrder?.poNumber ?? targetPoId ?? '—';
                      const vendorName = receipt.poLine?.purchaseOrder?.vendor?.name;
                      return (
                        <div
                          key={receipt.id}
                          className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between gap-3 group"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                              {targetPoId ? (
                                <Link
                                  href={`/procurement/purchase-orders/${targetPoId}`}
                                  className="font-mono text-xs font-bold text-primary hover:underline"
                                >
                                  {poNum}
                                </Link>
                              ) : (
                                <span className="font-mono text-xs font-bold text-foreground">{poNum}</span>
                              )}
                              <StatusBadge status={receipt.status} />
                            </div>

                            <div className="mt-3">
                              <h4 className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                                {itemName}
                              </h4>
                              {itemCode && (
                                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                                  SKU: {itemCode}
                                </p>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 p-2 text-xs">
                              <span className="text-[11px] text-muted-foreground">Quantity</span>
                              <span className="font-mono font-bold text-foreground">
                                {receipt.poLine?.quantity ?? '—'} {receipt.poLine?.uom?.symbol || ''}
                              </span>
                            </div>

                            {vendorName && (
                              <p className="mt-2 text-[11px] text-muted-foreground truncate">
                                Vendor: <span className="font-medium text-foreground">{vendorName}</span>
                              </p>
                            )}
                          </div>

                          <div className="border-t border-border/60 pt-3">
                            {receipt.status !== 'FULLY_RECEIVED' ? (
                              <Link
                                href={`/receiving/goods-receipts/new?poId=${receipt.poId}&poLineId=${receipt.poLineId}`}
                                className="w-full block"
                              >
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="w-full rounded-xl shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-8"
                                >
                                  <PackageCheck size={13} className="mr-1.5" />
                                  <span>Receive Shipment</span>
                                  <ArrowRight size={13} className="ml-auto" />
                                </Button>
                              </Link>
                            ) : (
                              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground font-semibold py-1">
                                <CheckCircle2 size={14} />
                                <span>Fully Received</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
