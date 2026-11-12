'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Plus,
  Search,
  Trash2,
  Boxes,
  Cpu,
  AlertTriangle,
  RotateCcw,
  Pencil,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@plinth/ui';
import { useBomVersions, useDeleteBomDraft, useDeleteBomDrafts } from '../../../../features/bom/hooks';
import type { BomVersionSummary } from '../../../../features/bom/types';
import { PaginationControls } from '../../../../components/PaginationControls';
import { ConfirmDeleteDialog } from '../../../../components/ConfirmDeleteDialog';
import { showToast } from '../../../../components/toast-store';

const getComponentLineCount = (bom: BomVersionSummary) =>
  Array.isArray(bom.lines) ? bom.lines.length : (bom._count?.lines ?? 0);

export default function BomListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [deleteTarget, setDeleteTarget] = useState<BomVersionSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const { data: bomData, isLoading, error, refetch } = useBomVersions({
    page,
    limit: pageSize,
    search: search.trim() || undefined,
  });

  const deleteMutation = useDeleteBomDraft();
  const bulkDeleteMutation = useDeleteBomDrafts();

  const items = bomData?.items || [];
  const totalCount = bomData?.total || 0;
  const activeCount = useMemo(
    () => items.filter((b) => b.status === 'APPROVED').length,
    [items]
  );
  // The BOM list endpoint includes the line records, but may not include
  // Prisma's optional `_count` payload. Prefer the actual returned lines so
  // the registry and summary card agree with the BOM detail page.
  const totalComponentLines = useMemo(
    () => items.reduce((acc, bom) => acc + getComponentLineCount(bom), 0),
    [items]
  );
  const isAllSelected = items.length > 0 && items.every((b) => selectedIds.has(b.id));
  const isSomeSelected = items.some((b) => selectedIds.has(b.id)) && !isAllSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map((b) => b.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Could not delete BOM draft.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const result = await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
      const outcome = result.retiredCount > 0
        ? `${result.deletedCount} deleted and ${result.retiredCount} retired because they are referenced by production.`
        : `${result.deletedCount} Bill of Materials ${result.deletedCount === 1 ? 'specification was' : 'specifications were'} permanently deleted.`;
      showToast({
        kind: result.deletedCount > 0 ? 'success' : 'info',
        title: result.retiredCount > 0 ? 'BOMs Removed Safely' : 'BOMs Deleted',
        message: outcome,
      });
      setSelectedIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } catch (err: any) {
      setBulkDeleteError(err?.message || 'Could not delete all selected BOMs.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedIds(new Set());
    setPage(1);
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-4 min-h-screen">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Bill of Materials
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            onClick={() => router.push('/production/bom/new')}
            size="sm"
            className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-none flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create BOM</span>
          </Button>
        </div>
      </header>

      {/* Compact 3-Card KPI Grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 w-full">
        {/* Card 1: Total Specifications */}
        <Card className="border border-border/80 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-primary/40 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Bill of Materials
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {totalCount}
                </span>
                <span className="text-xs font-medium text-muted-foreground">formulas</span>
              </div>
            </div>
            <span className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
              <Cpu className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        {/* Card 2: Active Specifications */}
        <Card className="border border-border/80 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-tone-green-solid/25 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Active Specifications
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {activeCount}
                </span>
                <span className="text-xs font-medium text-muted-foreground">active / approved</span>
              </div>
            </div>
            <span className="rounded-lg bg-tone-green-bg p-2 text-tone-green-text shrink-0">
              <Boxes className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        {/* Card 3: Formula Components */}
        <Card className="border border-border/80 bg-card shadow-none rounded-xl p-3 sm:p-3.5 hover:border-tone-amber-solid/25 transition-all">
          <CardContent className="p-0 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Formula Lines
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {totalComponentLines}
                </span>
                <span className="text-xs font-medium text-muted-foreground">components & items</span>
              </div>
            </div>
            <span className="rounded-lg bg-tone-amber-bg p-2 text-tone-amber-text shrink-0">
              <Layers className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card spanning full width */}
      <Card className="rounded-xl border border-border overflow-hidden shadow-none w-full bg-card">
        {/* Table Toolbar / Filters Bar */}
        <div className="p-3 sm:p-4 border-border-strong border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold text-foreground">BOM Registry</span>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
              {totalCount} Total
            </span>
            {selectedIds.size > 0 && (
              <span className="rounded-full bg-tone-amber-bg border border-tone-amber-solid/25 px-2 py-0.5 text-[11px] font-bold text-tone-amber-text">
                {selectedIds.size} Selected
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setBulkDeleteError(null);
                  setIsBulkDeleteDialogOpen(true);
                }}
                className="h-7 px-2.5 text-xs font-bold"
                icon={Trash2}
              >
                Delete Selected ({selectedIds.size})
              </Button>
            )}

            {/* Search Input */}
            <div className="relative min-w-[220px] sm:min-w-[280px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by BOM # or notes..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            {search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                icon={RotateCcw}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="w-full overflow-x-auto">
          {isLoading && !bomData ? (
            <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
              Loading Bill of Materials registry…
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-destructive bg-destructive/10 space-y-2">
              <AlertTriangle className="h-5 w-5 text-destructive mx-auto" />
              <p className="font-semibold text-foreground">Failed to load BOM specifications</p>
              <p className="text-muted-foreground max-w-md mx-auto">
                {error instanceof Error ? error.message : 'An unexpected error occurred while fetching the BOM records.'}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center space-y-2.5">
              <Layers className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <h3 className="text-sm font-semibold text-foreground">No Bill of Materials Found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {search
                  ? 'No BOM matches your current search criteria.'
                  : 'Get started by creating your first Bill of Materials formula.'}
              </p>
              {!search && (
                <Button
                  size="sm"
                  onClick={() => router.push('/production/bom/new')}
                  className="mt-1 bg-primary text-primary-foreground font-semibold h-8 text-xs"
                >
                  Create BOM
                </Button>
              )}
            </div>
          ) : (
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-border-strong border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead className="py-2.5 px-3 w-10 text-center">
                    <Checkbox

                      aria-label="Select all BOMs on this page"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary/30 cursor-pointer accent-primary"
                    />
                  </TableHead>
                  <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground">
                    BOM Name
                  </TableHead>
                  <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground">
                    Specification Notes
                  </TableHead>
                  <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground text-center">
                    Components
                  </TableHead>
                  <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground">
                    Effective Date
                  </TableHead>
                  <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground">
                    Last Updated
                  </TableHead>
                  <TableHead className="py-2.5 px-3.5 font-semibold text-xs text-muted-foreground text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((bom) => {
                  const isChecked = selectedIds.has(bom.id);
                  return (
                    <TableRow
                      key={bom.id}
                      onClick={() => router.push(`/production/bom/${bom.id}`)}
                      className={`cursor-pointer transition-colors group border-border-strong border-border/60 ${
                        isChecked ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                      }`}
                    >
                      {/* Row Checkbox */}
                      <TableCell className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox

                          aria-label={`Select ${bom.bomNumber}`}
                          checked={isChecked}
                          onChange={(e) => handleToggleRow(bom.id, e)}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary/30 cursor-pointer accent-primary"
                        />
                      </TableCell>

                      {/* BOM Number */}
                      <TableCell className="py-2.5 px-3.5 font-mono font-bold text-foreground">
                        <span className="text-xs">{bom.bomNumber}</span>
                      </TableCell>

                      {/* Specification Notes */}
                      <TableCell className="py-2.5 px-3.5">
                        <span className="text-xs text-muted-foreground line-clamp-1 max-w-[320px]">
                          {/^(?:Created from finished good|Created from raw material) creation$/i.test(bom.note?.trim() || '') ? '' : (bom.note || '')}
                        </span>
                      </TableCell>

                      {/* Components / Lines */}
                      <TableCell className="py-2.5 px-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-foreground border border-border">
                          {getComponentLineCount(bom)} items
                        </span>
                      </TableCell>

                      {/* Effective Date */}
                      <TableCell className="py-2.5 px-3.5 text-xs text-muted-foreground">
                        {bom.effectiveDate
                          ? new Date(bom.effectiveDate).toLocaleDateString()
                          : 'Immediate'}
                      </TableCell>

                      {/* Last Updated */}
                      <TableCell className="py-2.5 px-3.5 text-xs text-muted-foreground font-mono text-[11px]">
                        {new Date(bom.updatedAt).toLocaleDateString()}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-2.5 px-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            aria-label={`Edit ${bom.bomNumber}`}
                            title="Edit BOM"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/production/bom/${bom.id}?edit=true`);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${bom.bomNumber}`}
                            title="Delete BOM"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(bom);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination Controls */}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={totalCount}
          onPageChange={(nextPage) => {
            setPage(nextPage);
          }}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      </Card>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-md px-4 py-2.5 shadow-none animate-in fade-in slide-in-from-bottom-3">
          <span className="text-xs sm:text-sm font-semibold text-foreground">
            {selectedIds.size} BOM{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Deselect
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setBulkDeleteError(null);
              setIsBulkDeleteDialogOpen(true);
            }}
            className="h-8 px-3.5 text-xs font-bold shadow-none"
            icon={Trash2}
          >
            Delete Selected ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Single Delete Confirmation Modal */}
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete Bill of Materials"
        message={
          <>
            Are you sure you want to delete BOM{' '}
            <strong className="text-foreground">{deleteTarget?.bomNumber}</strong>?
            This draft specification will be permanently removed.
          </>
        }
        error={deleteError}
        isDeleting={deleteMutation.isPending}
        confirmText="Delete BOM"
        loadingText="Deleting…"
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleDelete}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmDeleteDialog
        open={isBulkDeleteDialogOpen}
        title="Delete Selected Bill of Materials"
        message={
          <>
            Are you sure you want to permanently delete the{' '}
            <strong className="text-foreground">{selectedIds.size} selected</strong> Bill of Materials specification(s)?
            This action cannot be undone.
          </>
        }
        error={bulkDeleteError}
        isDeleting={isBulkDeleting}
        confirmText={`Delete ${selectedIds.size} BOM(s)`}
        loadingText="Deleting…"
        onClose={() => {
          if (!isBulkDeleting) {
            setIsBulkDeleteDialogOpen(false);
            setBulkDeleteError(null);
          }
        }}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
