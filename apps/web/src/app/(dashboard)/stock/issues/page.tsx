"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import {
  useStockIssues,
  useCreateStockIssue,
  useReverseStockIssue,
  useInventoryItemAvailability,
} from '../../../../features/inventory/hooks';
import {
  useApprovedProducts,
  useApprovedMaterials,
  useActiveUOMs,
} from '../../../../features/purchases/hooks';
import { extractErrorMessage } from '../../../../features/inventory/errors';
import { generateUUID } from '@/lib/uuid';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { ForbiddenState } from '../../../../components/ForbiddenState';
import { PaginationControls } from '../../../../components/PaginationControls';
import { SearchableSelector } from '../../../../components/ui/SearchableSelector';
import { formatVariantName } from '@/features/products/variant-names';
import { StockMovementSummary } from '../../../../features/inventory/components/StockMovementSummary';
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
  ArrowUpRightSquare,
  Plus,
  Undo2,
  RotateCcw,
  X,
  RefreshCw,
} from 'lucide-react';

export default function StockIssuesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const { data, isLoading, error, refetch, isRefetching } = useStockIssues({ limit: 500 });
  const [createOpen, setCreateOpen] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: products, isLoading: productsLoading, error: productsError } = useApprovedProducts();
  const { data: materials, isLoading: materialsLoading } = useApprovedMaterials();
  const { data: uoms } = useActiveUOMs();

  const materialOptions = useMemo(
    () =>
      (materials?.items ?? []).map((material: any) => {
        const parentId = material.parentMaterialId || material.materialId || String(material.specs?.parentMaterialId || '') || undefined;
        const isVar = Boolean(material.isVariant || material.specs?.isVariant || parentId);
        return {
          id: material.id,
          name: material.name,
          code: material.code,
          status: material.status,
          uomId: material.uomId,
          isVariant: isVar,
          parentOptionId: parentId,
          parentItemName: material.parentMaterialName,
          category: material.category,
        };
      }),
    [materials?.items]
  );
  const productOptions = useMemo(
    () =>
      (products?.items ?? []).map((product: any) => {
        const parentId = product.parentProductId || product.productId || (product.metadata as any)?.parentProductId;
        const isVar = Boolean(product.isVariant || (product.metadata as any)?.isVariant || parentId);
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          status: product.status,
          uomId: product.uomId,
          isVariant: isVar,
          parentOptionId: parentId,
          parentItemName: product.parentProductName,
          category: product.category,
        };
      }),
    [products?.items]
  );

  const createIssue = useCreateStockIssue();
  const reverseIssue = useReverseStockIssue();

  const [itemType, setItemType] = useState<'PRODUCT' | 'MATERIAL'>('MATERIAL');
  const [form, setForm] = useState({
    productId: '',
    materialId: '',
    uomId: '',
    quantity: '',
    reason: '',
  });

  const selectedItemData = useMemo(() => {
    if (itemType === 'MATERIAL') {
      return (materials?.items ?? []).find((m: any) => m.id === form.materialId) as any;
    }
    return (products?.items ?? []).find((p: any) => p.id === form.productId) as any;
  }, [itemType, form.materialId, form.productId, materials?.items, products?.items]);
  const selectedInventoryItemId = itemType === 'MATERIAL' ? form.materialId : form.productId;
  const {
    data: selectedItemAvailability,
    isLoading: selectedItemAvailabilityLoading,
    isError: selectedItemAvailabilityError,
  } = useInventoryItemAvailability(itemType, selectedInventoryItemId, form.uomId);
  const requestedIssueQuantity = Number(form.quantity);
  const hasRequestedIssueQuantity = Number.isFinite(requestedIssueQuantity) && requestedIssueQuantity > 0;
  const issueShortage = Boolean(
    selectedItemAvailability &&
    hasRequestedIssueQuantity &&
    requestedIssueQuantity > selectedItemAvailability.availableQuantity + 0.00005
  );
  const selectedUomLabel = uoms?.items.find((uom) => uom.id === form.uomId)?.symbol
    || uoms?.items.find((uom) => uom.id === form.uomId)?.code
    || '';

  const allowedUoms = useMemo(() => {
    if (!selectedItemData) return [];
    const baseUomId = selectedItemData.uomId;
    const configuredIds = Array.isArray(selectedItemData.specs?.availableUomIds)
      ? selectedItemData.specs.availableUomIds
      : Array.isArray(selectedItemData.metadata?.availableUomIds)
      ? selectedItemData.metadata.availableUomIds
      : Array.isArray(selectedItemData.availableUomIds)
      ? selectedItemData.availableUomIds
      : [];
    const allAllowedIds = new Set([baseUomId, ...configuredIds].filter(Boolean));
    const list = (uoms?.items ?? []).filter((u) => allAllowedIds.has(u.id));
    return list.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.symbol || u.code,
    }));
  }, [selectedItemData, uoms?.items]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  if (isLoading) return <LoadingState message="Loading shop floor stock issues..." />;
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return <ForbiddenState />;
    return <ErrorState error={error as Error} retry={refetch} />;
  }

  const rawItems = data?.items ?? [];

  const items = rawItems.filter((issue) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const num = (issue.issueNumber || '').toLowerCase();
    const itemStr = `${issue.product?.sku ?? ''} ${issue.product?.name ?? ''} ${issue.material?.code ?? ''} ${issue.material?.name ?? ''}`.toLowerCase();
    const reasonStr = (issue.reason ?? '').toLowerCase();
    return num.includes(q) || itemStr.includes(q) || reasonStr.includes(q);
  });

  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

  const totalCount = data?.total ?? rawItems.length;
  const activeIssuedCount = rawItems.filter((i) => i.status === 'ISSUED').length;
  const reversedCount = rawItems.filter((i) => i.status === 'REVERSED').length;
  const totalIssuedUnits = rawItems.reduce((acc, i) => i.status === 'ISSUED' ? acc + (Number(i.quantity) || 0) : acc, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (itemType === 'PRODUCT' && !form.productId) {
      setFormError('Please select a finished product.');
      return;
    }
    if (itemType === 'MATERIAL' && !form.materialId) {
      setFormError('Please select a raw material.');
      return;
    }
    if (!form.uomId || !form.quantity || !form.reason) {
      setFormError('UOM, quantity, and purpose/reason are required.');
      return;
    }
    if (Number(form.quantity) <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }

    try {
      const isVariant = Boolean(
        selectedItemData?.isVariant ||
        selectedItemData?.specs?.isVariant ||
        selectedItemData?.metadata?.isVariant
      );
      const selectedItemDisplayName = selectedItemData
        ? isVariant
          ? formatVariantName(selectedItemData.parentProductName || selectedItemData.parentMaterialName, selectedItemData.name)
          : selectedItemData.name
        : '';
      const variantContext = isVariant && selectedItemDisplayName
        ? `[Variant: ${selectedItemDisplayName}] `
        : '';
      await createIssue.mutateAsync({
        data: {
          productId: itemType === 'PRODUCT' ? form.productId : undefined,
          materialId: itemType === 'MATERIAL' ? form.materialId : undefined,
          uomId: form.uomId,
          quantity: Number(form.quantity),
          reason: `${variantContext}${form.reason}`,
        },
        idempotencyKey: generateUUID(),
        toastContext: {
          itemName: selectedItemDisplayName || 'Selected item',
          quantity: Number(form.quantity),
          uomLabel: uoms?.items.find((uom) => uom.id === form.uomId)?.symbol
            || uoms?.items.find((uom) => uom.id === form.uomId)?.code
            || 'units',
        },
      });
      setCreateOpen(false);
      setForm({ productId: '', materialId: '', uomId: '', quantity: '', reason: '' });
      await refetch();
    } catch (err) {
      setFormError(extractErrorMessage(err).message);
    }
  };

  const handleReverse = async (id: string) => {
    setFormError(null);
    if (!reverseReason || reverseReason.length < 3) {
      setFormError('A reason (min 3 characters) is required to reverse an issue.');
      return;
    }
    try {
      await reverseIssue.mutateAsync({ id, reason: reverseReason });
      setReversingId(null);
      setReverseReason('');
      await refetch();
    } catch (err) {
      setFormError(extractErrorMessage(err).message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full">
      <div className="w-full space-y-6">
        
        {/* Page Header */}
        <PageHeader
          title="Stock Issues & Consumption"
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
              <Link href="/stock/issues/new">
                <Button
                  size="sm"
                  className="gap-1.5 rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Direct Stock Issue</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* 4 Quantitative Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Issue Orders</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {totalCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Issues</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-primary font-mono">
              {activeIssuedCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Units Issued</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-primary font-mono">
              {totalIssuedUnits.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reversed Issues</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-muted-foreground font-mono">
              {reversedCount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Issue #, Item Name, Reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Standard @plinth/ui Table Card */}
        <Card className="shadow-xs overflow-hidden border border-border/80">
          <div className="p-4 border-b border-border/80 flex items-center justify-between bg-card">
            <div className="flex items-center gap-2">
              <ArrowUpRightSquare className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Issue Journal Records
              </h2>
              <span className="text-xs text-muted-foreground">
                ({items.length} records)
              </span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center">
              <ArrowUpRightSquare className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">No Stock Issues Recorded</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {search
                  ? 'No stock issues match your search query.'
                  : 'Click "Direct Stock Issue" to disburse materials to shop floor assembly or maintenance.'}
              </p>
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-x-auto">
              <Table className="w-full min-w-[720px] table-fixed lg:min-w-0">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[16%] pl-4">Issue #</TableHead>
                    <TableHead className="w-[29%]">Item Name</TableHead>
                    <TableHead className="w-[12%] whitespace-nowrap text-right">Qty / UOM</TableHead>
                    <TableHead className="w-[20%]">Reason</TableHead>
                    <TableHead className="w-[13%] whitespace-nowrap">Date &amp; Time</TableHead>
                    <TableHead className="w-[10%] whitespace-nowrap pr-5 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((issue) => {
                    const isProduct = Boolean(issue.product);
                    const variantName = issue.reason?.match(/\[Variant:\s*([^\]]+)\]/i)?.[1];
                    const name = variantName || (isProduct ? issue.product?.name : issue.material?.name) || 'Item';
                    const isReversed = issue.status === 'REVERSED';
                    const timestamp = issue.issuedAt || ('postedAt' in issue ? String((issue as Record<string, unknown>).postedAt) : undefined);
                    const dateObj = timestamp ? new Date(timestamp) : null;

                    return (
                      <TableRow key={issue.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="min-w-0 pl-4 font-mono text-xs font-semibold text-primary">
                          <Link
                            href={`/stock/issues/${issue.id || issue.issueNumber}`}
                            className="block break-all transition-colors hover:text-amber-600 hover:underline"
                            title="View Stock Issue Details"
                          >
                            <span>{issue.issueNumber}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="min-w-0 py-3">
                          <div className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]" title={name}>
                            <StockItemName name={name} item={issue.product || issue.material} context={issue.reason} />
                          </div>
                        </TableCell>

                        <TableCell className={`text-right font-mono font-bold text-sm ${
                          isReversed ? 'line-through text-muted-foreground' : 'text-foreground'
                        }`}>
                          <span>{Number(issue.quantity).toLocaleString()}</span>
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">{issue.uom?.code || 'Units'}</span>
                        </TableCell>


                        <TableCell className="min-w-0 overflow-hidden py-3">
                          <div className="break-words text-xs font-medium text-foreground [overflow-wrap:anywhere]" title={issue.reason || ''}>
                            {issue.reason || '—'}
                          </div>
                          {isReversed && (
                            <div className="text-[11px] text-muted-foreground font-semibold">
                              Reversed back to stock
                            </div>
                          )}
                        </TableCell>


                        <TableCell className="whitespace-nowrap">
                          {dateObj ? (
                            <div className="flex flex-col text-xs leading-tight font-mono">
                              <span className="text-foreground font-medium">
                                {dateObj.toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {dateObj.toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">—</span>
                          )}
                        </TableCell>


                        <TableCell className="text-right pr-5">
                          {!isReversed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFormError(null);
                                setReversingId(issue.id);
                              }}
                              className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10 border-border rounded-full gap-1 px-3"
                              title="Reverse Stock Issue"
                            >
                              <Undo2 className="h-3 w-3 shrink-0" />
                              <span>Reverse</span>
                            </Button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border cursor-not-allowed select-none"
                              title="This stock issue has already been reversed"
                            >
                              <RotateCcw className="h-3 w-3 shrink-0" />
                              <span>Reverted</span>
                            </span>
                          )}
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

        {/* Modal: New Stock Issue */}
        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <Card className="w-full max-w-lg p-6 shadow-xl space-y-5 border border-border">
              
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <ArrowUpRightSquare className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-bold text-foreground">
                    Direct Stock Issue to Shop Floor
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4 text-xs">
                
                {/* Item Type Switcher */}
                <div>
                  <label className="block text-muted-foreground font-semibold mb-1">Item Classification</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setItemType('MATERIAL'); setForm({ ...form, productId: '' }); }}
                      className={`py-2 font-semibold rounded-lg text-center transition-all border ${
                        itemType === 'MATERIAL'
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : 'border-border text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      Raw Material
                    </button>
                    <button
                      type="button"
                      onClick={() => { setItemType('PRODUCT'); setForm({ ...form, materialId: '' }); }}
                      className={`py-2 font-semibold rounded-lg text-center transition-all border ${
                        itemType === 'PRODUCT'
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : 'border-border text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      Finished Product
                    </button>
                  </div>
                </div>

                {/* Item Selection */}
                {itemType === 'MATERIAL' ? (
                  <div>
                    <label className="block text-muted-foreground font-semibold mb-1">Select Raw Material *</label>
                    <SearchableSelector
                      value={form.materialId}
                      onChange={(value) => {
                        const mat = (materials?.items ?? []).find((m: any) => m.id === value) as any;
                        const available = Array.isArray(mat?.specs?.availableUomIds) && mat.specs.availableUomIds.length > 0
                          ? mat.specs.availableUomIds
                          : [mat?.uomId].filter(Boolean);
                        setForm((f) => ({ ...f, materialId: value, uomId: mat?.uomId || available[0] || '' }));
                      }}
                      options={materialOptions}
                      isLoading={materialsLoading}
                      placeholder="Search material..."
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-semibold mb-1">Select Finished Product *</label>
                    <SearchableSelector
                      value={form.productId}
                      onChange={(value) => {
                        const prod = (products?.items ?? []).find((p: any) => p.id === value) as any;
                        const available = Array.isArray(prod?.metadata?.availableUomIds) && prod.metadata.availableUomIds.length > 0
                          ? prod.metadata.availableUomIds
                          : [prod?.uomId].filter(Boolean);
                        setForm((f) => ({ ...f, productId: value, uomId: prod?.uomId || available[0] || '' }));
                      }}
                      options={productOptions}
                      isLoading={productsLoading}
                      error={productsError}
                      placeholder="Search product..."
                    />
                  </div>
                )}

                {/* Quantity & UOM */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted-foreground font-semibold mb-1">Quantity to Issue *</label>
                    <input
                      type="number"
                      step="any"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-muted-foreground font-semibold mb-1">Unit of Measure (UOM) *</label>
                    <SearchableSelector
                      value={form.uomId}
                      onChange={(val) => setForm({ ...form, uomId: val })}
                      disabled={!(itemType === 'MATERIAL' ? form.materialId : form.productId)}
                      options={allowedUoms}
                      placeholder={(itemType === 'MATERIAL' ? form.materialId : form.productId) ? 'Search UOM...' : 'Select item first'}
                      renderOption={(u) => (
                        <span className="font-medium text-foreground">
                          {u.name} {u.code ? `(${u.code})` : ''}
                        </span>
                      )}
                    />
                  </div>
                </div>
                {selectedInventoryItemId && (
                  <div className="space-y-2" aria-live="polite">
                    <StockMovementSummary
                      availableQuantity={selectedItemAvailability?.availableQuantity}
                      movementQuantity={hasRequestedIssueQuantity ? -requestedIssueQuantity : 0}
                      uomLabel={selectedUomLabel}
                      isLoading={selectedItemAvailabilityLoading}
                      isError={selectedItemAvailabilityError}
                    />
                    {issueShortage && (
                      <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                        This issue exceeds the selected item’s available stock by {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(requestedIssueQuantity - (selectedItemAvailability?.availableQuantity ?? 0))} {selectedUomLabel}.
                      </p>
                    )}
                  </div>
                )}

                {/* Reason / Purpose */}
                <div>
                  <label className="block text-muted-foreground font-semibold mb-1">
                    Production Line / Work Center / Purpose *
                  </label>
                  <textarea
                    rows={2}
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="e.g., Disbursed to Assembly Line 2 for Cloth Dryer Batch #892"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground resize-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createIssue.isPending || issueShortage}
                    className="rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-semibold"
                  >
                    {createIssue.isPending ? 'Posting Issue...' : 'Confirm Issue'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Modal: Reverse Stock Issue */}
        {reversingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <Card className="w-full max-w-md p-6 shadow-xl space-y-4 border border-border">
              <div className="flex items-center gap-2 text-rose-600">
                <Undo2 className="h-5 w-5" />
                <h3 className="text-base font-bold text-foreground">
                  Reverse Stock Issue
                </h3>
              </div>

              <p className="text-xs text-muted-foreground">
                This will atomically return the disbursed stock back to available perpetual inventory and record an audit reversal in the ledger journal.
              </p>

              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs text-muted-foreground font-semibold mb-1">
                  Reversal Reason &amp; Authorization *
                </label>
                <textarea
                  rows={3}
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g., Unused material returned from Assembly Line 1 due to batch completion"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-muted-foreground resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReversingId(null)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleReverse(reversingId)}
                  disabled={reverseIssue.isPending}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-full font-semibold"
                >
                  {reverseIssue.isPending ? 'Reversing...' : 'Authorize Reversal'}
                </Button>
              </div>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
