'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { readStorageValue } from '../../lib/storageKeys';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Card, Button, Checkbox } from '@plinth/ui';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { TableToolbar } from '../../components/TableToolbar';
import { useRouter } from 'next/navigation';
import type { LifecycleStatus } from '@plinth/types';
import { Plus, Trash2, AlertTriangle, Pencil, ArrowDownUp } from 'lucide-react';
import { PaginationControls } from '../../components/PaginationControls';

export interface ColumnDef<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  render?: (row: T) => React.ReactNode;
}

export interface EntityDescriptor<T> {
  name: string;
  pluralName: string;
  apiPath: string; // e.g. 'products', 'uom', 'rules/qc'
  basePath: string; // e.g. '/products', '/inventory/uom'
  categoryLabel?: string;
  columns: ColumnDef<T>[];
  allowDelete?: boolean;
  allowBulkDelete?: boolean;
  sortByHeaders?: boolean;
  disableRowNavigation?: boolean;
  hideStatusControls?: boolean;
  deleteConfirmation?: (item: T) => string;
  excludeFromList?: (row: T) => boolean;
}

export function GenericList<T extends { id: string; status: LifecycleStatus }>({
  descriptor,
  onCreate,
  onOpen,
  onEdit, onDelete, renderExpanded, getExpansionSummary,
  children,
  hideHeader = false,
}: {
  descriptor: EntityDescriptor<T>;
  onCreate?: () => void;
  onOpen?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => Promise<unknown>;
  renderExpanded?: (item: T) => React.ReactNode;
  getExpansionSummary?: (item: T) => { count: number; label: string };
  children?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState(() =>
    descriptor.apiPath === 'routing/routes'
      ? 'updatedAt'
      : ['categories', 'product-families', 'uom'].includes(descriptor.apiPath)
        ? 'createdAt'
        : 'name'
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(descriptor.sortByHeaders ? 20 : 100);
  const [deleteTarget, setDeleteTarget] = useState<T[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const pageSizePreferenceKey = `plinth-table-page-size:${descriptor.apiPath}`;
  const legacyPageSizeKey = `plinth-table-page-size:${descriptor.apiPath}`;
  const { data, isLoading, error, refetch } = useQuery<{ items: T[], total: number }>({
    queryKey: [descriptor.apiPath, 'list'],
    queryFn: () => fetchApi(`/${descriptor.apiPath}?limit=1000`)
  });

  const rawItems = (data?.items || []).filter((item) => !descriptor.excludeFromList?.(item));

  const items = useMemo(() => {
    return rawItems
      .filter(item => (!status || item.status === status) && (!search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => {
        if (sort === 'createdAt' || sort === 'updatedAt') {
          const preferredTimestamp = sort === 'updatedAt' ? 'updatedAt' : 'createdAt';
          const fallbackTimestamp = sort === 'updatedAt' ? 'createdAt' : 'updatedAt';
          const aDate = new Date(String((a as Record<string, unknown>)[preferredTimestamp] || (a as Record<string, unknown>)[fallbackTimestamp] || 0)).getTime();
          const bDate = new Date(String((b as Record<string, unknown>)[preferredTimestamp] || (b as Record<string, unknown>)[fallbackTimestamp] || 0)).getTime();
          return bDate - aDate || String((b as Record<string, unknown>).id || '').localeCompare(String((a as Record<string, unknown>).id || ''));
        }
        if (sort === 'status') return String(a.status).localeCompare(String(b.status));
        if (sort.startsWith('code')) {
          const aCode = String((a as Record<string, unknown>).code || '');
          const bCode = String((b as Record<string, unknown>).code || '');
          return aCode.localeCompare(bCode) * (sort.endsWith('-desc') ? -1 : 1);
        }
        const nameOrder = String((a as Record<string, unknown>).name || '').localeCompare(String((b as Record<string, unknown>).name || ''));
        return sort.endsWith('-desc') ? nameOrder * -1 : nameOrder;
      });
  }, [rawItems, search, sort, status]);

  const paginatedItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);

  useEffect(() => setPage(1), [search, status, sort]);

  useEffect(() => {
    if (!descriptor.sortByHeaders) return;
    try {
      const savedPageSize = Number(readStorageValue(pageSizePreferenceKey, legacyPageSizeKey));
      if ([10, 20, 50, 100].includes(savedPageSize)) setPageSize(savedPageSize);
    } catch {
      // Keep the default page size when browser storage is unavailable.
    }
  }, [descriptor.sortByHeaders, pageSizePreferenceKey]);

  const updatePageSize = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
    if (!descriptor.sortByHeaders) return;
    try {
      window.localStorage.setItem(pageSizePreferenceKey, String(nextPageSize));
    } catch {
      // The selected size still applies for the current view.
    }
  };

  if (isLoading) return <LoadingState message={`Loading ${descriptor.pluralName.toLowerCase()}…`} />;
  if (error) return <ErrorState error={error as Error} retry={refetch} />;

  const deleteItem = async () => {
    if (!deleteTarget?.length) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const deleteRecord = onDelete ?? ((item: T) => fetchApi(`/${descriptor.apiPath}/${item.id}`, { method: 'DELETE' }));
      const results = await Promise.allSettled(deleteTarget.map((item) => deleteRecord(item)));
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length) {
        const firstFailure = failures[0] as PromiseRejectedResult;
        const reason = firstFailure.reason instanceof Error ? firstFailure.reason.message : String(firstFailure.reason || 'Unknown server error');
        throw new Error(`${failures.length} of ${deleteTarget.length} record(s) could not be deleted. ${reason}`);
      }
      await queryClient.invalidateQueries({ queryKey: [descriptor.apiPath] });
      await queryClient.invalidateQueries({ queryKey: [`${descriptor.apiPath}s`] });
      setDeleteTarget(null);
      setSelectedIds(new Set());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'The record could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={hideHeader ? "w-full space-y-6" : "flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6"}>
      {/* Top Header */}
      {!hideHeader && (
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            {descriptor.pluralName}
          </h1>
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              onClick={() => onCreate ? onCreate() : router.push(`${descriptor.basePath}/new`)}
              size="sm"
              className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create {descriptor.name}</span>
            </Button>
          </div>
        </header>
      )}
      {/* Main Table spanning full width */}
      <Card className="rounded-2xl border border-border overflow-hidden shadow-xs w-full bg-card">
        <div className="p-4 sm:p-5 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">{descriptor.pluralName}</span>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
              {items.length} Records
            </span>
          </div>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder={`Search ${descriptor.pluralName.toLowerCase()}…`}
            {...(!descriptor.sortByHeaders && !descriptor.hideStatusControls && !['categories', 'product-families', 'uom'].includes(descriptor.apiPath) && {
              sort,
              onSort: setSort,
              sortOptions: [
                { label: 'Name', value: 'name' },
                { label: 'Code', value: 'code' },
                { label: 'Status', value: 'status' }
              ],
              filter: status,
              onFilter: setStatus,
              filterOptions: [
                { label: 'Approved', value: 'APPROVED' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Draft', value: 'DRAFT' },
                { label: 'Inactive', value: 'INACTIVE' }
              ]
            })}
          />
        </div>

        <div className="w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                {descriptor.allowBulkDelete && <TableHead className="w-10">
                  <Checkbox aria-label={`Select all ${descriptor.pluralName}`} checked={items.length > 0 && items.every((item) => selectedIds.has(item.id))} onChange={(event) => setSelectedIds(event.target.checked ? new Set(items.map((item) => item.id)) : new Set())} />
                </TableHead>}
                {descriptor.columns.map((col) => (
                  <TableHead key={String(col.key)} style={{ width: col.width }}>
                    {descriptor.sortByHeaders && ['name', 'code'].includes(String(col.key)) ? (
                      <button
                        type="button"
                        onClick={() => setSort((current) => current.startsWith(String(col.key)) && !current.endsWith('-desc') ? `${String(col.key)}-desc` : String(col.key))}
                        className="inline-flex items-center gap-1.5 text-inverse hover:text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm"
                        aria-label={`Sort by ${col.header}`}
                      >
                        {col.header}<ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    ) : col.header}
                  </TableHead>
                ))}
                {(descriptor.allowDelete || descriptor.allowBulkDelete) && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={descriptor.columns.length + (descriptor.allowBulkDelete ? 1 : 0) + (descriptor.allowDelete ? 1 : 0)} className="h-32 text-center">
                    <EmptyState title={`No ${descriptor.pluralName} Found`} />
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item) => <React.Fragment key={item.id}>
                  <TableRow
                    role={descriptor.disableRowNavigation ? undefined : 'link'}
                    tabIndex={descriptor.disableRowNavigation ? undefined : 0}
                    onClick={descriptor.disableRowNavigation ? undefined : () => onOpen ? onOpen(item) : router.push(`${descriptor.basePath}/${item.id}`)}
                    onKeyDown={descriptor.disableRowNavigation ? undefined : (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpen ? onOpen(item) : router.push(`${descriptor.basePath}/${item.id}`);
                      }
                    }}
                    className={`${descriptor.disableRowNavigation ? '' : 'cursor-pointer'} hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors`}
                  >
                    {descriptor.allowBulkDelete && <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                      <Checkbox aria-label={`Select ${descriptor.name}`} checked={selectedIds.has(item.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />
                    </TableCell>}
                    {descriptor.columns.map((col) => (
                      <TableCell key={String(col.key)} className="font-medium text-foreground">
                        {col.key === 'name' && getExpansionSummary ? (() => {
                          const summary = getExpansionSummary(item);
                          return <div className="flex flex-col items-start gap-1">
                            {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key as string] || '—')}
                            {summary && summary.count > 0 && <button
                              type="button"
                              aria-label={`${expandedIds.has(item.id) ? 'Collapse' : 'Expand'} ${summary.label} for ${String((item as Record<string, unknown>).name || 'category')}`}
                              aria-expanded={expandedIds.has(item.id)}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(item.id);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {summary.count} {summary.label}
                            </button>}
                          </div>;
                        })() : col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key as string] || '—')}
                      </TableCell>
                    ))}
                    {(descriptor.allowDelete || descriptor.allowBulkDelete) && (
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer"
                            onClick={() => onEdit ? onEdit(item) : onOpen ? onOpen(item) : router.push(`${descriptor.basePath}/${item.id}`)}
                            title={`Edit / View ${descriptor.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit {descriptor.name}</span>
                          </Button>
                          {descriptor.allowDelete && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget([item]);
                              }}
                              title={`${onDelete ? 'Deactivate' : 'Delete'} ${descriptor.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">{onDelete ? 'Deactivate' : 'Delete'} {descriptor.name}</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  {renderExpanded && expandedIds.has(item.id) && renderExpanded(item)}
                </React.Fragment>)
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={items.length} onPageChange={setPage} onPageSizeChange={updatePageSize} />
      </Card>
      {descriptor.allowBulkDelete && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-none">
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <Button type="button" variant="destructive" size="sm" onClick={() => { setDeleteError(null); setDeleteTarget(items.filter((item) => selectedIds.has(item.id))); }}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete selected
          </Button>
        </div>
      )}

      {children}
      {deleteTarget && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex min-h-screen min-h-[100dvh] w-screen items-center justify-center bg-inverse p-4 backdrop-blur-[1px]" role="presentation" onMouseDown={() => !isDeleting && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-none" role="dialog" aria-modal="true" aria-labelledby="delete-master-data-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-destructive/10 p-2 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
              <div>
                <h2 id="delete-master-data-title" className="text-base font-bold">{onDelete ? `Deactivate ${descriptor.name}?` : `Delete ${descriptor.name}?`}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{deleteTarget.length === 1 && descriptor.deleteConfirmation ? descriptor.deleteConfirmation(deleteTarget[0]) : onDelete ? `This will deactivate ${deleteTarget.length === 1 ? String((deleteTarget[0] as Record<string, unknown>).name || (deleteTarget[0] as Record<string, unknown>).code || deleteTarget[0].id) : `${deleteTarget.length} selected ${descriptor.pluralName.toLowerCase()}`} while preserving its production history.` : `This permanently removes ${deleteTarget.length === 1 ? String((deleteTarget[0] as Record<string, unknown>).name || (deleteTarget[0] as Record<string, unknown>).code || deleteTarget[0].id) : `${deleteTarget.length} selected ${descriptor.pluralName.toLowerCase()}`}. This cannot be undone.`}</p>
              </div>
            </div>
            {deleteError && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={isDeleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button type="button" variant="destructive" disabled={isDeleting} onClick={deleteItem}>{isDeleting ? (onDelete ? 'Deactivating…' : 'Deleting…') : (onDelete ? 'Confirm deactivation' : 'Confirm delete')}</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
