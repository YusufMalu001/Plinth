"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStockAdjustments } from '../../../../features/inventory/hooks';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { ForbiddenState } from '../../../../components/ForbiddenState';
import { PaginationControls } from '../../../../components/PaginationControls';
import type { StockAdjustmentStatus } from '../../../../features/inventory/api';
import { FilterPills } from '../../../../components/FilterPills';
import {
  PageHeader,
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
} from '@synergy/ui';
import {
  Search,
  SlidersHorizontal,
  Plus,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
} from 'lucide-react';


export default function StockAdjustmentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockAdjustmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const { data, isLoading, error, refetch, isRefetching } = useStockAdjustments({
    status: statusFilter || undefined,
    limit: 500,
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  if (isLoading) return <LoadingState message="Loading inventory adjustments..." />;
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return <ForbiddenState />;
    return <ErrorState error={error as Error} retry={refetch} />;
  }

  const rawItems = data?.items ?? [];

  const items = rawItems.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const num = (a.adjustmentNumber || '').toLowerCase();
    const itemStr = `${a.product?.sku ?? ''} ${a.product?.name ?? ''} ${a.material?.code ?? ''} ${a.material?.name ?? ''}`.toLowerCase();
    const reasonStr = (a.reason ?? '').toLowerCase();
    return num.includes(q) || itemStr.includes(q) || reasonStr.includes(q);
  });

  const totalCount = data?.total ?? rawItems.length;
  const proposedCount = rawItems.filter((a) => a.status === 'PROPOSED' || a.status === 'UNDER_REVIEW').length;
  const approvedCount = rawItems.filter((a) => a.status === 'APPROVED').length;
  const postedCount = rawItems.filter((a) => a.status === 'POSTED').length;

  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full">
      <div className="w-full space-y-6">
        
        {/* Page Header */}
        <PageHeader
          title="Stock Adjustments"
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="gap-2 rounded-full shadow-xs"
              >
                <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
              <Link href="/stock/adjustments/new">
                <Button
                  size="sm"
                  className="gap-1.5 rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Propose Adjustment</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* 4 Quantitative Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Adjustments</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {totalCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Review</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {proposedCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approved</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {approvedCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Posted to Ledger</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {postedCount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Adjustment #, Item Name, Reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <FilterPills
              label="Status:"
              options={[
                { label: 'All Statuses', value: '' },
                { label: 'Proposed', value: 'PROPOSED' },
                { label: 'Under Review', value: 'UNDER_REVIEW' },
                { label: 'Approved', value: 'APPROVED' },
                { label: 'Posted to Ledger', value: 'POSTED' },
                { label: 'Rejected', value: 'REJECTED' },
              ]}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as StockAdjustmentStatus | '')}
              size="sm"
            />
          </div>
        </div>

        {/* Standard @synergy/ui Table Card */}
        <Card className="shadow-xs overflow-hidden border border-border/80">
          <div className="p-4 border-b border-border/80 flex items-center justify-between bg-card">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Adjustment Records
              </h2>
              <span className="text-xs text-muted-foreground">
                ({items.length} records)
              </span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center">
              <SlidersHorizontal className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">No Adjustments Found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {search || statusFilter
                  ? 'No adjustments match your active filter or search query.'
                  : 'Propose a stock adjustment to reconcile physical stock discrepancies with audit approval.'}
              </p>
            </div>
          ) : (
            <div className="w-full">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Adjustment #</TableHead>
                    <TableHead className="w-[35%]">Item Name</TableHead>
                    <TableHead className="w-[15%] whitespace-nowrap">Delta</TableHead>
                    <TableHead className="w-[15%]">Reason</TableHead>
                    <TableHead className="text-center w-[5%] whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((a) => {
                    const isProduct = Boolean(a.product);
                    const variantName = a.reason?.match(/\[Variant:\s*([^\]]+)\]/i)?.[1];
                    const name = variantName || (isProduct ? a.product?.name : a.material?.name) || 'Item';
                    const isPositive = a.direction === 'INCREASE';
                    const delta = Number(a.quantity || 0);
                    return (
                      <TableRow key={a.id} className="hover:bg-muted/40">
                        <TableCell className="font-mono font-semibold text-primary text-xs break-all">
                          <Link
                            href={`/stock/adjustments/${a.id}`}
                            className="hover:underline"
                          >
                            {a.adjustmentNumber}
                          </Link>
                        </TableCell>

                        <TableCell>
                          <div className="font-medium text-foreground text-sm truncate" title={name}>
                            <StockItemName name={name} item={a.product || a.material} context={a.reason} />
                          </div>
                        </TableCell>

                        <TableCell className="overflow-hidden">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-muted text-foreground border-border whitespace-nowrap"
                          >
                            {isPositive ? <ArrowDownToLine className="h-3 w-3 text-muted-foreground" /> : <ArrowUpFromLine className="h-3 w-3 text-muted-foreground" />}
                            <span className="font-mono font-semibold">
                              {isPositive ? `+${delta.toLocaleString()}` : `−${delta.toLocaleString()}`}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <div className="text-xs text-muted-foreground truncate" title={a.reason || 'Audit reconciliation'}>
                            {a.reason || 'Audit reconciliation'}
                          </div>
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <Link href={`/stock/adjustments/${a.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-primary"
                              title="Review / View Adjustment"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {items.length > pageSize && (
            <div className="p-4 border-t border-border/80 bg-card">
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={items.length}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
              />
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
