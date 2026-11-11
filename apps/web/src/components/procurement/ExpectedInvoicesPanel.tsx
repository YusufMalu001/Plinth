'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@plinth/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { PaginationControls } from '@/components/PaginationControls';
import {
  useExpectedReceipts,
  useUpdateExpectedReceipt,
} from '@/features/purchases/hooks';
import { ExpectedReceiptStatus } from '@plinth/types';
import {
  ScanLine,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RotateCcw,
  Building2,
  Calendar,
  Boxes,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
} from 'lucide-react';
import { ReceivingListToolbar } from '@/features/goods-receipt/components/ReceivingListToolbar';
import { ReceivingSummaryCards } from '@/features/goods-receipt/components/ReceivingSummaryCards';

const RECEIPT_STATUS_OPTIONS: { label: string; value: ExpectedReceiptStatus | '' }[] = [
  { label: 'All Invoices', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Partially Received', value: 'PARTIALLY_RECEIVED' },
  { label: 'Fully Received', value: 'FULLY_RECEIVED' },
];

export function ExpectedInvoicesPanel({ embedded = false, navigation, hideHeader = false }: { embedded?: boolean; navigation?: React.ReactNode; hideHeader?: boolean }) {
  const router = useRouter();

  // Search, filter, sorting, and pagination state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpectedReceiptStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>('expectedDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedVendorPos, setExpandedVendorPos] = useState<Record<string, boolean>>({});
  // Debounce search query to optimize database requests
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Query database with pagination, search, status, and sort criteria
  const { data, isLoading, error, refetch, isFetching } = useExpectedReceipts({
    status: statusFilter || undefined,
    search: debouncedSearch.trim() || undefined,
    sortBy,
    sortOrder,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    overdueOnly,
    page,
    limit: pageSize,
  });

  const updateReceipt = useUpdateExpectedReceipt();

  const items = Array.isArray(data) ? data : (data?.items ?? []);
  const total = data?.total ?? (Array.isArray(data) ? data.length : items.length);

  // Group items by Vendor + PO (or Vendor + Expected Date + PO) so multiple material lines under the same PO/vendor appear as a single entry
  interface GroupedReceiptEntry {
    groupKey: string;
    poId?: string;
    poNumber: string;
    vendorName: string;
    expectedDate: string;
    status: ExpectedReceiptStatus;
    lineCount: number;
    totalQuantity: number;
    lines: typeof items;
  }

  const groupedEntries: GroupedReceiptEntry[] = useMemo(() => {
    const groups: Record<string, GroupedReceiptEntry> = {};

    for (const receipt of items) {
      const targetPoId =
        receipt.poId ||
        receipt.poLine?.poId ||
        receipt.poLine?.purchaseOrder?.id ||
        receipt.po?.id;
      const poNumber =
        receipt.po?.poNumber ??
        receipt.poLine?.purchaseOrder?.poNumber ??
        targetPoId ??
        'PO-UNKNOWN';
      const vendorName = receipt.poLine?.purchaseOrder?.vendor?.name || 'Unknown Vendor';

      const groupKey = `${vendorName}_${poNumber}_${receipt.expectedDate?.split('T')[0] || ''}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          groupKey,
          poId: targetPoId,
          poNumber,
          vendorName,
          expectedDate: receipt.expectedDate,
          status: receipt.status,
          lineCount: 0,
          totalQuantity: 0,
          lines: [],
        };
      }

      groups[groupKey].lines.push(receipt);
      groups[groupKey].lineCount += 1;
      groups[groupKey].totalQuantity += Number(receipt.poLine?.quantity || 0);

      // Determine aggregate group status
      const allLines = groups[groupKey].lines;
      const allFullyReceived = allLines.every((l) => l.status === 'FULLY_RECEIVED');
      const anyReceived = allLines.some((l) => l.status !== 'PENDING');
      groups[groupKey].status = allFullyReceived
        ? 'FULLY_RECEIVED'
        : anyReceived
        ? 'PARTIALLY_RECEIVED'
        : 'PENDING';
    }

    return Object.values(groups);
  }, [items]);

  const toggleExpand = (groupKey: string) => {
    setExpandedVendorPos((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };
  // Sorting toggle handler
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(current => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortableHeader = (column: string, label: string, extraClass: string = '') => {
    const isActive = sortBy === column;
    return (
      <TableHead
        className={`cursor-pointer select-none text-primary-foreground transition-colors hover:bg-primary/90 hover:text-primary-foreground ${extraClass}`}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1.5">
          <span className={isActive ? 'font-bold text-primary-foreground' : 'text-primary-foreground'}>{label}</span>
          {isActive ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-primary-foreground" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-primary-foreground" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-primary-foreground/65 transition-colors" />
          )}
        </div>
      </TableHead>
    );
  };

  // KPI Metrics calculation
  const summary = data?.summary;
  const pendingCount = summary?.pending ?? items.filter(item => item.status === 'PENDING').length;
  const partialCount = summary?.partiallyReceived ?? items.filter(item => item.status === 'PARTIALLY_RECEIVED').length;
  const completedCount = summary?.fullyReceived ?? items.filter(item => item.status === 'FULLY_RECEIVED').length;
  const overdueCount = summary?.overdue ?? items.filter(item =>
    item.status !== 'FULLY_RECEIVED' && new Date(item.expectedDate).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  ).length;

  return (
    <div className={embedded ? 'w-full space-y-6' : 'flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6'}>
      <div className="w-full space-y-6">
        {/* Page Header */}
        {!hideHeader && <PageHeader
          title="Expected Invoices"
          description={
            isLoading
              ? 'Loading expected supplier invoices...'
              : `${total} supplier invoice${total !== 1 ? 's' : ''} expected against open purchase orders`
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="font-semibold text-xs border-border/80 hover:border-primary/50 hover:text-primary"
              >
                <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
                Refresh
              </Button>
            </div>
          }
        />}

        <ReceivingSummaryCards metrics={[
          { label: 'All Invoices', value: summary?.total ?? total, icon: Boxes, iconClassName: 'text-slate-600 dark:text-slate-400' },
          { label: 'Pending Intake', value: pendingCount, icon: Clock },
          { label: 'Partially Received', value: partialCount, icon: AlertCircle },
          { label: 'Completed', value: completedCount, icon: CheckCircle2 },
          { label: 'Overdue', value: overdueCount, icon: AlertCircle, valueClassName: 'text-red-600 dark:text-red-400', iconClassName: 'text-red-500' },
        ]} />

        <ReceivingListToolbar
          navigation={navigation}
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(1); }}
          searchPlaceholder="Search by PO, vendor, product, or material..."
          filterValue={statusFilter}
          filterOptions={RECEIPT_STATUS_OPTIONS}
          onFilterChange={(value) => {
            setStatusFilter(value as ExpectedReceiptStatus | '');
            setOverdueOnly(false);
            setPage(1);
          }}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={(value) => { setDateFrom(value); setPage(1); }}
          onDateToChange={(value) => { setDateTo(value); setPage(1); }}
          dateFieldLabel="Expected date"
          onReset={() => {
            setSearch('');
            setStatusFilter('');
            setDateFrom('');
            setDateTo('');
            setOverdueOnly(false);
            setPage(1);
          }}
        />

        {/* Content Table State */}
        {isLoading ? (
          <LoadingState message="Loading expected supplier invoices..." />
        ) : error ? (
          <ErrorState error={error as Error} retry={refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No Expected Invoices Found"
            description={
              search || statusFilter || dateFrom || dateTo || overdueOnly
                ? 'No expected invoices matched your search and filter criteria. Try adjusting your query.'
                : 'Expected invoices appear here once purchase orders are issued to vendors. Invoice details can be recorded after physical goods verification.'
            }
            action={
              (search || statusFilter || dateFrom || dateTo || overdueOnly) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                    setDateFrom('');
                    setDateTo('');
                    setOverdueOnly(false);
                    setPage(1);
                  }}
                  className="font-semibold"
                >
                  Clear Filters
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-4">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    {renderSortableHeader('poNumber', 'PO Number')}
                    {renderSortableHeader('vendor', 'Vendor')}
                    {renderSortableHeader('expectedDate', 'Expected Date')}
                    <TableHead>Line Item & Specs</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    {renderSortableHeader('status', 'Status')}
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedEntries.map((group) => {
                    const isExpanded = Boolean(expandedVendorPos[group.groupKey]);
                    const isSingleLine = group.lines.length === 1;
                    const singleReceipt = group.lines[0];

                    const singleItemName =
                      singleReceipt.poLine?.product?.name ??
                      singleReceipt.poLine?.material?.name ??
                      'Line Item';
                    const singleItemCode =
                      singleReceipt.poLine?.product?.sku ??
                      singleReceipt.poLine?.material?.code;
                    const singleQuantity = singleReceipt.poLine?.quantity;
                    const singleUomSymbol = singleReceipt.poLine?.uom?.symbol ?? '';

                    return (
                      <React.Fragment key={group.groupKey}>
                        <TableRow
                          className={`group hover:bg-muted/30 transition-colors ${
                            isExpanded ? 'bg-muted/20 font-medium' : ''
                          }`}
                        >
                          {/* Expand/Collapse Chevron Button */}
                          <TableCell className="w-10 pl-4 pr-0">
                            {!isSingleLine ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(group.groupKey)}
                                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                title={isExpanded ? 'Collapse material lines' : `View all ${group.lineCount} material lines`}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-primary" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                          </TableCell>

                          {/* PO Number */}
                          <TableCell className="font-medium text-foreground">
                            {group.poId ? (
                              <Link
                                href={`/procurement/purchase-orders/${group.poId}`}
                                className="font-mono text-sm font-bold text-primary hover:underline"
                              >
                                {group.poNumber}
                              </Link>
                            ) : (
                              <span className="font-mono text-sm font-bold text-foreground">{group.poNumber}</span>
                            )}
                          </TableCell>

                          {/* Vendor Name (Shows as a single entry for this vendor) */}
                          <TableCell>
                            {group.vendorName ? (
                              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{group.vendorName}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>

                          {/* Expected receiving date */}
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1.5">
                              <Calendar className={`w-3.5 h-3.5 shrink-0 ${group.status === 'FULLY_RECEIVED' ? 'text-muted-foreground' : new Date(group.expectedDate).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime() ? 'text-red-500' : 'text-muted-foreground'}`} />
                              <span>
                                {new Date(group.expectedDate).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              {group.status !== 'FULLY_RECEIVED' && new Date(group.expectedDate).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime() && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-950/50 dark:text-red-300">Overdue</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Line Item & Code */}
                          <TableCell>
                            {isSingleLine ? (
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground text-sm">
                                  {singleItemName}
                                </span>
                                {singleItemCode && (
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {singleItemCode}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleExpand(group.groupKey)}
                                className="flex items-center gap-2 text-left text-foreground transition-colors cursor-pointer"
                              >
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
                                  <Layers className="w-3 h-3" />
                                  {group.lineCount} Material Lines
                                </span>
                                <span className="text-xs text-muted-foreground underline decoration-dotted">
                                  {isExpanded ? 'Hide items' : 'View materials'}
                                </span>
                              </button>
                            )}
                          </TableCell>

                          {/* Quantity */}
                          <TableCell className="text-center font-semibold text-sm text-foreground">
                            {isSingleLine ? (
                              singleQuantity !== undefined ? (
                                <span>
                                  {singleQuantity}{' '}
                                  <span className="text-xs text-muted-foreground font-normal">{singleUomSymbol}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )
                            ) : (
                              <span className="font-mono text-xs font-bold text-foreground">
                                {group.totalQuantity} <span className="text-[11px] text-muted-foreground font-normal">total</span>
                              </span>
                            )}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <StatusBadge status={group.status} className="text-xs" />
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            {isSingleLine ? (
                              singleReceipt.status !== 'FULLY_RECEIVED' ? (
                                <div className="flex items-center justify-end gap-2">
                                  {singleReceipt.status === 'PENDING' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        updateReceipt.mutate({
                                          id: singleReceipt.id,
                                          status: 'PARTIALLY_RECEIVED',
                                        })
                                      }
                                      disabled={updateReceipt.isPending}
                                      className="h-8 text-xs font-semibold hover:border-primary/50 hover:text-primary"
                                    >
                                      Partial
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        `/receiving/goods-receipts/new?poId=${singleReceipt.poId}&poLineId=${singleReceipt.poLineId}`
                                      )
                                    }
                                    disabled={updateReceipt.isPending}
                                    className="h-8 bg-primary text-xs text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs"
                                  >
                                    <ScanLine className="mr-1.5 h-3.5 w-3.5" /> Start OCR intake
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs font-semibold flex items-center justify-end gap-1 text-muted-foreground px-3 py-1.5 bg-muted rounded-full inline-flex ml-auto border border-border">
                                  <Check className="w-3.5 h-3.5" /> Received
                                </span>
                              )
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  onClick={() =>
                                    router.push(
                                      `/receiving/goods-receipts/new?poId=${group.poId}`
                                    )
                                  }
                                  disabled={updateReceipt.isPending}
                                  className="h-8 bg-primary text-xs text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs"
                                >
                                  <ScanLine className="mr-1.5 h-3.5 w-3.5" /> Capture Invoice
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expandable Drawer showing all material lines for this vendor PO */}
                        {!isSingleLine && isExpanded && (
                          <TableRow className="bg-muted/15 border-b border-border/80">
                            <TableCell colSpan={8} className="p-0">
                              <div className="p-4 pl-12 pr-6 space-y-3 bg-muted/10 border-l-4 border-l-primary/60">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-primary" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                                      Material Lines for {group.vendorName} ({group.poNumber})
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {group.lines.length} items in consignment
                                  </span>
                                </div>

                                <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
                                  <table className="w-full text-left text-xs">
                                    <thead className="border-b border-border/70 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      <tr>
                                        <th className="px-4 py-2.5">Line Material & Specs</th>
                                        <th className="px-4 py-2.5 text-center">Expected Qty</th>
                                        <th className="px-4 py-2.5 text-center">Status</th>
                                        <th className="px-4 py-2.5 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                      {group.lines.map((lineReceipt) => {
                                        const subItemName =
                                          lineReceipt.poLine?.product?.name ??
                                          lineReceipt.poLine?.material?.name ??
                                          'Line Item';
                                        const subItemCode =
                                          lineReceipt.poLine?.product?.sku ??
                                          lineReceipt.poLine?.material?.code;
                                        const subQuantity = lineReceipt.poLine?.quantity;
                                        const subUomSymbol = lineReceipt.poLine?.uom?.symbol ?? '';

                                        return (
                                          <tr key={lineReceipt.id} className="hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                              <p className="font-semibold text-foreground text-xs">{subItemName}</p>
                                              {subItemCode && (
                                                <p className="font-mono text-[10px] text-muted-foreground">{subItemCode}</p>
                                              )}
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono font-bold text-foreground">
                                              {subQuantity !== undefined ? (
                                                <span>
                                                  {subQuantity} <span className="text-xs text-muted-foreground font-normal">{subUomSymbol}</span>
                                                </span>
                                              ) : (
                                                '—'
                                              )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                              <StatusBadge status={lineReceipt.status} className="text-[11px]" />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {lineReceipt.status !== 'FULLY_RECEIVED' ? (
                                                <div className="flex items-center justify-end gap-1.5">
                                                  {lineReceipt.status === 'PENDING' && (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() =>
                                                        updateReceipt.mutate({
                                                          id: lineReceipt.id,
                                                          status: 'PARTIALLY_RECEIVED',
                                                        })
                                                      }
                                                      disabled={updateReceipt.isPending}
                                                      className="h-7 text-[11px] px-2 font-semibold"
                                                    >
                                                      Partial
                                                    </Button>
                                                  )}
                                                  <Button
                                                    type="button"
                                                    variant="default"
                                                    size="sm"
                                                    onClick={() =>
                                                      router.push(
                                                        `/receiving/goods-receipts/new?poId=${lineReceipt.poId}&poLineId=${lineReceipt.poLineId}`
                                                      )
                                                    }
                                                    disabled={updateReceipt.isPending}
                                                    className="h-7 bg-primary text-[11px] px-2 text-primary-foreground hover:bg-primary/90 font-semibold"
                                                  >
                                                    <ScanLine className="mr-1 h-3 w-3" /> Receive
                                                  </Button>
                                                </div>
                                              ) : (
                                                <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1">
                                                  <Check className="w-3 h-3" /> Received
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
            </Table>

            {/* Themed Pagination Controls */}
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={newPage => setPage(newPage)}
              onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
