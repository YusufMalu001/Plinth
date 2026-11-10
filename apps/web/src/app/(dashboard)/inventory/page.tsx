"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useState, useEffect, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  PageHeader,
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@synergy/ui';
import {
  Package,
  Search,
  Coins,
  LockKeyhole,
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { ConfirmDeleteDialog } from '../../../components/ConfirmDeleteDialog';
import { showToast } from '../../../components/toast-store';
import { fetchApi } from '../../../features/api/client';
import { PaginationControls } from '../../../components/PaginationControls';
import { inventoryApi, InventoryItemSummary } from '../../../features/inventory/api';
import { inventoryKeys } from '../../../features/inventory/hooks';
import { FilterPills } from '../../../components/FilterPills';
type TabType = 'all' | 'quarantine' | 'stockouts';

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading inventory command center...</div>}>
      <InventoryPageContent />
    </Suspense>
  );
}

function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams?.get('tab');
  const initialTab: TabType = requestedTab === 'quarantine' || requestedTab === 'stockouts' ? requestedTab : 'all';

  // Filters State
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'all' || tabParam === 'quarantine' || tabParam === 'stockouts') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Queries
  const { data: dashboard, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery({
    queryKey: inventoryKeys.dashboard(),
    queryFn: inventoryApi.dashboard,
    staleTime: 10_000,
  });

  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: inventoryKeys.items({ search, limit: 5000 }),
    queryFn: () => inventoryApi.listItems({ search, limit: 5000 }),
    staleTime: 5_000,
  });

  useEffect(() => {
    setPage(1);
  }, [search, activeTab, activeCategory, conditionFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchDashboard(), refetchItems()]);
    setIsRefreshing(false);
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const isProduct = deleteTarget.itemType === 'PRODUCT';
      const endpoint = isProduct
        ? `/products/${deleteTarget.itemId}`
        : `/materials/${deleteTarget.itemId}`;
      await fetchApi(endpoint, { method: 'DELETE' });
      showToast({
        kind: 'success',
        title: 'Item Deleted',
        message: `Successfully deleted ${deleteTarget.product?.name || deleteTarget.material?.name || 'item'}.`,
      });
      setDeleteTarget(null);
      await Promise.all([refetchDashboard(), refetchItems()]);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'The item could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  const inventoryItems = itemsData?.items || [];

  // Metrics computation
  const stockoutCount = inventoryItems.filter((row: InventoryItemSummary) => {
    const onHand = Number(row.onHandQuantity) || 0;
    const available = row.availableQuantity !== undefined ? Number(row.availableQuantity) : onHand;
    return onHand <= 0 || available <= 0;
  }).length;

  const totalInventoryValue = dashboard?.inventoryValue || inventoryItems.reduce((sum, item) => sum + (Number(item.inventoryValue) || 0), 0);
  const availableItemCount = dashboard?.stockedSkus ?? inventoryItems.filter((item) => Number(item.availableQuantity) > 0).length;
  const quarantinedQuantity = (dashboard?.quarantinedQuantity || 0) + (dashboard?.damagedQuantity || 0);
  const totalSkus = itemsData?.total ?? dashboard?.totalSkus ?? inventoryItems.length;
  const categoryCounts = inventoryItems.reduce((counts, row) => {
    const category = row.category?.name || row.product?.category?.name || row.material?.category?.name || 'Uncategorised';
    counts.set(category, (counts.get(category) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const categories = Array.from(categoryCounts.keys()).sort((a, b) => a.localeCompare(b));

  // Filtered dataset
  const filteredItems = inventoryItems.filter((row: InventoryItemSummary) => {
    const categoryName = row.category?.name || row.product?.category?.name || row.material?.category?.name || 'Uncategorised';
    if (activeCategory !== 'ALL' && categoryName !== activeCategory) return false;
    if (activeTab === 'quarantine' && !(row.conditions ?? []).some((condition) => ['QUARANTINED', 'DAMAGED', 'REJECTED'].includes(condition))) return false;
    if (activeTab === 'stockouts') {
      const onHand = Number(row.onHandQuantity) || 0;
      const available = row.availableQuantity !== undefined ? Number(row.availableQuantity) : onHand;
      if (onHand > 0 && available > 0) return false;
    }

    // Condition filter
    if (conditionFilter !== 'ALL') {
      if (!(row.conditions ?? []).includes(conditionFilter)) return false;
    }

    // Search query
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (row.product?.name || row.material?.name || '').toLowerCase();
    const code = ((row.itemType === 'PRODUCT' ? row.product?.sku : row.material?.code) || row.productId || row.materialId || '').toLowerCase();
    return name.includes(q) || code.includes(q) || categoryName.toLowerCase().includes(q);
  });

  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full">
      <div className="w-full space-y-6">

        {/* Full-width PageHeader */}
        <PageHeader
          title="Inventory & Stores Dashboard"
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="rounded-full shadow-xs bg-card"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
                <span>{isRefreshing ? 'Syncing…' : 'Live Sync'}</span>
              </Button>

              <Link href="/products/new">
                <Button
                  size="sm"
                  className="rounded-full shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  <span>Register Item</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* 4 Quantitative KPI Metric Cards (Compact & Spacious) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 w-full">

          {/* Card 1: Total Valuation */}
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-primary/40 relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Valuation
              </span>
              <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                <Coins size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {dashboardLoading ? '...' : `₹${Math.round(totalInventoryValue).toLocaleString('en-IN')}`}
              </span>
            </div>
          </div>

          {/* Card 2: Items with available stock */}
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-primary/40 relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Items with Available Stock
              </span>
              <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                <Package size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {dashboardLoading ? '...' : availableItemCount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Card 3: Active SKUs */}
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-primary/40 relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Catalog Items
              </span>
              <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                <Layers size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {dashboardLoading ? '...' : totalSkus.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Card 4: Quality & Quarantine */}
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-primary/40 relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quarantine &amp; Hold
              </span>
              <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
                <LockKeyhole size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {dashboardLoading ? '...' : quarantinedQuantity.toLocaleString()}
              </span>
            </div>
          </div>

        </div>

        {/* Enhanced Multi-Filter & Search Toolbar */}
        <div className="space-y-3 w-full">
          {/* Segment Tabs Bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => { setActiveTab('all'); setActiveCategory('ALL'); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'all' && activeCategory === 'ALL'
                    ? 'bg-card text-foreground shadow-xs font-bold border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                All ({inventoryItems.length})
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => { setActiveTab('all'); setActiveCategory(category); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'all' && activeCategory === category
                      ? 'bg-card text-foreground shadow-xs font-bold border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {category} ({categoryCounts.get(category)})
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setActiveTab('quarantine'); setActiveCategory('ALL'); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'quarantine'
                    ? 'bg-card text-foreground shadow-xs font-bold border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                QC Hold
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('stockouts'); setActiveCategory('ALL'); }}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'stockouts'
                    ? 'bg-card text-foreground shadow-xs font-bold border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                <span>Attention ({stockoutCount})</span>
              </button>
            </div>
          </div>

          {/* Search Box & Dropdown Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search by SKU, item name, or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground shadow-xs"
              />
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <FilterPills
                label="Condition:"
                options={[
                  { label: 'All Conditions', value: 'ALL' },
                  { label: 'Available / Usable', value: 'AVAILABLE' },
                  { label: 'Quarantined / QC Hold', value: 'QUARANTINED' },
                  { label: 'Damaged / Scrap', value: 'DAMAGED' },
                ]}
                value={conditionFilter}
                onChange={setConditionFilter}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Unified Stock Balances Explorer Table */}
        <Card className="shadow-xs overflow-hidden border border-border/80 w-full">
          {itemsLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground">Loading inventory…</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              No inventory records match your search or filter criteria.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%] px-2.5 sm:px-3">Item Name</TableHead>
                    <TableHead className="w-[19%] px-2.5 sm:px-3">Category</TableHead>
                    <TableHead className="w-[12%] px-2.5 sm:px-3">Condition</TableHead>
                    <TableHead className="text-right w-[11%] px-2.5 sm:px-3 whitespace-nowrap">On-Hand</TableHead>
                    <TableHead className="text-right w-[9%] px-2.5 sm:px-3 whitespace-nowrap">Reserved</TableHead>
                    <TableHead className="text-right w-[12%] px-2.5 sm:px-3 whitespace-nowrap">Available</TableHead>
                    <TableHead className="text-center w-[7%] px-1 sm:px-2">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((row) => {
                    const isProduct = row.itemType === 'PRODUCT';
                    const name = (isProduct ? row.product?.name : row.material?.name) || 'Unnamed Item';
                    const categoryName = row.category?.name || (isProduct ? row.product?.category?.name : row.material?.category?.name) || 'Uncategorised';
                    const itemTypeLabel = isProduct ? 'Finished Product' : (row.material?.materialType?.replace(/_/g, ' ').toLowerCase() || 'Material');
                    const uomSymbol = row.uom?.symbol || row.uom?.code || (isProduct ? row.product?.uom?.symbol : row.material?.uom?.symbol) || 'Units';
                    const onHand = Number(row.onHandQuantity) || 0;
                    const reserved = Number(row.reservedQuantity) || 0;
                    const available = row.availableQuantity !== undefined ? Number(row.availableQuantity) : Math.max(0, onHand - reserved);
                    const hasQualityHold = (row.conditions ?? []).some((condition) => ['QUARANTINED', 'DAMAGED', 'REJECTED'].includes(condition));
                    const stockState = hasQualityHold ? 'QC HOLD' : onHand <= 0 ? 'ZERO STOCK' : 'IN STOCK';
                    const stockStateClass = stockState === 'QC HOLD'
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                      : stockState === 'IN STOCK'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';

                    const itemHref = isProduct ? `/products/${row.itemId}` : `/inventory/materials/${row.itemId}`;

                    return (
                      <TableRow
                        key={row.itemKey}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(itemHref)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') router.push(itemHref);
                        }}
                        className="cursor-pointer hover:bg-muted/40 transition-colors group"
                      >
                        {/* Item Name */}
                        <TableCell className="px-2.5 sm:px-3 py-2.5 overflow-hidden">
                          <div className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors" title={name}>
                            <StockItemName name={name} item={row.product || row.material} />
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 whitespace-nowrap capitalize">
                            <span>{itemTypeLabel}</span>
                            <span>·</span>
                            <span>{uomSymbol}</span>
                          </div>
                        </TableCell>

                        {/* Category */}
                        <TableCell className="px-2.5 sm:px-3 py-2.5 overflow-hidden whitespace-nowrap">
                          <span
                            className="inline-flex max-w-full items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground border border-border/60 truncate"
                            title={categoryName}
                          >
                            {categoryName}
                          </span>
                        </TableCell>

                        {/* Condition */}
                        <TableCell className="px-2.5 sm:px-3 py-2.5 whitespace-nowrap overflow-hidden">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stockStateClass}`}>
                            {stockState}
                          </span>
                        </TableCell>
                        {/* On-Hand */}
                        <TableCell className="px-2.5 sm:px-3 py-2.5 text-right font-mono font-medium text-foreground text-xs whitespace-nowrap overflow-hidden">
                          {onHand.toLocaleString()} <span className="text-[10px] font-sans font-normal text-muted-foreground">{uomSymbol}</span>
                        </TableCell>

                        {/* Reserved */}
                        <TableCell className="px-2.5 sm:px-3 py-2.5 text-right font-mono font-medium text-muted-foreground text-xs whitespace-nowrap overflow-hidden">
                          {reserved.toLocaleString()} <span className="text-[10px] font-sans font-normal">{uomSymbol}</span>
                        </TableCell>

                        {/* Available */}
                        <TableCell
                          className="px-2.5 sm:px-3 py-2.5 text-right font-mono font-bold text-foreground text-xs whitespace-nowrap overflow-hidden"
                          title={row.unconvertibleBalanceCount
                            ? `${row.unconvertibleBalanceCount} stock balance(s) use a different unit without an approved conversion; they are excluded from this ${uomSymbol} total.`
                            : undefined}
                        >
                          {available.toLocaleString()} <span className="text-[10px] font-sans font-normal text-muted-foreground">{uomSymbol}</span>
                        </TableCell>

                        {/* 8. Action (Delete only) */}
                        <TableCell className="px-1 sm:px-2 py-2.5 text-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(row);
                            }}
                            aria-label={`Delete ${name}`}
                            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredItems.length > pageSize && (
            <div className="p-4 border-t border-border/80 bg-card">
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={filteredItems.length}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
              />
            </div>
          )}

          {/* Delete Item Confirmation Modal */}
          <ConfirmDeleteDialog
            open={Boolean(deleteTarget)}
            title="Delete Inventory Item"
            message={
              deleteTarget && (
                <>
                  Are you sure you want to permanently delete{' '}
                  <strong>
                    {(deleteTarget.itemType === 'PRODUCT'
                      ? deleteTarget.product?.name
                      : deleteTarget.material?.name) || 'this item'}
                  </strong>
                  ? This action cannot be undone.
                </>
              )
            }
            error={deleteError}
            isDeleting={isDeleting}
            confirmText="Delete Item"
            loadingText="Deleting…"
            onClose={() => {
              if (!isDeleting) {
                setDeleteTarget(null);
                setDeleteError(null);
              }
            }}
            onConfirm={handleDeleteItem}
          />
        </Card>

      </div>
    </div>
  );
}
