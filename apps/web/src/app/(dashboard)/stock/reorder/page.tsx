"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useReorderSignals } from '../../../../features/inventory/hooks';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { ForbiddenState } from '../../../../components/ForbiddenState';
import { PaginationControls } from '../../../../components/PaginationControls';
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
} from '@plinth/ui';
import {
  Search,
  AlertTriangle,
  ShoppingCart,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export default function StockReorderPage() {
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const { data: signals, isLoading, error, refetch, isRefetching } = useReorderSignals();

  // Reset pagination when search or filters change
  useEffect(() => {
    setPage(1);
  }, [search, onlyLow]);

  const rawItems = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof signals>[number]>();
    for (const signal of signals ?? []) {
      const existing = grouped.get(signal.itemKey);
      if (!existing) {
        grouped.set(signal.itemKey, { ...signal });
        continue;
      }
      const onHandQuantity = Number(existing.onHandQuantity) + Number(signal.onHandQuantity);
      const availableQuantity = Number(existing.availableQuantity) + Number(signal.availableQuantity);
      const avgDailyConsumption = Number(existing.avgDailyConsumption) + Number(signal.avgDailyConsumption);
      grouped.set(signal.itemKey, {
        ...existing,
        onHandQuantity,
        availableQuantity,
        avgDailyConsumption,
        daysOfCover: avgDailyConsumption > 0 ? onHandQuantity / avgDailyConsumption : null,
        belowSafetyBuffer: existing.configuredSafetyBuffer !== null
          ? availableQuantity <= existing.configuredSafetyBuffer
          : null,
      });
    }
    return [...grouped.values()];
  }, [signals]);

  const filtered = useMemo(() => {
    return rawItems.filter((s) => {
      if (onlyLow && !s.belowSafetyBuffer && (s.daysOfCover === null || s.daysOfCover > 14)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const label = `${s.product?.sku ?? ''} ${s.product?.name ?? ''} ${s.material?.code ?? ''} ${s.material?.name ?? ''} ${s.itemKey}`.toLowerCase();
      return label.includes(q);
    });
  }, [rawItems, onlyLow, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aCover = a.daysOfCover ?? Infinity;
      const bCover = b.daysOfCover ?? Infinity;
      return aCover - bCover;
    });
  }, [filtered]);

  const paginatedSignals = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const criticalCount = rawItems.filter((s) => s.belowSafetyBuffer || (s.daysOfCover !== null && s.daysOfCover <= 7)).length;
  const warningCount = rawItems.filter((s) => s.daysOfCover !== null && s.daysOfCover > 7 && s.daysOfCover <= 21).length;
  const healthyCount = rawItems.length - criticalCount - warningCount;

  if (isLoading) return <LoadingState message="Computing reorder consumption velocity..." />;
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return <ForbiddenState />;
    return <ErrorState error={error as Error} retry={refetch} />;
  }

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full">
      <div className="w-full space-y-8">

        {/* Page Header */}
        <PageHeader
          title="Reorder Signals & Shortage Forecast"
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
              <Link href="/procurement/purchase-orders/generate">
                <Button
                  className="gap-1.5 rounded-full shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>Generate PO from Signals</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* 4 Quantitative Metric Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Critical (&lt; 7 Days)</p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-foreground font-mono">
              {criticalCount}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reorder Soon (8-21d)</p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-foreground font-mono">
              {warningCount}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Healthy Buffer</p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-foreground font-mono">
              {healthyCount}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Analyzed</p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-foreground font-mono">
              {rawItems.length}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Item Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2">
            <FilterPills
              options={[
                { label: 'All Stock Levels', value: 'all' },
                { label: 'Critical & Low Stock Only', value: 'low', icon: AlertTriangle },
              ]}
              value={onlyLow ? 'low' : 'all'}
              onChange={(val) => setOnlyLow(val === 'low')}
              size="sm"
            />
          </div>
        </div>

        {/* Standard @plinth/ui Table Card */}
        <Card className="shadow-xs overflow-hidden border border-border/80 rounded-2xl">
          <div className="p-5 sm:p-6 border-border-strong border-border/80 flex items-center justify-between bg-card">
            <h2 className="text-sm font-semibold text-foreground">
              Shortage Run-Out &amp; Consumption Velocity
            </h2>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              {sorted.length} {sorted.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {sorted.length === 0 ? (
            <div className="p-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-tone-green-text mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">All Stock Levels are Healthy</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                No active shortages detected based on 30-day consumption velocity.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-6 py-4 w-[35%]">Item SKU / Name</TableHead>
                    <TableHead className="text-right py-4 w-[18%]">Available</TableHead>
                    <TableHead className="text-right py-4 w-[18%]">Buffer</TableHead>
                    <TableHead className="py-4 w-[15%]">Stock Health</TableHead>
                    <TableHead className="text-center py-4 w-[14%] pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSignals.map((s) => {
                    const isProduct = Boolean(s.product);
                    const name = isProduct ? s.product?.name : s.material?.name || s.itemKey;
                    const isCritical = s.belowSafetyBuffer || (s.daysOfCover !== null && s.daysOfCover <= 7);
                    const isWarning = !isCritical && s.daysOfCover !== null && s.daysOfCover <= 21;

                    return (
                      <TableRow
                        key={`${s.itemKey}:${s.locationId}`}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <TableCell className="pl-6 py-4">
                          <div className="font-medium text-foreground text-sm truncate" title={name}>
                            <StockItemName name={name} item={s.product || s.material} />
                          </div>
                        </TableCell>

                        <TableCell className="text-right py-4 font-mono font-bold text-foreground text-sm whitespace-nowrap">
                          {Number(s.availableQuantity).toLocaleString()}
                        </TableCell>

                        <TableCell className="text-right py-4 font-mono text-xs text-muted-foreground">
                          {s.configuredSafetyBuffer !== null ? s.configuredSafetyBuffer : '—'}
                        </TableCell>

                        <TableCell className="py-4 whitespace-nowrap overflow-hidden">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${isCritical
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : isWarning
                              ? 'bg-muted text-foreground border-border'
                              : 'bg-muted text-muted-foreground border-border'
                            }`}>
                            {isCritical ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <CheckCircle2 className="h-3 w-3 shrink-0" />}
                            <span>{isCritical ? 'Critical' : isWarning ? 'Reorder Soon' : 'Healthy'}</span>
                          </span>
                        </TableCell>

                        <TableCell className="text-center py-4 pr-6">
                          {(() => {
                            const hasConfiguredBuffer = typeof s.configuredSafetyBuffer === 'number';
                            const bufferQty = hasConfiguredBuffer ? Math.max(0, s.configuredSafetyBuffer as number) : 0;
                            // Use buffer quantity as the primary default; if buffer is 0, use calculated shortage or min 1
                            const defaultQty = bufferQty > 0 ? bufferQty : Math.max(1, Math.round(Math.max(0, 10 - Number(s.availableQuantity || 0))));
                            const itemId = s.productId || s.materialId || '';
                            const itemType = s.productId ? 'product' : 'material';
                            const itemName = encodeURIComponent(name || '');
                            const url = `/procurement/purchase-orders/generate?itemId=${itemId}&itemType=${itemType}&itemName=${itemName}&quantity=${defaultQty}&bufferQty=${bufferQty}&overrideDraft=true`;
                            return (
                              <Link href={url}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs rounded-full gap-1 text-foreground hover:text-primary px-3.5"
                                >
                                  <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                                  <span>Create PO</span>
                                  <ArrowRight className="h-3 w-3 opacity-60 shrink-0" />
                                </Button>
                              </Link>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {/* Pagination Controls */}
          {sorted.length > pageSize && (
            <div className="p-4 border-t border-border/80 bg-card">
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={sorted.length}
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
