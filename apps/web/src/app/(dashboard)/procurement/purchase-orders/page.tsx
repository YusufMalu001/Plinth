'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, PageHeader, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Card } from '@synergy/ui';
import { StatusBadge } from '../../../../components/StatusBadge';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { usePOList, useDeletePO } from '../../../../features/purchases/hooks';
import { useCurrentUser } from '../../../../features/auth/hooks';
import { PO } from '../../../../features/purchases/api';
import { PoStatus } from '@synergy/types';
import { 
  Calendar, 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  Search, 
  Plus, 
  Trash2, 
  FileSpreadsheet, 
  CheckCircle2, 
  Clock, 
  PackageCheck, 
  X, 
  RotateCcw,
  Pencil,
} from 'lucide-react';
import { useDebounce } from '../../../../common/hooks/useDebounce';
import { PaginationControls } from '../../../../components/PaginationControls';
import { ConfirmDeleteDialog } from '../../../../components/ConfirmDeleteDialog';
import { showToast } from '../../../../components/toast-store';
const PO_STATUS_TABS: { label: string; value: PoStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function PurchaseOrdersListPage() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const deletePO = useDeletePO();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; poNumber: string } | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState<PoStatus | ''>('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  useEffect(() => setPage(1), [debouncedSearch, statusFilter, sortBy, sortOrder, startDate, endDate]);
  const applyMonthYearFilter = () => {
    if (filterMonth && filterYear) {
      const year = parseInt(filterYear);
      const month = parseInt(filterMonth);
      const startStr = `${year}-${month.toString().padStart(2, '0')}-01`;
      const end = new Date(year, month, 0);
      const endStr = `${year}-${month.toString().padStart(2, '0')}-${end.getDate().toString().padStart(2, '0')}`;
      
      setStartDate(startStr);
      setEndDate(endStr);
      setDateFilterOpen(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const renderSortableHeader = (column: string, label: string, extraClass: string = '') => {
    return (
      <TableHead 
        className={`cursor-pointer select-none hover:bg-white/10 transition-colors text-white font-bold py-3.5 ${extraClass}`}
        onClick={() => handleSort(column)}
      >
        <div className={`flex items-center gap-1.5 ${extraClass.includes('text-right') ? 'justify-end' : extraClass.includes('text-center') ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {sortBy === column ? (
            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-white shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-white shrink-0" />
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-white/50 shrink-0" />
          )}
        </div>
      </TableHead>
    );
  };
  const { data: allData } = usePOList({ limit: 100 });
  const { data, isLoading, error, refetch } = usePOList({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    sortBy,
    sortOrder,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit: pageSize,
  });

  const items = Array.isArray(data) ? data : (data?.items ?? []);
  const rawRoles = [currentUser?.role, currentUser?.roleDefinition?.key, currentUser?.roleDefinition?.name, ...(currentUser?.roles?.map(r => r.key) ?? []), ...(currentUser?.roles?.map(r => r.name) ?? [])].filter(Boolean) as string[];
  const normalizedRoles = rawRoles.map(role => role.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const canDeletePO = normalizedRoles.some(role => ['admin', 'super_admin'].includes(role));
  const canEditPO = normalizedRoles.some(role => ['admin', 'super_admin', 'procurement_manager', 'store_manager', 'inventory_manager', 'manager'].includes(role));
  const total = data?.total !== undefined ? data.total : (Array.isArray(data) ? data.length : items.length);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deletePO.mutateAsync({ id: target.id, poNumber: target.poNumber });
      setDeleteTarget(null);
      showToast({ kind: 'success', title: 'Purchase order deleted', message: `${target.poNumber} was deleted.` });
      await refetch();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.includes('not found')
        ? `${target.poNumber} could not be found. Refresh the register and try again.`
        : rawMessage || 'Unable to delete the purchase order. Please try again.';
      showToast({ kind: 'error', title: 'Delete failed', message });
    }
  };

  const allItems = Array.isArray(allData) ? allData : (allData?.items ?? []);
  const allTotal = allData?.total !== undefined ? allData.total : allItems.length;
  const draftCount = allItems.filter(po => po.status === 'DRAFT').length;
  const approvedCount = allItems.filter(po => ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status)).length;
  const cancelledCount = allItems.filter(po => ['CANCELLED', 'REJECTED', 'SUPERSEDED'].includes(po.status)).length;

  const calcTotalAmount = (po: PO) => {
    if (po.totalAmount !== undefined && po.totalAmount !== null && Number(po.totalAmount) > 0) {
      return Number(po.totalAmount);
    }
    if (po.subtotal !== undefined && po.subtotal !== null && Number(po.subtotal) > 0) {
      return Number(po.subtotal) + Number(po.taxAmount || 0);
    }
    if (po.lines?.length) {
      return po.lines.reduce((sum, line) => {
        const lineTotal = Number(line.lineTotal) || (Number(line.quantity || 0) * Number(line.unitPrice || 0));
        return sum + lineTotal;
      }, 0);
    }
    return 0;
  };

  const getEarliestNeedDate = (po: PO) => {
    const dates = (po.lines || []).map(l => l.needDate).filter(Boolean);
    if (!dates.length) return null;
    const sorted = [...dates].sort();
    return sorted[0];
  };
  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 space-y-4">
      <div className="w-full space-y-4">
        <PageHeader 
          title="Purchase Orders"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button 
                  variant="outline" 
                  onClick={() => setDateFilterOpen(!dateFilterOpen)} 
                  icon={Calendar} 
                  className={`font-semibold shadow-xs text-xs h-9 ${startDate || endDate ? 'border-primary text-primary bg-primary/5' : ''}`}
                >
                  {startDate && endDate ? `${startDate} → ${endDate}` : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}
                </Button>
                {dateFilterOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDateFilterOpen(false)}></div>
                    <div className="absolute right-0 mt-2 p-4 bg-popover rounded-xl shadow-lg border border-border z-50 w-72 animate-in fade-in zoom-in-95 duration-100">
                      <div className="mb-3 flex items-center justify-between rounded-xl bg-primary/5 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-primary"><Calendar className="h-4 w-4" /> Choose dates</div><span className="text-[10px] font-medium text-muted-foreground">{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}</span></div>
                      
                      <div className="space-y-4">
                        {/* Fast Select */}
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Month / Year</label>
                          <div className="flex gap-2">
                            <select 
                              className="flex-1 text-sm p-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary/20"
                              value={filterMonth}
                              onChange={(e) => setFilterMonth(e.target.value)}
                            >
                              <option value="">Month</option>
                              {Array.from({length: 12}).map((_, i) => (
                                <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'short' })}</option>
                              ))}
                            </select>
                            <select 
                              className="flex-1 text-sm p-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary/20"
                              value={filterYear}
                              onChange={(e) => setFilterYear(e.target.value)}
                            >
                              {Array.from({length: 5}).map((_, i) => {
                                const y = new Date().getFullYear() - i;
                                return <option key={y} value={y}>{y}</option>;
                              })}
                            </select>
                            <Button variant="default" size="sm" onClick={applyMonthYearFilter} disabled={!filterMonth}>Go</Button>
                          </div>
                        </div>

                        <div className="border-t border-border"></div>

                        {/* Custom Range */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Custom date range</label>
                          <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1 text-[10px] font-medium text-muted-foreground">From<input
                            type="date" 
                            aria-label="Date from" className="w-full text-xs p-2 border border-border rounded-lg bg-background text-foreground"
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                          /></label><label className="space-y-1 text-[10px] font-medium text-muted-foreground">To<input
                            type="date" 
                            aria-label="Date to" className="w-full text-xs p-2 border border-border rounded-lg bg-background text-foreground"
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)} 
                          /></label></div>
                        </div>

                        {(startDate || endDate) && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full text-xs" 
                            onClick={() => { setStartDate(''); setEndDate(''); setFilterMonth(''); setDateFilterOpen(false); }}
                          >
                            Reset Date Filter
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <Link href="/procurement/purchase-orders/generate">
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-lg shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 gap-1.5"
                  icon={Plus}
                >
                  Create Purchase Order
                </Button>
              </Link>
            </div>
          }
        />

        {/* Sleek Compact Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                Total Orders
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {allTotal}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                Active & Issued
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {approvedCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                Drafts / Review
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {draftCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Clock className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                Cancelled
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {cancelledCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <PackageCheck className="h-4.5 w-4.5" />
            </div>
          </div>
        </div>



        {/* Search & Status Filter Controls Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-card p-2.5 sm:p-3 rounded-xl border border-border/80 shadow-2xs">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="po-search"
              type="text"
              placeholder="Search by PO number, vendor name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-muted/30 border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Pills & Reset */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">Filter:</span>
            {PO_STATUS_TABS.map(tab => {
              const isActive = statusFilter === tab.value;
              return (
                <button
                  key={tab.label}
                  onClick={() => setStatusFilter(tab.value as PoStatus | '')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs transition-all shrink-0 ${
                    isActive
                      ? 'bg-primary text-white shadow-2xs'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}

            {(search || statusFilter || startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setStartDate('');
                  setEndDate('');
                  setFilterMonth('');
                }}
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5 rounded-lg border border-dashed border-border ml-1 shrink-0"
                icon={RotateCcw}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Loading purchase orders..." />
        ) : error ? (
          <ErrorState error={error as Error} retry={refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No Purchase Orders Found"
            description={
              statusFilter || search
                ? 'Try adjusting your search query or filter criteria.'
                : 'Create a purchase order to start the approval and receiving workflow.'
            }
          />
        ) : (
          <Card className="shadow-2xs overflow-hidden border border-border/80 rounded-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-primary text-white">
                  <TableRow className="hover:bg-primary border-none">
                    {renderSortableHeader('poNumber', 'PO Number')}
                    {renderSortableHeader('vendor', 'Vendor')}
                    {renderSortableHeader('totalAmount', 'Order Value', 'text-right')}
                    {renderSortableHeader('status', 'Status', 'text-center')}
                    {renderSortableHeader('createdAt', 'Order Date')}
                    <TableHead className="w-24 text-center text-white font-bold py-3.5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(po => {
                    const poId = po.id || (po as PO & { poId?: string }).poId;
                    if (!poId) return null;

                    const totalVal = calcTotalAmount(po);
                    const earliestNeedDate = getEarliestNeedDate(po);

                    return (
                      <TableRow 
                        key={poId} 
                        role="link" 
                        tabIndex={0} 
                        onClick={() => router.push(`/procurement/purchase-orders/${poId}`)} 
                        onKeyDown={(event) => { 
                          if (event.key === 'Enter' || event.key === ' ') { 
                            event.preventDefault(); 
                            router.push(`/procurement/purchase-orders/${poId}`);
                          } 
                        }} 
                        className="cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors border-b border-border/60"
                      >
                        {/* PO Number */}
                        <TableCell className="py-3">
                          <span className="inline-flex rounded-md bg-muted/50 px-2.5 py-1 font-mono text-xs sm:text-sm font-semibold tracking-tight text-foreground hover:text-primary transition-colors">
                            {po.poNumber}
                          </span>
                          {po.sourcePr?.prNumber && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              PR: {po.sourcePr.prNumber}
                            </span>
                          )}
                        </TableCell>

                        {/* Vendor */}
                        <TableCell className="py-3">
                          <div className="font-semibold text-xs sm:text-sm text-foreground">
                            {po.vendor?.name ?? po.vendorId}
                          </div>
                        </TableCell>

                        {/* Order Value (₹) */}
                        <TableCell className="py-3 text-right">
                          <div className="font-mono font-bold text-xs sm:text-sm text-foreground">
                            {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase font-mono">
                            {po.currency || 'INR'}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-3 text-center">
                          <StatusBadge status={['SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status) ? 'APPROVED' : ['REJECTED', 'SUPERSEDED'].includes(po.status) ? 'CANCELLED' : po.status} />
                        </TableCell>

                        {/* Date */}
                        <TableCell className="py-3">
                          <div className="text-xs font-medium text-foreground">
                            {new Date(po.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                          {earliestNeedDate && (
                            <div className="text-[10px] text-muted-foreground">
                              Need: {new Date(earliestNeedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </div>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3 text-center" onClick={event => event.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {canEditPO && po.status === 'DRAFT' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 rounded-lg p-0 text-primary hover:bg-primary/10"
                                title="Edit purchase order"
                                aria-label={`Edit ${po.poNumber}`}
                                onClick={() => router.push(`/procurement/purchase-orders/${poId}?edit=1`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canDeletePO && po.status === 'DRAFT' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-lg"
                                title="Delete purchase order"
                                disabled={deletePO.isPending}
                                onClick={() => setDeleteTarget({ id: poId, poNumber: po.poNumber })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <PaginationControls page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }} />
          </Card>
        )}
      </div>
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete purchase order?"
        message={deleteTarget ? `Delete ${deleteTarget.poNumber}? This action cannot be undone.` : ''}
        isDeleting={deletePO.isPending}
        confirmText="Delete PO"
        loadingText="Deleting…"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
