'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  PageHeader,
  EmptyState,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@plinth/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { ForbiddenState } from '@/components/ForbiddenState';
import { PaginationControls } from '@/components/PaginationControls';
import { useGrnCapabilities, useGrnList } from '@/features/goods-receipt/hooks';
import { ReceivingListToolbar, ReceivingTabs } from '@/features/goods-receipt/components/ReceivingListToolbar';
import { useExpectedReceipts } from '@/features/purchases/hooks';
import type { Grn } from '@/features/goods-receipt/api';
import { GrnStatus } from '@plinth/types';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Layers,
  ArrowRight,
  RotateCcw,
  Building2,
  CalendarDays,
} from 'lucide-react';
import { useDebounce } from '../../../../common/hooks/useDebounce';
import { ExpectedInvoicesPanel } from '@/components/procurement/ExpectedInvoicesPanel';
import { ReceivingSummaryCards } from '@/features/goods-receipt/components/ReceivingSummaryCards';

const GRN_STATUSES: { label: string; value: GrnStatus | '' }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'Arrived', value: 'ARRIVED' },
  { label: 'Under Verification', value: 'UNDER_VERIFICATION' },
  { label: 'Discrepancy Pending', value: 'DISCREPANCY_PENDING' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Signed Off', value: 'SIGNED_OFF' },
  { label: 'Finalized', value: 'FINALIZED' },
];

const localDateKey = (value?: string | Date | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function GoodsReceiptsListPage({ searchParams }: { searchParams?: { status?: string; tab?: string } }) {
  const router = useRouter();
  const initialStatus = (searchParams?.status as GrnStatus) || '';
  const [activeTab, setActiveTab] = useState<'all' | 'discrepancies' | 'expected-invoices'>(
    searchParams?.tab === 'expected-invoices' ? 'expected-invoices' : initialStatus === 'DISCREPANCY_PENDING' || searchParams?.tab === 'discrepancies' ? 'discrepancies' : 'all'
  );
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState<GrnStatus | ''>(initialStatus);
  const [sortBy, setSortBy] = useState<string>('receivedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const requested = urlParams.get('status') as GrnStatus | null;
    const tab = urlParams.get('tab');
    if (tab === 'expected-invoices') {
      setActiveTab('expected-invoices');
    } else if (requested === 'DISCREPANCY_PENDING' || tab === 'discrepancies') {
      setActiveTab('discrepancies');
      setStatusFilter('DISCREPANCY_PENDING');
    } else if (requested && GRN_STATUSES.some((item) => item.value === requested)) {
      setStatusFilter(requested);
      setActiveTab('all');
    } else if (searchParams?.status && GRN_STATUSES.some((item) => item.value === searchParams.status)) {
      setStatusFilter(searchParams.status as GrnStatus);
      if (searchParams.status === 'DISCREPANCY_PENDING') {
        setActiveTab('discrepancies');
      }
    }
  }, [searchParams?.status, searchParams?.tab]);

  const { data, isLoading, error, refetch } = useGrnList({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    page,
    limit: pageSize,
  });
  const { data: capabilities } = useGrnCapabilities();
  const expectedSummaryQuery = useExpectedReceipts({ sortBy: 'expectedDate', sortOrder: 'asc', page: 1, limit: 10 });

  const items: Grn[] = Array.isArray(data) ? data : (data?.items ?? []);
  const total = data?.total ?? items.length;

  // Sorting
  const sortedItems = useMemo(() => {
    return [...items].filter((item) => {
      const received = localDateKey(item.receivedAt);
      return (!dateFrom || received >= dateFrom) && (!dateTo || received <= dateTo);
    }).sort((a, b) => {
      let aVal = (a as unknown as Record<string, unknown>)[sortBy];
      let bVal = (b as unknown as Record<string, unknown>)[sortBy];

      if (sortBy === 'vendor') {
        aVal = a.vendor?.name || a.vendorId || '';
        bVal = b.vendor?.name || b.vendorId || '';
      } else if (sortBy === 'lines') {
        aVal = a.lines?.length || 0;
        bVal = b.lines?.length || 0;
      }

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const factor = sortOrder === 'asc' ? 1 : -1;
      return aVal > bVal ? factor : -factor;
    });
  }, [items, sortBy, sortOrder, dateFrom, dateTo]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const renderSortableHeader = (column: string, label: string, extraClass: string = '') => {
    return (
      <TableHead
        className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${extraClass}`}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {sortBy === column ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-foreground" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-foreground" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    );
  };

  // KPI calculations
  const arrivedCount = items.filter((i) => i.status === 'ARRIVED').length;
  const underVerificationCount = items.filter((i) => i.status === 'UNDER_VERIFICATION').length;
  const discrepancyCount = items.filter((i) => i.status === 'DISCREPANCY_PENDING').length;
  const finalizedCount = items.filter(
    (i) => i.status === 'VERIFIED' || i.status === 'SIGNED_OFF' || i.status === 'FINALIZED'
  ).length;
  const discrepancyLineCount = items.reduce((count, item) => count + (item.lines?.length ?? 0), 0);
  const discrepancyVendorCount = new Set(items.map((item) => item.vendorId || item.vendor?.name).filter(Boolean)).size;
  const multiLineDiscrepancyCount = items.filter((item) => (item.lines?.length ?? 0) > 1).length;
  const oldestDiscrepancyAge = items.length
    ? Math.max(0, Math.floor((Date.now() - Math.min(...items.map((item) => new Date(item.receivedAt).getTime()))) / 86_400_000))
    : 0;
  const summaryMetrics = activeTab === 'discrepancies'
    ? [
        { label: 'Discrepant Receipts', value: total, icon: AlertTriangle, iconClassName: 'text-tone-red-text' },
        { label: 'Affected Lines', value: discrepancyLineCount, icon: Layers },
        { label: 'Suppliers', value: discrepancyVendorCount, icon: Building2 },
        { label: 'Multi-Line Receipts', value: multiLineDiscrepancyCount, icon: Layers },
        { label: 'Oldest Open (Days)', value: oldestDiscrepancyAge, icon: CalendarDays },
      ]
    : [
        { label: 'Total Receipts', value: total, icon: Layers },
        { label: 'Arrived / Staging', value: arrivedCount, icon: Clock },
        { label: 'Pending Review', value: underVerificationCount + discrepancyCount, icon: AlertTriangle },
        { label: 'Verified & Finalized', value: finalizedCount, icon: CheckCircle2 },
        { label: 'Discrepancy Pending', value: discrepancyCount, icon: AlertTriangle, iconClassName: 'text-tone-red-text' },
      ];

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        {/* Consistent Procurement-style PageHeader */}
        <PageHeader
          title={activeTab === 'expected-invoices' ? 'Expected Invoices' : 'Goods Receipts'}
          description={activeTab === 'expected-invoices'
            ? expectedSummaryQuery.isLoading
              ? 'Loading expected supplier invoices...'
              : `${expectedSummaryQuery.data?.summary?.total ?? expectedSummaryQuery.data?.total ?? 0} supplier invoices expected against open purchase orders`
            : isLoading ? 'Loading...' : `${total} receipt${total !== 1 ? 's' : ''} recorded`}
          actions={
            <div className="flex items-center gap-2.5">
              {activeTab === 'expected-invoices' ? (
                <Button variant="outline" size="sm" onClick={() => expectedSummaryQuery.refetch()} disabled={expectedSummaryQuery.isFetching} className="font-semibold text-xs">
                  <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${expectedSummaryQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              ) : capabilities?.receive && (
                <Link href="/receiving/goods-receipts/new">
                  <Button
                    variant="default"
                    id="btn-new-grn"
                    className="rounded-full shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Goods Receipt
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        {/* GRN summary cards only apply to the receipt list and discrepancy hub. */}
        {activeTab !== 'expected-invoices' && <ReceivingSummaryCards metrics={summaryMetrics} />}

        {activeTab !== 'expected-invoices' && (
          <ReceivingListToolbar
            navigation={
              <ReceivingTabs
                activeTab={activeTab}
                total={total}
                discrepancyCount={discrepancyCount}
                onSelect={(tab) => {
                  setActiveTab(tab);
                  setPage(1);
                  if (tab === 'all') {
                    setStatusFilter('');
                    router.push('/receiving/goods-receipts');
                  } else if (tab === 'expected-invoices') {
                    setStatusFilter('');
                    router.push('/receiving/goods-receipts?tab=expected-invoices');
                  } else {
                    setStatusFilter('DISCREPANCY_PENDING');
                    router.push('/receiving/goods-receipts?tab=discrepancies');
                  }
                }}
              />
            }
            search={search}
            onSearchChange={(value) => { setSearch(value); setPage(1); }}
            searchPlaceholder="Search by GRN number, PO, or vendor..."
            filterValue={statusFilter}
            filterOptions={GRN_STATUSES}
            onFilterChange={(value) => {
              const nextStatus = value as GrnStatus | '';
              setStatusFilter(nextStatus);
              setActiveTab(nextStatus === 'DISCREPANCY_PENDING' ? 'discrepancies' : 'all');
              setPage(1);
            }}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={(value) => { setDateFrom(value); setPage(1); }}
            onDateToChange={(value) => { setDateTo(value); setPage(1); }}
            dateFieldLabel="Received date"
            onReset={() => { setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          />
        )}
        {activeTab === 'expected-invoices' ? (
          <ExpectedInvoicesPanel
            embedded
            hideHeader
            navigation={
              <ReceivingTabs
                activeTab="expected-invoices"
                total={total}
                discrepancyCount={discrepancyCount}
                onSelect={(tab) => {
                  setActiveTab(tab);
                  setPage(1);
                  if (tab === 'all') {
                    setStatusFilter('');
                    router.push('/receiving/goods-receipts');
                  } else if (tab === 'expected-invoices') {
                    setStatusFilter('');
                    router.push('/receiving/goods-receipts?tab=expected-invoices');
                  } else {
                    setStatusFilter('DISCREPANCY_PENDING');
                    router.push('/receiving/goods-receipts?tab=discrepancies');
                  }
                }}
              />
            }
          />
        ) : isLoading ? (
          <LoadingState message="Loading goods receipts..." />
        ) : error ? (
          (error as { status?: number }).status === 401 ? (
            <ForbiddenState message="You must be logged in to view goods receipts." />
          ) : (error as { status?: number }).status === 403 ? (
            <ForbiddenState message="You do not have permission to view goods receipts." />
          ) : (
            <ErrorState error={error as Error} retry={refetch} />
          )
        ) : items.length === 0 ? (
          <EmptyState
            title="No Goods Receipts Found"
            description={
              statusFilter
                ? 'Try adjusting your search or filter criteria.'
                : 'Receive an incoming shipment from the Expected Receipts queue to get started.'
            }
          />
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  {renderSortableHeader('grnNumber', 'GRN Number')}
                  <TableHead>Source PO</TableHead>
                  {renderSortableHeader('vendor', 'Vendor')}
                  {renderSortableHeader('lines', 'Lines')}
                  <TableHead>Status</TableHead>
                  {renderSortableHeader('receivedAt', 'Received Date')}
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((grn) => (
                  <TableRow
                    key={grn.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/receiving/goods-receipts/${grn.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/receiving/goods-receipts/${grn.id}`);
                      }
                    }}
                    className="cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors group"
                  >
                    {/* GRN Number */}
                    <TableCell className="font-mono text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {grn.grnNumber}
                    </TableCell>

                    {/* Source PO */}
                    <TableCell>
                      {grn.isUnreferenced ? (
                        <span className="text-[11px] bg-tone-amber-bg text-tone-amber-text px-2.5 py-0.5 rounded-full font-semibold border border-tone-amber-solid/25">
                          Unreferenced
                        </span>
                      ) : grn.poId || grn.po?.id ? (
                        <Link
                          onClick={(event) => event.stopPropagation()}
                          href={`/procurement/purchase-orders/${grn.poId || grn.po?.id}`}
                          className="text-primary hover:underline font-mono text-xs font-semibold bg-primary/5 px-2 py-1 rounded-md"
                        >
                          {grn.po?.poNumber ?? (grn.poId || grn.po?.id)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{grn.po?.poNumber || '—'}</span>
                      )}
                    </TableCell>

                    {/* Vendor */}
                    <TableCell className="font-medium text-foreground">
                      {grn.vendor?.name ?? grn.vendorId ?? '—'}
                    </TableCell>

                    {/* Line Count */}
                    <TableCell className="font-medium text-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span>{grn.lines?.length ?? 0}</span>
                        <span className="text-xs text-muted-foreground">lines</span>
                      </span>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      <StatusBadge status={grn.status} />
                    </TableCell>

                    {/* Received Date */}
                    <TableCell className="text-muted-foreground font-medium text-xs">
                      {new Date(grn.receivedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </TableCell>

                    {/* Action Arrow */}
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <span>Inspect</span>
                        <ArrowRight size={13} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
